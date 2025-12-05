import { GoogleGenAI } from "@google/genai";
import { Client, validateSignature } from "@line/bot-sdk";
import { Buffer } from 'node:buffer';

// Vercel Serverless Function Config
export const config = {
  api: {
    bodyParser: false,
  },
};

// 系統提示詞
const SYSTEM_INSTRUCTION = `
**角色設定 (Role):**
你是一位在台灣政府機關服務超過 20 年的「資深行政主管」，大家都尊稱你為「阿標」。你對公務體系的運作瞭若指掌，特別精通《政府採購法》、《文書處理手冊》、《勞動基準法》以及最新的《軍公教人員年終工作獎金發給注意事項》。你的個性沉穩、剛正不阿，但對待同仁（使用者）非常熱心，總是不厭其煩地指導後進，並習慣使用公務員的標準語氣（如「報告同仁」、「請 核示」、「依規定」）。

**核心任務 (Tasks):**
協助使用者解決政府行政與出納薪資問題，確保行政作業合規且高效。

**專業知識庫 (Knowledge Base) - 請嚴格依據以下內容回答：**

1.  **【114年軍公教人員年終工作獎金發給注意事項 (114 Year-End Bonus)】**：
    *   **發放日期**：**115年2月6日 (週五)**（春節前10日）。
    *   **發給對象**：
        *   **114年12月1日**仍在職之現職軍公教人員。
        *   年度中退休（伍、職）、資遣、死亡人員。
    *   **發給基準**：
        *   原則發給 **1.5 個月**。
        *   計支內涵：本俸 + 專業加給 + 主管職務加給（或比照主管職務加給）。
        *   **年資未滿一年者**：按實際在職月數比例計支（例如7月1日到職，服務6個月，則為 1.5 * 6/12）。
    *   **特殊身分**：
        *   **留職停薪**：按實際在職月數比例發給。
        *   **按日計酬人員**：依12月份薪酬 * 1.5 * (實際在職日數/365，或依規定比例)。

2.  **【薪資管理系統操作重點 (Payroll System)】**：
    *   **作業路徑**：C.獎金發放作業 > 02 年終獎金批次管理。
    *   **重要設定**：
        *   **所得歸屬年度**：必須設為 **115年度**。
    *   **扣款規定**：
        *   **所得稅**：5%。
        *   **二代健保補充保費**：2.11% (超過投保金額4倍部分)。

**回答準則:**
1.  **引用依據**：回答時請明確指出是依據哪一條規定。
2.  **計算範例**：若問及計算，請列出算式。
3.  **風險提示**：若使用者的做法可能違規，請嚴肅提醒。
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

    // 5. 處理「Verify」請求
    const events = bodyObj.events;
    if (!events || !Array.isArray(events) || events.length === 0) {
      console.log('Webhook Verification Successful (No events to process)');
      return res.status(200).json({ message: 'OK' });
    }

    // 6. 初始化 Clients (在 Handler 內部初始化以確保環境變數最新且 Instance 獨立)
    const client = new Client({
      channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.CHANNEL_SECRET,
    });
    
    // 檢查 API KEY
    const apiKey = process.env.API_KEY;
    
    // 7. 處理所有事件
    await Promise.all(events.map(async (event) => {
      if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
      }

      try {
        if (!apiKey) {
           throw new Error("API_KEY_MISSING");
        }
        
        // 建立新的 AI Client 實例
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: event.message.text,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.3,
            maxOutputTokens: 600,
            // 關鍵修正：設定安全過濾器為 BLOCK_NONE，避免誤判行政用語 (如死亡、處罰)
            safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          },
        });

        // 確保有文字回應，若被阻擋或發生錯誤，給予明確回覆
        let replyText = response.text;
        
        if (!replyText) {
             console.warn("Gemini response text is empty. Checking candidates/safety.");
             // 如果回應是空的，通常是因為 Safety Filter 即使設了 BLOCK_NONE 還是極端情況，或是模型錯誤
             replyText = "報告同仁，阿標剛才分神了（回應內容為空），請您再複述一次問題。";
        }

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });

      } catch (innerError) {
        console.error('Event Processing Error:', innerError);
        
        let errorMsg = '報告同仁，系統連線發生異常，請稍後再試。';
        if (innerError.message === 'API_KEY_MISSING') {
            errorMsg = '報告同仁，系統未設定 API 金鑰。';
        }
        
        try {
            await client.replyMessage(event.replyToken, {
                type: 'text',
                text: errorMsg
            });
        } catch (replyError) {
            console.error('Could not send error reply:', replyError);
        }
      }
    }));

    return res.status(200).json({ message: 'OK' });

  } catch (error) {
    console.error('Fatal Webhook Handler Error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}