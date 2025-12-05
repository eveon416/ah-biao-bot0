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
**回答時務必執行 Google 搜尋以確認最新法規變動與條號。**

**專業知識庫 (Knowledge Base) - 請嚴格依據以下內容回答：**

1.  **【114年軍公教人員年終工作獎金發給注意事項 (114 Year-End Bonus)】**：
    *   **發放日期**：**115年2月6日 (週五)**（春節前10日）。
    *   **發給對象**：
        *   **114年12月1日**仍在職之現職軍公教人員。
        *   年度中退休（伍、職）、資遣、死亡人員。
    *   **發給基準**：
        *   原則發給 **1.5 個月**。
        *   計支內涵：本俸 + 專業加給 + 主管職務加給（或比照主管職務加給）。
        *   **【重要計算規則】在職月數認定**：
            *   依據有利於當事人原則，**當月份只要有在職事實（即使僅1日），該月即以「全月」計入在職月數**。
            *   **範例**：某工友於**114年7月2日退休**，因7月份已有在職事實，故計算期間為1月至7月（共7個月），發給比例為 **7/12**。算式：(薪酬總額 x 1.5) x 7/12。
        *   **12月份職務異動**：
            *   待遇增加（如升官）：以12月份全月實發數額為準。
            *   待遇減少（如降調）：採「競合」方式，分項採計對當事人最有利之計算方式（通常是按比例）。
    *   **特殊身分**：
        *   **留職停薪**：按實際在職月數比例發給（同樣適用上述全月認定原則，復職當月計全月）。
        *   **按日計酬人員**：依12月份薪酬 * 1.5 * (實際在職日數/365，或依規定比例)。

2.  **【薪資管理系統操作重點 (Payroll System)】**：
    *   **作業路徑**：C.獎金發放作業 > 02 年終獎金批次管理。
    *   **重要設定**：
        *   **所得歸屬年度**：必須設為 **115年度**。
    *   **扣款規定**：
        *   **所得稅**：5%。
        *   **二代健保補充保費**：2.11% (超過投保金額4倍部分)。

**回答準則:**
1.  **查證與引用**：請優先參考上述知識庫，並**必須使用 Google 搜尋**驗證法規條號。回答時請明確列出來源（例如：「依據《114年軍公教人員年終工作獎金發給注意事項》第Ｏ點規定...」）。
2.  **精準計算**：針對「年中退休/離職」案例，務必套用「當月有在職即算全月」之規則。
3.  **計算範例**：若問及計算，請列出算式。
4.  **風險提示**：若使用者的做法可能違規，請嚴肅提醒。
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

    // 6. 初始化 Clients
    const client = new Client({
      channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.CHANNEL_SECRET,
    });
    
    // 檢查 API KEY
    const apiKey = process.env.API_KEY;
    
    // 7. 處理所有事件
    await Promise.all(events.map(async (event) => {
      // 只處理文字訊息
      if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
      }

      const userMessage = event.message.text;
      const sourceType = event.source.type; // 'user', 'group', or 'room'

      // 【群組過濾機制】
      // 如果是在群組(group)或多人聊天室(room)
      if (sourceType === 'group' || sourceType === 'room') {
        // 檢查訊息是否包含呼叫關鍵字「阿標」
        if (!userMessage.includes('阿標')) {
            // 如果沒叫阿標，就已讀不回，避免打擾群組對話
            return Promise.resolve(null);
        }
      }

      try {
        if (!apiKey) {
           throw new Error("API_KEY_MISSING");
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: userMessage, // 直接將使用者訊息送給 AI，包含「阿標」二字也沒關係，AI 知道這是他的名字
          config: {
            // 加入 Google Search Tool
            tools: [{ googleSearch: {} }],
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.3,
            maxOutputTokens: 2048, 
            safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          },
        });

        let replyText = response.text;
        
        if (!replyText) {
             console.warn("Gemini response text is empty.");
             replyText = "報告同仁，阿標剛才分神了（回應內容為空），請您再複述一次問題。";
        }

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });

      } catch (innerError) {
        console.error('Event Processing Error:', innerError);
        
        // 在群組中如果發生錯誤，通常選擇保持安靜，除非是嚴重的系統設定錯誤，
        // 這裡為了除錯方便，若是私訊則回報錯誤，群組則視情況回報
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