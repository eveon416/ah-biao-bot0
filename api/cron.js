
import { Client } from "@line/bot-sdk";

// === 全域設定：需跳過輪值的週次 (以該週「週一」日期為準) ===
const SKIP_WEEKS = ['2025-01-27', '2026-02-16']; 

// 取得台灣時間 (UTC+8) 的 Date 物件
function getTaiwanDate(base = new Date()) {
    return new Date(base.getTime() + (8 * 60 * 60 * 1000));
}

// 格式化日期 YYYY-MM-DD
function formatDate(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// 檢查是否為暫停週 (以當週週一為準)
function isSkipWeek(targetTpeDate) {
    const day = targetTpeDate.getUTCDay(); // 0-6
    const diffToMon = (day === 0 ? -6 : 1) - day;
    const monday = new Date(targetTpeDate);
    monday.setUTCDate(targetTpeDate.getUTCDate() + diffToMon);
    const monStr = formatDate(monday);
    return SKIP_WEEKS.includes(monStr);
}

// 計算有效週數差 (扣除暫停週)
function getEffectiveWeeksDiff(targetTpeDate, anchorTpeDate) {
    const oneWeekMs = 604800000;
    const rawDiffTime = targetTpeDate.getTime() - anchorTpeDate.getTime();
    const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);

    let skipCount = 0;
    const start = rawDiffTime > 0 ? anchorTpeDate : targetTpeDate;
    const end = rawDiffTime > 0 ? targetTpeDate : anchorTpeDate;

    SKIP_WEEKS.forEach(skipDateStr => {
        const skipDate = new Date(skipDateStr + 'T00:00:00Z'); // 以 UTC 處理確保一致
        if (skipDate >= start && skipDate < end) {
            skipCount++;
        }
    });

    return rawDiffTime > 0 ? (rawWeeks - skipCount) : (rawWeeks + skipCount);
}

// 建立輪值 Flex Message (卡片形式)
function createRosterFlex(dutyPerson, dateStr) {
  const dateObj = new Date(dateStr);
  const month = dateObj.getUTCMonth() + 1;
  const day = dateObj.getUTCDate();
  const dateLabel = `${month}/${day} 當週`;

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
        contents: [{ type: "text", text: "📢 行政科週知", color: "#ffffff", weight: "bold", size: "lg" }]
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
              { type: "text", text: "完成工作日誌 📝", color: "#64748b", size: "sm" },
              { type: "text", text: "俾利輪值同仁於 週三", color: "#334155", weight: "bold", size: "sm", margin: "md" },
              { type: "text", text: "彙整陳核用印 📑", color: "#64748b", size: "sm" }
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
    return {
      type: 'flex',
      altText: `⛔ 會議暫停公告：${reason}`,
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#b91c1c",
          paddingAll: "lg",
          contents: [{ type: "text", text: "⛔ 會議暫停公告", color: "#ffffff", weight: "bold" }]
        },
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "lg",
          contents: [
            { type: "text", text: "本週科務會議因故暫停：", size: "sm", color: "#64748b" },
            { type: "text", text: reason || "國定假日或特殊事由", weight: "bold", color: "#b91c1c", margin: "md", align: "center", size: "lg", wrap: true },
            { type: "text", text: "輪值順序將自動遞延至下週。", size: "xs", color: "#94a3b8", margin: "md", align: "center" }
          ]
        }
      }
    };
}

// 建立一般公告 Message
function createGeneralMessage(content) {
    return {
        type: 'text',
        text: `【行政公告】\n\n${content}\n\n(系統自動發送)`
    };
}

export default async function handler(req, res) {
  const now = new Date();
  const tpeNow = getTaiwanDate(now);
  console.log(`[Cron] API Call Triggered at TPE: ${tpeNow.toISOString()}`);

  const isManual = req.query.manual === 'true';
  const actionType = req.query.type || 'weekly';

  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  const defaultGroupId = process.env.LINE_GROUP_ID_AdminHome || process.env.LINE_GROUP_ID;

  // 環境檢查
  if (!channelAccessToken) {
    return res.status(500).json({ success: false, message: '後端缺失：CHANNEL_ACCESS_TOKEN 未設定' });
  }
  if (!defaultGroupId && !req.query.groupId) {
    return res.status(500).json({ success: false, message: '後端缺失：LINE_GROUP_ID 未設定' });
  }

  try {
    const client = new Client({ channelAccessToken, channelSecret });
    const staffList = (req.query.staffList || '林唯農,宋憲昌,江開承,吳怡慧,胡蔚杰,陳頤恩,陳怡妗,陳薏雯,游智諺,陳美杏').split(',');

    let payload;
    
    if (actionType === 'general') {
        payload = createGeneralMessage(req.query.content || "無公告內容");
    } else if (actionType === 'suspend') {
        payload = createSuspendFlex(req.query.reason);
    } else {
        const overridePerson = req.query.person;
        if (overridePerson) {
            payload = createRosterFlex(overridePerson, tpeNow.toISOString());
        } else if (isSkipWeek(tpeNow)) {
            payload = createSuspendFlex("適逢連假或系統預設暫停週");
        } else {
            const anchorDate = new Date('2024-12-09T00:00:00Z'); 
            const anchorIndex = 4; 
            const diffWeeks = getEffectiveWeeksDiff(tpeNow, anchorDate);
            const shift = parseInt(req.query.shift || '0', 10);
            let targetIndex = (anchorIndex + diffWeeks + shift) % staffList.length;
            if (targetIndex < 0) targetIndex += staffList.length;
            payload = createRosterFlex(staffList[targetIndex], tpeNow.toISOString());
        }
    }

    // 發送對象處理
    const targetGroupIds = (req.query.groupId || defaultGroupId).split(',');
    let results = [];

    for (const gid of targetGroupIds) {
      const cleanGid = gid.trim();
      if (cleanGid) {
        try {
            await client.pushMessage(cleanGid, payload);
            results.push({ id: cleanGid, status: 'success' });
            console.log(`[Cron] Pushed to ${cleanGid} successfully.`);
        } catch (pushError) {
            console.error(`[Cron] Failed to push to ${cleanGid}:`, pushError.message);
            results.push({ id: cleanGid, status: 'failed', error: pushError.message });
        }
      }
    }

    // 只要有一個成功就回傳成功，否則回傳錯誤
    const hasSuccess = results.some(r => r.status === 'success');
    if (hasSuccess) {
        return res.status(200).json({ success: true, tpeDate: formatDate(tpeNow), action: actionType, results });
    } else {
        return res.status(500).json({ success: false, message: '所有目標群組發送皆失敗', details: results });
    }

  } catch (error) {
    console.error('[Cron Critical Error]', error);
    return res.status(500).json({ success: false, message: `伺服器內部錯誤: ${error.message}` });
  }
}
