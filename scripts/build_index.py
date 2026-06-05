"""
多業務索引 + 凌晨同步腳本（GitHub Actions 每天執行）

每個啟用的業務（businesses.json）會：
  1. 同步：把「待審核」分頁中 狀態=已審查 且屬於該業務的列，搬到該業務正式分頁，
     並從待審核移除。
  2. 索引文件：掃描該業務的 Drive 資料夾 → 本地 fastembed → 寫入該業務 namespace。
     （掃描檔 PDF 會嘗試 OCR）
  3. 索引 FAQ：把該業務正式分頁的問答也建索引（source_type=faq），納入查詢。

需要的環境變數：
  GOOGLE_SERVICE_ACCOUNT_JSON, PINECONE_API_KEY, PINECONE_INDEX_NAME(選填)
"""

import io
import os
import json
import time
import hashlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

from google.oauth2 import service_account
import google.auth.transport.requests
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from pinecone import Pinecone, ServerlessSpec
from fastembed import TextEmbedding

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── 設定 ─────────────────────────────────────────────────────────────────────
PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
INDEX_NAME       = os.environ.get("PINECONE_INDEX_NAME", "ah-biao-bot")
SA_INFO          = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
EMBED_MODEL_NAME = "BAAI/bge-small-zh-v1.5"
EMBED_DIM        = 512
CHUNK_SIZE       = 800
CHUNK_OVERLAP    = 150
EMBED_BATCH      = 256
MAX_FILE_MB      = 20
OCR_MAX_PAGES    = 15        # 每個掃描 PDF 最多 OCR 頁數
OCR_MIN_TEXT     = 80        # 抽出文字少於此字數 → 視為掃描檔，嘗試 OCR

with open(os.path.join(ROOT, "businesses.json"), "r", encoding="utf-8") as f:
    CONFIG = json.load(f)
FAQ_SHEET_ID = CONFIG["faq_sheet_id"]
REVIEW_TAB   = CONFIG.get("review_tab", "待審核")
BUSINESSES   = [b for b in CONFIG["businesses"] if b.get("enabled")]

SKIP_MIMES = {"image/", "video/", "audio/", "application/zip", "application/x-zip",
              "application/x-rar", "application/octet-stream", "application/vnd.ms-powerpoint"}
def should_skip(m): return any(m.startswith(x) for x in SKIP_MIMES)

def now_tw_date(): return datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")

# ── Google 憑證 ───────────────────────────────────────────────────────────────
def drive_service():
    creds = service_account.Credentials.from_service_account_info(
        SA_INFO, scopes=["https://www.googleapis.com/auth/drive.readonly"])
    return build("drive", "v3", credentials=creds)

def sheets_token():
    creds = service_account.Credentials.from_service_account_info(
        SA_INFO, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

# ── Sheets REST helpers ──────────────────────────────────────────────────────
def _sheet_req(method, path, body=None):
    token = sheets_token()
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
          headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sheet_read(tab):
    rng = urllib.parse.quote(f"{tab}!A1:J5000")
    resp = _sheet_req("GET", f"{FAQ_SHEET_ID}/values/{rng}")
    return resp.get("values", [])

def sheet_append(tab, rows):
    if not rows:
        return
    rng = urllib.parse.quote(f"{tab}!A1")
    _sheet_req("POST",
        f"{FAQ_SHEET_ID}/values/{rng}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
        {"values": rows})

def sheet_tab_id(tab):
    meta = _sheet_req("GET", f"{FAQ_SHEET_ID}?fields=sheets.properties")
    for s in meta.get("sheets", []):
        if s["properties"]["title"] == tab:
            return s["properties"]["sheetId"]
    return None

def sheet_delete_rows(tab, row_indices_zero_based):
    """刪除指定的列（0-based，含表頭列為第0列）。由大到小刪避免位移。"""
    if not row_indices_zero_based:
        return
    sid = sheet_tab_id(tab)
    if sid is None:
        return
    reqs = []
    for idx in sorted(row_indices_zero_based, reverse=True):
        reqs.append({"deleteDimension": {"range": {
            "sheetId": sid, "dimension": "ROWS",
            "startIndex": idx, "endIndex": idx + 1}}})
    _sheet_req("POST", f"{FAQ_SHEET_ID}:batchUpdate", {"requests": reqs})

# ── Drive 掃描 / 取文字 ───────────────────────────────────────────────────────
def list_files(service, folder_id, depth=0):
    files, page = [], None
    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="nextPageToken, files(id,name,mimeType,modifiedTime,size)",
            pageToken=page, pageSize=100).execute()
        for f in resp.get("files", []):
            if f["mimeType"] == "application/vnd.google-apps.folder":
                files.extend(list_files(service, f["id"], depth + 1))
            elif not should_skip(f["mimeType"]):
                if int(f.get("size", 0)) / 1024 / 1024 <= MAX_FILE_MB:
                    files.append(f)
        page = resp.get("nextPageToken")
        if not page:
            break
    return files

def _download(service, fid, export_mime=None):
    if export_mime:
        req = service.files().export_media(fileId=fid, mimeType=export_mime)
    else:
        req = service.files().get_media(fileId=fid)
    buf = io.BytesIO()
    dl = MediaIoBaseDownload(buf, req)
    done = False
    while not done:
        _, done = dl.next_chunk()
    return buf.getvalue()

def _pdf_text(raw, name):
    try:
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(raw))
        return "\n".join(p.extract_text() or "" for p in r.pages)
    except Exception as e:
        print(f"  ⚠ PDF 解析失敗 {name}: {e}")
        return ""

def _ocr_pdf(raw, name):
    """掃描 PDF 用 OCR 取文字（需 tesseract + poppler）。"""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
        images = convert_from_bytes(raw, dpi=200, first_page=1, last_page=OCR_MAX_PAGES)
        out = []
        for im in images:
            out.append(pytesseract.image_to_string(im, lang="chi_tra+eng"))
        text = "\n".join(out)
        if text.strip():
            print(f"  🔍 OCR 取得 {len(text)} 字：{name}")
        return text
    except Exception as e:
        print(f"  ⚠ OCR 失敗 {name}: {e}")
        return ""

def _docx_text(raw, name):
    try:
        from docx import Document
        return "\n".join(p.text for p in Document(io.BytesIO(raw)).paragraphs)
    except Exception as e:
        print(f"  ⚠ DOCX 失敗 {name}: {e}")
        return ""

def _xlsx_text(raw, name):
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        rows = []
        for ws in wb.worksheets:
            for row in ws.iter_rows(values_only=True):
                line = "\t".join(str(c) if c is not None else "" for c in row)
                if line.strip():
                    rows.append(line)
        return "\n".join(rows)
    except Exception as e:
        print(f"  ⚠ XLSX 失敗 {name}: {e}")
        return ""

DOCX_MIMES = {"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/msword"}
XLSX_MIMES = {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "application/vnd.ms-excel"}

def extract_text(service, f):
    mime, fid, name = f["mimeType"], f["id"], f["name"]
    try:
        if mime == "application/vnd.google-apps.document":
            return _download(service, fid, "text/plain").decode("utf-8", "ignore")
        if mime == "application/vnd.google-apps.spreadsheet":
            return _download(service, fid, "text/csv").decode("utf-8", "ignore")
        if mime == "application/vnd.google-apps.presentation":
            return _download(service, fid, "text/plain").decode("utf-8", "ignore")
        if mime == "application/pdf":
            raw = _download(service, fid)
            text = _pdf_text(raw, name)
            if len((text or "").strip()) < OCR_MIN_TEXT:   # 疑似掃描檔 → OCR
                text = _ocr_pdf(raw, name) or text
            return text
        if mime in DOCX_MIMES:
            return _docx_text(_download(service, fid), name)
        if mime in XLSX_MIMES:
            return _xlsx_text(_download(service, fid), name)
        if mime.startswith("text/"):
            return _download(service, fid).decode("utf-8", "ignore")
    except Exception as e:
        print(f"  ⚠ 讀取失敗 {name}: {e}")
    return ""

def chunk_text(text, source, file_id, modified, namespace):
    text = (text or "").strip()
    if not text:
        return []
    out, start, idx = [], 0, 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        out.append({
            "id": hashlib.md5(f"{namespace}:{file_id}:{idx}".encode()).hexdigest(),
            "text": text[start:end], "source": source,
            "file_id": file_id, "modified": modified, "chunk_idx": idx,
        })
        start += CHUNK_SIZE - CHUNK_OVERLAP
        idx += 1
    return out

# ── Embedding ────────────────────────────────────────────────────────────────
_model = None
def get_model():
    global _model
    if _model is None:
        print(f"  載入本地 embedding 模型 {EMBED_MODEL_NAME} ...")
        _model = TextEmbedding(model_name=EMBED_MODEL_NAME)
    return _model

def embed(texts):
    return [e.tolist() for e in get_model().embed(texts, batch_size=EMBED_BATCH)]

# ── Pinecone ─────────────────────────────────────────────────────────────────
def get_index(pc):
    if INDEX_NAME not in [i.name for i in pc.list_indexes()]:
        print(f"  建立 index {INDEX_NAME} (dim={EMBED_DIM})")
        pc.create_index(name=INDEX_NAME, dimension=EMBED_DIM, metric="cosine",
                        spec=ServerlessSpec(cloud="aws", region="us-east-1"))
        time.sleep(10)
    return pc.Index(INDEX_NAME)

def upsert(index, namespace, items, embeddings, source_type):
    vectors = []
    for it, emb in zip(items, embeddings):
        vectors.append({"id": it["id"], "values": emb, "metadata": {
            "source": it["source"], "text": it["text"][:900],
            "source_type": source_type,
            "file_id": it.get("file_id", ""), "chunk_idx": it.get("chunk_idx", 0),
        }})
    for i in range(0, len(vectors), 100):
        index.upsert(vectors=vectors[i:i+100], namespace=namespace)

# ── Checkpoint ───────────────────────────────────────────────────────────────
CKPT = os.path.join(ROOT, "data", "checkpoint.json")
def load_ckpt():
    if os.path.exists(CKPT):
        with open(CKPT) as f: return json.load(f)
    return {}
def save_ckpt(d):
    os.makedirs(os.path.dirname(CKPT), exist_ok=True)
    with open(CKPT, "w") as f: json.dump(d, f)

# ── 步驟一：同步已審查 → 正式分頁 ─────────────────────────────────────────────
def promote_reviewed(business):
    rows = sheet_read(REVIEW_TAB)
    if not rows:
        return
    move, del_idx = [], []
    for i in range(1, len(rows)):
        r = (rows[i] + [""] * 10)[:10]
        biz, status = r[1].strip(), r[8].strip()
        if biz == business["name"] and status == "已審查":
            today = now_tw_date()
            r[6] = r[6] or today      # 審核日期
            r[7] = today              # 最後更新日期
            move.append(r)
            del_idx.append(i)         # 0-based 列索引（含表頭為第0列）
    if move:
        sheet_append(business["sheet_tab"], move)
        sheet_delete_rows(REVIEW_TAB, del_idx)
        print(f"  ➡ 已將 {len(move)} 筆已審查 FAQ 搬到「{business['sheet_tab']}」分頁")

# ── 步驟二：索引 Drive 資料夾 ────────────────────────────────────────────────
def index_drive(index, business, drive, done):
    ns = business["namespace"]
    fid_folder = business.get("drive_folder_id", "")
    if not fid_folder:
        return 0
    files = list_files(drive, fid_folder)
    print(f"  Drive 找到 {len(files)} 個檔案")
    total = 0
    for i, f in enumerate(files, 1):
        fid, fmod = f["id"], f.get("modifiedTime", "")
        if done.get(fid) == fmod:
            continue
        text = extract_text(drive, f)
        chunks = chunk_text(text, f["name"], fid, fmod, ns)
        if chunks:
            for j in range(0, len(chunks), EMBED_BATCH):
                bc = chunks[j:j+EMBED_BATCH]
                upsert(index, ns, bc, embed([c["text"] for c in bc]), "doc")
            total += len(chunks)
            print(f"  [{i}/{len(files)}] {f['name']} → {len(chunks)} 片段")
        done[fid] = fmod
        save_ckpt(done)
    return total

# ── 步驟三：索引正式分頁的 FAQ ───────────────────────────────────────────────
def index_faq(index, business):
    ns = business["namespace"]
    rows = sheet_read(business["sheet_tab"])
    items = []
    for i in range(1, len(rows)):
        r = (rows[i] + [""] * 10)[:10]
        num, q, a = r[0].strip(), r[3].strip(), r[4].strip()
        if not q or not a:
            continue
        items.append({
            "id": f"faq-{ns}-" + hashlib.md5((num or q).encode()).hexdigest(),
            "text": f"問：{q}\n答：{a}", "source": f"FAQ：{q}",
        })
    if items:
        for j in range(0, len(items), EMBED_BATCH):
            bc = items[j:j+EMBED_BATCH]
            upsert(index, ns, bc, embed([c["text"] for c in bc]), "faq")
        print(f"  FAQ 索引 {len(items)} 筆（namespace={ns}）")
    return len(items)

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = get_index(pc)
    drive = drive_service()
    done = load_ckpt()

    for b in BUSINESSES:
        print(f"\n=== 業務：{b['name']}（namespace={b['namespace']}）===")
        try:
            promote_reviewed(b)
        except Exception as e:
            print(f"  ⚠ 同步已審查失敗：{e}")
        n_doc = index_drive(index, b, drive, done)
        try:
            n_faq = index_faq(index, b)
        except Exception as e:
            n_faq = 0
            print(f"  ⚠ FAQ 索引失敗：{e}")
        print(f"  ✅ {b['name']}：文件片段 +{n_doc}，FAQ {n_faq} 筆")

    stats = index.describe_index_stats()
    print(f"\n🎉 完成！總向量數：{stats.total_vector_count}")
    print(f"   namespaces：{list((stats.get('namespaces') or {}).keys())}")
    print(f"   時間：{datetime.now(timezone.utc).isoformat()}")

if __name__ == "__main__":
    main()
