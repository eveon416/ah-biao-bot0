"""
LINE Bot Webhook — Vercel Serverless Function
Queries Pinecone for relevant chunks, generates answer with Gemini.
"""

import base64
import hashlib
import hmac
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from flask import Flask, request, abort

app = Flask(__name__)

GEMINI_API_KEY      = os.environ.get("GEMINI_API_KEY", "")
LINE_ACCESS_TOKEN   = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "")
PINECONE_API_KEY    = os.environ.get("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "ah-biao-bot")
LINE_REPLY_URL      = "https://api.line.me/v2/bot/message/reply"
EMBED_MODEL         = "models/text-embedding-004"
GEN_MODEL           = "gemini-1.5-flash"
TOP_K               = 6

# ── Pinecone client (lazy init) ───────────────────────────────────────────
_pinecone_index = None

def _get_index():
    global _pinecone_index
    if _pinecone_index is not None:
        return _pinecone_index
    from pinecone import Pinecone
    pc = Pinecone(api_key=PINECONE_API_KEY)
    _pinecone_index = pc.Index(PINECONE_INDEX_NAME)
    return _pinecone_index

# ── Gemini via urllib (no SDK dependency at import time) ──────────────────
def _gemini_post(path, payload):
    url = f"https://generativelanguage.googleapis.com/v1beta/{path}?key={GEMINI_API_KEY}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())

def _embed(text):
    resp = _gemini_post(f"{EMBED_MODEL}:embedContent", {
        "model": EMBED_MODEL,
        "content": {"parts": [{"text": text}]},
        "taskType": "RETRIEVAL_QUERY",
    })
    return resp["embedding"]["values"]

def _generate(prompt):
    resp = _gemini_post(f"models/{GEN_MODEL}:generateContent", {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1024},
    })
    return resp["candidates"][0]["content"]["parts"][0]["text"].strip()

# ── RAG ───────────────────────────────────────────────────────────────────
def answer_question(user_q: str) -> str:
    if not PINECONE_API_KEY:
        return "系統尚未設定向量資料庫，請聯絡管理員。"

    try:
        query_vec = _embed(user_q)
    except Exception as e:
        return f"查詢時發生錯誤：{e}"

    try:
        index = _get_index()
        results = index.query(
            vector=query_vec,
            top_k=TOP_K,
            include_metadata=True,
        )
        matches = results.get("matches", [])
    except Exception as e:
        return f"資料庫查詢失敗：{e}"

    # Filter low-score matches
    relevant = [m for m in matches if m.get("score", 0) > 0.3]
    if not relevant:
        return "知識庫中找不到相關的採購資料，請換個方式提問或確認文件是否已建立索引。"

    ctx_parts = []
    for m in relevant:
        meta = m.get("metadata", {})
        source = meta.get("source", "未知來源")
        text   = meta.get("text", "")
        ctx_parts.append(f"【{source}】\n{text}")
    context = "\n\n---\n\n".join(ctx_parts)

    prompt = (
        "你是花衛局採購業務助理，只根據以下採購相關資料回答問題。\n"
        "若資料中找不到答案，請明確說明。回答請使用繁體中文，語氣親切專業。\n\n"
        f"參考資料：\n{context}\n\n"
        f"問題：{user_q}\n\n回答："
    )

    try:
        return _generate(prompt)
    except Exception as e:
        return f"生成回答時發生錯誤：{e}"

# ── LINE Bot ──────────────────────────────────────────────────────────────
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

# ── Flask routes ──────────────────────────────────────────────────────────
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
        try:
            ans = answer_question(text)
        except Exception as e:
            ans = f"系統錯誤：{e}"
        _reply(token, ans)
    return "OK", 200

@app.route("/",            methods=["GET"])
@app.route("/webhook",     methods=["GET"])
@app.route("/api/webhook", methods=["GET"])
def health():
    try:
        idx   = _get_index()
        stats = idx.describe_index_stats()
        count = stats.total_vector_count
        status = f"✅ LINE Bot RAG 運行中\n向量數：{count:,}\n資料來源：採購-Antigravity"
    except Exception as e:
        status = f"⚠️ Pinecone 連線失敗：{e}"
    return status, 200
