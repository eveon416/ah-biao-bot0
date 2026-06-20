# 阿標 LINE BOT — 專案簡報（供優化討論）

> 這份文件是給另一個 AI/工程師看的「現況交接」，看完即可討論優化方向，不必先讀原始碼。
> 最後更新：2026-06-19。

## 1. 這是什麼
「阿標」是花蓮縣衛生局的 LINE 問答機器人（RAG）。使用者在 LINE 對它說「阿標 +問題」，它從一個 Google Drive 知識庫（約 3GB 公務文件）找答案回覆。涵蓋四個業務：**採購、總務、人事、公文檔管**。目標：**使用者問資料夾裡有的東西，都要答得出來、且正確。**

## 2. 技術架構（全貌）
- **入口**：LINE Webhook → **Vercel** serverless function（Python / Flask），檔案 `api/webhook.py`。
- **向量資料庫**：**Pinecone**，索引名 `ah-biao-bot`，**512 維、cosine**。
- **Embedding（向量模型）**：**Google Gemini `gemini-embedding-001`，512 維、L2 正規化**。查詢端用 `RETRIEVAL_QUERY`、索引端用 `RETRIEVAL_DOCUMENT`。
  - ⚠️ 2026-06-19 才從免費本機模型 `fastembed bge-small-zh`（弱，只比字面）升級成 Gemini 付費強模型。這是近期最大改動。
- **生成（寫答案）**：**Gemini `gemini-2.5-flash`**（多模型備援：2.0-flash / flash-latest，抗 429/503）。
- **知識庫**：Google Drive 資料夾「採購-Antigravity」(~3GB)，靠 **GitHub Actions** 跑 `scripts/build_index.py` 建索引（每晚台灣 3:00 + 可手動觸發）。
- **FAQ**：Google 試算表。一個「待審核」分頁 + 各業務正式分頁。每題問答會自動寫回「待審核」供人工審核。
- **多業務設定**：`businesses.json`。採購 namespace=""、總務 zongwu、人事 renshi、公文檔管 gongwen。
- **金流/成本**：Gemini 走 Google 付費「預付額度」，目前約 NT$400 點數、自動加值關閉（用完即停、不會超扣）。Pinecone/Vercel/LINE 都在免費額度。

## 3. 索引流程（build_index.py，GitHub Actions）
1. 遞迴掃描 Drive 資料夾，抽取文字：PDF（pypdf，文字太少→tesseract OCR 前 15 頁）、.docx（段落＋**表格**）、.pptx（投影片/表格/備忘稿）、.xlsx、舊版 .doc（LibreOffice 轉純文字）、.txt、.html、Google 原生檔（匯出純文字/CSV）。
2. 切塊：每塊 **800 字、重疊 150**。
3. **檔名一起嵌入（title-augmented）**：嵌入文字 = 「檔名\n內容」，因為檔名常是法規全名，是強檢索訊號。
4. 增量更新：`data/checkpoint.json` 記錄已處理檔（modifiedTime），暫時性錯誤重試最多 5 次。
5. 另外建 **FAQ 索引**（source_type=faq）與 **大綱索引**（source_type=outline，Gemini 為大型教學檔生成 300-500 字大綱，提升綜覽題召回）。
6. 無法索引的檔（>20MB、抽不到文字…）寫到試算表「索引問題」分頁通知使用者。
7. 一次性重算腳本 `scripts/reembed_titles.py`：直接讀 Pinecone 既有向量的 metadata、用 Gemini 重算，不必重新下載 Drive（多種子 query 聯集列舉以涵蓋全部 ~12000 筆，小批次+退避避開 429）。

## 4. 回答流程（answer_for_businesses in webhook.py）
1. **業務判斷**：訊息含某業務關鍵字 → 只搜該 namespace；沒有 → 搜全部業務（跨業務）。
2. **FAQ 語意比對 + 查詢擴展**（一次 Gemini 呼叫 `match_and_rewrite`）：判斷與既有 FAQ 的關係 EXACT / RELATED / NONE，並把問題改寫成 3 個同義變體。
   - EXACT → 直接逐字回 FAQ 標準答案。
3. **多查詢檢索**：4 個查詢變體各自向量檢索（source_type=doc，分數>0.3），合併取分數最高，**依檔名去除重複副本**。
4. **父文件還原**（`fetch_full_doc`）：取最相關的前 3 個檔，**以命中片段為中心向兩側擴展**成連續內容（上限 FULL_DOC_CAP=28000 字），確保長文件中相關段落一定涵蓋；短文件則整份還原。其餘命中片段再補上（總共最多 4-5 塊）。
5. **生成**：Gemini 讀「FAQ標準答案(若有) + 文件內容」寫答案。指令要求純文字（LINE 不支援 Markdown，送出前還會 `_strip_md` 清掉符號）、**有明確天數/條號就一定要列出、不可用「請查閱」帶過**。
6. **保險機制**：若被判 NOTFOUND 但有高分文件 → 換寬鬆指令再生成一次（救援）；單一業務答不出 → 自動改搜全部業務；答案出現人名/自助回覆 → 標記「需改職稱/需修正」。
7. 每題（非命中FAQ）寫回「待審核」分頁。

## 5. 現在「會了」的（升級後實測）
- 核心病根「法規檔完全檢索不到」已根治：《公務人員請假規則》等從「進不了候選」變「第 1 名」。
- 實測答得好且引用條號：**事假（七日）、病假（二十八日）、休假（年資表）、採購驗收（分金額級距）、政府採購法決標方式（第52條）**。
- docx 表格、pptx 都讀得到；長文件以相關段落為中心還原有效。

## 6. 還沒解決 / 待優化（討論重點）
1. **單一短條文的「答案層」不穩**：例如「婚假幾天」——檢索層《請假規則》已排第 1（0.689），但生成端偶爾回「找不到」或不給數字。事假/病假同一份文件卻答得出，婚假卻漏。需釐清是「還原視窗沒涵蓋該條」還是「該 .txt 內容本身缺/措辭對不上」。
2. **雜訊文件污染**：`02.招標規範_改.docx`（一份「差勤系統」的採購招標規範）列了所有假別、對任何請假問題都排到 ~0.68，內容是「系統會依請假規則檢核X天數」這種空話，會把答案帶偏成不給具體數字。如何在不手動排除下抑制這類雜訊文件？
3. **namespace 形同單一**：實際上所有文件都在 ns ""（採購資料夾），人事/總務/公文三個業務的 Drive 資料夾是空的，只有 FAQ。等於全部文件在同一個池子裡競爭，跨業務搜尋沒有真正分流。是否該重整資料夾/業務結構？
4. **檢索可加強**：目前純向量（dense）檢索。是否加入 (a) 關鍵字/BM25 混合檢索、(b) re-ranker 重排序、(c) 更高維度 embedding（現 512，可 768/1536/3072，但要開新索引）？
5. **大型檔未索引**：7 個 >20MB 檔（含 571MB《政府採購法令彙編35版》電子書、數個契約大 PDF）受平台限制沒進索引，需拆檔/純文字化。
6. **FAQ 比對成本**：`match_and_rewrite` 每題把約 170 條 FAQ 標題送進 LLM，FAQ 變多會變慢/變貴。是否改成向量預篩？
7. **還原策略參數**：top-3 檔、FULL_DOC_CAP=28000、視窗擴展——可調，但要小心動一題壞一題。

## 7. 限制與前提（討論時要考慮）
- **成本敏感**：偏好低成本；目前 NT$400 預付額度、無月租、自動加值關閉（不會超扣）。
- **Vercel 部署 250MB 限制**：當初用本機模型的原因；改走 Gemini API 後已不受此限。
- **LINE 限制**：單則回覆上限 5000 字；Webhook 須在約 60 秒內回應（救援重試會增加延遲）。
- **資料隱私**：政府公務資料（本就放在 Google Drive），用 Gemini 屬同一家、未新增第三方。
- **使用量**：每天約 < 5 題（正式），但要能處理綜覽題與大量法規檔。

## 8. 想請教的優化方向（給對方的提問）
1. 怎麼讓「單一條文型問題」(事假/婚假/喪假…天數) 穩定地把正確條文數字抓出來？（還原策略？clause-level 檢索？re-ranker？）
2. 怎麼壓制像「差勤系統招標規範」這種「關鍵字很密但內容空」的雜訊文件，而不必一個個手動排除？
3. 在這個量級與成本下，值得導入混合檢索（dense+BM25）或 re-ranker 嗎？投報率如何？
4. embedding 維度該停在 512，還是提高到 1536/3072 值得？
5. 四個業務、但文件都擠在一個 namespace——重整結構（每業務獨立資料夾/namespace）有幫助嗎？

## 9. 關鍵檔案地圖
- `api/webhook.py` — LINE webhook + 回答流程（檢索、還原、生成、保險機制）。
- `scripts/build_index.py` — Drive 掃描、抽文字、切塊、嵌入、FAQ/大綱索引、問題回報。
- `scripts/reembed_titles.py` — 一次性用 Gemini 重算既有向量。
- `businesses.json` — 業務×namespace×關鍵字×Drive資料夾×FAQ分頁 集中設定。
- `.github/workflows/` — sync.yml（每日全量）、faq_sync.yml、outline_sync.yml、reembed.yml（改 `data/reembed_trigger` 即觸發）。
- 資料：`data/checkpoint.json`、`data/outline_ckpt.json`。
