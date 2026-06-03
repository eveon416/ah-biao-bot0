# 部署步驟

## 一、Google Service Account 設定（一次性）

1. 前往 https://console.cloud.google.com/
2. 建立新專案（或使用現有）
3. 啟用 **Google Drive API**
4. 前往「IAM 和管理員」→「服務帳戶」→ 建立服務帳戶
5. 下載 JSON 金鑰檔案
6. **將 Google Drive 資料夾分享給服務帳戶 email**（僅需閱讀者權限）
   - 資料夾 ID: `1Gr3nk1hBeQDfm1nPU7HXOnkni-91b0Zk`

## 二、LINE Developer Console

1. 前往 https://developers.line.biz/
2. 在你的 Channel 設定中取得 **Channel Secret**（與 Channel Access Token 不同）

## 三、GitHub Secrets 設定

在 https://github.com/eveon416/ah-biao-bot0/settings/secrets/actions 新增：

| Secret 名稱 | 值 |
|---|---|
| `GEMINI_API_KEY` | AIzaSyA6q4YUoOyA-Urgr8gX56HXGsVRzZ6WJaU |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 服務帳戶 JSON 檔案的完整內容 |
| `DRIVE_FOLDER_ID` | 1Gr3nk1hBeQDfm1nPU7HXOnkni-91b0Zk |

## 四、Vercel 環境變數設定

在 Vercel 專案設定中新增：

| 變數名稱 | 值 |
|---|---|
| `GEMINI_API_KEY` | AIzaSyA6q4YUoOyA-Urgr8gX56HXGsVRzZ6WJaU |
| `LINE_CHANNEL_ACCESS_TOKEN` | dpvC/+0lY3hByAjmAYJk0... (完整 token) |
| `LINE_CHANNEL_SECRET` | 從 LINE Developer Console 取得 |

## 五、首次部署指令

```bash
cd ah-biao-bot0
git init
git add .
git commit -m "init: RAG LINE bot"
git branch -M main
git remote add origin https://github.com/eveon416/ah-biao-bot0.git
git push -u origin main
```

Vercel 連接 GitHub 後會自動部署。

## 六、首次建立索引

部署完成後，手動觸發 GitHub Actions：
https://github.com/eveon416/ah-biao-bot0/actions/workflows/sync.yml
→ 點「Run workflow」

## 七、設定 LINE Webhook URL

在 LINE Developer Console 將 Webhook URL 設為：
```
https://<your-vercel-url>/webhook
```
