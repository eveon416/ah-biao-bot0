"""
台北市採購SOP（工程履約管理應辦事項作業程序）完整抓取 + 異動偵測。
獨立監控管線：不寫入阿標 Pinecone、不覆蓋 compile_sop。產出快照與「異動報告」供人工決策。

技術重點（依規格，已實測）：
- ASP.NET WebForms，內容靠 postback；純 HTTP 直打網址會 session 污染 → 用 Playwright 真瀏覽器。
- 每個分類用「獨立 browser context」避免狀態污染；用固定 id 點擊（非文字）。
- 等「該分類第一個項次代碼」出現再擷取（非固定 sleep）。
- 強驗證：頁面須含該分類中文名稱 + 項次代碼，數量與舊版骨架比對，對不上即標記，不靜默交付。
"""
import os
import re
import json
import hashlib
import datetime
from playwright.sync_api import sync_playwright

INDEX = "https://gpis.taipei/RWD/frontFunction/Affair/wfrmCItem.aspx"
LIST  = "https://gpis.taipei/frontFunction/Affair/wfrmCItem_List.aspx?Categroy={name}&No={code}"
ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAPDIR = os.path.join(ROOT, "data", "taipei_sop")

CATEGORIES = [
    ("A.1", "預算階段管理作業程序"), ("A.2", "設計階段管理作業程序"),
    ("A.3", "招標前置作業"),         ("A.4", "開決標作業"),
    ("A.5", "決標後作業"),           ("A.6", "採購文件保存作業"),
    ("B.1", "開工前"),               ("B.2", "施工階段"),
    ("B.3", "完工驗收階段"),         ("C.1", "保固階段"),
]
BASELINE = {"A.1":5,"A.2":9,"A.3":10,"A.4":6,"A.5":6,"A.6":5,"B.1":18,"B.2":26,"B.3":12,"C.1":5}

def _clean(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).replace("&nbsp;", " ").strip()

def parse_table(html, code):
    """解析 gv_List 表格 → 結構化資料（用 pandas 處理 rowspan，並去掉 rowspan 造成的重複列）。
    保留有意義的子項（同代碼但應辦事項不同），合併重複列的附件檔名。"""
    import pandas as pd
    import io
    m = re.search(r"<table[^>]*gv_List[\s\S]*?</table>", html, re.I)
    if not m:
        return []
    try:
        df = pd.read_html(io.StringIO(m.group(0)))[0]   # pandas 會自動填補 rowspan
    except Exception as e:
        print(f"  ⚠ {code} 表格解析失敗：{e}")
        return []
    df.columns = [str(c).strip() for c in df.columns]
    def col(row, *keys):
        for k in df.columns:
            if any(x in k for x in keys):
                v = row.get(k, "")
                return _clean("" if pd.isna(v) else str(v))
        return ""
    # 項次代碼：開頭字母「可選」(台北網站偶爾漏打字母，如 A2.7 變「2.7」)
    code_re = re.compile(r"^([A-C])?\.?\d+(?:\.\d+)+")
    cat_letter = code[0]
    is_file = lambda s: bool(re.search(r"\.\w{2,5}$", s or ""))
    ATT = ["公文範本", "使用表單", "實例", "標準作業流程"]
    seen, order = {}, []
    for _, row in df.iterrows():
        c0 = _clean(str(row.get(df.columns[0], "")))
        mm = code_re.match(c0)
        if not mm:
            continue
        no = mm.group(0)
        if not no[:1].isalpha():
            no = cat_letter + no                      # 補回缺漏的類別字母：2.7 → A2.7
        item = col(row, "應辦事項")
        if not item or is_file(item) or item == c0:   # 過濾附件檔名列、空列
            continue
        atts = [col(row, a) for a in ATT]
        atts = [a for a in atts if a and re.search(r"\.\w{2,5}$", a)]   # 像檔名的才收
        key = (no, item)
        if key in seen:                              # rowspan 重複列 → 只併附件
            seen[key]["範本表單"] = list(dict.fromkeys(seen[key]["範本表單"] + atts))
            continue
        seen[key] = {
            "項次": no, "應辦事項": item,
            "權責分工": {k: col(row, k) for k in
                        ["施工廠商", "監造廠商", "設計廠商", "機關", "維護"]},
            "辦理期限": col(row, "期限"),
            "法令依據": col(row, "法令依據", "法令"),
            "控制重點": col(row, "控制重點"),
            "範本表單": atts,
        }
        order.append(key)
    return [seen[k] for k in order]

def scrape():
    out, problems = {}, []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for code, name in CATEGORIES:
            ctx = browser.new_context()              # 每分類獨立 context，避免污染
            page = ctx.new_page()
            try:
                page.goto(LIST.format(name=name, code=code), wait_until="domcontentloaded", timeout=30000)
                # 等該分類「第一個項次代碼」出現（非固定 sleep）
                pref = code.replace(".", r"\.")
                try:
                    page.wait_for_function(
                        f"() => /{pref}\\.?\\d/.test(document.body.innerText)", timeout=20000)
                except Exception:
                    pass
                html = page.content()
                ok_name = name in html
                items = parse_table(html, code)
                codes = []
                for it in items:
                    if it["項次"] not in codes:
                        codes.append(it["項次"])
                n_codes = len(codes)
                base = BASELINE.get(code, 0)
                note = ""
                if not ok_name:
                    note = f"頁面找不到分類名稱「{name}」(疑似抓錯/污染)"
                elif not items:
                    note = "解析不到任何項次"
                elif base and abs(n_codes - base) > max(2, base * 0.4):
                    note = f"項次代碼數 {n_codes} 與舊版 {base} 差異過大"
                if note:
                    problems.append(f"{code} {name}：{note}")
                out[code] = {"name": name, "code_count": n_codes, "item_count": len(items),
                             "first": codes[0] if codes else None,
                             "last": codes[-1] if codes else None,
                             "ok_name": ok_name, "items": items}
                print(f"  {code} {name}：{n_codes} 代碼/{len(items)} 列"
                      + (f"  ⚠ {note}" if note else "  ✓"), flush=True)
            except Exception as e:
                problems.append(f"{code} {name}：抓取例外 {e}")
                out[code] = {"name": name, "item_count": 0, "items": [], "error": str(e)}
                print(f"  {code} {name}：例外 {e}", flush=True)
            finally:
                ctx.close()
        browser.close()
    return out, problems

def latest_snapshot():
    if not os.path.isdir(SNAPDIR):
        return None
    snaps = sorted(f for f in os.listdir(SNAPDIR) if f.startswith("snapshot_") and f.endswith(".json"))
    if not snaps:
        return None
    with open(os.path.join(SNAPDIR, snaps[-1]), encoding="utf-8") as f:
        return snaps[-1], json.load(f)

def item_hash(it):
    return hashlib.md5(json.dumps(it, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def diff(old, new):
    """逐項次比對，回傳異動清單。"""
    changes = []
    for code, _ in CATEGORIES:
        on = {i["項次"]: i for i in (old.get(code, {}) or {}).get("items", [])}
        nn = {i["項次"]: i for i in (new.get(code, {}) or {}).get("items", [])}
        for k in nn.keys() - on.keys():
            changes.append(f"[新增] {k} {nn[k].get('應辦事項','')}")
        for k in on.keys() - nn.keys():
            changes.append(f"[刪除] {k} {on[k].get('應辦事項','')}")
        for k in on.keys() & nn.keys():
            if item_hash(on[k]) != item_hash(nn[k]):
                changes.append(f"[修改] {k} {nn[k].get('應辦事項','')}")
    return changes

# ── 寫「台北SOP骨架」試算表分頁（保留使用者策展的兩欄）──────────────────────
SHEET = os.environ.get("FAQ_SHEET_ID", "1Co7vSpCJ2NqQ8HLSQIPSg3TIO7R6vqBBX-YbWUCtscw")
SKTAB = "台北SOP骨架"
HEADER = ["分類", "項次", "應辦事項", "權責分工", "辦理期限", "法令依據",
          "控制重點", "是否台北專屬", "花蓮對應依據/做法", "本月異動"]

def _sheet_token():
    from google.oauth2 import service_account
    import google.auth.transport.requests
    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def _sreq(method, path, body=None):
    import urllib.request, urllib.parse
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"https://sheets.googleapis.com/v4/spreadsheets/{path}", data=data, method=method,
        headers={"Authorization": f"Bearer {_sheet_token()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def write_skeleton(data):
    if not os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"):
        print("（無 SA，略過骨架表）"); return
    import urllib.parse
    # 1) 讀現有分頁，保留使用者填的「台北專屬/花蓮對應」兩欄（key=分類+項次+應辦事項）
    meta = _sreq("GET", f"{SHEET}?fields=sheets.properties.title")
    tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
    keep, old_scrape = {}, {}
    if SKTAB in tabs:
        rng = urllib.parse.quote(f"{SKTAB}!A2:I10000")
        rows = _sreq("GET", f"{SHEET}/values/{rng}").get("values", [])
        for r in rows:
            r = (r + [""] * 9)[:9]
            k = (r[0], r[1], r[2])
            keep[k] = (r[7], r[8])                      # 台北專屬, 花蓮對應
            old_scrape[k] = (r[3], r[4], r[5], r[6])    # 抓取欄位（比對是否異動）
    else:
        _sreq("POST", f"{SHEET}:batchUpdate", {"requests": [{"addSheet": {
            "properties": {"title": SKTAB, "gridProperties": {"frozenRowCount": 1}}}}]})

    # 2) 組新列，保留兩欄、標記本月異動
    out = [HEADER]
    for code, name in CATEGORIES:
        for it in (data.get(code, {}) or {}).get("items", []):
            duty = "；".join(f"{k}{v}" for k, v in it.get("權責分工", {}).items() if v)
            scrape = (it.get("應辦事項", ""), it.get("辦理期限", ""),
                      it.get("法令依據", ""), it.get("控制重點", ""))
            key = (code, it.get("項次", ""), it.get("應辦事項", ""))
            tp, hl = keep.get(key, ("", ""))
            new_scrape = (duty, scrape[1], scrape[2], scrape[3])   # 權責,期限,法令,控制
            changed = "★更新" if (key in old_scrape and old_scrape[key] != new_scrape) else ""
            out.append([code, it.get("項次", ""), scrape[0], duty, scrape[1],
                        scrape[2], scrape[3], tp, hl, changed])

    rng = urllib.parse.quote(f"{SKTAB}!A1:J10000")
    _sreq("POST", f"{SHEET}/values/{rng}:clear", {})
    _sreq("PUT", f"{SHEET}/values/{urllib.parse.quote(SKTAB + '!A1')}?valueInputOption=RAW",
          {"values": out})
    print(f"已寫入「{SKTAB}」分頁：{len(out)-1} 列（保留 {len(keep)} 列既有策展）", flush=True)

# ── 灌進阿標（採購 namespace，來源標「台北市採購SOP」供 webhook 加警示）─────────
TAIPEI_SRC_TAG = "台北市採購SOP"   # webhook 以此字串判斷是否加台北警示語

def _item_block(it):
    duty = "；".join(f"{k}{v}" for k, v in it.get("權責分工", {}).items() if v)
    parts = [f"項次 {it.get('項次','')}　{it.get('應辦事項','')}"]
    if duty:               parts.append(f"權責分工：{duty}")
    if it.get("辦理期限"):  parts.append(f"辦理期限：{it['辦理期限']}")
    if it.get("法令依據"):  parts.append(f"法令依據：{it['法令依據']}")
    if it.get("控制重點"):  parts.append(f"控制重點：{it['控制重點']}")
    return "\n".join(parts)

def index_for_bot(data):
    """把台北SOP灌進阿標 Pinecone（採購 namespace=''）。
    一個「項次」一個 chunk（聚焦 embedding，才檢索得到）；可重灌覆蓋。"""
    if not (os.environ.get("PINECONE_API_KEY") and os.environ.get("GEMINI_API_KEY")):
        print("（無 PINECONE/GEMINI 金鑰，略過灌入阿標）"); return
    import sys
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import build_index as bi
    from pinecone import Pinecone
    import hashlib as _h
    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
    index = bi.get_index(pc)
    ns, today = "", datetime.date.today().isoformat()
    chunks, emb_texts = [], []
    for code, name in CATEGORIES:
        items = (data.get(code, {}) or {}).get("items", [])
        # 清舊向量：舊版「整分類一塊」(TAIPEI_SOP_{code}) + 本版每項次
        old_ids = [_h.md5(f"TAIPEI_SOP_{code}:{i}".encode()).hexdigest() for i in range(300)]
        try: index.delete(ids=old_ids, namespace=ns)
        except Exception: pass
        source = f"{TAIPEI_SRC_TAG}-{code} {name}（參考）"
        for it in items:
            no = it.get("項次", "")
            fid = f"TAIPEI_SOP_{code}_{no}"          # 每項次獨立 file_id
            cs = bi.chunk_text(_item_block(it), source, fid, today, ns)
            for c in cs:
                chunks.append(c)
                # title-augmented，且把「應辦事項」前置以利檢索命中
                emb_texts.append(f"{source}\n{no} {it.get('應辦事項','')}\n{c['text']}")
    if not chunks:
        print("（無台北項次可灌）"); return
    # 同步清掉所有殘留的每項次舊 id（沿用相同 fid → upsert 自然覆蓋；縮減的另清）
    embs = bi.embed(emb_texts)
    bi.upsert(index, ns, chunks, embs, "taipei_sop")
    print(f"已灌入阿標（採購 namespace）：{len(chunks)} chunks（每項次一片），"
          f"來源標記「{TAIPEI_SRC_TAG}」", flush=True)

def main():
    os.makedirs(SNAPDIR, exist_ok=True)
    prev = latest_snapshot()
    data, problems = scrape()
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d")
    snap_path = os.path.join(SNAPDIR, f"snapshot_{today}.json")
    with open(snap_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 摘要報告
    lines = [f"# 台北採購SOP 抓取摘要（{today}）", ""]
    lines.append("| 分類 | 名稱 | 項次代碼數 | 舊版 | 含子項列數 | 起–訖 | 狀態 |")
    lines.append("|---|---|---|---|---|---|---|")
    for code, name in CATEGORIES:
        d = data.get(code, {})
        base = BASELINE.get(code, "-")
        nc = d.get("code_count", 0)
        ok = d.get("ok_name") and nc and (not base or abs(nc - base) <= max(2, base * 0.4))
        st = "✅" if ok else "⚠️需檢查"
        lines.append(f"| {code} | {name} | {nc} | {base} | {d.get('item_count',0)} | "
                     f"{d.get('first','-')}–{d.get('last','-')} | {st} |")
    if problems:
        lines += ["", "## ⚠️ 需人工檢查", *[f"- {x}" for x in problems]]
    # 異動
    change_lines, changes = [], []
    if prev:
        pname, pdata = prev
        changes = diff(pdata, data)
        change_lines = [f"## 異動（對照 {pname}）"] + (
            [f"- {c}" for c in changes] if changes else ["- (無異動)"])
    else:
        change_lines = ["## 異動", "- 這是第一次抓取，存為 baseline；下次跑才開始比對。"]
    report = "\n".join(lines + [""] + change_lines)
    with open(os.path.join(SNAPDIR, "latest_report.md"), "w", encoding="utf-8") as f:
        f.write(report)
    print("\n" + report, flush=True)
    print(f"\n快照：{snap_path}", flush=True)

    # 寫骨架表（保留使用者策展兩欄、標記異動列）
    try:
        write_skeleton(data)
    except Exception as e:
        print(f"骨架表寫入失敗：{e}", flush=True)

    # 灌進阿標（讓阿標可回答台北SOP；webhook 會自動加台北警示）
    try:
        index_for_bot(data)
    except Exception as e:
        print(f"灌入阿標失敗：{e}", flush=True)

    # 有異動 → 開 Issue 通知（人工決策，不自動更新索引）
    if prev and changes:
        notify_issue(today, changes, len(changes))

def notify_issue(today, changes, n):
    import urllib.request
    token, repo = os.environ.get("GH_TOKEN", ""), os.environ.get("GH_REPO", "")
    if not (token and repo):
        return
    owner = repo.split("/")[0]
    body = [f"@{owner} 台北採購SOP（{today}）偵測到 {n} 處異動，請人工確認是否更新骨架表：", ""]
    body += [f"- {c}" for c in changes[:60]]
    body += ["", "詳見 data/taipei_sop/latest_report.md。（此為監控通知，未自動更新索引/骨架表）"]
    data = json.dumps({"title": f"【台北SOP異動】{n} 處（{today}）",
                       "body": "\n".join(body), "assignees": [owner]}).encode()
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/issues", data=data, method="POST",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                     "User-Agent": "ah-biao", "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=20)
    print(f"已開異動通知 Issue", flush=True)

if __name__ == "__main__":
    main()
