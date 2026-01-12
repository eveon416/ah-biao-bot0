
import { Client } from "@line/bot-sdk";

// === 全域設定：需跳過輪值的週次 (以該週「週一」日期為準) ===
const SKIP_WEEKS = ['2025-01-27', '2026-02-16']; 

// 行政科預設群組 ID (作為環境變數未設定時的備案)
const DEFAULT_GROUP_ID = 'Cb35ecb9f86b1968dd51e476fdc819655';

// 輔助函式：取得台北時間的 YYYY-MM-DD
function getTaipeiDateString(date) {
    const offsetDate = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    return offsetDate.toISOString().split('T')[0];
}

// 檢查是否為暫停週
function isSkipWeek(dateObj) {
    const dayOfWeek = dateObj.getDay(); // 0(Sun) - 6(Sat)
    const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(dateObj);
    monday.setDate(dateObj.getDate() + diffToMon);
    
    // 確保以台北時區判定
    const mondayStr = getTaipeiDateString(monday);
    return SKIP_WEEKS.includes(mondayStr);
}

// 計算有效週數差 (扣除暫停週)
function getEffectiveWeeksDiff(targetDate, anchorDate) {
    const oneWeekMs = 604800000;
    const rawDiffTime = targetDate.getTime() - anchorDate.getTime();
    const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);

    let skipCount = 0;
    const start = rawDiffTime > 0 ? anchorDate : targetDate;
    const end = rawDiffTime > 0 ? targetDate : anchorDate;

    SKIP_WEEKS.forEach(skipDateStr => {
        const skipDate = new Date(skipDateStr + 'T00:00:00+08:00');
        if (skipDate >= start && skipDate < end) {
            skipCount++;
        }
    });

    return rawDiffTime > 0 ? (rawWeeks - skipCount) : (rawWeeks + skipCount);
}

// 建立輪值 Flex Message
function createRosterFlex(dutyPerson, dateStr) {
  const dateObj = new Date(dateStr);
  // 使用台北時區取得月日
  const tpDate = new Date(dateObj.getTime() + (8 * 60 * 60 * 1000));
  const month = tpDate.getUTCMonth() + 1;
  const day = tpDate.getUTCDate();
  const dateLabel = isNaN(month) ? "本週" : `${month}/${day} 當週`;

  return {
    type: 'flex',
    altText: `📢 行政科週知：${dateLabel}輪值 ${dutyPerson}`,
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
          { type: "text", text: `${dateLabel}科務會議輪值人員：`, color: "#334155", size: "md", weight: "bold" },
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
              { type: "text", text: "彙整陳核用印 📑", color: "#64748b", size: "sm", margin: "none" }
            ]
          },
          { type: "text", text: "辛苦了，祝本週工作順心！💪✨", margin: "xl", size: "xs", color: "#94a3b8", align: "center" }
        ]
      }
    }
  };
}

// 建立暫停公告 Flex Message
function createSuspendFlex(reason) {
    const displayReason = reason || "國定假日或特殊事由";
    return {
      type: 'flex',
      altText: `⛔ 會議暫停公告：${displayReason}`,
      contents: {
        type: "bubble",
        size: "giga",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#b91c1c",
          paddingAll: "lg",
          contents: [
            { type: "text", text: "⛔ 會議暫停公告", color: "#ffffff", weight: "bold", size: "lg" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            { type: "text", text: "報告同仁早安 ☀️", color: "#64748b", size: "sm" },
            { type: "text", text: "因適逢下列事由，本週暫停：", color: "#334155", size: "md", weight: "bold" },
            { type: "separator", color: "#cbd5e1" },
            { type: "text", text: displayReason, size: "xl", weight: "bold", color: "#b91c1c", align: "center", margin: "lg", wrap: true },
            { type: "separator", color: "#cbd5e1", margin: "lg" },
            {
              type: "box",
              layout: "vertical",
              margin: "lg",
              spacing: "sm",
              contents: [
                { type: "text", text: "⚠️ 注意事項", color: "#334155", weight: "bold", size: "sm" },
                { type: "text", text: "本週輪值順序遞延 (順延一週)", color: "#64748b", size: "sm", margin: "none" },
                { type: "text", text: "請各位同仁留意行程安排", color: "#64748b", size: "sm", margin: "none" }
              ]
            },
            { type: "text", text: "祝各位假期愉快，平安順心！✨", margin: "xl", size: "xs", color: "#94a3b8", align: "center" }
          ]
        }
      }
    };
}

export default async function handler(req, res) {
  const nowUtc = new Date();
  console.log(`[Cron] Triggered at ${nowUtc.toISOString()}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const isManualRun = req.query.manual === 'true';
  const authHeader = req.headers['authorization'];
  
  // 驗證排程金鑰 (僅在非手動觸發且有設定 SECRET 時檢查)
  if (!isManualRun && process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       console.error("[Cron] Unauthorized access attempt.");
       return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  }

  const channelAccessToken = (process.env.CHANNEL_ACCESS_TOKEN || "").trim();
  const channelSecret = (process.env.CHANNEL_SECRET || "").trim();
  
  // 決定發送目標
  let targetGroupIds = [];
  if (req.query.groupId) {
      targetGroupIds = req.query.groupId.split(',').map(id => id.trim()).filter(id => id);
  } else {
      // 自動排程模式：優先嘗試所有可能的環境變數
      const envIds = [
          process.env.LINE_GROUP_ID_AdminHome,
          process.env.LINE_GROUP_ID,
          DEFAULT_GROUP_ID
      ];
      targetGroupIds = envIds.filter(id => id && id.trim()).map(id => id.trim());
      // 去重
      targetGroupIds = [...new Set(targetGroupIds)];
  }

  console.log(`[Cron] Target Groups: ${targetGroupIds.join(', ')}`);

  if (!channelAccessToken || !channelSecret) {
    return res.status(500).json({ success: false, message: 'Missing LINE Configuration' });
  }

  try {
    const client = new Client({ channelAccessToken, channelSecret });
    let messagePayload;
    
    const actionType = req.query.type || 'weekly'; 
    const customReason = req.query.reason || ''; 
    const customContent = req.query.content || ''; 
    const targetDateStr = req.query.date; 
    const overridePerson = req.query.person; 
    
    let staffList = [
        '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
        '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
    ];

    // 建立基準時間 (UTC 轉台北)
    let baseDate = new Date();
    if (targetDateStr) baseDate = new Date(targetDateStr);
    const taiwanNow = new Date(baseDate.getTime()); // 基於傳入或當前時間

    let contentDesc = "";
    if (actionType === 'general') {
        messagePayload = { type: 'text', text: customContent };
        contentDesc = "一般公告";
    } else if (actionType === 'suspend') {
        messagePayload = createSuspendFlex(customReason);
        contentDesc = "暫停公告";
    } else {
        if (overridePerson) {
             messagePayload = createRosterFlex(overridePerson, taiwanNow.toISOString());
             contentDesc = `輪值公告(指定:${overridePerson})`;
        } else if (isSkipWeek(taiwanNow)) {
            messagePayload = createSuspendFlex("適逢國定假日或特殊事由");
            contentDesc = "暫停公告(系統自動)";
        } else {
            const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
            const anchorIndex = 6; // 陳怡妗
    
            const diffWeeks = getEffectiveWeeksDiff(taiwanNow, anchorDate);
            let targetIndex = (anchorIndex + diffWeeks) % staffList.length;
            if (targetIndex < 0) targetIndex += staffList.length;
    
            const dutyPerson = staffList[targetIndex];
            messagePayload = createRosterFlex(dutyPerson, taiwanNow.toISOString());
            contentDesc = `輪值公告(推算:${dutyPerson})`;
        }
    }

    const results = [];
    for (const groupId of targetGroupIds) {
        try {
            await client.pushMessage(groupId, messagePayload);
            results.push(groupId);
            console.log(`[Cron] Successfully pushed to ${groupId}`);
        } catch (e) {
            console.error(`[Cron] Push to ${groupId} failed:`, e.message);
        }
    }

    return res.status(200).json({ 
        success: results.length > 0, 
        message: `${contentDesc} 已執行。成功發送至 ${results.length} 個群組。`,
        sentTo: results,
        timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Cron] Fatal Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
