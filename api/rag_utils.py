"""RAG utilities: load index, search, generate answer."""

import json
import os

import google.generativeai as genai
import numpy as np

_INDEX = None
INDEX_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "knowledge_base.json")
EMBED_MODEL = "models/text-embedding-004"
GEN_MODEL = "gemini-1.5-flash"
TOP_K = 5


def _load_index():
    global _INDEX
    if _INDEX is not None:
        return _INDEX
    path = os.path.abspath(INDEX_PATH)
    if not os.path.exists(path):
        _INDEX = {"chunks": [], "built_at": None}
        return _INDEX
    with open(path, "r", encoding="utf-8") as f:
        _INDEX = json.load(f)
    # pre-compute numpy array for fast cosine search
    if _INDEX["chunks"]:
        vecs = np.array([c["embedding"] for c in _INDEX["chunks"]], dtype=np.float32)
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        _INDEX["_vecs"] = vecs / np.where(norms == 0, 1, norms)
    else:
        _INDEX["_vecs"] = None
    return _INDEX


def _cosine_search(query_vec, top_k=TOP_K):
    idx = _load_index()
    if idx["_vecs"] is None:
        return []
    q = np.array(query_vec, dtype=np.float32)
    q = q / (np.linalg.norm(q) or 1.0)
    scores = idx["_vecs"] @ q
    top_indices = np.argsort(scores)[::-1][:top_k]
    return [
        {"chunk": idx["chunks"][i], "score": float(scores[i])}
        for i in top_indices
        if scores[i] > 0.3  # minimum relevance threshold
    ]


def answer_question(user_question: str, gemini_api_key: str) -> str:
    genai.configure(api_key=gemini_api_key)

    idx = _load_index()
    if not idx["chunks"]:
        return "知識庫目前是空的，請先完成文件索引建置。"

    # embed the query
    embed_result = genai.embed_content(
        model=EMBED_MODEL,
        content=user_question,
        task_type="RETRIEVAL_QUERY",
    )
    query_vec = embed_result["embedding"]

    results = _cosine_search(query_vec)
    if not results:
        return "我在知識庫中找不到與您問題相關的資訊，請換個方式提問或確認文件已上傳。"

    context_parts = []
    for r in results:
        chunk = r["chunk"]
        context_parts.append(f"【來源：{chunk['source']}】\n{chunk['text']}")
    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""你是一個知識庫助理，請根據以下參考資料回答使用者的問題。
只使用提供的資料來回答，如果資料中沒有足夠資訊，請直接說明。
回答請使用繁體中文，語氣親切自然。

參考資料：
{context}

使用者問題：{user_question}

回答："""

    model = genai.GenerativeModel(GEN_MODEL)
    response = model.generate_content(prompt)
    return response.text.strip()
