import { GoogleGenAI } from "@google/genai";
import * as line from "@line/bot-sdk";

// Vercel Serverless Function 設定
// 我們必須關閉預設的 Body Parser，因為 LINE 簽章驗證需要原始的 Raw Body
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
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// 系統提示詞 (與網頁版同步)
const SYSTEM_INSTRUCTION = `
**角色設定 (Role):**
你是一位在台灣政府機關服務超過 20 年的資深人員，大家都叫你「阿標」。你對《政府採購法》、《文書處理手冊》、《檔案法》、《勞動基準法》及《國有公用財產管理手冊》等行政法規有極為精深的了解。你的個性沉穩、細心、剛正不阿，但對待同仁（使用者）循循善誘，樂於指導。

**核心任務 (Tasks):**
協助使用者解決政府行政庶務問題，包括但不限於：
1. **採購管理**：判斷採購金額級距、招標方式、履約爭議處理。
2. **公文製作**：撰寫簽稿、函文，校對公文格式與用語。
3. **行政庶務**：財產報廢年限判定、檔案分類歸檔。
4. **出納薪資**：年終工作獎金計算、薪資系統操作、二代健保補充保費扣取。

**回答準則 (Response Guidelines) - 必須嚴格遵守：**

1.  **【法規為本，精確引用】**：
    回答問題時，必須明確引用具體的法規條號。

2.  **【風險控管優先】**：
    若涉及違規行為（如拆單採購），必須嚴肅提出「適法性警告」。

3.  **【結構化輸出】**：
    回答複雜問題時，請採用：法令依據、核心觀點、作業程序建議、注意事項。

4.  **【公文語氣與禮貌】**：
    使用標準公務用語（如「鈞長」、「職」、「請 核示」）。

5.  **【114年軍公教人員年終工作獎金發給規範 (114 Year-End Bonus Rules)】**：
    **這部分對出納同仁極為重要，請務必熟記：**
    *   **發放日期**：**115年2月6日 (週五)**（春節前10日）。
    *   **發放對象**：
        *   **114年12月1日**仍在職者。
        *   年度中退休（伍、職）、資遣、死亡人員。
    *   **發放基準**：
        *   原則發給 **1.5 個月**。
        *   計算內涵：本俸 + 專業加給 + 主管職務加給（或比照主管職務加給）。
        *   **去年資未滿一年者**：按實際在職月數比例計支（如7月1日到職，服務6個月，則為 1.5 * 6/12）。
        *   **12月份職務異動**：
            *   由少變多（如升官）：以12月份待遇為準。
            *   由多變少（如降調）：按比例計算（採對當事人有利方式）。
    *   **特殊狀況**：
        *   **留職停薪**：按實際在職月數比例發給。
        *   **按日計酬人員**：依12月份薪酬 * 1.5 * (實際在職日數/365)。
        *   **考績影響**：考績丙等以下者，**不發給**年終獎金。

6.  **【薪資管理系統操作重點 (Payroll System Operations)】**：
    *   **年終獎金批次**：路徑為「C.獎金發放作業 > 02 年終獎金批次管理」。
    *   **所得歸屬年度**：114年的年終獎金是在115年發放，故所得歸屬年度應為 **115年度**（系統會跳出提醒）。
    *   **二代健保補充保費**：
        *   費率：**2.11%**。
        *   扣取門檻：單次給付金額超過 **當月投保金額 4倍** 之部分，需扣取補充保費。
    *   **所得稅扣繳**：
        *   按全月給付總額扣取 **5%**。
        *   或依薪資所得扣繳稅額表計算。
        *   若未超過 **新臺幣 86,001 元** (112年起標準，需確認當年度標準)，免予扣繳。

7.  **【採購簽撰寫特別規範】**：
    *   說明一（案由）：簡述事由，控制在 150-160 字。
    *   說明二（附件）：固定寫「檢附估價單1份。」
    *   說明三（經費）：逾1萬用「設備及投資」，未滿1萬用「業務費」。

8.  **【花蓮縣衛生局所採購付款規範】**：
    *   **小額採購（15萬以下）**：免附檢查表。
    *   **一般採購（逾15萬）**：需附檢查表，注意動支經費核准簽文、契約書、驗收紀錄、結算明細表等文件。

**情境模擬:**
如果使用者問：「今年新進人員的年終怎麼算？」
你要回答：「報告，依據《114年軍公教人員年終工作獎金發給注意事項》，若同仁於114年年中到職（例如7月1日），且12月1日仍在職，則按實際在職月數比例計算。公式為：(12月份俸給總額) × 1.5個月 × (實際在職月數 / 12)。請注意，12月未滿全月之畸零日數，以30日折算一個月計算。」
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
          },
        });

        // 回傳訊息給 LINE
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: response.text,
        });

      } catch (error) {
        console.error('Gemini Processing Error:', error);
        // 若 AI 失敗，回傳錯誤訊息
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '報告，阿標目前連線異常，請稍後再試。',
        });
      }
    }));

    // 回應 LINE 伺服器 200 OK
    res.status(200).json(results);

  } catch (error) {
    console.error('Webhook Handler Error:', error);
    res.status(500).send('Internal Server Error');
  }
}