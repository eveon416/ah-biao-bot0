"""
LINE Bot Webhook — Vercel Serverless Function
All logic is self-contained in this single file to avoid import issues.
"""

import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

# ── 路徑修正：讓 data/ 資料夾可被找到 ──────────────────────────────────────
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from flask import Flask, request, abort

app = Flask(__name__)

# ── 設定 ─────────────────────────────────────────────────────────────────────
GEMINI_API_KEY    = os.environ.get("GEMINI_API_KEY", "")
LINE_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "")
LINE_REPLY_URL    = "https://api.line.me/v2/bot/message/reply"
INDEX_PATH        = os.path.join(ROOT, "data", "knowledge_base.json")
EMBED_MODEL       = "models/text-embedding-004"
GEN_MODEL         = "gemini-1.5-flash"
TOP_K             = 5

# ── 向量索引（冷啟動時載入一次）─────────────────────────────────────────────
_INDEX = None

def _load_index():
    global _INDEX
    if _INDEX is not None:
        return _INDEX
    if not os.path.exists(INDEX_PATH):
        _INDEX = {"chunks": [], "_vecs": None}
        return _INDEX
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    chunks = data.get("chunks", [])
    if chunks:
        import numpy as np
        vecs = np.array([c["embedding"] for c in chunks], dtype=np.float32)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        data["_vecs"] = vecs / np.where(norms == 0, 1, norms)
    else:
        data["_vecs"] = None
    _INDEX = data
    return _INDEX


def _cosine_search(query_vec):
    import numpy as np
    idx = _load_index()
    if idx["_vecs"] is None:
        return []
    q = np.array(query_vec, dtype=np.float32)
    q = q / (np.linalg.norm(q) or 1.0)
    scores = idx["_vecs"] @ q
    top_i = np.argsort(scores)[::-1][:TOP_K]
    return [
        {"chunk": idx["chunks"][i], "score": float(scores[i])}
        for i in top_i if scores[i] > 0.3
    ]


# ── Gemini 呼叫（純 urllib，不依賴 SDK）─────────────────────────────────────
def _gemini_post(path, payload):
    url = f"https://generativelanguage.googleapis.com/v1beta/{path}?key={GEMINI_API_KEY}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _embed(text, task_type="RETRIEVAL_QUERY"):
    resp = _gemini_post(f"{EMBED_MODEL}:embedContent", {
        "model": EMBED_MODEL,
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
    })
    return resp["embedding"]["values"]


def _generate(prompt):
    resp = _gemini_post(f"models/{GEN_MODEL}:generateContent", {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2},
    })
    return resp["candidates"][0]["content"]["parts"][0]["text"].strip()


# ── RAG 主流程 ────────────────────────────────────────────────────────────────
def answer_question(user_q: str) -> str:
    idx = _load_index()
    if not idx.get("chunks"):
        return "知識庫目前是空的，請先完成文件索引建置（執行 GitHub Actions: Daily Knowledge Base Sync）。"

    try:
        query_vec = _embed(user_q)
        results   = _cosine_search(query_vec)
    except Exception as e:
        return f"查詢時發生錯誤：{e}"

    if not results:
        return "我在知識庫中找不到相關資訊，請換個方式提問，或確認文件已上傳至 Google 雲端硬碟。"

    ctx = "\n\n---\n\n".join(
        f"【{r['chunk']['source']}】\n{r['chunk']['text']}" for r in results
    )
    prompt = (
        "你是一個知識庫助理，只根據以下資料回答問題。"
        "若資料不足，請直接說明。請用繁體中文回答，語氣親切。\n\n"
        f"參考資料：\n{ctx}\n\n"
        f"問題：{user_q}\n\n回答："
    )
    try:
        return _generate(prompt)
    except Exception as e:
        return f"生成回答時發生錯誤：{e}"


# ── LINE Bot ──────────────────────────────────────────────────────────────────
def _verify_sig(body: bytes, sig: str) -> bool:
    if not LINE_CHANNEL_SECRET:
        return True
    mac = hmac.new(LINE_CHANNEL_SECRET.encode(), body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(mac).decode(), sig)


def _reply(token: str, text: str):
    payload = json.dumps({
        "replyToken": token,
        "messages": [{"type": "text", "text": text[:5000]}],
    }).encode()
    req = urllib.request.Request(
        LINE_REPLY_URL, data=payload,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {LINE_ACCESS_TOKEN}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"LINE reply error: {e}")


# ── Flask routes ──────────────────────────────────────────────────────────────
@app.route("/webhook", methods=["POST"])
@app.route("/",        methods=["POST"])   # fallback
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
        try:
            ans = answer_question(text)
        except Exception as e:
            ans = f"系統錯誤：{e}"
        _reply(token, ans)

    return "OK", 200


@app.route("/", methods=["GET"])
@app.route("/webhook", methods=["GET"])
def health():
    idx   = _load_index()
    count = len(idx.get("chunks", []))
    built = idx.get("built_at", "尚未建置")
    return f"✅ LINE Bot RAG 運行中\n知識庫：{count} 個片段\n建立時間：{built}", 200
