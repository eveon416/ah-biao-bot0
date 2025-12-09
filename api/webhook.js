import { GoogleGenAI } from "@google/genai";
import { Client, validateSignature } from "@line/bot-sdk";
import { Buffer } from 'node:buffer';

// Vercel Serverless Function Config
export const config = {
  api: {
    bodyParser: false,
  },
};

// 全域快取：用於儲存已處理過的事件 ID (防止重複回應)
const processedEventIds = new Map();

// 【新增】對話紀錄快取：用於儲存使用者的歷史對話 (記憶功能)
// Key: userId, Value: Array of content parts
// 注意：在 Serverless 環境中，此變數在冷啟動 (Cold Start) 時會重置。
// 若需永久記憶，需連接外部資料庫 (如 Redis, Firebase)。
const userSessions = new Map();

// 系統提示詞
const SYSTEM_INSTRUCTION = `
**角色設定 (Role):**
你是一位在台灣政府機關服務超過 20 年的「資深行政主管」，大家都尊稱你為「阿標」。你對公務體系的運作瞭若指掌，特別精通《政府採購法》、《文書處理手冊》、《機關檔案管理作業手冊》。你的個性沉穩、剛正不阿，但對待同仁（使用者）非常熱心，總是不厭其煩地指導後進，並習慣使用公務員的標準語氣（如「報告同仁」、「請 核示」、「依規定」）。

**核心任務 (Tasks):**
協助使用者解決政府行政、公文撰寫、檔案管理與出納薪資問題，確保行政作業合規且高效。

**【最高指導原則：版本控制與衝突仲裁 (CRITICAL: Version Control)】**
由於法規會隨時間修正，你必須嚴格執行以下判斷邏輯，確保回答的時效性：

1.  **檔案時效檢核**：
    *   將內部知識庫或上傳檔案的日期與「當前時間」及「網路搜尋結果」進行比對。

2.  **衝突仲裁機制 (Conflict Resolution)**：
    *   **情境 A (檔案過舊)**：若知識庫檔案日期較舊（例如 2021 年），但透過 Google Search 發現該法規已有最新修正（例如 2024 年修法），**請強制引用「Google Search 的最新搜尋結果」**，並在回答中明確警告使用者檔案已過期。
    *   **情境 B (數據查核)**：針對「金額門檻」（如公告金額）、「薪資標準」、「罰則數字」，**每次回答前必須強制執行 Google Search** 進行雙重確認，不可僅依賴內部檔案。

3.  **搜尋網域限制**：
    *   進行外部檢索時，僅限引用 **.gov.tw** (政府機關) 網站之資訊（如工程會、全國法規資料庫）。嚴禁引用部落格或非官方懶人包。

**【內建知識庫重點摘要 (Internal Knowledge Base)】**
*(請依據此基準，但務必執行上述查核)*
1.  **政府採購金額級距 (112.01.01 生效)**：
    *   **查核金額**：工程/財物 5,000 萬元；勞務 1,000 萬元。
    *   **公告金額**：150 萬元。
    *   **中央機關小額採購**：15 萬元以下 (得不經公告程序，逕洽廠商採購)。
2.  **總標價低於底價 80% 之執行程序 (114.01.14 修正)**：
    *   機關認為顯不合理，有降低品質、不能誠信履約之虞，限期通知廠商提出說明。
    *   廠商未提出說明或說明不合理：不決標。
    *   廠商說明合理：決標。
    *   廠商說明尚非完全合理，但最低標繳納差額保證金，即可避免降低品質不能誠信履約：通知廠商於五日內提出差額保證金，繳妥後決標。

**【回答格式規範 (Response Format)】**
請依照下列結構回答使用者的提問：

---
**🎯【核心結論】**：(一句話直接回答 可/不可/數字)
**⚖️【法令依據】**：
*   引用法規名稱、條號、解釋函令字號。
*   *(若引用網路資訊，請括號註明：依據最新網路檢索)*
**💡【作業建議】**：
*   條列式說明執行步驟 (Step-by-step)。
*   針對下級單位常犯錯誤提出「避雷提醒」。
**⚠️【資料狀態警示】**：
*   *(若內部資料過期，請在此顯示：資料庫之《xxx檔案》已過期，本回答依據最新法規修正)*
*   *(若檔案與現行法規一致，則免填此欄)*
---
*(免責聲明：本系統由 AI 輔助生成，僅供行政作業參考，重大決策請依正式公文程序請示上級。)*

**【語氣與態度 (Tone)】**
*   **專業權威**：站在督導立場，語氣客觀、堅定。
*   **公文用語**：使用標準行政用語（如：得否、應、擬請），避免過度口語化。
*   **教育性質**：不僅給答案，還要教導正確的行政邏輯，避免下級單位重複詢問相同問題。
`;

export default async function handler(req, res) {
  // 1. 只允許 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 2. 嚴格檢查環境變數
  if (!process.env.CHANNEL_SECRET || !process.env.CHANNEL_ACCESS_TOKEN) {
    console.error('CRITICAL ERROR: LINE Channel Secret or Access Token is missing.');
    return res.status(500).json({ message: 'Server Configuration Error: Missing Env Vars' });
  }

  try {
    let bodyText = '';
    let bodyObj = null;

    // 3. 智慧讀取 Body
    if (req.body && typeof req.body === 'object') {
      bodyObj = req.body;
      try {
        bodyText = JSON.stringify(bodyObj);
      } catch (e) {
        console.error('Body stringify failed:', e);
        return res.status(400).json({ message: 'Invalid Body Format' });
      }
    } else {
      const chunks = [];
      try {
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const buffer = Buffer.concat(chunks);
        bodyText = buffer.toString('utf-8');
        
        if (!bodyText) {
             console.log('Warning: Received empty body');
             return res.status(400).json({ message: 'Empty Body' });
        }
        
        bodyObj = JSON.parse(bodyText);
      } catch (e) {
        console.error('Stream reading or JSON parsing failed:', e);
        return res.status(400).json({ message: 'Invalid JSON' });
      }
    }

    // 4. 驗證 LINE 簽章
    const signature = req.headers['x-line-signature'];
    if (signature) {
      if (!validateSignature(bodyText, process.env.CHANNEL_SECRET, signature)) {
        console.error('Signature Validation Failed.');
        return res.status(401).json({ message: 'Invalid Signature' });
      }
    } else {
        console.warn('Missing X-Line-Signature');
        return res.status(401).json({ message: 'Missing Signature' });
    }

    // 5. 事件防呆與重複檢查 (Deduplication)
    const webhookEventId = bodyObj.webhookEventId;
    if (webhookEventId) {
        const lastSeen = processedEventIds.get(webhookEventId);
        if (lastSeen && (Date.now() - lastSeen < 60000)) {
            console.log(`Duplicate event detected: ${webhookEventId}. Skipping.`);
            return res.status(200).json({ message: 'Duplicate event ignored' });
        }
        const now = Date.now();
        for (const [id, time] of processedEventIds) {
            if (now - time > 300000) processedEventIds.delete(id);
        }
        processedEventIds.set(webhookEventId, now);
    }

    const events = bodyObj.events;
    if (!events || !Array.isArray(events) || events.length === 0) {
      console.log('Webhook Verification Successful (No events to process)');
      return res.status(200).json({ message: 'OK' });
    }

    // 6. 初始化 Clients
    const client = new Client({
      channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.CHANNEL_SECRET,
    });
    
    const apiKey = process.env.API_KEY;
    
    // 7. 處理所有事件
    await Promise.all(events.map(async (event) => {
      // 只處理文字訊息
      if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
      }

      const userMessage = event.message.text;
      const sourceType = event.source.type; // 'user', 'group', or 'room'
      const userId = event.source.userId;

      // 【群組過濾機制】
      if (sourceType === 'group' || sourceType === 'room') {
        if (!userMessage.includes('阿標')) {
            return Promise.resolve(null);
        }
      }

      try {
        if (!apiKey) {
           throw new Error("API_KEY_MISSING");
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKey });

        // 【記憶功能實作】
        // 1. 嘗試從快取中取得該使用者的歷史對話
        const sessionKey = userId || 'unknown';
        // 使用 map 來確保 deep copy 歷史紀錄，避免 SDK 內部參考造成狀態汙染
        const rawHistory = userSessions.get(sessionKey) || [];
        const history = rawHistory.map(item => ({
             role: item.role,
             parts: item.parts.map(p => ({ text: p.text }))
        }));

        // 2. 建立 Chat Session，傳入歷史紀錄
        const chat = ai.chats.create({
          model: 'gemini-2.5-flash',
          history: history,
          config: {
            tools: [{ googleSearch: {} }],
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.0,
            maxOutputTokens: 2048, 
            safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          },
        });

        // 3. 發送訊息 (Chat 模式)
        // 注意：result 是 GenerateContentResponse 物件，直接存取 .text
        const result = await chat.sendMessage({ message: userMessage });
        let replyText = result.text; 
        
        if (!replyText) {
             console.warn("Gemini response text is empty.");
             // 嘗試檢查是否有搜尋結果但沒文字 (雖不常見)
             if (result.candidates?.[0]?.groundingMetadata) {
                 replyText = "報告同仁，相關資料已檢索完畢，請您確認連結（但系統未生成摘要文字）。";
             } else {
                 replyText = "報告同仁，阿標剛才分神了（回應內容為空），請您再複述一次問題。";
             }
        }

        // 4. 更新歷史紀錄
        const newExchange = [
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: replyText }] }
        ];
        
        const updatedHistory = [...rawHistory, ...newExchange];
        // 保持最近 20 則訊息 (10輪對話)
        if (updatedHistory.length > 20) {
            updatedHistory.splice(0, updatedHistory.length - 20); 
        }
        userSessions.set(sessionKey, updatedHistory);

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });

      } catch (innerError) {
        console.error('Event Processing Error:', innerError.message, innerError.stack); // Enhanced logging
        
        let errorMsg = '報告同仁，系統連線發生異常，請稍後再試。'; // Default generic error

        if (innerError.message === 'API_KEY_MISSING') {
            errorMsg = '報告同仁，系統未設定 API 金鑰，請檢查環境變數。';
        } else if (innerError.message.includes('PERMISSION_DENIED') || innerError.message.includes('UNAUTHENTICATED')) {
            errorMsg = '報告同仁，您的 API 金鑰可能無效或權限不足，請確認 Google Cloud 專案已啟用 Gemini API 並開通計費功能。';
        } else if (innerError.message.includes('RESOURCE_EXHAUSTED')) {
            errorMsg = '報告同仁，服務忙碌中，請稍候再試或檢查您的用量配額。';
        } else if (innerError.message.includes('Bad Request') || innerError.message.includes('Failed to parse response')) {
            // This might catch issues with model response format if it's not proper text
            errorMsg = '報告同仁，模型回應格式異常，請稍後再試。';
        } else if (innerError.message.includes('Rate Limit Exceeded')) {
            errorMsg = '報告同仁，請求頻率過高，請稍候再試。';
        }


        try {
            await client.replyMessage(event.replyToken, {
                type: 'text',
                text: errorMsg
            });
        } catch (replyError) {
            console.error('Could not send error reply to LINE:', replyError);
        }
      }
    }));

    return res.status(200).json({ message: 'OK' });

  } catch (error) {
    console.error('Fatal Webhook Handler Error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}