"""
LINE Bot Webhook — Vercel Serverless Function (Flask/WSGI)
Env vars required on Vercel:
  GEMINI_API_KEY
  LINE_CHANNEL_ACCESS_TOKEN
  LINE_CHANNEL_SECRET
"""

import hashlib
import hmac
import base64
import json
import os

from flask import Flask, request, abort
import google.generativeai as genai

from rag_utils import answer_question

app = Flask(__name__)

LINE_API_URL = "https://api.line.me/v2/bot/message/reply"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
LINE_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "")


def _verify_signature(body: bytes, signature: str) -> bool:
    """Verify LINE webhook signature."""
    if not LINE_CHANNEL_SECRET:
        return True  # skip in dev without secret
    mac = hmac.new(
        LINE_CHANNEL_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()
    expected = base64.b64encode(mac).decode("utf-8")
    return hmac.compare_digest(expected, signature)


def _reply(reply_token: str, text: str):
    import urllib.request
    payload = {
        "replyToken": reply_token,
        "messages": [{"type": "text", "text": text[:5000]}],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        LINE_API_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LINE_ACCESS_TOKEN}",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"LINE reply error: {e}")


@app.route("/webhook", methods=["POST"])
def webhook():
    signature = request.headers.get("X-Line-Signature", "")
    body = request.get_data()

    if not _verify_signature(body, signature):
        abort(400, "Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        abort(400, "Invalid JSON")

    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        msg = event.get("message", {})
        if msg.get("type") != "text":
            continue

        user_text = msg.get("text", "").strip()
        reply_token = event.get("replyToken", "")

        if not user_text or not reply_token:
            continue

        try:
            answer = answer_question(user_text, GEMINI_API_KEY)
        except Exception as e:
            print(f"RAG error: {e}")
            answer = "系統發生錯誤，請稍後再試。"

        _reply(reply_token, answer)

    return "OK", 200


@app.route("/", methods=["GET"])
def health():
    return "LINE Bot RAG is running.", 200
