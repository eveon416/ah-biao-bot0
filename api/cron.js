

import { Client } from "@line/bot-sdk";

// === 全域設定：需跳過輪值的週次 (以該週「週一」日期為準) ===
// 2025-01-27 (2025春節)
// 2026-02-16 (2026春節: 2/16-2/22)
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

// 建立輪值 Flex Message (正常版)
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
          { type: "text", text: "本週科務會議輪值人員：", color: "#334155", size: "md", weight: "bold" },
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

// 建立暫停公告 Flex Message (新版卡片)
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
          backgroundColor: "#b91c1c", // Red-700
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

// Vercel Cron Job Handler
export default async function handler(req, res) {
  // [System] Force Rebuild Tag: v2025-Advanced-Features
  console.log(`[API] Cron Handler invoked at ${new Date().toISOString()}`);

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
  
  // === Target Group Logic (支援多重發送) ===
  let targetGroupIds = [];
  
  if (req.query.groupId) {
      targetGroupIds = req.query.groupId.split(',').map(id => id.trim()).filter(id => id);
  }
  
  if (targetGroupIds.length === 0 && !isManualRun) {
      const defaultId = process.env.LINE_GROUP_ID_AdminHome || process.env.LINE_GROUP_ID;
      if (defaultId) targetGroupIds.push(defaultId);
  }

  if (!channelAccessToken || !channelSecret) {
    return res.status(500).json({ success: false, message: '錯誤：未設定 CHANNEL_ACCESS_TOKEN 或 CHANNEL_SECRET' });
  }

  if (targetGroupIds.length === 0) {
    return res.status(400).json({ success: false, message: '錯誤：未指定任何目標群組 ID (groupId)' });
  }

  try {
    const client = new Client({ channelAccessToken, channelSecret });
    let messagePayload;
    
    // 3. 參數解析
    const actionType = req.query.type || 'weekly'; 
    const customReason = req.query.reason || ''; 
    const customContent = req.query.content || ''; 
    const targetDateStr = req.query.date; 
    const overridePerson = req.query.person; 
    const shiftOffset = parseInt(req.query.shift || '0', 10);
    
    // 支援前端傳入自定義人員名單
    let staffList = [
        '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
        '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
    ];
    if (req.query.staffList) {
        const parsedList = req.query.staffList.split(',').map(s => s.trim()).filter(s => s);
        if (parsedList.length > 0) staffList = parsedList;
    }

    // 計算目標日期
    let baseDate = new Date();
    if (targetDateStr) {
        baseDate = new Date(targetDateStr);
    }
    const taiwanNow = new Date(baseDate.getTime() + (8 * 60 * 60 * 1000));

    // 4. 訊息生成邏輯
    let contentDesc = "";
    if (actionType === 'general') {
        // === 一般公告 (純文字) ===
        if (!customContent) {
            return res.status(400).json({ success: false, message: '一般公告內容不能為空' });
        }
        messagePayload = {
            type: 'text',
            text: customContent
        };
        contentDesc = `一般公告`;

    } else if (actionType === 'suspend') {
        // === 暫停公告 (Flex Message) ===
        const reasonText = customReason || "特殊事由";
        messagePayload = createSuspendFlex(reasonText);
        contentDesc = `暫停公告 (事由: ${reasonText})`;

    } else {
        // === 輪值公告 (Flex Message) ===
        
        // A. 優先檢查是否指定了人員 (Override)
        if (overridePerson) {
             messagePayload = createRosterFlex(overridePerson, taiwanNow.toISOString());
             contentDesc = `輪值公告 (手動指定: ${overridePerson})`;
        } 
        // B. 其次檢查是否為系統內建暫停週
        else if (isSkipWeek(taiwanNow)) {
            const reasonText = customReason || "春節連假或排定休假";
             messagePayload = createSuspendFlex(reasonText);
            contentDesc = `暫停公告 (自動轉暫停, 事由: ${reasonText})`;
        } 
        // C. 最後進行自動計算 (含 Shift 偏移)
        else {
            const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
            const anchorIndex = 6; // 陳怡妗 (在原始名單中的位置，若名單變更可能需要更複雜的錨點邏輯，此處假設基準點的人員始終對應此Index)
    
            const diffWeeks = getEffectiveWeeksDiff(taiwanNow, anchorDate);
            
            // shift = -1 代表「往回推一週/順延」
            // shift = +1 代表「跳過一週」
            let totalWeeks = diffWeeks + shiftOffset;

            let targetIndex = (anchorIndex + totalWeeks) % staffList.length;
            if (targetIndex < 0) targetIndex = targetIndex + staffList.length;
    
            const dutyPerson = staffList[targetIndex];
            messagePayload = createRosterFlex(dutyPerson, taiwanNow.toISOString());
            contentDesc = `輪值公告 (本週: ${dutyPerson}, 偏移: ${shiftOffset})`;
        }
    }

    // 5. 執行發送 (迴圈)
    const results = [];
    const errors = [];

    for (const groupId of targetGroupIds) {
        if (groupId === 'default') continue; 

        try {
            await client.pushMessage(groupId, messagePayload);
            results.push(groupId);
        } catch (lineError) {
            console.error(`Failed to send to ${groupId}:`, lineError);
            let errMsg = `[${groupId.substring(0, 6)}...] 發送失敗`;
             if (lineError.originalError && lineError.originalError.response && lineError.originalError.response.data) {
                 const detail = lineError.originalError.response.data.message || '';
                 if (detail.includes('not a member')) errMsg = `[${groupId.substring(0, 6)}...] 機器人未入群`;
                 else if (detail.includes('invalid')) errMsg = `[${groupId.substring(0, 6)}...] ID無效`;
                 else errMsg = `[${groupId.substring(0, 6)}...] ${detail}`;
             }
            errors.push(errMsg);
        }
    }

    if (results.length > 0) {
        return res.status(200).json({ 
            success: true, 
            message: `${contentDesc} 已發送至 ${results.length} 個群組`,
            sentTo: results,
            errors: errors.length > 0 ? errors : undefined,
            type: actionType,
            targetDate: taiwanNow.toISOString()
        });
    } else {
        return res.status(500).json({ 
            success: false, 
            message: errors.length > 0 ? `發送失敗: ${errors.join(', ')}` : '未執行任何發送'
        });
    }

  } catch (error) {
    console.error('Cron Job Error:', error);
    return res.status(500).json({ success: false, message: `伺服器錯誤: ${error.message}` });
  }
}
