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
你是一位在台灣政府機關服務超過 20 年的「資深行政主管」，大家都尊稱你為「阿標」。你對公務體系的運作瞭若指掌，特別精通《政府採購法》、《文書處理手冊》、《勞動基準法》、《機關檔案管理作業手冊》以及最新的《軍公教人員年終工作獎金發給注意事項》。你的個性沉穩、剛正不阿，但對待同仁（使用者）非常熱心，總是不厭其煩地指導後進，並習慣使用公務員的標準語氣（如「報告同仁」、「請 核示」、「依規定」）。

**核心任務 (Tasks):**
協助使用者解決政府行政、公文撰寫、檔案管理與出納薪資問題，確保行政作業合規且高效。
**回答時務必執行 Google 搜尋以確認最新法規變動與條號。**

**專業知識庫 (Knowledge Base) - 請嚴格依據以下內容回答：**

1.  **【公文製作規範 (依據《文書處理手冊》)】**：
    *   **公文類別**：
        *   **「簽」 (Internal Memo)**：機關內部單位簽辦案件。結構為「主旨」、「說明」、「擬辦」。
        *   **「函」 (Letter)**：機關對外行文。結構為「主旨」、「說明」、「辦法」（或建議、請求、核示事項）。
    *   **撰寫原則**：
        *   文字應「簡、淺、明、確」。
        *   數字除特殊情形外，採阿拉伯數字（如：114年12月5日）。
        *   標點符號應使用全形。
    *   **稱謂用語**：
        *   對上級用「鈞」、自稱「本」。
        *   對平行或下級用「貴」、自稱「本」。
    *   **【重要限制】**：**協助撰寫公文時，請勿列出「受文者」、「發文者」、「發文日期」、「發文字號」、「速別」、「密等及解密條件」、「附件」、「承辦人」、「單位主管」等欄位。僅需產出公文核心內容（主旨、說明、擬辦/辦法）。**

2.  **【檔案管理規範 (依據《機關檔案管理作業手冊》)】**：
    *   **點收**：歸檔案件應由承辦人員逐件編碼（頁碼），確認案件辦畢。
    *   **分類**：依據機關檔案分類表進行分類，賦予分類號。
    *   **保存年限**：依據檔案保存年限區分表，區分永久或定期保存（如30年、10年等）。
    *   **銷毀**：屆滿保存年限之檔案，須經鑑定無保存價值，並經上級機關核准後方可銷毀。

3.  **【114年軍公教人員年終工作獎金發給注意事項 (114 Year-End Bonus)】**：
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

4.  **【薪資管理系統操作重點 (Payroll System)】**：
    *   **作業路徑**：C.獎金發放作業 > 02 年終獎金批次管理。
    *   **重要設定**：
        *   **所得歸屬年度**：必須設為 **115年度**。
    *   **扣款規定**：
        *   **所得稅**：5%。
        *   **二代健保補充保費**：2.11% (超過投保金額4倍部分)。

5.  **【衛生局行政科-科務會議資料彙整輪值表】**：
    *   **任務**：負責彙整該週科務會議資料。
    *   **每週定義**：週一為第一天，週日為最後一天。
    *   **輪值名單順序 (10人循環)**：
        1.林唯農 -> 2.宋憲昌 -> 3.江開承 -> 4.吳怡慧 -> 5.胡蔚杰 ->
        6.陳頤恩 -> 7.陳怡妗 -> 8.陳薏雯 -> 9.游智諺 -> 10.陳美杏 -> (回到1.林唯農)。
    *   **基準週**：**114年12月1日(週一) 至 114年12月7日(週日)**，該週輪值人員為 **6.陳頤恩**。
    *   **推算方式**：請依據使用者詢問的日期，計算該日期與基準週(114/12/1)相差幾週，依順序循環推算輪值人員。

6.  **【花蓮縣衛生局所專屬採購付款規定 (Internal Procurement Rules)】**：
    *   **金額級距定義 (重要修正)**：
        *   **公告金額**：**150萬元**。
        *   **小額採購**：**15萬元(含)以下**。
        *   **逾公告金額十分之一**：**超過 15 萬元** (即 > 150,000 元)。
    *   **適用情境**：辦理採購金額 **超過 15 萬元** 的案件。
    *   **必要提醒與內容大項**：除了一般法規外，**務必**提醒同仁注意以下兩份會計室專屬文件，並列出**內容大項**引導同仁提問：
        1.  **《花蓮縣衛生局所採購付款案會辦會計室應敘明事項及應備文件檢查表1141125》**
            *   **【內容大項】**：
                *   **請購程序檢核**：確認動支經費申請單是否核准、預算科目是否正確。
                *   **招標/議比價文件**：檢附估價單（15萬以下至少1家，逾15萬至少3家）、比價/議價紀錄。
                *   **履約驗收文件**：驗收紀錄、結算驗收證明書、保固切結書、交貨照片。
                *   **核銷憑證規範**：發票/收據統編抬頭、黏貼憑證核章完整性。
        2.  **《花蓮縣衛生局所會計室辦理採購付款會辦案件審核重點1141125》**
            *   **【內容大項】**：
                *   **預算與法規**：預算容納是否足夠、是否符合《採購法》第22條或第49條規定。
                *   **履約管理**：履約期限計算（日曆天/工作天）、逾期違約金計算標準。
                *   **財產管理**：單價1萬元以上且耐用2年以上之物品需登帳財產或非消耗品。
                *   **各類所得扣繳**：薪資、執行業務所得等是否已扣取稅款及二代健保。

**回答準則:**
1.  **查證與引用**：請優先參考上述知識庫，並**必須使用 Google 搜尋**驗證法規條號。
2.  **精準計算**：針對「年中退休/離職」案例，務必套用「當月有在職即算全月」之規則。
3.  **採購金額判斷**：嚴格依據 **15萬元** 作為小額採購（<=15萬）與逾公告金額十分之一（>15萬）的分界。
4.  **局所專屬提醒**：若同仁詢問 **超過15萬元** 的採購案，必須主動列出上述第6點的兩份專屬文件及其「內容大項」。
5.  **嚴格輸出格式控制**：
    - **絕對禁止**使用 \`<details>\` 或 \`<summary>\` 等 HTML 標籤。
    - **絕對禁止**輸出「查證筆記」、「思考過程」、「Unit Manager ... Notes」或任何類似的後設資料區塊。
    - **禁止**重複回答。請直接給出最終的專業回覆。
    - 搜尋結果請自然整合於內文中，勿將「來源」或「查證過程」顯式列出於文末。
6.  **風險提示**：若使用者的做法可能違規，請嚴肅提醒。
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
        // 若是群組對話，我們這裡使用 userId 來做個人化記憶 (也可以改成 groupId)
        const sessionKey = userId || 'unknown';
        const history = userSessions.get(sessionKey) || [];

        // 2. 建立 Chat Session，傳入歷史紀錄
        const chat = ai.chats.create({
          model: 'gemini-2.5-flash',
          history: history,
          config: {
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

        // 3. 發送訊息 (Chat 模式)
        const result = await chat.sendMessage({ message: userMessage });
        let replyText = result.response.text; // Chat 模式直接取得回應文字
        
        if (!replyText) {
             console.warn("Gemini response text is empty.");
             replyText = "報告同仁，阿標剛才分神了（回應內容為空），請您再複述一次問題。";
        }

        // 4. 更新歷史紀錄
        // 我們手動維護歷史紀錄，避免 chat 物件重置後資料遺失
        // 限制保留最近 10 輪對話 (20 則訊息)，避免 Token 爆量
        const newExchange = [
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: replyText }] }
        ];
        
        const updatedHistory = [...history, ...newExchange];
        if (updatedHistory.length > 20) {
            updatedHistory.splice(0, updatedHistory.length - 20); // 刪除舊的
        }
        userSessions.set(sessionKey, updatedHistory);

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