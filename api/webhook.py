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

# ── Gemini 生成（urllib）────────────────────────────────────────────────────
def _gemini_post(path, payload):
    url = f"https://generativelanguage.googleapis.com/v1beta/{path}?key={GEMINI_API_KEY}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())

def _generate(prompt):
    resp = _gemini_post(f"models/{GEN_MODEL}:generateContent", {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048,
                              "thinkingConfig": {"thinkingBudget": 0}},
    })
    cand = resp["candidates"][0]
    parts = cand.get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts).strip()

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

# ── RAG 主流程 ────────────────────────────────────────────────────────────────
def answer_for_business(business, question):
    """回傳 (使用者答案, 警示字串)。"""
    ns = business.get("namespace", "")
    try:
        qvec = _embed(question)
    except Exception as e:
        return f"查詢時發生錯誤：{e}", ""

    matches = []
    try:
        idx = _get_index()
        res = idx.query(vector=qvec, top_k=TOP_K, include_metadata=True, namespace=ns)
        matches = res.get("matches", [])
        # namespace 尚未建好時（移轉期）退回預設 namespace
        if not matches and ns:
            res = idx.query(vector=qvec, top_k=TOP_K, include_metadata=True, namespace="")
            matches = res.get("matches", [])
    except Exception as e:
        return f"資料庫查詢失敗：{e}", ""

    # ── FAQ 優先：問題與某條已審查 FAQ 高度相符 → 直接採用該 FAQ 答案 ──────
    faq_matches = [m for m in matches
                   if m.get("metadata", {}).get("source_type") == "faq"]
    if faq_matches:
        top_faq = max(faq_matches, key=lambda m: m.get("score", 0))
        if top_faq.get("score", 0) >= FAQ_DIRECT_THRESHOLD:
            md = top_faq.get("metadata", {})
            faq_ans = md.get("faq_answer", "")
            if not faq_ans:  # 舊向量沒存答案 → 從 text 退而求其次
                txt = md.get("text", "")
                faq_ans = txt.split("答：", 1)[-1].strip() if "答：" in txt else txt
            if faq_ans:
                return faq_ans, "命中FAQ"

    relevant = [m for m in matches if m.get("score", 0) > 0.3]
    if not relevant:
        ans = f"我在「{business['name']}」的資料中找不到相關內容，請換個方式提問，或確認文件／FAQ 是否已收錄。"
        return ans, ""

    ctx = "\n\n---\n\n".join(
        f"【{m.get('metadata',{}).get('source','來源')}】\n{m.get('metadata',{}).get('text','')}"
        for m in relevant)

    prompt = (
        f"你是花蓮縣衛生局「{business['name']}」業務助理，只根據以下資料回答問題。\n"
        "若資料中找不到答案，請明確說明，不要編造。回答用繁體中文，語氣親切專業。\n"
        "規則：若你的回答中提到『具體人名』（例如某承辦人姓名，而非單位或職稱），"
        "請在整則回答的最後另起一行，單獨輸出標記 [HASNAME]；若沒有人名則不要輸出該標記。\n\n"
        f"參考資料：\n{ctx}\n\n問題：{question}\n\n回答："
    )
    try:
        raw = _generate(prompt)
    except Exception as e:
        return f"生成回答時發生錯誤：{e}", ""

    name_flag = "[HASNAME]" in raw
    answer = raw.replace("[HASNAME]", "").strip()
    warns = compute_warnings(answer, relevant, name_flag)
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

        # 業務判斷
        business = detect_business(question)
        # 記錄到待審核時，把業務關鍵字從問題開頭去掉，讓問題更乾淨
        log_question = question
        if business is not None:
            for kw in business.get("keywords", []):
                log_question = log_question.replace(kw, "", 1)
            log_question = log_question.strip(" ,，:：、")
        if business is None:
            names = "、".join(b["name"] for b in BUSINESSES) or "（尚未設定業務）"
            _reply(token, f"請問您要詢問的是哪一個業務呢？目前可詢問：{names}。\n"
                          f"例如：「阿標 採購 …」")
            continue

        # 回答
        try:
            answer, warns = answer_for_business(business, question)
        except Exception as e:
            answer, warns = f"系統錯誤：{e}", ""
        _reply(token, answer)

        # 命中既有 FAQ → 已涵蓋，不重複寫入待審核（避免灌爆）
        # 其餘（RAG 重組的答案）才寫入待審核，供你日後決定是否收錄
        if warns != "命中FAQ":
            ts = _now_tw().strftime("%Y%m%d%H%M%S")
            row = [ts, business["name"], "", log_question or question, answer, "", "", "", "待審核", warns]
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
