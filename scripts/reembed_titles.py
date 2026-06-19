"""
一次性重嵌：把既有「文件片段」改成「檔名＋內容」一起嵌入，
讓檔名（常是法規/文件全名）成為強檢索訊號，解決法規類問題召回不到的問題。

用 query() 直接取回既有向量的 metadata（source/text）重算 embedding，
不需重新下載 Drive、不需 OCR。只處理 source_type=doc。
（用 query 而非 list/fetch，相容各版本 pinecone 客戶端。）
"""
import os
import traceback
from pinecone import Pinecone
from fastembed import TextEmbedding

KEY  = os.environ["PINECONE_API_KEY"]
NAME = os.environ.get("PINECONE_INDEX_NAME") or "ah-biao-bot"
EMBED_MODEL = "BAAI/bge-small-zh-v1.5"
EMBED_DIM   = 512
EMBED_BATCH = 256
NAMESPACES  = ["", "zongwu", "renshi", "gongwen"]
SEED = [0.001] * EMBED_DIM

pc  = Pinecone(api_key=KEY)
idx = pc.Index(NAME)
_model = TextEmbedding(model_name=EMBED_MODEL)
def embed(texts):
    return [e.tolist() for e in _model.embed(texts, batch_size=EMBED_BATCH)]

def reembed_ns(ns):
    try:
        res = idx.query(vector=SEED, top_k=10000, include_metadata=True,
                        namespace=ns, filter={"source_type": {"$eq": "doc"}})
    except Exception as e:
        print(f"  ns='{ns}' query 失敗：{e}")
        return 0
    matches = res.get("matches", []) if isinstance(res, dict) else getattr(res, "matches", [])
    items = []
    for m in matches:
        mid = m.get("id") if hasattr(m, "get") else m["id"]
        md  = (m.get("metadata") if hasattr(m, "get") else m["metadata"]) or {}
        src = md.get("source", "")
        txt = md.get("text", "")
        if txt:
            items.append((mid, dict(md), f"{src}\n{txt}"))
    print(f"  ns='{ns}'：文件片段 {len(items)}（共回 {len(matches)} 筆）")
    done = 0
    for i in range(0, len(items), EMBED_BATCH):
        bi = items[i:i+EMBED_BATCH]
        embs = embed([t for _, _, t in bi])
        ups = [{"id": vid, "values": e, "metadata": md}
               for (vid, md, _), e in zip(bi, embs)]
        for j in range(0, len(ups), 100):
            idx.upsert(vectors=ups[j:j+100], namespace=ns)
        done += len(ups)
        print(f"    重嵌 {done}/{len(items)}")
    return done

def main():
    total = 0
    for ns in NAMESPACES:
        print(f"=== namespace='{ns}' ===")
        try:
            total += reembed_ns(ns)
        except Exception:
            print(traceback.format_exc())
    print(f"\n🎉 完成！重嵌文件片段：{total}")

if __name__ == "__main__":
    main()
