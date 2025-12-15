import { Client } from "@line/bot-sdk";

// === 全域設定：需跳過輪值的週次 (以該週「週一」日期為準) ===
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

// 建立輪值 Flex Message (維持卡片格式)
function createRosterFlex(dutyPerson, dateStr) {
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
          { type: "text", text: "📢 行政科週知", color: "#ffffff", weight: "bold", size: "lg" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "報告同仁早安 ☀️", color: "#64748b", size: "sm" },
          { type: "text", text: "本週科務會議輪值紀錄為：", color: "#334155", size: "md", weight: "bold" },
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
              { type: "text", text: "彙整陳核用印 🈳", color: "#64748b", size: "sm", margin: "none" }
            ]
          },
          { type: "text", text: "辛苦了，祝本週工作順心！💪✨", margin: "xl", size: "xs", color: "#94a3b8", align: "center" }
        ]
      }
    }
  };
}

// 建立暫停公告文字 (改為純文字)
function createSuspendText(reason) {
    const displayReason = reason || "國定假日或特殊事由";
    return `⛔ 【會議暫停公告】

報告同仁早安 ☀️
因適逢「${displayReason}」，本週科務會議【暫停辦理乙次】。

( 本週暫停輪值，順序遞延 )

祝各位假期愉快，平安順心！✨`;
}

// Vercel Cron Job Handler
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. 基本安全檢查
  const isManualRun = req.query.manual === 'true';
  const authHeader = req.headers['authorization'];
  
  if (!isManualRun && process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized (Invalid Cron Secret)' });
  }

  // 2. 檢查 LINE 設定
  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  
  // === CRITICAL CHANGE: Default to AdminHome Group ID if not specified ===
  // 優先順序：Query參數 > AdminHome Env > Test Env > 一般 Env
  const targetGroupId = req.query.groupId || 
                        process.env.LINE_GROUP_ID_AdminHome || 
                        process.env.LINE_GROUP_ID_Test || 
                        process.env.LINE_GROUP_ID;

  if (!channelAccessToken || !channelSecret) {
    return res.status(500).json({ success: false, message: '錯誤：未設定 CHANNEL_ACCESS_TOKEN 或 CHANNEL_SECRET' });
  }

  if (!targetGroupId) {
    return res.status(500).json({ success: false, message: '錯誤：未指定目標群組 ID (請確認 Env: LINE_GROUP_ID_AdminHome)' });
  }

  try {
    const client = new Client({ channelAccessToken, channelSecret });
    let messagePayload;
    let logMessage = "";
    
    // 3. 參數解析
    const actionType = req.query.type || 'weekly'; 
    const customReason = req.query.reason || ''; 
    const customContent = req.query.content || ''; // 新增：自訂文字內容
    const targetDateStr = req.query.date; 

    // 計算目標日期
    let baseDate = new Date();
    if (targetDateStr) {
        baseDate = new Date(targetDateStr);
    }
    const taiwanNow = new Date(baseDate.getTime() + (8 * 60 * 60 * 1000));

    // 4. 訊息生成邏輯
    if (actionType === 'general') {
        // === 一般公告 (純文字) ===
        if (!customContent) {
            return res.status(400).json({ success: false, message: '一般公告內容不能為空' });
        }
        messagePayload = {
            type: 'text',
            text: customContent
        };
        logMessage = `一般公告已發送`;

    } else if (actionType === 'suspend') {
        // === 暫停公告 (純文字) ===
        const reasonText = customReason || "特殊事由";
        messagePayload = {
            type: 'text',
            text: createSuspendText(reasonText)
        };
        logMessage = `暫停公告已發送 (事由: ${reasonText})`;

    } else {
        // === 輪值公告 (Flex Message) ===
        // 判斷是否為暫停週 (若為暫停週，自動轉為暫停公告文字)
        if (isSkipWeek(taiwanNow)) {
            console.log(`Target Date ${taiwanNow.toISOString()} is a SKIP WEEK. Switching to suspend notice.`);
            const reasonText = customReason || "春節連假或排定休假";
             messagePayload = {
                type: 'text',
                text: createSuspendText(reasonText)
            };
            logMessage = `暫停公告已發送 (自動轉暫停, 事由: ${reasonText})`;
        } else {
            // 正常輪值
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
            messagePayload = createRosterFlex(dutyPerson, taiwanNow.toISOString());
            logMessage = `輪值公告已發送 (本週輪值: ${dutyPerson})`;
        }
    }

    // 5. 執行發送
    try {
        await client.pushMessage(targetGroupId, messagePayload);
    } catch (lineError) {
        console.error('LINE API Error:', lineError);
        
        let errorMsg = `發送失敗：未知錯誤 (${lineError.statusCode})`;
        if (lineError.originalError && lineError.originalError.response && lineError.originalError.response.data) {
             const detail = lineError.originalError.response.data.message || '';
             if (detail.includes('not a member') || detail.includes('count')) {
                 errorMsg = '發送失敗：機器人未加入該群組，請先邀請機器人。';
             } else if (detail.includes('invalid') || detail.includes('to')) {
                 errorMsg = `發送失敗：無效的 Group ID (${targetGroupId})`;
             }
        }
        return res.status(500).json({ success: false, message: errorMsg });
    }
    
    return res.status(200).json({ 
        success: true, 
        message: logMessage,
        targetGroup: targetGroupId, 
        type: actionType,
        targetDate: taiwanNow.toISOString()
    });

  } catch (error) {
    console.error('Cron Job Error:', error);
    return res.status(500).json({ success: false, message: `伺服器錯誤: ${error.message}` });
  }
}