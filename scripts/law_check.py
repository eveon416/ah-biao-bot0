"""
每日法規版本比對：
1. 從 Pinecone 取出我們索引的「法規類 .txt」每部法規的 法規名稱 + 我方修正日期（讀 chunk_idx=0 的標頭）。
2. 從全國法規資料庫開放資料（法律 + 命令/規則）取每部法規的最新修正日期。
3. 比對 → 寫到試算表分頁「法規版本對照」，把「有更新」的標出來。
只通知，不自動更換（使用者自行去 Drive 換新的 .txt）。
"""
import os
import io
import re
import json
import zipfile
import urllib.request
from datetime import datetime, timezone, timedelta
from pinecone import Pinecone
from google.oauth2 import service_account
import google.auth.transport.requests

PKEY  = os.environ["PINECONE_API_KEY"]
INAME = os.environ.get("PINECONE_INDEX_NAME") or "ah-biao-bot"
SA    = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
SHEET = os.environ.get("FAQ_SHEET_ID", "1Co7vSpCJ2NqQ8HLSQIPSg3TIO7R6vqBBX-YbWUCtscw")
TAB   = "法規版本對照"
DATASETS = ["https://law.moj.gov.tw/api/Ch/Law/JSON",     # 法律
            "https://law.moj.gov.tw/api/Ch/Order/JSON"]   # 命令/規則

# ── 解析我方法規版本（Pinecone chunk0 標頭）──────────────────────────────────
def _roc_to_int(text):
    m = re.search(r"修正日期[：:]\s*民國\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日", text)
    if not m:
        m = re.search(r"(?:制定|訂定|發布)日期[：:]\s*民國\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日", text)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return (1911 + y) * 10000 + mo * 100 + d

def _name_of(text):
    m = re.search(r"法規名稱[：:]\s*([^\r\n]+)", text)
    return m.group(1).strip() if m else None

def our_laws():
    idx = Pinecone(api_key=PKEY).Index(INAME)
    out = {}
    for ns in ["", "renshi", "zongwu", "gongwen"]:
        res = idx.query(vector=[0.001] * 512, top_k=3000, include_metadata=True,
                        namespace=ns, filter={"chunk_idx": {"$eq": 0}})
        for m in res.get("matches", []):
            md = m.get("metadata", {})
            txt = md.get("text", "")
            name = _name_of(txt)
            if not name:
                continue
            out[name] = {"date": _roc_to_int(txt), "src": md.get("source", "")}
    return out

# ── 下載官方資料集 → {法規名稱: 最新修正日期(int)} ──────────────────────────
def official_latest():
    latest = {}
    for url in DATASETS:
        try:
            raw = urllib.request.urlopen(url, timeout=180).read()
            zf = zipfile.ZipFile(io.BytesIO(raw))
            txt = zf.read(zf.namelist()[0]).decode("utf-8").lstrip("﻿")
            data = json.loads(txt)
            for law in data.get("Laws", []):
                nm = (law.get("LawName") or "").strip()
                d = (law.get("LawModifiedDate") or "").strip()
                if nm and d.isdigit() and len(d) == 8:
                    latest[nm] = {"date": int(d), "url": law.get("LawURL", "")}
        except Exception as e:
            print(f"下載/解析失敗 {url}: {e}")
    print(f"官方資料：{len(latest)} 部")
    return latest

# ── 寫試算表 ─────────────────────────────────────────────────────────────────
def _token():
    creds = service_account.Credentials.from_service_account_info(
        SA, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"https://sheets.googleapis.com/v4/spreadsheets/{path}", data=data, method=method,
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def write_sheet(rows):
    meta = _req("GET", f"{SHEET}?fields=sheets.properties.title")
    tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
    if TAB not in tabs:
        _req("POST", f"{SHEET}:batchUpdate",
             {"requests": [{"addSheet": {"properties": {"title": TAB,
              "gridProperties": {"frozenRowCount": 1}}}}]})
    rng = urllib.parse.quote(f"{TAB}!A1:F5000")
    _req("POST", f"{SHEET}/values/{rng}:clear", {})
    _req("PUT", f"{SHEET}/values/{urllib.parse.quote(TAB + '!A1')}?valueInputOption=RAW",
         {"values": rows})

import urllib.parse

def _fmt(n):
    return "" if not n else f"{n//10000}-{n//100%100:02d}-{n%100:02d}"

def main():
    ours = our_laws()
    latest = official_latest()
    header = ["法規名稱", "我方版本(修正日期)", "線上最新版本", "狀態", "官方連結", "我方檔名"]
    rows, updated = [header], 0
    for name in sorted(ours):
        od = ours[name]["date"]
        off = latest.get(name)
        ld = off["date"] if off else None
        if not off:
            status = "❓官方查無同名(可能更名/非現行)"
        elif od is None:
            status = "⚠️我方版本日期讀不到，請查看"
        elif ld > od:
            status = "⚠️有更新，建議更換"; updated += 1
        else:
            status = "✅最新"
        rows.append([name, _fmt(od), _fmt(ld), status,
                     (off or {}).get("url", ""), ours[name]["src"]])
    ts = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")
    rows.append([f"（更新時間 {ts}；共 {len(ours)} 部法規，其中 {updated} 部有更新）", "", "", "", "", ""])
    write_sheet(rows)
    print(f"完成：我方 {len(ours)} 部法規，{updated} 部有更新 → 已寫入「{TAB}」分頁")

if __name__ == "__main__":
    main()
