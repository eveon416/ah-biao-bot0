
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

interface ScheduledTask {
  id: string;
  type: 'weekly' | 'suspend' | 'general';
  targetDate: string;
  targetTime: string;
  info: string;
  targetGroupNames: string[];
  targetGroupIds: string[];
  createdAt: string;
  repeatType: 'none' | 'daily' | 'weekly' | 'monthly';
  repeatDays?: number[];
  repeatDate?: number;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'model', content: WELCOME_MESSAGE, timestamp: new Date() },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('scheduled_tasks_v1');
    if (saved) { try { setScheduledTasks(JSON.parse(saved)); } catch (e) {} }
  }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => scrollToBottom(), [messages]);
  useEffect(() => inputRef.current?.focus(), []);

  // 輔助函式：計算下一次執行的日期
  const calculateNextDate = (currentDateStr: string, repeatType: string): string => {
    const d = new Date(currentDateStr);
    if (isNaN(d.getTime())) return currentDateStr;
    if (repeatType === 'daily') d.setDate(d.getDate() + 1);
    else if (repeatType === 'weekly') d.setDate(d.getDate() + 7);
    else return "";
    return d.toISOString().split('T')[0];
  };

  // 背景預約排程執行邏輯 (加強開關檢查)
  useEffect(() => {
    const processQueue = async () => {
      // 檢查總開關
      const isProcessorEnabled = localStorage.getItem('local_processor_enabled') !== 'false';
      if (!isProcessorEnabled) return;

      const storedTasks = localStorage.getItem('scheduled_tasks_v1');
      if (!storedTasks) return;
      const tasks = JSON.parse(storedTasks);
      if (!Array.isArray(tasks) || tasks.length === 0) return;

      const now = new Date();
      const nowYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const tasksToRun = tasks.filter(t => t.targetDate === nowYMD && t.targetTime === nowHM);
      
      if (tasksToRun.length > 0) {
        const updatedTasks = tasks.map(t => {
          if (t.targetDate === nowYMD && t.targetTime === nowHM) {
            if (t.repeatType && t.repeatType !== 'none') {
              const nextDate = calculateNextDate(t.targetDate, t.repeatType);
              return nextDate ? { ...t, targetDate: nextDate } : null;
            }
            return null;
          }
          return t;
        }).filter(Boolean) as ScheduledTask[];

        localStorage.setItem('scheduled_tasks_v1', JSON.stringify(updatedTasks));
        setScheduledTasks(updatedTasks);

        const remoteUrl = localStorage.getItem('remote_api_url') || 'https://ah-biao-bot0.vercel.app';
        for (const task of tasksToRun) {
          try {
            const params = new URLSearchParams({ 
                manual: 'true', type: task.type, date: task.targetDate,
                groupId: task.targetGroupIds.join(',') 
            });
            if (task.type === 'suspend') params.append('reason', task.info);
            else if (task.type === 'general') params.append('content', task.info);
            else if (task.type === 'weekly') params.append('person', task.info);
            
            const res = await fetch(`${remoteUrl.replace(/\/$/, '')}/api/cron?${params.toString()}`);
            const data = await res.json();
            if (data.success) handleGenerateAnnouncement(task.type, task.info);
          } catch (err) { console.error(`[Scheduler] Error:`, err); }
        }
      }
    };

    const timer = setInterval(processQueue, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: content.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);
    const botMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: botMsgId, role: 'model', content: '', timestamp: new Date() }]);

    try {
      await streamResponse([...messages, userMsg], userMsg.content, (chunkText) => {
        setMessages((prev) => prev.map((msg) => msg.id === botMsgId ? { ...msg, content: chunkText } : msg));
      });
    } catch (error) {
      setMessages((prev) => prev.map((msg) => msg.id === botMsgId ? { ...msg, content: '系統異常，請稍後再試。', isError: true } : msg));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isLoading]);

  const handleGenerateAnnouncement = (type: 'weekly' | 'suspend' | 'general', info: string) => {
    let content = "";
    if (type === 'weekly') content = `### 📢 行政科週知 (預約發送)\n\n**輪值人員**：**${info}**\n\n✅ 已完成 LINE 廣播作業。`;
    else if (type === 'suspend') content = `### ⛔ 會議暫停公告 (預約發送)\n\n**事由**：**${info}**\n\n✅ 已完成 LINE 通知。`;
    else content = `### 📝 一般公告 (預約發送)\n\n${info}\n\n✅ 已完成發送。`;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content, timestamp: new Date() }]);
  };

  const handleRequestRefine = (text: string) => handleSendMessage(`阿標，請幫我潤飾以下公告內容，符合公職用語並加入表情符號：\n\n${text}`);
  const handleClearChat = () => { if (window.confirm('確定要清除所有對話紀錄嗎？')) setMessages([{ id: 'welcome', role: 'model', content: WELCOME_MESSAGE, timestamp: new Date() }]); };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header onOpenRules={() => setIsRulesOpen(true)} onOpenFiles={() => setIsFilesOpen(true)} onOpenSchedule={() => setIsScheduleOpen(true)} />
      <SystemRulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
      <ReferenceFilesModal isOpen={isFilesOpen} onClose={() => setIsFilesOpen(false)} />
      <ScheduleModal 
        isOpen={isScheduleOpen} onClose={() => setIsScheduleOpen(false)} 
        onGenerate={handleGenerateAnnouncement} onRequestRefine={handleRequestRefine}
        tasks={scheduledTasks} setTasks={(newTasks) => { setScheduledTasks(newTasks); localStorage.setItem('scheduled_tasks_v1', JSON.stringify(newTasks)); }}
      />
      <main className="flex-1 overflow-hidden flex flex-col relative max-w-5xl w-full mx-auto bg-white shadow-2xl md:my-4 md:rounded-xl md:border border-slate-200">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          {messages.map((msg) => <ChatBubble key={msg.id} message={msg} />)}
          {isLoading && <div className="flex items-center gap-2 text-slate-500 text-sm ml-2 mb-4 animate-pulse"><div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div><span className="font-serif ml-1">阿標研擬回覆中...</span></div>}
          <div ref={messagesEndRef} />
        </div>
        <div className="bg-slate-50 border-t border-slate-200 p-4">
          {messages.length < 3 && <div className="mb-4"><Suggestions onSelect={handleSendMessage} disabled={isLoading} /></div>}
          <div className="relative flex items-end gap-2 bg-white p-2 rounded-xl border border-slate-300 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
            <textarea
              ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(inputValue); } }}
              placeholder="請輸入問題..." className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-2.5 px-3 text-slate-700 text-base" rows={1} disabled={isLoading}
            />
            <div className="flex flex-col gap-2 pb-1">
               <button onClick={handleClearChat} disabled={isLoading} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Eraser size={20} /></button>
               <button onClick={() => handleSendMessage(inputValue)} disabled={!inputValue.trim() || isLoading} className={`p-2 rounded-lg transition-all ${!inputValue.trim() || isLoading ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}>{isLoading ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}</button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-2">免責聲明：本系統由 AI 生成，僅供行政輔助參考。</p>
        </div>
      </main>
    </div>
  );
};

export default App;
