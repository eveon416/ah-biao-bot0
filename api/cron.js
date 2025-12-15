import { Client } from "@line/bot-sdk";

// 輔助函式：建立輪值 Flex Message
function createRosterFlex(dutyPerson) {
  return {
    type: 'flex',
    altText: `📢 行政科週知：本週輪值 ${dutyPerson}`,
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1e293b", // Slate-800
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "📢 行政科週知",
            color: "#ffffff",
            weight: "bold",
            size: "lg"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "報告同仁早安 ☀️",
            color: "#64748b",
            size: "sm"
          },
          {
            type: "text",
            text: "本週科務會議輪值紀錄為：",
            color: "#334155",
            size: "md",
            weight: "bold"
          },
          {
            type: "separator",
            color: "#cbd5e1"
          },
          {
            type: "text",
            text: dutyPerson,
            size: "3xl", 
            weight: "bold",
            color: "#ef4444", // Red-500
            align: "center",
            margin: "lg"
          },
          {
            type: "separator",
            color: "#cbd5e1",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                 type: "text",
                 text: "煩請各位於 週二下班前",
                 color: "#334155",
                 weight: "bold",
                 size: "sm"
              },
              {
                 type: "text",
                 text: "完成工作日誌 📝",
                 color: "#64748b",
                 size: "sm",
                 margin: "none"
              },
              {
                 type: "text",
                 text: "俾利輪值同仁於 週三",
                 color: "#334155",
                 weight: "bold",
                 size: "sm",
                 margin: "md"
              },
              {
                 type: "text",
                 text: "彙整陳核用印 🈳",
                 color: "#64748b",
                 size: "sm",
                 margin: "none"
              }
            ]
          },
          {
            type: "text",
            text: "辛苦了，祝本週工作順心！💪✨",
            margin: "xl",
            size: "xs",
            color: "#94a3b8",
            align: "center"
          }
        ]
      }
    }
  };
}

// Vercel Cron Job Handler
export default async function handler(req, res) {
  // 1. 安全驗證
  // 如果是 Cron 自動執行，需檢查 Authorization Header
  // 如果是手動觸發 (query 帶有 manual=true)，則允許通過 (方便前端測試)
  const isManualRun = req.query.manual === 'true';
  const authHeader = req.headers['authorization'];
  
  if (!isManualRun && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // 2. 檢查必要設定
  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  const targetGroupId = process.env.LINE_GROUP_ID;

  if (!channelAccessToken || !channelSecret) {
    console.error('Missing LINE Config');
    return res.status(500).json({ success: false, message: 'Server Config Error: Missing Channel Token/Secret' });
  }

  if (!targetGroupId) {
    console.error('Missing LINE_GROUP_ID');
    return res.status(500).json({ success: false, message: 'Server Config Error: Missing LINE_GROUP_ID' });
  }

  try {
    const client = new Client({
      channelAccessToken,
      channelSecret,
    });

    // 3. 執行每週科務會議輪值推播
    console.log('Running Weekly Roster Announcement...');
    
    const staffList = [
      '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
      '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
    ];

    // 設定錨點日期：114年12月8日 (2025-12-08) -> 當週輪值為：陳怡妗 (Index 6)
    const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
    const anchorIndex = 6;

    // 取得當前時間 (調整為台灣時間)
    const now = new Date();
    const taiwanNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    
    // 計算與錨點日期的時間差
    const oneWeekMs = 604800000;
    const diffTime = taiwanNow.getTime() - anchorDate.getTime();
    const diffWeeks = Math.floor(diffTime / oneWeekMs);

    // 計算當週索引
    let targetIndex = (anchorIndex + diffWeeks) % staffList.length;
    if (targetIndex < 0) targetIndex = targetIndex + staffList.length;

    const dutyPerson = staffList[targetIndex];
    const flexMsg = createRosterFlex(dutyPerson);

    await client.pushMessage(targetGroupId, flexMsg);
    
    console.log(`Weekly Flex Message sent to ${targetGroupId}. Duty: ${dutyPerson}`);
    return res.status(200).json({ 
        success: true, 
        message: 'Weekly Roster Sent Successfully', 
        duty: dutyPerson,
        timestamp: taiwanNow.toISOString()
    });

  } catch (error) {
    console.error('Cron Job Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}