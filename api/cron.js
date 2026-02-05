
import { Client } from "@line/bot-sdk";

// 行政科預設群組 ID
const DEFAULT_GROUP_ID = 'Cb35ecb9f86b1968dd51e476fdc819655';

// 建立輪值 Flex Message
function createRosterFlex(dutyPerson, dateStr) {
  const dateObj = new Date(dateStr);
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
  console.log(`[API/Cron] Manual Trigger at ${nowUtc.toISOString()}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 安全檢查：若非手動且有 SECRET，則驗證
  if (req.query.manual !== 'true' && process.env.CRON_SECRET) {
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
       return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  }

  const channelAccessToken = (process.env.CHANNEL_ACCESS_TOKEN || "").trim();
  const channelSecret = (process.env.CHANNEL_SECRET || "").trim();
  
  // 決定目標
  let targetGroupIds = req.query.groupId 
    ? req.query.groupId.split(',').map(id => id.trim()).filter(id => id)
    : [process.env.LINE_GROUP_ID, process.env.LINE_GROUP_ID_AdminHome, DEFAULT_GROUP_ID].filter(id => id && id.trim());

  targetGroupIds = [...new Set(targetGroupIds)];

  if (targetGroupIds.length === 0 || !channelAccessToken || !channelSecret) {
    return res.status(500).json({ success: false, message: 'Missing Configuration' });
  }

  try {
    const client = new Client({ channelAccessToken, channelSecret });
    let messagePayload;
    
    const actionType = req.query.type || 'general'; // 預設改為一般公告
    const customReason = req.query.reason || ''; 
    const customContent = req.query.content || ''; 
    const targetDateStr = req.query.date || new Date().toISOString(); 
    const overridePerson = req.query.person; 

    let contentDesc = "";
    if (actionType === 'general') {
        messagePayload = { type: 'text', text: customContent || "（無內容公告）" };
        contentDesc = "一般公告";
    } else if (actionType === 'suspend') {
        messagePayload = createSuspendFlex(customReason);
        contentDesc = "暫停公告";
    } else if (actionType === 'weekly') {
        // 僅在明確傳入人員時才發送輪值卡
        if (overridePerson) {
            messagePayload = createRosterFlex(overridePerson, targetDateStr);
            contentDesc = `輪值公告(${overridePerson})`;
        } else {
            return res.status(400).json({ success: false, message: 'Weekly type requires person name' });
        }
    }

    const results = [];
    for (const groupId of targetGroupIds) {
        try {
            await client.pushMessage(groupId, messagePayload);
            results.push(groupId);
        } catch (e) {
            console.error(`Push to ${groupId} failed:`, e.message);
        }
    }

    return res.status(200).json({ 
        success: results.length > 0, 
        message: `${contentDesc} 已執行發送。`,
        sentTo: results
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
