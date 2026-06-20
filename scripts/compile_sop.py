"""
把一個 Drive 資料夾「SOP 化」：依資料夾/檔名的自然順序(1、2、3…)走訪，
把每個檔的完整內容鉅細靡遺串成「一份有序的大文件」，
產出 TXT(可下載檢視)並直接建進阿標索引(單一有序文件，順序被保留)。

用資料夾命名來決定順序，不靠模型推斷。重跑會先清掉舊的 SOP 向量再重建。
需環境變數：SOP_FOLDER_ID（要彙編的資料夾）、GOOGLE_SERVICE_ACCOUNT_JSON、PINECONE_API_KEY、GEMINI_API_KEY
"""
import os
import re
import hashlib

# 重用 build_index 既有的抽取/嵌入/索引邏輯
from build_index import (drive_service, extract_text, embed, get_index,
                         chunk_text, upsert)
from pinecone import Pinecone

ROOT       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def _folder_id():
    fid = os.environ.get("SOP_FOLDER_ID", "").strip()
    if fid:
        return fid
    p = os.path.join(ROOT, "data", "sop_folder.txt")        # 後備：repo 內設定檔
    return open(p, encoding="utf-8").read().strip() if os.path.exists(p) else ""
FOLDER     = _folder_id()
OUT        = os.path.join(ROOT, "data", "sop_compiled.txt")
SOP_FID    = "SOP_COMPILED"                 # 固定 file_id，重跑覆蓋
SOP_SOURCE = "SOP彙編（依資料夾順序）"
NS         = ""                             # 放採購 namespace，阿標查得到

def natkey(name):
    """自然排序：1,2,…,10,11 與 1.1<1.2 都正確。"""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]

def walk(service, folder_id, prefix=""):
    files, page = [], None
    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="nextPageToken, files(id,name,mimeType,size)",
            pageToken=page, pageSize=200).execute()
        files += resp.get("files", [])
        page = resp.get("nextPageToken")
        if not page:
            break
    files.sort(key=lambda f: natkey(f["name"]))
    items = []
    for f in files:
        path = prefix + f["name"]
        if f["mimeType"] == "application/vnd.google-apps.folder":
            items.append((path + "/", None))                 # 資料夾標題
            items += walk(service, f["id"], path + "/")
        else:
            txt = extract_text(service, f)
            items.append((path, (txt or "").strip() or "（此檔無法擷取文字）"))
    return items

def main():
    service = drive_service()
    items = walk(service, FOLDER)
    parts = []
    for path, txt in items:
        if txt is None:
            parts.append(f"\n\n========== 【{path}】 ==========")
        else:
            parts.append(f"\n----- 【{path}】 -----\n{txt}")
    big = "\n".join(parts).strip()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(big)
    n_files = sum(1 for _, t in items if t is not None)
    print(f"彙編完成：{len(items)} 個項目（{n_files} 個檔）→ {OUT}（{len(big)} 字）", flush=True)

    # 建索引：先用「推算的 chunk id 範圍」刪掉舊的 SOP 向量(serverless 不支援 filter 刪)
    idx = get_index(Pinecone(api_key=os.environ["PINECONE_API_KEY"]))
    old = [hashlib.md5(f"{SOP_FID}:{i}".encode()).hexdigest() for i in range(5000)]
    for i in range(0, len(old), 1000):
        try:
            idx.delete(ids=old[i:i+1000], namespace=NS)
        except Exception as e:
            print(f"清舊 SOP 略過：{e}")
            break
    chunks = chunk_text(big, SOP_SOURCE, SOP_FID, "compiled", NS)
    for i in range(0, len(chunks), 100):
        bc = chunks[i:i+100]
        upsert(idx, NS, bc, embed([f"{c['source']}\n{c['text']}" for c in bc]), "doc")
    print(f"已索引為單一有序文件：{len(chunks)} 片段", flush=True)

if __name__ == "__main__":
    main()
