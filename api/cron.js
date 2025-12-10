import { Client } from "@line/bot-sdk";

// Vercel Cron Job Handler
export default async function handler(req, res) {
  // 1. 安全驗證
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // 2. 檢查必要設定
  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  const targetGroupId = process.env.LINE_GROUP_ID;

  if (!channelAccessToken || !channelSecret || !targetGroupId) {
    console.error('Missing LINE Config or Target Group ID');
    return res.status(500).json({ success: false, message: 'Server Config Error' });
  }

  try {
    const client = new Client({
      channelAccessToken,
      channelSecret,
    });

    // 3. 科務會議輪值邏輯
    
    // 正式名單 (依據 OCR 內容)
    const staffList = [
      '林唯農', // Index 0
      '宋憲昌', // Index 1
      '江開承', // Index 2
      '吳怡慧', // Index 3
      '胡蔚杰', // Index 4
      '陳頤恩', // Index 5
      '陳怡妗', // Index 6 (114/12/08 基準)
      '陳薏雯', // Index 7
      '游智諺', // Index 8
      '陳美杏'  // Index 9
    ];

    // 設定錨點日期：114年12月8日 (2025-12-08)
    // 當週輪值為：陳怡妗 (Index 6)
    const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
    const anchorIndex = 6;

    // 取得當前時間 (調整為台灣時間)
    const now = new Date();
    const taiwanNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    
    // 計算與錨點日期的時間差 (毫秒)
    const diffTime = taiwanNow.getTime() - anchorDate.getTime();
    
    // 計算相差週數 (無條件捨去)
    // 1 週 = 7 * 24 * 60 * 60 * 1000 毫秒
    const oneWeekMs = 604800000;
    const diffWeeks = Math.floor(diffTime / oneWeekMs);

    // 計算當週索引
    // 注意：diffWeeks 可能是負數 (如果現在時間早於 2025/12/8)，需處理負數取餘數
    let targetIndex = (anchorIndex + diffWeeks) % staffList.length;
    
    // JavaScript 的 % 運算子對負數會回傳負數，需轉正
    if (targetIndex < 0) {
      targetIndex = targetIndex + staffList.length;
    }

    const dutyPerson = staffList[targetIndex];

    // 4. 擬定公告內容
    const messageText = `📢 【行政科週知】
報告同仁早安 ☀️，本週科務會議輪值紀錄為 **${dutyPerson}**。

煩請各位於 **週二下班前** 完成工作日誌 📝，俾利輪值同仁於 **週三** 彙整陳核用印 🈳。

辛苦了，祝本週工作順心！💪✨`;

    // 5. 發送推播訊息
    await client.pushMessage(targetGroupId, {
      type: 'text',
      text: messageText,
    });

    console.log(`Weekly reminder sent to ${targetGroupId}. WeekDiff: ${diffWeeks}, Index: ${targetIndex}, Duty: ${dutyPerson}`);
    return res.status(200).json({ success: true, message: 'Reminder Sent', duty: dutyPerson });

  } catch (error) {
    console.error('Cron Job Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}