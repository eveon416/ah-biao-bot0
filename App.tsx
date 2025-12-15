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

  // 接收來自 ScheduleModal 的指令，直接在對話視窗生成公告 (美化版)
  const handleGenerateAnnouncement = (type: 'weekly' | 'suspend', info: string) => {
    const timestamp = new Date();
    let content = "";
    
    if (type === 'weekly') {
        content = `### 📢 行政科週知 (系統擬稿預覽)

**【本週輪值狀態】**
> **輪值人員**：**${info}**

---
**【待辦事項】**
1. 煩請於 **週二下班前** 完成工作日誌 📝
2. 輪值同仁於 **週三** 彙整陳核用印 🈳

*(系統備註：本公告已發送至 LINE 排程佇列)*`;
    } else {
         content = `### ⛔ 會議暫停公告 (系統擬稿預覽)

**【暫停事由】**
> 適逢：**${info}**

---
**【執行事項】**
1. 本週科務會議 **【暫停辦理乙次】**
2. 輪值順序遞延，本週免計。

*(系統備註：祝各位假期愉快，平安順心)*`;
    }

    const botMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        content: content,
        timestamp: timestamp,
    };
    
    // 稍微延遲一點，讓使用者感覺系統在處理
    setTimeout(() => {
        setMessages(prev => [...prev, botMsg]);
    }, 600);
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