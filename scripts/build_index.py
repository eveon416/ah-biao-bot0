"""
Build / update Pinecone vector index from Google Drive folder.
- Recursive scan of all files
- Skips binary files (images, video, audio, zip)
- Incremental: only processes files modified since last run
- Batch embeddings with rate-limit retry
- Upserts vectors to Pinecone

Required env vars:
  GOOGLE_SERVICE_ACCOUNT_JSON
  GEMINI_API_KEY
  PINECONE_API_KEY
  DRIVE_FOLDER_ID
  PINECONE_INDEX_NAME  (optional, default: ah-biao-bot)
"""

import io
import json
import os
import time
import hashlib
from datetime import datetime, timezone

import google.generativeai as genai
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from pinecone import Pinecone, ServerlessSpec

# ── Config ─────────────────────────────────────────────────────────────────
DRIVE_FOLDER_ID   = os.environ["DRIVE_FOLDER_ID"]
GEMINI_API_KEY    = os.environ["GEMINI_API_KEY"]
PINECONE_API_KEY  = os.environ["PINECONE_API_KEY"]
INDEX_NAME        = os.environ.get("PINECONE_INDEX_NAME", "ah-biao-bot")
EMBED_MODEL = "models/gemini-embedding-001"
CHUNK_SIZE        = 800
CHUNK_OVERLAP     = 150
EMBED_BATCH       = 5
EMBED_DIM = 3072
MAX_FILE_MB       = 20   # skip files larger than this

SKIP_MIMES = {
    "image/", "video/", "audio/",
    "application/zip", "application/x-zip",
    "application/x-rar", "application/octet-stream",
    "application/vnd.ms-powerpoint",       # skip pptx for speed (add later if needed)
}

def should_skip(mime: str) -> bool:
    return any(mime.startswith(m) for m in SKIP_MIMES)


# ── Google Drive ────────────────────────────────────────────────────────────
def get_drive_service():
    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )
    return build("drive", "v3", credentials=creds)


def list_files(service, folder_id, depth=0):
    """Recursively list all non-binary files."""
    files = []
    page_token = None
    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="nextPageToken, files(id,name,mimeType,modifiedTime,size)",
            pageToken=page_token,
            pageSize=100,
        ).execute()
        for f in resp.get("files", []):
            if f["mimeType"] == "application/vnd.google-apps.folder":
                files.extend(list_files(service, f["id"], depth + 1))
            elif not should_skip(f["mimeType"]):
                size_mb = int(f.get("size", 0)) / 1024 / 1024
                if size_mb <= MAX_FILE_MB:
                    f["_depth"] = depth
                    files.append(f)
                else:
                    print(f"  ⏭ 跳過 {f['name']} ({size_mb:.1f}MB，超過限制)")
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def extract_text(service, file_info) -> str | None:
    mime = file_info["mimeType"]
    fid  = file_info["id"]
    name = file_info["name"]
    try:
        if mime == "application/vnd.google-apps.document":
            req = service.files().export_media(fileId=fid, mimeType="text/plain")
        elif mime == "application/vnd.google-apps.spreadsheet":
            req = service.files().export_media(fileId=fid, mimeType="text/csv")
        elif mime == "application/vnd.google-apps.presentation":
            req = service.files().export_media(fileId=fid, mimeType="text/plain")
        elif mime == "application/pdf":
            req = service.files().get_media(fileId=fid)
        elif mime in (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ):
            req = service.files().get_media(fileId=fid)
        elif mime in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ):
            req = service.files().get_media(fileId=fid)
        elif mime.startswith("text/"):
            req = service.files().get_media(fileId=fid)
        else:
            return None

        buf = io.BytesIO()
        dl  = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = dl.next_chunk()
        raw = buf.getvalue()

        if mime == "application/pdf":
            return _pdf_text(raw, name)
        if mime in (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ):
            return _docx_text(raw, name)
        if mime in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ):
            return _xlsx_text(raw, name)
        return raw.decode("utf-8", errors="ignore")

    except Exception as e:
        print(f"  ⚠ 讀取失敗 {name}: {e}")
        return None


def _pdf_text(raw, name):
    try:
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(raw))
        return "\n".join(p.extract_text() or "" for p in r.pages)
    except Exception as e:
        print(f"  ⚠ PDF 解析失敗 {name}: {e}")
        return None


def _docx_text(raw, name):
    try:
        from docx import Document
        doc = Document(io.BytesIO(raw))
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception as e:
        print(f"  ⚠ DOCX 解析失敗 {name}: {e}")
        return None


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
        print(f"  ⚠ XLSX 解析失敗 {name}: {e}")
        return None


# ── Chunking ────────────────────────────────────────────────────────────────
def chunk_text(text, source, file_id, modified_time):
    text = text.strip()
    if not text:
        return []
    chunks = []
    start, idx = 0, 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk_text_val = text[start:end]
        chunk_id = hashlib.md5(f"{file_id}:{idx}".encode()).hexdigest()
        chunks.append({
            "id":       chunk_id,
            "text":     chunk_text_val,
            "source":   source,
            "file_id":  file_id,
            "modified": modified_time,
            "chunk_idx": idx,
        })
        start += CHUNK_SIZE - CHUNK_OVERLAP
        idx   += 1
    return chunks


# ── Embeddings ──────────────────────────────────────────────────────────────
def embed_batch(texts, retries=3):
    for attempt in range(retries):
        try:
            result = genai.embed_content(
                model=EMBED_MODEL,
                content=texts,
                task_type="RETRIEVAL_DOCUMENT",
            )
            return result["embedding"]
        except Exception as e:
            wait = 10 * (attempt + 1)
            print(f"  ⚠ Embedding 失敗（{e}），{wait}s 後重試...")
            time.sleep(wait)
    raise RuntimeError(f"Embedding 連續失敗 {retries} 次")


# ── Pinecone ────────────────────────────────────────────────────────────────
def get_or_create_index(pc):
    existing = [i.name for i in pc.list_indexes()]
    if INDEX_NAME not in existing:
        print(f"  建立 Pinecone index: {INDEX_NAME}")
        pc.create_index(
            name=INDEX_NAME,
            dimension=EMBED_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        time.sleep(10)
    return pc.Index(INDEX_NAME)


def upsert_chunks(index, chunks, embeddings):
    vectors = []
    for chunk, emb in zip(chunks, embeddings):
        vectors.append({
            "id": chunk["id"],
            "values": emb,
            "metadata": {
                "source":   chunk["source"],
                "text":     chunk["text"][:900],   # Pinecone metadata limit
                "file_id":  chunk["file_id"],
                "modified": chunk["modified"],
                "chunk_idx": chunk["chunk_idx"],
            }
        })
    # Upsert in batches of 100
    for i in range(0, len(vectors), 100):
        index.upsert(vectors=vectors[i:i+100])


# ── Checkpoint（記錄已處理的檔案，支援斷點續傳）───────────────────────────
CHECKPOINT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "checkpoint.json")

def load_checkpoint():
    """載入已處理的檔案清單 {file_id: modifiedTime}"""
    path = os.path.abspath(CHECKPOINT_PATH)
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {}

def save_checkpoint(done: dict):
    """儲存已處理的檔案清單"""
    path = os.path.abspath(CHECKPOINT_PATH)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(done, f)


# ── Main ─────────────────────────────────────────────────────────────────────
def build_index():
    genai.configure(api_key=GEMINI_API_KEY)
    pc = Pinecone(api_key=PINECONE_API_KEY)

    print("📂 連接 Google Drive...")
    drive = get_drive_service()

    print(f"🔍 掃描資料夾 {DRIVE_FOLDER_ID}...")
    files = list_files(drive, DRIVE_FOLDER_ID)
    print(f"   找到 {len(files)} 個可處理檔案")

    print("🗄  連接 Pinecone...")
    index = get_or_create_index(pc)
    stats = index.describe_index_stats()
    print(f"   現有向量數：{stats.total_vector_count}")

    # 載入斷點：跳過已處理且未被修改的檔案
    done = load_checkpoint()
    skipped = 0
    for f in files:
        if done.get(f["id"]) == f.get("modifiedTime"):
            skipped += 1
    print(f"   已處理（跳過）：{skipped} 個，待處理：{len(files) - skipped} 個")

    total_chunks = 0
    for i, f in enumerate(files, 1):
        fid  = f["id"]
        fmod = f.get("modifiedTime", "")

        # 斷點續傳：已處理且未修改 → 跳過
        if done.get(fid) == fmod:
            continue

        print(f"[{i}/{len(files)}] {f['name']}")
        text = extract_text(drive, f)
        if not text or not text.strip():
            print("   (空白或無法讀取，略過)")
            done[fid] = fmod
            save_checkpoint(done)
            continue

        chunks = chunk_text(text, f["name"], fid, fmod)
        if not chunks:
            done[fid] = fmod
            save_checkpoint(done)
            continue

        print(f"   {len(chunks)} 個片段，產生 embedding...")

        for j in range(0, len(chunks), EMBED_BATCH):
            batch_chunks = chunks[j:j + EMBED_BATCH]
            texts = [c["text"] for c in batch_chunks]
            embeddings = embed_batch(texts)
            upsert_chunks(index, batch_chunks, embeddings)
            time.sleep(1.0)   # 每批次間隔 1 秒，避免超過 rate limit

        # 標記此檔案已完成
        done[fid] = fmod
        save_checkpoint(done)

        total_chunks += len(chunks)
        print(f"   ✅ 累計已上傳 {total_chunks} 個片段")

    final_stats = index.describe_index_stats()
    print(f"\n🎉 完成！Pinecone 總向量數：{final_stats.total_vector_count}")
    print(f"   處理時間：{datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    build_index()
