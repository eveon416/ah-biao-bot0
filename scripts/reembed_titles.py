"""
一次性重嵌：把索引內既有向量改用 Gemini 強模型（gemini-embedding-001, 512維）重算。
列舉手法：用多個「不同方向」的種子向量各撈 top_k=10000 再聯集去重，
即使單一 namespace 超過一萬筆也能近乎全數涵蓋（避開 list() 在此版本回傳空的問題）。
只重算 values，metadata 不動。
"""
import os
import json
import time
import math
import urllib.request
from pinecone import Pinecone

KEY    = os.environ["PINECONE_API_KEY"]
NAME   = os.environ.get("PINECONE_INDEX_NAME") or "ah-biao-bot"
GKEY   = os.environ["GEMINI_API_KEY"]
EMBED_DIM   = 512
NAMESPACES  = ["", "zongwu", "renshi", "gongwen"]

# 多個方向相異的種子向量 → 各自 top_k 涵蓋不同子集，聯集後近乎全覆蓋
SEEDS = [
    [0.001] * EMBED_DIM,
    [((-1) ** i) * 0.05 for i in range(EMBED_DIM)],
    [math.sin(i) * 0.05 for i in range(EMBED_DIM)],
    [math.cos(i * 1.7) * 0.05 for i in range(EMBED_DIM)],
    [((i % 11) - 5) * 0.02 for i in range(EMBED_DIM)],
    [math.sin(i * 0.3 + 1) * 0.05 for i in range(EMBED_DIM)],
]

pc  = Pinecone(api_key=KEY)
idx = pc.Index(NAME)

def _l2(v):
    s = sum(x * x for x in v) ** 0.5
    return [x / s for x in v] if s else v

def gemini_embed(texts):
    reqs = [{"model": "models/gemini-embedding-001",
             "content": {"parts": [{"text": (t or " ")}]},
             "outputDimensionality": EMBED_DIM,
             "taskType": "RETRIEVAL_DOCUMENT"} for t in texts]
    body = json.dumps({"requests": reqs}).encode()
    url = ("https://generativelanguage.googleapis.com/v1beta/"
           f"models/gemini-embedding-001:batchEmbedContents?key={GKEY}")
    last = ""
    for _ in range(6):
        try:
            req = urllib.request.Request(url, data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                j = json.loads(r.read())
            return [_l2(e["values"]) for e in j["embeddings"]]
        except Exception as e:
            last = str(e)
            time.sleep(6)
    raise RuntimeError(f"Gemini 嵌入失敗：{last}")

def text_for(md):
    txt = md.get("text", "")
    if md.get("source_type", "doc") == "doc":
        return f"{md.get('source','')}\n{txt}"     # 文件：檔名＋內容
    return txt                                      # FAQ / outline：原文

def collect(ns):
    """多種子聯集，回傳 {id: metadata}。"""
    found = {}
    for s in SEEDS:
        res = idx.query(vector=s, top_k=10000, include_metadata=True, namespace=ns)
        ms = res.get("matches", []) if isinstance(res, dict) else getattr(res, "matches", [])
        for m in ms:
            mid = m.get("id") if hasattr(m, "get") else m["id"]
            md  = (m.get("metadata") if hasattr(m, "get") else m["metadata"]) or {}
            found[mid] = md
        print(f"    種子撈取後累計唯一向量：{len(found)}", flush=True)
    return found

def reembed_ns(ns):
    found = collect(ns)
    items = list(found.items())
    print(f"  ns='{ns}'：唯一向量 {len(items)}", flush=True)
    done = 0
    for i in range(0, len(items), 100):
        batch = items[i:i+100]
        embs = gemini_embed([text_for(md) for _, md in batch])
        ups = [{"id": vid, "values": e, "metadata": md}
               for (vid, md), e in zip(batch, embs)]
        idx.upsert(vectors=ups, namespace=ns)
        done += len(ups)
        print(f"    重嵌 {done}/{len(items)}", flush=True)
    return done

def main():
    total = 0
    for ns in NAMESPACES:
        print(f"=== namespace='{ns}' ===", flush=True)
        total += reembed_ns(ns)
    print(f"\n🎉 Gemini 重嵌完成：{total} 個向量", flush=True)

if __name__ == "__main__":
    main()
