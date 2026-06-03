import React from 'react';
import { Building2, Scale, BookOpen, Database, CalendarClock } from 'lucide-react';

interface HeaderProps {
  onOpenRules?: () => void;
  onOpenFiles?: () => void;
  onOpenSchedule?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenRules, onOpenFiles, onOpenSchedule }) => {
  return (
    <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md z-10 sticky top-0">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-white/10 p-2 rounded-lg border border-white/20">
            <Building2 className="w-6 h-6 text-slate-100" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide official-font">公務行政諮詢輔佐系統</h1>
            <p className="text-xs text-slate-300 font-light tracking-wider">GOVERNMENT ADMINISTRATION ASSISTANT AI</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
           <button 
            onClick={onOpenSchedule}
            className="flex items-center space-x-1.5 text-xs text-emerald-100 bg-emerald-800/50 hover:bg-emerald-700 px-3 py-1.5 rounded-full border border-emerald-500 transition-all hover:border-emerald-400 active:scale-95"
            title="查閱系統自動排程"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">排程管理</span>
          </button>

           <button 
            onClick={onOpenFiles}
            className="flex items-center space-x-1.5 text-xs text-indigo-100 bg-indigo-800/50 hover:bg-indigo-700 px-3 py-1.5 rounded-full border border-indigo-500 transition-all hover:border-indigo-400 active:scale-95"
            title="檢視已載入之機關文件"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">內建資料</span>
          </button>

          <button 
            onClick={onOpenRules}
            className="flex items-center space-x-1.5 text-xs text-slate-200 bg-slate-700/50 hover:bg-slate-700 px-3 py-1.5 rounded-full border border-slate-600 transition-all hover:border-slate-400 active:scale-95"
            title="檢視系統作業準則"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">作業準則</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;