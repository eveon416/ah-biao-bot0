import { GoogleGenAI } from "@google/genai";
import { Client, validateSignature } from "@line/bot-sdk";
import { Buffer } from 'node:buffer';

// Vercel Serverless Function Config
export const config = {
  api: {
    bodyParser: false,
  },
};

// 全域快取與 Session
const processedEventIds = new Map();
const userSessions = new Map();

// 系統提示詞 (修正版：嚴格禁止 Markdown，使用 LINE 官方風格)
const SYSTEM_INSTRUCTION = `
**角色設定 (Role):**
你是一位在台灣政府機關服務超過 20 年的「資深行政主管」，大家都尊稱你為「阿標」。你對公務體系的運作瞭若指掌，特別精通《政府採購法》、《文書處理手冊》、《機關檔案管理作業手冊》。你的個性沉穩、剛正不阿，但對待同仁（使用者）非常熱心，總是不厭其煩地指導後進。

**【排版格式最高指令 (Strict Formatting Rules)】**
由於 LINE 對話框不支援 Markdown 語法，為了讓訊息整潔易讀，請**嚴格遵守**以下規範，**禁止**使用任何 Markdown 符號：

1.  **🚫 禁止使用 Markdown**：
    *   **絕對禁止**使用星號（*）來標示粗體。
    *   **絕對禁止**使用井號（#）來標示標題。
    *   **絕對禁止**使用底線（_）或波浪號（~）。

2.  **✅ 正確強調方式 (LINE Style)**：
    *   **標題/重點**：請使用**全形括號【】** 包覆。
        *   範例：【核心結論】、【法令依據】
    *   **專有名詞/引用**：請使用**全形引號「」** 包覆。
        *   範例：依據「政府採購法」第 14 條...
    *   **條列式**：請使用數字 **1.** **2.** 或實心圓點 **•** (與後方文字需空一格)。

3.  **🗣️ 語氣要求**：
    *   保持公務員的正式感，多使用「報告同仁」、「請 核示」、「依規定辦理」。

**核心任務 (Tasks):**
協助使用者解決政府行政、公文撰寫、檔案管理與出納薪資問題，確保行政作業合規且高效。

**【最高指導原則：版本控制與衝突仲裁】**
1.  **檔案時效檢核**：隨時比對內部檔案日期與當前時間/網路資訊。
2.  **衝突仲裁**：若內部檔案明顯過舊（如 2021 年）且網路有最新修法（如 2024 年），請強制引用**最新網路資訊**並明確告知使用者。
3.  **數據查核**：金額、薪資、罰則等數字，務必執行 Google Search 雙重確認。

**【內建知識庫重點摘要】**
*(回答時請優先參考以下基準)*
1.  **政府採購金額**：查核金額(5000萬/1000萬)、公告金額(150萬)、小額採購(15萬)。
2.  **低於底價80%處理**：機關認為顯不合理...通知廠商提出說明...差額保證金(114.01.14修正)。
3.  **科務會議輪值**：參考基準 114/12/8 (週一) 為「陳怡妗」，名單順序：林唯農、宋憲昌、江開承、吳怡慧、胡蔚杰、陳頤恩、陳怡妗、陳薏雯、游智諺、陳美杏。

**【回答結構範例】**

【核心結論】
(請在此直接回答問題結論)

【法令依據】
• 依據「政府採購法」第 XX 條規定。
• 參照「機關檔案管理作業手冊」第 XX 點。

【作業建議】
1. 請確認核銷文件是否齊全。
2. 建議先行簽辦，避免程序瑕疵。

(免責聲明：本系統由 AI 輔助生成，僅供參考)
`;

// 輔助函式：計算輪值人員 (與 Cron Job 邏輯同步)
function getDutyPerson() {
    const staffList = [
      '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
      '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
    ];
    const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
    const anchorIndex = 6;
    const now = new Date();
    const taiwanNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const oneWeekMs = 604800000;
    const diffTime = taiwanNow.getTime() - anchorDate.getTime();
    const diffWeeks = Math.floor(diffTime / oneWeekMs);
    let targetIndex = (anchorIndex + diffWeeks) % staffList.length;
    if (targetIndex < 0) targetIndex = targetIndex + staffList.length;
    return staffList[targetIndex];
}

// 輔助函式：產生 Flex Message
function createAnnouncementFlex(dutyPerson) {
    return {
      type: 'flex',
      altText: `📢 行政科週知：本週輪值 ${dutyPerson}`,
      contents: {
        type: "bubble",
        size: "giga",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1e293b",
          paddingAll: "lg",
          contents: [
            { type: "text", text: "📢 行政科週知", color: "#ffffff", weight: "bold", size: "lg" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            { type: "text", text: "報告同仁早安 ☀️", color: "#64748b", size: "sm" },
            { type: "text", text: "本週科務會議輪值紀錄為：", color: "#334155", size: "md", weight: "bold" },
            { type: "separator", color: "#cbd5e1" },
            { type: "text", text: dutyPerson, size: "3xl", weight: "bold", color: "#ef4444", align: "center", margin: "lg" },
            { type: "separator", color: "#cbd5e1", margin: "lg" },
            {
              type: "box",
              layout: "vertical",
              margin: "lg",
              spacing: "sm",
              contents: [
                { type: "text", text: "煩請各位於 週二下班前", color: "#334155", weight: "bold", size: "sm" },
                { type: "text", text: "完成工作日誌 📝", color: "#64748b", size: "sm", margin: "none" },
                { type: "text", text: "俾利輪值同仁於 週三", color: "#334155", weight: "bold", size: "sm", margin: "md" },
                { type: "text", text: "彙整陳核用印 🈳", color: "#64748b", size: "sm", margin: "none" }
              ]
            },
            { type: "text", text: "辛苦了，祝本週工作順心！💪✨", margin: "xl", size: "xs", color: "#94a3b8", align: "center" }
          ]
        }
      }
    };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  if (!process.env.CHANNEL_SECRET || !process.env.CHANNEL_ACCESS_TOKEN) {
    console.error('CRITICAL ERROR: LINE Channel Secret or Access Token is missing.');
    return res.status(500).json({ message: 'Server Configuration Error: Missing Env Vars' });
  }

  try {
    let bodyText = '';
    let bodyObj = null;

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

    const client = new Client({
      channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.CHANNEL_SECRET,
    });
    
    const apiKey = process.env.API_KEY;
    
    await Promise.all(events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
      }

      const userMessage = event.message.text.trim();
      const sourceType = event.source.type; 
      const userId = event.source.userId;
      const groupId = event.source.groupId;
      const roomId = event.source.roomId;

      // 1. 特殊功能：查詢群組 ID
      if (userMessage.includes('查詢群組ID') || userMessage.includes('查詢群組id')) {
          let idInfo = '';
          if (groupId) idInfo = `群組 ID (Group ID): ${groupId}`;
          else if (roomId) idInfo = `聊天室 ID (Room ID): ${roomId}`;
          else idInfo = `使用者 ID (User ID): ${userId}`;

          const replyMsg = `報告長官，本聊天室的識別碼如下：\n\n${idInfo}\n\n請將此 ID 設定至環境變數 LINE_GROUP_ID 以啟用每週自動公告功能。`;
          
          await client.replyMessage(event.replyToken, { type: 'text', text: replyMsg });
          return;
      }

      // 2. 判斷是否為「阿標」呼叫 (群組內需喊名)
      if (sourceType === 'group' || sourceType === 'room') {
        if (!userMessage.includes('阿標')) {
            return Promise.resolve(null);
        }
      }

      // 3. 特殊功能：手動觸發週一會議公告 (攔截並直接發送 Flex Message)
      if (userMessage.includes('週一會議公告') || userMessage.includes('產生公告') || userMessage.includes('查詢輪值')) {
          try {
             const dutyPerson = getDutyPerson();
             const flexMsg = createAnnouncementFlex(dutyPerson);
             await client.replyMessage(event.replyToken, flexMsg);
             return; // 處理完畢，不需經過 Gemini
          } catch (e) {
             console.error("Manual Flex Generation Error:", e);
             // 若出錯則往下繼續交給 Gemini 處理
          }
      }

      // 4. 一般 AI 對話 (Gemini)
      try {
        if (!apiKey) throw new Error("API_KEY_MISSING");
        
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const sessionKey = userId || 'unknown';
        const rawHistory = userSessions.get(sessionKey) || [];
        const history = rawHistory.map(item => ({
             role: item.role,
             parts: item.parts.map(p => ({ text: p.text }))
        }));

        const chat = ai.chats.create({
          model: 'gemini-2.5-flash',
          history: history,
          config: {
            tools: [{ googleSearch: {} }],
            systemInstruction: SYSTEM_INSTRUCTION, // 已套用新的無 Markdown 規範
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

        const result = await chat.sendMessage({ message: userMessage });
        let replyText = result.text; 
        
        if (!replyText) {
             if (result.candidates?.[0]?.groundingMetadata) {
                 replyText = "報告同仁，相關資料已檢索完畢，請您確認連結（但系統未生成摘要文字）。";
             } else {
                 replyText = "報告同仁，阿標剛才分神了（回應內容為空），請您再複述一次問題。";
             }
        }

        const newExchange = [
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: replyText }] }
        ];
        
        const updatedHistory = [...rawHistory, ...newExchange];
        if (updatedHistory.length > 20) {
            updatedHistory.splice(0, updatedHistory.length - 20); 
        }
        userSessions.set(sessionKey, updatedHistory);

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });

      } catch (innerError) {
        console.error('Event Processing Error:', innerError.message, innerError.stack); 
        
        let errorMsg = '報告同仁，系統連線發生異常，請稍後再試。';
        // (Error handling logic kept same as before)
        if (innerError.message === 'API_KEY_MISSING') errorMsg = '報告同仁，系統未設定 API 金鑰。';
        else if (innerError.message.includes('RESOURCE_EXHAUSTED')) errorMsg = '報告同仁，服務忙碌中，請稍候再試。';

        try {
            await client.replyMessage(event.replyToken, { type: 'text', text: errorMsg });
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