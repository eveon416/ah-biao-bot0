import { GoogleGenAI } from "@google/genai";
import * as line from "@line/bot-sdk";

// Vercel Serverless Function 設定
export const config = {
  api: {
    bodyParser: false,
  },
};

// 讀取 Raw Body 的輔助函式
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// 初始化 LINE Client
const client = new line.Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

// 初始化 Gemini Client
// 使用 process.env.API_KEY，若未設定則使用空字串避免初始化錯誤，但在呼叫時會失敗並被 catch 捕獲
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

// 系統提示詞 (與 constants.ts 保持一致，確保 LINE 機器人擁有相同知識)
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
        *   **12月份職務異動**：
            *   待遇增加（如升官）：以12月份全月實發數額為準。
            *   待遇減少（如降調）：採「競合」方式，分項採計對當事人最有利之計算方式（通常是按比例）。
    *   **特殊身分**：
        *   **留職停薪**：按實際在職月數比例發給。
        *   **按日計酬人員**：依12月份薪酬 * 1.5 * (實際在職日數/365，或依規定比例)。
        *   **考績限制**：年終考績列**丙等**以下者，**不發給**年終工作獎金。

2.  **【薪資管理系統操作重點 (Payroll System)】**：
    *   **作業路徑**：C.獎金發放作業 > 02 年終獎金批次管理。
    *   **重要設定**：
        *   **所得歸屬年度**：必須設為 **115年度**（因為是115年2月發放）。若設為114年，系統應會跳出提醒。
        *   **計算基準**：系統預設以「12月份所支待遇標準」計算。
    *   **扣款規定**：
        *   **所得稅**：按全月給付總額扣取 **5%**（若未達起扣點 86,001 元則免扣，起扣點請依當年度國稅局規定為準）。
        *   **二代健保補充保費**：費率 **2.11%**。當單次給付金額超過 **當月投保金額 4倍** 之部分，需扣取補充保費。
        *   **法院強制扣款**：如有法院執行命令，需依比例扣薪（通常為1/3）。
    *   **操作流程**：新增批次 -> 資料維護(處理特殊案例) -> 報表列印(清冊/總表) -> 轉帳媒體製作 -> **結轉批次**(鎖定資料並歸戶所得)。

3.  **【一般行政與採購規範】**：
    *   **採購金額級距**：小額採購（15萬以下）、公告金額（150萬）、查核金額（1500萬/5000萬）。
    *   **公文用語**：上行文用「鈞」、平行文用「貴」、下行文用「臺端/貴」。簽稿撰寫需分段清晰（主旨、說明、擬辦）。

**回答準則:**
1.  **引用依據**：回答時請明確指出是依據哪一條規定（如：「依據發給注意事項第三點...」）。
2.  **計算範例**：若問及計算，請列出算式（如：「(本俸+專加) x 1.5 x 6/12」）。
3.  **系統操作提醒**：若涉及發放，請順帶提醒系統操作重點（如：「記得將所得歸屬年度設為115年」）。
4.  **風險提示**：若使用者的做法可能違規（如：提前發放、計算錯誤），請嚴肅提醒。
`;

// 主處理函式
export default async function handler(req, res) {
  // 只接受 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. 取得 Raw Body (Buffer)
    const rawBody = await getRawBody(req);
    const bodyText = rawBody.toString('utf-8');
    
    // 2. 驗證 LINE 簽章 (安全性檢查)
    const signature = req.headers['x-line-signature'];
    if (!process.env.CHANNEL_SECRET || !process.env.CHANNEL_ACCESS_TOKEN) {
      console.error('Missing LINE Environment Variables');
      return res.status(500).send('Server Configuration Error');
    }

    if (!line.validateSignature(bodyText, process.env.CHANNEL_SECRET, signature)) {
      console.error('Signature validation failed');
      return res.status(401).send('Invalid Signature');
    }

    // 3. 解析 JSON
    const body = JSON.parse(bodyText);
    const events = body.events;

    // 4. 平行處理所有事件
    const results = await Promise.all(events.map(async (event) => {
      // 只回應文字訊息
      if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
      }

      try {
        // 呼叫 Gemini
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: event.message.text,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        });

        // 確保有回傳文字，若無則提供預設訊息
        const replyText = response.text || "報告同仁，阿標目前正在查閱法規，請稍後再試一次。";

        // 回傳訊息給 LINE
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });

      } catch (error) {
        console.error('Gemini Processing Error:', error);
        
        // 若 AI 失敗，回傳錯誤訊息，讓使用者知道機器人還活著
        try {
            return await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '報告同仁，系統連線發生異常（可能為API Key額度或連線問題），請稍後再試。',
            });
        } catch (lineError) {
            console.error('LINE Reply Error:', lineError);
            return null;
        }
      }
    }));

    // 回應 LINE 伺服器 200 OK
    res.status(200).json(results);

  } catch (error) {
    console.error('Webhook Handler Error:', error);
    res.status(500).send('Internal Server Error');
  }
}