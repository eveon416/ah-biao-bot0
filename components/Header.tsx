import React from 'react';
import { Building2, Scale } from 'lucide-react';

const Header: React.FC = () => {
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
        <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-300 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700">
          <Scale className="w-3.5 h-3.5" />
          <span>依法行政・薪資出納</span>
        </div>
      </div>
    </header>
  );
};

export default Header;