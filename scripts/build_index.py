"""
Build vector index from Google Drive folder.
Run via GitHub Actions daily, or manually:
  python scripts/build_index.py
Required env vars:
  GOOGLE_SERVICE_ACCOUNT_JSON  - service account credentials JSON string
  GEMINI_API_KEY               - Gemini API key
  DRIVE_FOLDER_ID              - Google Drive folder ID
"""

import io
import json
import os
import time
from datetime import datetime, timezone

import google.generativeai as genai
import numpy as np
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "1Gr3nk1hBeQDfm1nPU7HXOnkni-91b0Zk")
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "knowledge_base.json")
CHUNK_SIZE = 600   # characters per chunk
CHUNK_OVERLAP = 100
EMBED_MODEL = "models/text-embedding-004"
EMBED_BATCH = 5    # embeddings per API call (rate limit safety)


def get_drive_service():
    sa_json = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    info = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )
    return build("drive", "v3", credentials=creds)


def list_files(service, folder_id):
    """Recursively list all files in a Drive folder."""
    files = []
    page_token = None
    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="nextPageToken, files(id, name, mimeType)",
            pageToken=page_token,
        ).execute()
        for f in resp.get("files", []):
            if f["mimeType"] == "application/vnd.google-apps.folder":
                files.extend(list_files(service, f["id"]))
            else:
                files.append(f)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def extract_text(service, file_info):
    """Download or export file content as plain text."""
    mime = file_info["mimeType"]
    fid = file_info["id"]
    name = file_info["name"]

    try:
        if mime == "application/vnd.google-apps.document":
            req = service.files().export_media(fileId=fid, mimeType="text/plain")
        elif mime == "application/vnd.google-apps.spreadsheet":
            req = service.files().export_media(fileId=fid, mimeType="text/csv")
        elif mime in ("application/pdf",):
            req = service.files().get_media(fileId=fid)
        elif mime.startswith("text/"):
            req = service.files().get_media(fileId=fid)
        else:
            print(f"  skip unsupported mime: {name} ({mime})")
            return None

        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        raw = buf.getvalue()

        if mime == "application/pdf":
            return _extract_pdf_text(raw, name)
        return raw.decode("utf-8", errors="ignore")

    except Exception as e:
        print(f"  error reading {name}: {e}")
        return None


def _extract_pdf_text(raw_bytes, name):
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw_bytes))
        pages = [p.extract_text() or "" for p in reader.pages]
        return "\n".join(pages)
    except Exception as e:
        print(f"  pdf parse error {name}: {e}")
        return None


def chunk_text(text, source):
    """Split text into overlapping chunks."""
    text = text.strip()
    if not text:
        return []
    chunks = []
    start = 0
    i = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append({"source": source, "text": text[start:end], "chunk_index": i})
        start += CHUNK_SIZE - CHUNK_OVERLAP
        i += 1
    return chunks


def embed_texts(texts):
    """Embed a list of texts with Gemini, returns list of float lists."""
    genai.configure(api_key=GEMINI_API_KEY)
    embeddings = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i : i + EMBED_BATCH]
        result = genai.embed_content(
            model=EMBED_MODEL,
            content=batch,
            task_type="RETRIEVAL_DOCUMENT",
        )
        embeddings.extend(result["embedding"])
        time.sleep(0.5)  # stay under rate limit
    return embeddings


def build_index():
    print("Connecting to Google Drive...")
    service = get_drive_service()

    print(f"Listing files in folder {DRIVE_FOLDER_ID}...")
    files = list_files(service, DRIVE_FOLDER_ID)
    print(f"Found {len(files)} files")

    all_chunks = []
    for f in files:
        print(f"  Reading: {f['name']}")
        text = extract_text(service, f)
        if not text:
            continue
        chunks = chunk_text(text, f["name"])
        all_chunks.extend(chunks)
        print(f"    → {len(chunks)} chunks")

    print(f"\nTotal chunks: {len(all_chunks)}")
    if not all_chunks:
        print("No chunks to index. Exiting.")
        return

    print("Generating embeddings...")
    texts = [c["text"] for c in all_chunks]
    embeddings = embed_texts(texts)

    for chunk, emb in zip(all_chunks, embeddings):
        chunk["embedding"] = emb

    index = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "chunk_count": len(all_chunks),
        "chunks": all_chunks,
    }

    out_path = os.path.abspath(OUTPUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\nIndex saved to {out_path} ({size_kb:.1f} KB)")
    print(f"Built at: {index['built_at']}")


if __name__ == "__main__":
    build_index()
