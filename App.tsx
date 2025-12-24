
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ChatBubble from './components/ChatBubble';
import Suggestions from './components/Suggestions';
import SystemRulesModal from './components/SystemRulesModal';
import ReferenceFilesModal from './components/ReferenceFilesModal';
import ScheduleModal from './components/ScheduleModal';
import { Message } from './types';
import { WELCOME_MESSAGE } from './constants';
import { streamResponse } from './services/geminiService';
import { Send, RefreshCw, Eraser } from 'lucide-react';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // --- 背景預約排程執行邏輯 (修正發送失敗問題) ---
  useEffect(() => {
    const processQueue = async () => {
      const savedTasks = localStorage.getItem('scheduled_tasks_v1');
      if (!savedTasks) return;

      try {
        let tasks = JSON.parse(savedTasks);
        if (!Array.isArray(tasks) || tasks.length === 0) return;

        const now = new Date();
        const nowYMD = now.toISOString().split('T')[0];
        // 確保格式為 HH:mm
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const nowHM = `${hours}:${minutes}`;

        // 篩選出到期任務
        const tasksToRun = tasks.filter(t => t.targetDate === nowYMD && t.targetTime === nowHM);
        
        if (tasksToRun.length > 0) {
          console.log(`[Scheduler] 發現 ${tasksToRun.length} 個到期任務，準備執行...`);
          
          // 立即更新快取，避免在一分鐘內重複觸發
          const remainingTasks = tasks.filter(t => !(t.targetDate === nowYMD && t.targetTime === nowHM));
          localStorage.setItem('scheduled_tasks_v1', JSON.stringify(remainingTasks));

          const remoteUrl = localStorage.getItem('remote_api_url') || 'https://ah-biao-bot0.vercel.app';

          for (const task of tasksToRun) {
            try {
              const params = new URLSearchParams();
              params.append('manual', 'true');
              params.append('type', task.type);
              params.append('date', task.targetDate);
              
              if (task.type === 'suspend') params.append('reason', task.info);
              if (task.type === 'general') params.append('content', task.info);
              if (task.type === 'weekly') params.append('person', task.info);
              
              // 重要：傳入當初設定的群組 ID 列表
              if (task.targetGroupIds && task.targetGroupIds.length > 0) {
                  params.append('groupId', task.targetGroupIds.join(','));
              }
              
              const targetUrl = `${remoteUrl.replace(/\/$/, '')}/api/cron?${params.toString()}`;
              const res = await fetch(targetUrl);
              const data = await res.json();
              
              if (data.success) {
                handleGenerateAnnouncement(task.type, task.info);
                console.log(`[Scheduler] 任務 ${task.id} 執行成功`);
              } else {
                console.error(`[Scheduler] 任務 ${task.id} API 回傳失敗:`, data.message);
              }
            } catch (err) {
              console.error(`[Scheduler] 任務 ${task.id} 網路請求出錯:`, err);
            }
          }
        }
      } catch (e) {
        console.error("[Scheduler] 解析任務佇列出錯", e);
      }
    };

    // 每 30 秒檢查一次，確保不遺漏分鐘切換
    const timer = setInterval(processQueue, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    const botMsgId = (Date.now() + 1).toString();
    const botMsg: Message = {
      id: botMsgId,
      role: 'model',
      content: '', // Start empty
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, botMsg]);

    try {
      const conversationHistory = [...messages, userMsg];
      
      await streamResponse(conversationHistory, userMsg.content, (chunkText) => {
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === botMsgId ? { ...msg, content: chunkText } : msg
          )
        );
      });
    } catch (error) {
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === botMsgId 
            ? { ...msg, content: '報告，系統目前遭遇連線異常，請稍後再試。', isError: true } 
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isLoading]);

  const handleGenerateAnnouncement = (type: 'weekly' | 'suspend' | 'general', info: string) => {
    const timestamp = new Date();
    let content = "";
    
    if (type === 'weekly') {
        content = `### 📢 行政科週知 (預約排程已發送)

**【本週輪值狀態】**
> **輪值人員**：**${info}**

---
**【執行狀態】**
✅ 已依預約時間完成 LINE 群組廣播。
*(系統備註：本週輪值作業已生效)*`;
    } else if (type === 'suspend') {
         content = `### ⛔ 會議暫停公告 (預約排程已發送)

**【暫停事由】**
> 適逢：**${info}**

---
**【執行狀態】**
✅ 已依預約時間發送會議暫停通知。
*(系統備註：輪值順序將自動遞延)*`;
    } else {
        content = `### 📝 一般公告 (預約排程已發送)

${info}

---
**【執行狀態】**
✅ 已依預約時間發送一般公告。`;
    }

    const botMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        content: content,
        timestamp: timestamp,
    };
    
    setMessages(prev => [...prev, botMsg]);
  };

  const handleRequestRefine = (text: string) => {
      const prompt = `阿標，請幫我潤飾以下公告內容，使其語氣委婉但堅定，並符合公務用語，適當加入表情符號：\n\n${text}`;
      handleSendMessage(prompt);
  };

  const handleClearChat = () => {
    if (window.confirm('確定要清除所有對話紀錄嗎？')) {
      setMessages([
        {
          id: 'welcome',
          role: 'model',
          content: WELCOME_MESSAGE,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header 
        onOpenRules={() => setIsRulesOpen(true)} 
        onOpenFiles={() => setIsFilesOpen(true)}
        onOpenSchedule={() => setIsScheduleOpen(true)}
      />
      
      <SystemRulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
      <ReferenceFilesModal isOpen={isFilesOpen} onClose={() => setIsFilesOpen(false)} />
      <ScheduleModal 
        isOpen={isScheduleOpen} 
        onClose={() => setIsScheduleOpen(false)} 
        onGenerate={handleGenerateAnnouncement}
        onRequestRefine={handleRequestRefine}
      />

      <main className="flex-1 overflow-hidden flex flex-col relative max-w-5xl w-full mx-auto bg-white shadow-2xl md:my-4 md:rounded-xl md:border border-slate-200">
        
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-500 text-sm ml-2 mb-4 animate-pulse">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              <span className="ml-2 font-serif">正在研擬回覆...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-slate-50 border-t border-slate-200 p-4">
          
          {messages.length < 3 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider ml-1">常用諮詢事項</p>
              <Suggestions onSelect={handleSendMessage} disabled={isLoading} />
            </div>
          )}

          <div className="relative flex items-end gap-2 bg-white p-2 rounded-xl border border-slate-300 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="請輸入行政或出納問題，例如：年終獎金計算、採購流程..."
              className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-2.5 px-3 text-slate-700 placeholder-slate-400 text-base"
              rows={1}
              style={{ height: 'auto', minHeight: '44px' }}
              disabled={isLoading}
            />
            
            <div className="flex flex-col gap-2 pb-1">
               <button
                onClick={handleClearChat}
                disabled={isLoading}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="清除對話"
              >
                <Eraser size={20} />
              </button>
              
              <button
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isLoading}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  !inputValue.trim() || isLoading
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-95'
                }`}
              >
                {isLoading ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </div>
          
          <div className="text-center mt-2">
            <p className="text-[10px] text-slate-400">
              免責聲明：本系統由 AI 生成，僅供行政輔助參考，正式公文與決策仍請依機關核定程序辦理。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
