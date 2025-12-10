import { Client } from "@line/bot-sdk";

// 使用者定義的公告設定 (可在此修改每月公告內容)
const ANNOUNCEMENT_CONFIG = {
  title: "系統定期維護通知",
  version: "System Update v1.2",
  items: [
    "更新本月最新政府採購法規釋例。",
    "優化「科務會議輪值」自動推算邏輯。",
    "修正部分行動裝置顯示相容性問題。"
  ],
  footer: "系統運作正常，請同仁安心使用。"
};

// 輔助函式：建立維護公告 Flex Message
function createMaintenanceFlex() {
  return {
    type: 'flex',
    altText: `📢 ${ANNOUNCEMENT_CONFIG.title}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f172a", // Slate-900
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "⚙️ 系統維護公告",
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
            text: ANNOUNCEMENT_CONFIG.title,
            weight: "bold",
            size: "md",
            color: "#334155"
          },
          {
            type: "text",
            text: ANNOUNCEMENT_CONFIG.version,
            size: "xs",
            color: "#64748b",
            margin: "none"
          },
          {
            type: "separator",
            margin: "md",
            color: "#e2e8f0"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "sm",
            contents: ANNOUNCEMENT_CONFIG.items.map(item => ({
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                {
                  type: "icon",
                  url: "https://scdn.line-apps.com/n/channel_devcenter/img/fx/review_gold_star_28.png",
                  size: "xs",
                  offsetTop: "1px"
                },
                {
                  type: "text",
                  text: item,
                  wrap: true,
                  color: "#475569",
                  size: "sm"
                }
              ]
            }))
          },
          {
            type: "separator",
            margin: "lg",
            color: "#e2e8f0"
          },
          {
            type: "text",
            text: ANNOUNCEMENT_CONFIG.footer,
            margin: "lg",
            size: "xs",
            color: "#94a3b8",
            align: "center"
          }
        ]
      }
    }
  };
}

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

    // 3. 判斷任務類型 (透過 Query Parameter: ?type=weekly 或 ?type=monthly)
    const jobType = req.query.type || 'weekly'; // 預設為 weekly

    if (jobType === 'monthly') {
      // --- 執行每月維護公告 ---
      console.log('Running Monthly Maintenance Announcement...');
      const flexMsg = createMaintenanceFlex();
      await client.pushMessage(targetGroupId, flexMsg);
      return res.status(200).json({ success: true, message: 'Monthly Maintenance Notice Sent' });

    } else {
      // --- 執行每週科務會議輪值 ---
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
      return res.status(200).json({ success: true, message: 'Weekly Roster Sent', duty: dutyPerson });
    }

  } catch (error) {
    console.error('Cron Job Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}