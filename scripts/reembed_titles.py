"""
一次性重嵌：把既有「文件片段」改成「檔名＋內容」一起嵌入，
讓檔名（常是法規/文件全名）成為強檢索訊號，解決法規類問題召回不到的問題。

直接讀 Pinecone 既有向量的 metadata（source/text）重算 embedding，
不需重新下載 Drive、不需 OCR，速度快。只處理 source_type=doc。
"""
import os
from pinecone import Pinecone
from fastembed import TextEmbedding

KEY  = os.environ["PINECONE_API_KEY"]
NAME = os.environ.get("PINECONE_INDEX_NAME", "ah-biao-bot")
EMBED_MODEL = "BAAI/bge-small-zh-v1.5"
EMBED_BATCH = 256
NAMESPACES  = ["", "zongwu", "renshi", "gongwen"]

pc  = Pinecone(api_key=KEY)
idx = pc.Index(NAME)
_model = TextEmbedding(model_name=EMBED_MODEL)
def embed(texts):
    return [e.tolist() for e in _model.embed(texts, batch_size=EMBED_BATCH)]

def _meta(v):
    return getattr(v, "metadata", None) or (v.get("metadata") if isinstance(v, dict) else {}) or {}

def reembed_ns(ns):
    # 收集此 namespace 所有向量 id
    ids = []
    try:
        for page in idx.list(namespace=ns):
            ids.extend(page)
    except Exception as e:
        print(f"  ns='{ns}' list 失敗：{e}")
        return 0
    print(f"  ns='{ns}'：共 {len(ids)} 個向量")
    done = 0
    FETCH = 200
    for i in range(0, len(ids), FETCH):
        batch_ids = ids[i:i+FETCH]
        fr = idx.fetch(ids=batch_ids, namespace=ns)
        vectors = getattr(fr, "vectors", None) or fr.get("vectors", {})
        items = []
        for vid, v in vectors.items():
            md = _meta(v)
            if md.get("source_type") != "doc":     # 只重嵌文件；FAQ/outline 維持原樣
                continue
            src = md.get("source", "")
            txt = md.get("text", "")
            if not txt:
                continue
            items.append((vid, dict(md), f"{src}\n{txt}"))
        if not items:
            continue
        embs = embed([t for _, _, t in items])
        ups = [{"id": vid, "values": e, "metadata": md}
               for (vid, md, _), e in zip(items, embs)]
        for j in range(0, len(ups), 100):
            idx.upsert(vectors=ups[j:j+100], namespace=ns)
        done += len(ups)
        print(f"    重嵌進度 {min(i+FETCH, len(ids))}/{len(ids)}（本批 {len(ups)}）")
    return done

def main():
    total = 0
    for ns in NAMESPACES:
        print(f"=== namespace='{ns}' ===")
        total += reembed_ns(ns)
    print(f"\n🎉 完成！重嵌文件片段：{total}")

if __name__ == "__main__":
    main()
