import { GoogleGenAI } from "@google/genai";
import { Client, validateSignature } from "@line/bot-sdk";
import { Buffer } from 'node:buffer';

export const config = {
  api: { bodyParser: false },
};

const processedEventIds = new Map();
const userSessions = new Map();

// ==========================================
// 採購顧問 Apps Script API 網址
// ==========================================
const PROCUREMENT_API_URL = 'https://script.google.com/macros/s/AKfycbyW9w0TSX-mo0w4TZtQNJTnUMckT4-tY7rQAJymZnQBEyinf3ZPd-S__mIK5IolmWhY/exec';

// ==========================================
// 取得採購文件內容（帶快取）
// ==========================================
let cachedDocContext = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6小時

async function getProcurementContext() {
  const now = Date.now();
  if (cachedDocContext && (now - cacheTimestamp < CACHE_DURATION)) {
    console.log('使用快取的採購文件');
    return cachedDocContext;
  }
  try {
    console.log('重新讀取採購文件...');
    const response = await fetch(PROCUREMENT_API_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`API 回應錯誤: ${response.status}`);
    const data = await response.json();
    cachedDocContext = data.context || '';
    cacheTimestamp = now;
    console.log(`採購文件讀取成功，長度：${cachedDocContext.length}`);
    return cachedDocContext;
  } catch (e) {
    console.error('採購文件讀取失敗:', e.message);
    return '';
  }
}

// ==========================================
// 判斷是否為採購相關問題
// ==========================================
function isProcurementQuestion(text) {
  const keywords = [
    '採購', '招標', '決標', '驗收', '履約', '底價', '公告金額',
    '公開招標', '限制性招標', '議價', '比價', '簽約', '廠商',
    '工程', '勞務', '財物', '投標', '開標', '標案', '採購法',
    '查核', '小額', '簽辦', '簽稿', '該怎麼做', '下一步', '流程'
  ];
  return keywords.some(kw => text.includes(kw));
}

// ==========================================
// 系統提示詞（阿標原版）
// ==========================================
const SYSTEM_INSTRUCTION = `
**角色設定 (Role):**
你是一位在台灣政府機關服務超過 20 年的「資深行政主管」，大家都尊稱你為「阿標」。你對公務體系的運作瞭若指掌，特別精通《政府採購法》、《文書處理手冊》、《機關檔案管理作業手冊》。你的個性沉穩、剛正不阿，但對待同仁（使用者）非常熱心，總是不厭其煩地指導後進。

**【排版格式最高指令】**
由於 LINE 對話框不支援 Markdown 語法，請嚴格遵守以下規範：
1. 絕對禁止使用星號（*）、井號（#）、底線（_）。
2. 標題/重點：請使用全形括號【】包覆。
3. 專有名詞/引用：請使用全形引號「」包覆。
4. 條列式：請使用數字 1. 2. 或實心圓點 • (與後方文字需空一格)。
5. 語氣：保持公務員的正式感，多使用「報告同仁」、「請 核示」、「依規定辦理」。
6. 回答中不要使用任何人名，一律以職稱代替（例如：局長、科長、主任、承辦人）。

**【採購問題處理原則】**
收到採購相關問題時，工作流程分兩階段：

第一階段：釐清問題
收到問題後，先判斷資訊是否足夠。如果不夠，只問最關鍵的一個問題，例如：
• 採購類型（工程／財物／勞務）？
• 採購金額？
• 目前辦到哪個階段（需求規劃／招標／決標／履約／驗收）？
每次只問一個問題，不要一次問很多。

第二階段：完整回答
確認資訊足夠後，再提供：
【現在該做什麼】明確的步驟指引
【法令依據】相關條文名稱和條號
【應備文件】清單
【簽稿方向】重點內容建議

**【內建知識庫重點摘要】**
1. 政府採購金額：查核金額(5000萬/1000萬)、公告金額(150萬)、小額採購(15萬)。
2. 低於底價80%處理：機關認為顯不合理...通知廠商提出說明...差額保證金(114.01.14修正)。
3. 科務會議輪值：參考基準 114/12/8 (週一) 為「陳怡妗」，名單順序：林唯農、宋憲昌、江開承、吳怡慧、胡蔚杰、陳頤恩、陳怡妗、陳薏雯、游智諺、陳美杏。

(免責聲明：本系統由 AI 輔助生成，僅供參考)
`;

// ==========================================
// 輔助函式：計算輪值人員
// ==========================================
function getDutyPerson(targetDate = new Date()) {
  const staffList = [
    '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
    '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
  ];
  const anchorDate = new Date('2025-12-08T00:00:00+08:00');
  const anchorIndex = 6;
  const taiwanTarget = new Date(targetDate.getTime() + (8 * 60 * 60 * 1000));
  const oneWeekMs = 604800000;
  const diffTime = taiwanTarget.getTime() - anchorDate.getTime();
  const diffWeeks = Math.floor(diffTime / oneWeekMs);
  let targetIndex = (anchorIndex + diffWeeks) % staffList.length;
  if (targetIndex < 0) targetIndex = targetIndex + staffList.length;
  return staffList[targetIndex];
}

// ==========================================
// 輔助函式：產生 Flex Message
// ==========================================
function createAnnouncementFlex(dutyPerson, dateLabel = "本週") {
  return {
    type: 'flex',
    altText: `📢 行政科週知：${dateLabel}輪值 ${dutyPerson}`,
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box", layout: "vertical",
        backgroundColor: "#1e293b", paddingAll: "lg",
        contents: [{ type: "text", text: "📢 科務會議輪值", color: "#ffffff", weight: "bold", size: "lg" }]
      },
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: "報告同仁早安 ☀️", color: "#64748b", size: "sm" },
          { type: "text", text: `${dateLabel}科務會議輪值人員：`, color: "#334155", size: "md", weight: "bold" },
          { type: "separator", color: "#cbd5e1" },
          { type: "text", text: dutyPerson, size: "3xl", weight: "bold", color: "#ef4444", align: "center", margin: "lg" },
          { type: "separator", color: "#cbd5e1", margin: "lg" },
          {
            type: "box", layout: "vertical", margin: "lg", spacing: "sm",
            contents: [
              { type: "text", text: "煩請各位於 週二下班前", color: "#334155", weight: "bold", size: "sm" },
              { type: "text", text: "完成工作日誌 📝", color: "#64748b", size: "sm", margin: "none" },
              { type: "text", text: "俾利輪值同仁於 週三", color: "#334155", weight: "bold", size: "sm", margin: "md" },
              { type: "text", text: "彙整陳核用印 🈳", color: "#64748b", size: "sm", margin: "none" }
            ]
          },
          { type: "text", text: "辛苦了，祝工作順心！💪✨", margin: "xl", size: "xs", color: "#94a3b8", align: "center" }
        ]
      }
    }
  };
}

// ==========================================
// 主程式
// ==========================================
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  if (!process.env.CHANNEL_SECRET || !process.env.CHANNEL_ACCESS_TOKEN) {
    return res.status(500).json({ message: 'Server Configuration Error' });
  }

  try {
    let bodyText = '';
    let bodyObj = null;

    if (req.body && typeof req.body === 'object') {
      bodyObj = req.body;
      try { bodyText = JSON.stringify(bodyObj); } catch (e) {
        return res.status(400).json({ message: 'Invalid Body Format' });
      }
    } else {
      const chunks = [];
      try {
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        bodyText = Buffer.concat(chunks).toString('utf-8');
        if (!bodyText) return res.status(400).json({ message: 'Empty Body' });
        bodyObj = JSON.parse(bodyText);
      } catch (e) {
        return res.status(400).json({ message: 'Invalid JSON' });
      }
    }

    const signature = req.headers['x-line-signature'];
    if (!signature) return res.status(401).json({ message: 'Missing Signature' });
    if (!validateSignature(bodyText, process.env.CHANNEL_SECRET, signature)) {
      return res.status(401).json({ message: 'Invalid Signature' });
    }

    const webhookEventId = bodyObj.webhookEventId;
    if (webhookEventId) {
      const lastSeen = processedEventIds.get(webhookEventId);
      if (lastSeen && (Date.now() - lastSeen < 60000)) {
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
      return res.status(200).json({ message: 'OK' });
    }

    const client = new Client({
      channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.CHANNEL_SECRET,
    });

    const apiKey = process.env.API_KEY;

    await Promise.all(events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') return;

      const userMessage = event.message.text.trim();
      const sourceType = event.source.type;
      const userId = event.source.userId;
      const groupId = event.source.groupId;
      const roomId = event.source.roomId;

      // 1. 查詢群組 ID
      if (userMessage.includes('查詢群組ID') || userMessage.includes('查詢群組id')) {
        let idInfo = '';
        if (groupId) idInfo = `群組 ID: ${groupId}`;
        else if (roomId) idInfo = `聊天室 ID: ${roomId}`;
        else idInfo = `使用者 ID: ${userId}`;
        await client.replyMessage(event.replyToken, { type: 'text', text: `報告長官，本聊天室的識別碼如下：\n\n${idInfo}` });
        return;
      }

      // 2. 群組內需喊「阿標」
      if (sourceType === 'group' || sourceType === 'room') {
        if (!userMessage.includes('阿標')) return;
      }

      // 3. 輪值相關
      if (userMessage.includes('週一會議公告') || userMessage.includes('產生公告') || userMessage.includes('輪值') || userMessage.includes('誰')) {
        try {
          let targetDate = new Date();
          let dateLabel = "本週";
          if (userMessage.includes('下下週') || userMessage.includes('下下周')) { targetDate.setDate(targetDate.getDate() + 14); dateLabel = "下下週"; }
          else if (userMessage.includes('下週') || userMessage.includes('下周')) { targetDate.setDate(targetDate.getDate() + 7); dateLabel = "下週"; }
          else if (userMessage.includes('上週') || userMessage.includes('上周')) { targetDate.setDate(targetDate.getDate() - 7); dateLabel = "上週"; }
          const dutyPerson = getDutyPerson(targetDate);
          await client.replyMessage(event.replyToken, createAnnouncementFlex(dutyPerson, dateLabel));
          return;
        } catch (e) { console.error("Flex Generation Error:", e); }
      }

      // 4. AI 對話
      try {
        if (!apiKey) throw new Error("API_KEY_MISSING");

        const ai = new GoogleGenAI({ apiKey: apiKey });
        const sessionKey = userId || 'unknown';
        const rawHistory = userSessions.get(sessionKey) || [];
        const history = rawHistory.map(item => ({
          role: item.role,
          parts: item.parts.map(p => ({ text: p.text }))
        }));

        // 判斷是否為採購問題，是的話加入文件內容
        let systemPrompt = SYSTEM_INSTRUCTION;
        if (isProcurementQuestion(userMessage)) {
          console.log('偵測到採購問題，讀取文件...');
          const docContext = await getProcurementContext();
          if (docContext) {
            systemPrompt += `\n\n【機關採購相關文件資料，請優先參考以下內容回答】\n${docContext.substring(0, 50000)}`;
          }
        }

        const chat = ai.chats.create({
          model: 'gemini-2.5-flash',
          history: history,
          config: {
            tools: [{ googleSearch: {} }],
            systemInstruction: systemPrompt,
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
          replyText = "報告同仁，阿標剛才分神了，請您再複述一次問題。";
        }

        const newExchange = [
          { role: 'user', parts: [{ text: userMessage }] },
          { role: 'model', parts: [{ text: replyText }] }
        ];
        const updatedHistory = [...rawHistory, ...newExchange];
        if (updatedHistory.length > 20) updatedHistory.splice(0, updatedHistory.length - 20);
        userSessions.set(sessionKey, updatedHistory);

        await client.replyMessage(event.replyToken, { type: 'text', text: replyText });

      } catch (innerError) {
        console.error('Event Processing Error:', innerError.message);
        let errorMsg = '報告同仁，系統連線發生異常，請稍後再試。';
        if (innerError.message === 'API_KEY_MISSING') errorMsg = '報告同仁，系統未設定 API 金鑰。';
        else if (innerError.message.includes('RESOURCE_EXHAUSTED')) errorMsg = '報告同仁，服務忙碌中，請稍候再試。';
        try { await client.replyMessage(event.replyToken, { type: 'text', text: errorMsg }); } catch (e) { }
      }
    }));

    return res.status(200).json({ message: 'OK' });

  } catch (error) {
    console.error('Fatal Webhook Handler Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
