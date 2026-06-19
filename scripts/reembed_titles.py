"""
一次性重嵌：把索引內「所有」既有向量改用 Gemini 強模型（gemini-embedding-001, 512維）重算。
用 list()+fetch() 逐頁取回，確保超過 1 萬筆也一個不漏；只重算 values，metadata 不動。

- 文件(doc)：以「檔名＋內容」一起嵌入（檔名是強檢索訊號）
- FAQ / outline：用既有文字嵌入
- 全部 RETRIEVAL_DOCUMENT、512維、L2 正規化（與查詢端一致）
"""
import os
import json
import time
import urllib.request
from pinecone import Pinecone

KEY    = os.environ["PINECONE_API_KEY"]
NAME   = os.environ.get("PINECONE_INDEX_NAME") or "ah-biao-bot"
GKEY   = os.environ["GEMINI_API_KEY"]
EMBED_DIM   = 512
NAMESPACES  = ["", "zongwu", "renshi", "gongwen"]

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

def _meta(v):
    return (getattr(v, "metadata", None)
            or (v.get("metadata") if isinstance(v, dict) else {}) or {})

def all_ids(ns):
    ids = []
    for page in idx.list(namespace=ns):            # serverless：逐頁回傳 id 清單
        ids.extend(list(page))
    return ids

def reembed_ns(ns):
    ids = all_ids(ns)
    print(f"  ns='{ns}'：共 {len(ids)} 個向量", flush=True)
    done = 0
    for i in range(0, len(ids), 100):
        batch = ids[i:i+100]
        fr = idx.fetch(ids=batch, namespace=ns)
        vecs = getattr(fr, "vectors", None) or fr.get("vectors", {})
        items = [(vid, _meta(v)) for vid, v in vecs.items()]
        if not items:
            continue
        embs = gemini_embed([text_for(md) for _, md in items])
        ups = [{"id": vid, "values": e, "metadata": md}
               for (vid, md), e in zip(items, embs)]
        idx.upsert(vectors=ups, namespace=ns)
        done += len(ups)
        print(f"    {done}/{len(ids)}", flush=True)
    return done

def main():
    total = 0
    for ns in NAMESPACES:
        print(f"=== namespace='{ns}' ===", flush=True)
        total += reembed_ns(ns)
    print(f"\n🎉 Gemini 重嵌完成：{total} 個向量", flush=True)

if __name__ == "__main__":
    main()
