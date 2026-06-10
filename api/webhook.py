"""
LINE Bot Webhook — Vercel Serverless Function
多業務 RAG：依訊息中的業務關鍵字選擇業務 → 查該業務 namespace → Gemini 生成
每題寫入「待審核」分頁（含警示標記）。
"""

import base64
import hashlib
import hmac
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from flask import Flask, request, abort

app = Flask(__name__)

GEMINI_API_KEY      = os.environ.get("GEMINI_API_KEY", "")
LINE_ACCESS_TOKEN   = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "")
PINECONE_API_KEY    = os.environ.get("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "ah-biao-bot")
SA_JSON             = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
LINE_REPLY_URL      = "https://api.line.me/v2/bot/message/reply"
EMBED_MODEL_NAME    = "BAAI/bge-small-zh-v1.5"
GEN_MODEL           = "gemini-2.5-flash"
TOP_K               = 8
TRIGGER             = "阿標"
FAQ_DIRECT_THRESHOLD = 0.82   # 問題與已審查 FAQ 相似度 ≥ 此值 → 直接採用 FAQ 答案

# ── 載入業務設定 ─────────────────────────────────────────────────────────────
_FALLBACK_CONFIG = {
    "faq_sheet_id": "1Co7vSpCJ2NqQ8HLSQIPSg3TIO7R6vqBBX-YbWUCtscw",
    "review_tab": "待審核",
    "businesses": [{
        "key": "採購", "name": "採購", "enabled": True,
        "keywords": ["採購", "招標", "標案", "決標", "底價", "驗收", "履約", "監造", "竣工"],
        "drive_folder_id": "18-aKWluYmR2-A59ATtWb90wFnimpo_Cu",
        "sheet_tab": "採購", "namespace": "",
    }],
}

def _load_config():
    try:
        with open(os.path.join(ROOT, "businesses.json"), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"businesses.json 讀取失敗，使用內建設定：{e}")
        return _FALLBACK_CONFIG

_CONFIG = _load_config()
FAQ_SHEET_ID = _CONFIG.get("faq_sheet_id", "")
REVIEW_TAB   = _CONFIG.get("review_tab", "待審核")
BUSINESSES   = [b for b in _CONFIG.get("businesses", []) if b.get("enabled")]

def detect_business(text: str):
    """從訊息中比對業務關鍵字，回傳對應業務 dict，找不到回 None。"""
    for b in BUSINESSES:
        for kw in b.get("keywords", []):
            if kw in text:
                return b
    return None

# ── Pinecone（lazy）─────────────────────────────────────────────────────────
_pinecone_index = None
def _get_index():
    global _pinecone_index
    if _pinecone_index is None:
        from pinecone import Pinecone
        _pinecone_index = Pinecone(api_key=PINECONE_API_KEY).Index(PINECONE_INDEX_NAME)
    return _pinecone_index

# ── 本地 embedding（fastembed）──────────────────────────────────────────────
_embed_model = None
def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from fastembed import TextEmbedding
        _embed_model = TextEmbedding(model_name=EMBED_MODEL_NAME, cache_dir="/tmp/fastembed_cache")
    return _embed_model

def _embed(text):
    return list(_get_embed_model().query_embed(text))[0].tolist()

def _embed_many(texts):
    """一次批次 embedding 多個查詢，降低延遲。"""
    return [v.tolist() for v in _get_embed_model().query_embed(texts)]

# ── Gemini 生成（urllib，多模型備援抗 429/503）──────────────────────────────
GEN_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]

def _gemini_post(path, payload):
    url = f"https://generativelanguage.googleapis.com/v1beta/{path}?key={GEMINI_API_KEY}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())

def _generate(prompt):
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048,
                             "thinkingConfig": {"thinkingBudget": 0}},
    }
    import time as _t
    last = ""
    for attempt in range(4):                      # 額度滿(429)或過載(503)→換模型重試
        model = GEN_MODELS[attempt % len(GEN_MODELS)]
        try:
            resp = _gemini_post(f"models/{model}:generateContent", payload)
            cand = resp["candidates"][0]
            parts = cand.get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts).strip()
            if text:
                return text
        except Exception as e:
            last = str(e)
            _t.sleep(1.2)
    raise RuntimeError(f"生成失敗（已試多個模型）：{last}")

# ── Google Sheets 寫入（service account）───────────────────────────────────
def _sheets_token():
    from google.oauth2 import service_account
    import google.auth.transport.requests
    info = json.loads(SA_JSON)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def _append_review_row(row_values):
    """把一列資料 append 到待審核分頁。"""
    if not (SA_JSON and FAQ_SHEET_ID):
        return
    try:
        token = _sheets_token()
        rng = urllib.parse.quote(f"{REVIEW_TAB}!A1")
        url = (f"https://sheets.googleapis.com/v4/spreadsheets/{FAQ_SHEET_ID}"
               f"/values/{rng}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS")
        body = json.dumps({"values": [row_values]}).encode()
        req = urllib.request.Request(url, data=body, method="POST",
              headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"待審核寫入失敗：{e}")

# ── 警示偵測 ─────────────────────────────────────────────────────────────────
_SELF_HELP_RE = re.compile(r"請洽|請自行|請詢問|請聯[絡繫]|建議您?查|建議您?洽|洽詢|自行(查|洽)|請參閱|請查閱|洽承辦")

def compute_warnings(answer: str, matches, name_flag: bool) -> str:
    warns = []
    if name_flag:
        warns.append("需改職稱")
    if _SELF_HELP_RE.search(answer or ""):
        warns.append("需修正")
    for m in matches:
        md = m.get("metadata", {})
        if md.get("source_type") == "faq" and m.get("score", 0) > 0.85:
            warns.append("疑似重複")
            break
    return "、".join(warns)

# ── RAG 主流程（終極版：全部 FAQ 交給 AI 語意比對，保證不漏接）──────────────────
import time as _time
DOC_CAND_K     = 6
FAQ_CACHE_TTL  = 600          # FAQ 清單快取 10 分鐘
FAQ_MATCH_MAX  = 400          # FAQ 數量在此以內 → 全部送 AI 比對；超過則改用向量候選
_FAQ_CACHE     = {}           # {business_key: (timestamp, [ {q,a} ])}

def _query_docs(idx, qvec, ns, k):
    res = idx.query(vector=qvec, top_k=k, include_metadata=True, namespace=ns,
                    filter={"source_type": {"$eq": "doc"}})
    return [m for m in res.get("matches", []) if m.get("score", 0) > 0.3]

def get_all_faq(business):
    """抓某業務的全部已審查 FAQ（{q,a}），含 10 分鐘記憶體快取。"""
    key = business["key"]
    cached = _FAQ_CACHE.get(key)
    if cached and (_time.time() - cached[0] < FAQ_CACHE_TTL):
        return cached[1]
    faqs = []
    try:
        idx = _get_index()
        seed = [0.001] * 512   # 取全部 faq，用什麼向量都行
        res = idx.query(vector=seed, top_k=500, include_metadata=True,
                        namespace=business.get("namespace", ""),
                        filter={"source_type": {"$eq": "faq"}})
        for m in res.get("matches", []):
            md = m.get("metadata", {})
            q, a = md.get("faq_question", ""), md.get("faq_answer", "")
            if q and a:
                faqs.append({"q": q, "a": a})
    except Exception as e:
        print(f"取得 FAQ 清單失敗：{e}")
    _FAQ_CACHE[key] = (_time.time(), faqs)
    return faqs

def match_and_rewrite(question, faqs):
    """一次呼叫完成：FAQ 語意比對 + 多查詢擴展。
    回傳 (relation, faq_index, [查詢變體])；relation ∈ EXACT/RELATED/NONE。"""
    listing = "\n".join(f"{i+1}. {f['q']}" for i, f in enumerate(faqs)) if faqs else "（無）"
    prompt = (
        "你是檢索助理。根據下列『已審核FAQ清單』與『使用者問題』，輸出：\n"
        "第1行 MATCH：判斷使用者問題與FAQ的關係——\n"
        "  • 與某條FAQ問的是完全同一件事 → EXACT:編號\n"
        "  • 與某條FAQ相關但使用者問更廣/想知道更多 → RELATED:編號\n"
        "  • 都不相關 → NONE\n"
        "接著 QUERY1、QUERY2、QUERY3：把使用者問題改寫成 3 個『用詞不同但意思相同』"
        "的正式檢索問句（涵蓋同義詞、正式術語），每行一句，用來搜尋內部文件。\n"
        "格式範例：\nMATCH: NONE\nQUERY1: 採購的完整流程有哪些階段\n"
        "QUERY2: 政府採購生命週期各步驟說明\nQUERY3: 從請購到結案的作業程序\n\n"
        f"使用者問題：{question}\n\nFAQ清單：\n{listing}"
    )
    try:
        out = _generate(prompt)
    except Exception as e:
        print(f"比對/改寫失敗：{e}")
        return "NONE", -1, [question]
    rel, idx = "NONE", -1
    mm = re.search(r"MATCH:\s*(EXACT|RELATED|NONE)(?::\s*(\d+))?", out, re.I)
    if mm:
        rel = mm.group(1).upper()
        if mm.group(2):
            i = int(mm.group(2)) - 1
            if 0 <= i < len(faqs):
                idx = i
        if rel in ("EXACT", "RELATED") and idx < 0:
            rel = "NONE"
    queries = re.findall(r"QUERY\d*:\s*(.+)", out)
    queries = [q.strip() for q in queries if q.strip()]
    if not queries:
        queries = [question]
    queries.append(question)   # 也保留原問
    # 去重
    seen, uniq = set(), []
    for q in queries:
        if q not in seen:
            seen.add(q); uniq.append(q)
    return rel, idx, uniq[:4]

def _doc_sources(doc_cands, limit=3):
    seen, out = set(), []
    for m in doc_cands:
        s = m.get("metadata", {}).get("source", "")
        if s and s not in seen:
            seen.add(s); out.append(s)
        if len(out) >= limit:
            break
    return out

FULL_DOC_CAP   = 24000   # 還原整份文件的字數上限（教學檔/流程檔用）
_CHUNK_OVERLAP = 150     # 與建索引一致，用來去除拼接重疊

def fetch_full_doc(idx, ns, file_id):
    """把某檔案的所有片段抓回來、依序拼成完整文件（給綜覽性問題用）。"""
    try:
        res = idx.query(vector=[0.001] * 512, top_k=300, include_metadata=True,
                        namespace=ns, filter={"file_id": {"$eq": file_id}})
        chunks = sorted(res.get("matches", []),
                        key=lambda m: m.get("metadata", {}).get("chunk_idx", 0))
        if not chunks:
            return "", ""
        src = chunks[0].get("metadata", {}).get("source", "文件")
        parts = [chunks[0].get("metadata", {}).get("text", "")]
        for m in chunks[1:]:   # 後續片段去掉與前一段重疊的開頭
            parts.append(m.get("metadata", {}).get("text", "")[_CHUNK_OVERLAP:])
        return "".join(parts)[:FULL_DOC_CAP], src
    except Exception as e:
        print(f"還原完整文件失敗：{e}")
        return "", ""

def _multi_query_docs(idx, qvecs, ns, k_each=6):
    """多查詢擴展：用預先算好的查詢向量各檢索，合併去重，取分數最高的一批。"""
    best = {}
    for qv in qvecs:
        for m in _query_docs(idx, qv, ns, k_each):
            mid = m.get("id")
            if mid not in best or m.get("score", 0) > best[mid].get("score", 0):
                best[mid] = m
    return sorted(best.values(), key=lambda m: m.get("score", 0), reverse=True)

def answer_for_business(business, question):
    return answer_for_businesses([business], question)

def answer_for_businesses(businesses, question):
    """三段式回答；可跨多個業務搜尋（沒指定業務時搜全部，不卡使用者）。"""
    # 合併所有目標業務的 FAQ
    faqs = []
    for b in businesses:
        faqs.extend(get_all_faq(b))
    rel, fi, queries = "NONE", -1, [question]
    if faqs and len(faqs) <= FAQ_MATCH_MAX:
        rel, fi, queries = match_and_rewrite(question, faqs)

    # ① EXACT：完全同一問題 → 逐字回標準答案
    if rel == "EXACT" and fi >= 0:
        return faqs[fi]["a"].rstrip() + "\n\n（來源：本局 FAQ）", "命中FAQ"

    # 各業務 namespace 都查（跨業務搜尋）
    ns_list = []
    for b in businesses:
        ns = b.get("namespace", "")
        if ns not in ns_list:
            ns_list.append(ns)
    doc_cands, qvecs = [], []
    ns_by_id = {}      # 向量id → 所屬 namespace（不直接改動 Pinecone 物件）
    try:
        idx = _get_index()
        qvecs = _embed_many(queries)
        best = {}
        for ns in ns_list:
            for m in _multi_query_docs(idx, qvecs, ns):
                mid = m.get("id")
                if mid not in best or m.get("score", 0) > best[mid].get("score", 0):
                    best[mid] = m
                    ns_by_id[mid] = ns
        doc_cands = sorted(best.values(), key=lambda m: m.get("score", 0), reverse=True)
        print("[RETRIEVAL] q=" + question[:40] + " | queries=" + str(queries) +
              " | top=" + str([(m.get("metadata", {}).get("source", "")[:22],
                                round(m.get("score", 0), 3)) for m in doc_cands[:8]]))
    except Exception as e:
        if rel == "RELATED" and fi >= 0:
            return faqs[fi]["a"].rstrip() + "\n\n（來源：本局 FAQ）", "命中FAQ"
        return f"查詢時發生錯誤：{e}", ""

    faq_ctx = ""
    if rel == "RELATED" and fi >= 0:
        faq_ctx = ("【已審核標準答案（權威，必須以此為準，不可牴觸）】\n"
                   f"問：{faqs[fi]['q']}\n答：{faqs[fi]['a']}\n\n")

    if not doc_cands and not faq_ctx:
        return ("這個問題我在現有資料中找不到答案 😥\n建議您洽詢相關業務承辦人確認。"
                "（您的問題已記錄，將供日後補充進知識庫）"), "未解答"

    # 大綱命中 → 優先還原該教學檔
    outline_fids = {}   # fid -> ns
    try:
        for ns in ns_list:
            for ov in qvecs[:2]:
                ores = idx.query(vector=ov, top_k=3, include_metadata=True, namespace=ns,
                                 filter={"source_type": {"$eq": "outline"}})
                for m in ores.get("matches", []):
                    if m.get("score", 0) > 0.45:
                        fid = m.get("metadata", {}).get("file_id", "")
                        if fid and fid not in outline_fids:
                            outline_fids[fid] = ns
    except Exception as e:
        print(f"大綱檢索略過：{e}")

    # 父文件還原（大綱命中檔 + 最相關檔），各自用所屬 namespace
    blocks, used_files = [], set()
    fid_ns = dict(outline_fids)
    ordered = list(outline_fids.keys())
    for m in doc_cands:
        fid = m.get("metadata", {}).get("file_id", "")
        if fid and fid not in fid_ns:
            fid_ns[fid] = ns_by_id.get(m.get("id"), "")
            ordered.append(fid)
    for fid in ordered[:3]:
        full_text, full_src = fetch_full_doc(idx, fid_ns.get(fid, ""), fid)
        if full_text:
            blocks.append(f"【{full_src}（完整內容）】\n{full_text}")
            used_files.add(fid)
    for m in doc_cands:
        fid = m.get("metadata", {}).get("file_id", "")
        if fid in used_files:
            continue
        used_files.add(fid)
        md = m.get("metadata", {})
        blocks.append(f"【{md.get('source','文件')}】\n{md.get('text','')}")
        if len(blocks) >= 4:
            break
    doc_block = "\n\n---\n\n".join(blocks) or "（無相關文件）"

    instr = ("請『以下列標準答案為準』，並用文件內容補充更完整的說明（補充不可牴觸標準答案）。"
             if faq_ctx else "請只根據下列文件內容回答。")
    prompt = (
        f"你是花蓮縣衛生局的業務助理。{instr}\n"
        "用繁體中文、語氣親切專業。\n"
        "若是綜覽性、流程性問題，請完整有條理地回答（可分階段、分點），"
        "先給整體架構；內容很多時最後主動說明可針對哪部分再深入詢問。\n"
        "若標準答案與文件都無法回答，最後另起一行單獨輸出 [NOTFOUND]。\n"
        "若回答中出現具體人名（非單位或職稱），最後另起一行單獨輸出 [HASNAME]。\n\n"
        f"{faq_ctx}文件內容：\n{doc_block}\n\n問題：{question}\n\n回答："
    )
    try:
        raw = _generate(prompt)
    except Exception as e:
        return f"生成回答時發生錯誤：{e}", ""

    if "[NOTFOUND]" in raw:
        return ("這個問題我在現有資料中找不到完整答案 😥\n建議您洽詢相關業務承辦人確認。"
                "（您的問題已記錄，將供日後補充進知識庫）"), "未解答"

    name_flag = "[HASNAME]" in raw
    answer = raw.replace("[HASNAME]", "").replace("[NOTFOUND]", "").strip()
    cites = (["FAQ"] if faq_ctx else []) + _doc_sources(doc_cands)
    if cites:
        answer += "\n\n（依據：" + "、".join(cites) + "）"
    warns = compute_warnings(answer, doc_cands, name_flag)
    return answer, warns

# ── LINE ─────────────────────────────────────────────────────────────────────
def _verify_sig(body: bytes, sig: str) -> bool:
    if not LINE_CHANNEL_SECRET:
        return True
    mac = hmac.new(LINE_CHANNEL_SECRET.encode(), body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(mac).decode(), sig)

def _reply(token: str, text: str):
    payload = json.dumps({"replyToken": token,
                          "messages": [{"type": "text", "text": text[:5000]}]}).encode()
    req = urllib.request.Request(LINE_REPLY_URL, data=payload, method="POST",
          headers={"Content-Type": "application/json",
                   "Authorization": f"Bearer {LINE_ACCESS_TOKEN}"})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"LINE reply error: {e}")

def _now_tw():
    return datetime.now(timezone(timedelta(hours=8)))

# ── 路由 ─────────────────────────────────────────────────────────────────────
@app.route("/api/webhook", methods=["POST"])
@app.route("/webhook",     methods=["POST"])
@app.route("/",            methods=["POST"])
def webhook():
    sig  = request.headers.get("X-Line-Signature", "")
    body = request.get_data()
    if not _verify_sig(body, sig):
        abort(400, "Invalid signature")
    try:
        payload = json.loads(body)
    except Exception:
        abort(400, "Bad JSON")

    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        msg = event.get("message", {})
        if msg.get("type") != "text":
            continue
        text  = msg.get("text", "").strip()
        token = event.get("replyToken", "")
        if not text or not token:
            continue
        if TRIGGER not in text:
            continue

        question = text.replace(TRIGGER, "").strip(" ,，:：")
        if not question:
            _reply(token, "您好！我是阿標。請在訊息中說明業務別並提問，例如：\n「阿標 採購 小額採購限額多少？」")
            continue

        # 業務判斷：有講業務→只搜該業務（精準）；沒講→搜全部業務（不卡使用者）
        business = detect_business(question)
        log_question = question
        if business is not None:
            targets = [business]
            biz_name = business["name"]
            for kw in business.get("keywords", []):
                log_question = log_question.replace(kw, "", 1)
            log_question = log_question.strip(" ,，:：、")
        else:
            targets = BUSINESSES            # 跨全部業務搜尋
            biz_name = "未指定"

        # 回答
        try:
            answer, warns = answer_for_businesses(targets, question)
        except Exception as e:
            answer, warns = f"系統錯誤：{e}", ""
        _reply(token, answer)

        # 命中既有 FAQ → 已涵蓋，不重複寫入待審核
        if warns != "命中FAQ":
            ts = _now_tw().strftime("%Y%m%d%H%M%S")
            row = [ts, biz_name, "", log_question or question, answer, "", "", "", "待審核", warns]
            _append_review_row(row)

    return "OK", 200

@app.route("/",            methods=["GET"])
@app.route("/webhook",     methods=["GET"])
@app.route("/api/webhook", methods=["GET"])
def health():
    try:
        idx = _get_index()
        stats = idx.describe_index_stats()
        ns_info = stats.get("namespaces", {}) if isinstance(stats, dict) else {}
        biz = "、".join(b["name"] for b in BUSINESSES)
        return (f"✅ 阿標多業務 RAG 運行中\n啟用業務：{biz}\n"
                f"向量總數：{stats.get('total_vector_count', '?')}\n"
                f"namespaces：{list(ns_info.keys())}"), 200
    except Exception as e:
        return f"⚠️ 狀態檢查失敗：{e}", 200
