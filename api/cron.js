import { Client } from "@line/bot-sdk";

// === 全域設定：需跳過輪值的週次 (以該週「週一」日期為準) ===
// 2025-01-27 為 2025 農曆春節
// 2026-02-16 為 2026 農曆春節 (2/16-2/22)
const SKIP_WEEKS = ['2025-01-27', '2026-02-16']; 

// 檢查是否為暫停週
function isSkipWeek(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    const dayOfWeek = dateObj.getDay(); // 0(Sun) - 6(Sat)
    const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(dateObj);
    monday.setDate(dateObj.getDate() + diffToMon);
    
    const mYear = monday.getFullYear();
    const mMonth = String(monday.getMonth() + 1).padStart(2, '0');
    const mDay = String(monday.getDate()).padStart(2, '0');
    const mondayStr = `${mYear}-${mMonth}-${mDay}`;
    
    return SKIP_WEEKS.includes(mondayStr);
}

// 計算有效週數差 (扣除暫停週)
function getEffectiveWeeksDiff(targetDate, anchorDate) {
    const oneWeekMs = 604800000;
    const rawDiffTime = targetDate.getTime() - anchorDate.getTime();
    const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);

    // 計算區間內有多少個 SKIP_WEEKS
    let skipCount = 0;
    const start = rawDiffTime > 0 ? anchorDate : targetDate;
    const end = rawDiffTime > 0 ? targetDate : anchorDate;

    SKIP_WEEKS.forEach(skipDateStr => {
        const skipDate = new Date(skipDateStr + 'T00:00:00+08:00');
        if (skipDate >= start && skipDate < end) {
            skipCount++;
        }
    });

    if (rawDiffTime > 0) {
        return rawWeeks - skipCount;
    } else {
        return rawWeeks + skipCount;
    }
}

// 輔助函式：建立輪值 Flex Message (正常版)
function createRosterFlex(dutyPerson, dateStr) {
  // 簡單處理日期顯示，讓公告看起來更具體
  const dateObj = new Date(dateStr);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
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

// 輔助函式：建立暫停公告 Flex Message (暫停版)
function createSuspendFlex(reason) {
  const displayReason = reason || "國定假日或特殊事由";
  return {
    type: 'flex',
    altText: `⛔ 行政科週知：本週科務會議暫停辦理`,
    contents: {
      type: "bubble",
      size: "giga",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#b91c1c", // Red-700
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "⛔ 會議暫停公告",
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
            text: `因適逢${displayReason}`,
            color: "#334155",
            size: "md",
            weight: "bold",
            align: "center",
            margin: "lg",
            wrap: true
          },
          {
            type: "text",
            text: "本週科務會議",
            size: "xl", 
            weight: "bold",
            color: "#1e293b",
            align: "center"
          },
          {
            type: "text",
            text: "【暫停辦理乙次】",
            size: "xxl", 
            weight: "bold",
            color: "#ef4444", // Red-500
            align: "center",
            margin: "sm"
          },
           {
            type: "text",
            text: "( 本週暫停輪值，順序遞延 )",
            size: "sm", 
            color: "#94a3b8",
            align: "center",
            margin: "md"
          },
          {
            type: "separator",
            color: "#cbd5e1",
            margin: "xl"
          },
          {
            type: "text",
            text: "祝各位假期愉快，平安順心！✨",
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
  const isManualRun = req.query.manual === 'true';
  const actionType = req.query.type || 'weekly'; 
  const customReason = req.query.reason || ''; // 接收自訂理由
  const targetDateStr = req.query.date; // 接收指定日期 (YYYY-MM-DD)

  const authHeader = req.headers['authorization'];
  
  if (!isManualRun && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  const targetGroupId = process.env.LINE_GROUP_ID;

  if (!channelAccessToken || !channelSecret) {
    return res.status(500).json({ success: false, message: 'Missing Channel Token/Secret' });
  }

  if (!targetGroupId) {
    return res.status(500).json({ success: false, message: 'Missing LINE_GROUP_ID' });
  }

  try {
    const client = new Client({ channelAccessToken, channelSecret });
    let flexMsg;
    let logMessage = "";
    
    // 計算目標日期
    let baseDate = new Date();
    if (targetDateStr) {
        baseDate = new Date(targetDateStr);
    }
    
    // 轉換為台灣時間進行計算 (若 Server 為 UTC，+8hr)
    // 若 baseDate 來自 YYYY-MM-DD，則是 UTC 00:00，+8hr 變成當日早上 08:00，日期正確
    const taiwanNow = new Date(baseDate.getTime() + (8 * 60 * 60 * 1000));

    let effectiveType = actionType;
    
    // 自動排程時檢查 Skip Week，手動觸發則依指令為主(除非強制檢查)
    // 這裡邏輯：若手動指定 'suspend' 則直接暫停；若 'weekly' 則檢查日期
    if (effectiveType === 'weekly' && isSkipWeek(taiwanNow)) {
        console.log(`Target Date ${taiwanNow.toISOString()} is a SKIP WEEK. Switching to suspend notice.`);
        effectiveType = 'suspend';
    }

    if (effectiveType === 'suspend') {
        console.log('Running Suspension Announcement...');
        // 優先使用傳入的 customReason，若無則自動判斷
        const reasonText = customReason || (isSkipWeek(taiwanNow) ? "春節連假或排定休假" : "特殊事由");
        flexMsg = createSuspendFlex(reasonText);
        logMessage = `Suspension Notice Sent (Reason: ${reasonText})`;
    } else {
        console.log('Running Weekly Roster Announcement...');
        
        const staffList = [
          '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
          '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
        ];
        const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
        const anchorIndex = 6;

        const diffWeeks = getEffectiveWeeksDiff(taiwanNow, anchorDate);

        let targetIndex = (anchorIndex + diffWeeks) % staffList.length;
        if (targetIndex < 0) targetIndex = targetIndex + staffList.length;

        const dutyPerson = staffList[targetIndex];
        flexMsg = createRosterFlex(dutyPerson, taiwanNow.toISOString());
        logMessage = `Weekly Roster Sent. Duty: ${dutyPerson}`;
    }

    await client.pushMessage(targetGroupId, flexMsg);
    
    return res.status(200).json({ 
        success: true, 
        message: logMessage, 
        type: effectiveType,
        targetDate: taiwanNow.toISOString()
    });

  } catch (error) {
    console.error('Cron Job Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}