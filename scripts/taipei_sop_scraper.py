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
