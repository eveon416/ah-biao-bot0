import React from 'react';
import { Message } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import { User, Bot, AlertTriangle } from 'lucide-react';

interface ChatBubbleProps {
  message: Message;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm mt-1
          ${isUser ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-200 border-slate-300 text-slate-700'}`}>
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>

        {/* Message Content */}
        <div className={`relative px-5 py-4 rounded-2xl shadow-sm text-sm border
          ${isUser 
            ? 'bg-indigo-600 text-white rounded-tr-none border-indigo-700' 
            : 'bg-white text-slate-800 rounded-tl-none border-slate-200'
          } ${isError ? 'bg-red-50 border-red-200 text-red-800' : ''}`}>
          
          {isError && (
            <div className="flex items-center gap-2 mb-2 text-red-600 font-bold border-b border-red-100 pb-2">
              <AlertTriangle size={16} />
              <span>系統錯誤</span>
            </div>
          )}

          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div className="official-response">
               <MarkdownRenderer content={message.content} />
            </div>
          )}
          
          <div className={`text-[10px] mt-2 opacity-60 text-right ${isUser ? 'text-indigo-100' : 'text-slate-400'}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;