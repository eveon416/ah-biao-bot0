import React from 'react';
import { PRESET_QUESTIONS } from '../constants';
import { LawCategory } from '../types';
import { FileText, Gavel, Briefcase, Users, Coins } from 'lucide-react';

interface SuggestionsProps {
  onSelect: (question: string) => void;
  disabled: boolean;
}

const getIcon = (category: LawCategory) => {
  switch (category) {
    case LawCategory.PROCUREMENT: return <Gavel size={14} />;
    case LawCategory.DOCUMENT: return <FileText size={14} />;
    case LawCategory.ADMIN: return <Briefcase size={14} />;
    case LawCategory.LABOR: return <Users size={14} />;
    case LawCategory.FINANCE: return <Coins size={14} />;
    default: return <FileText size={14} />;
  }
};

const getColor = (category: LawCategory) => {
  switch (category) {
    case LawCategory.PROCUREMENT: return 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100';
    case LawCategory.DOCUMENT: return 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100';
    case LawCategory.ADMIN: return 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100';
    case LawCategory.LABOR: return 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100';
    case LawCategory.FINANCE: return 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100';
    default: return 'bg-slate-50 text-slate-700';
  }
};

const Suggestions: React.FC<SuggestionsProps> = ({ onSelect, disabled }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
      {PRESET_QUESTIONS.map((item, index) => (
        <button
          key={index}
          onClick={() => onSelect(item.question)}
          disabled={disabled}
          className={`text-left text-xs p-3 rounded-lg border transition-all duration-200 flex items-start gap-2 shadow-sm
            ${getColor(item.category)} ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}`}
        >
          <div className="mt-0.5 flex-shrink-0 opacity-70">
            {getIcon(item.category)}
          </div>
          <span className="font-medium">{item.question}</span>
        </button>
      ))}
    </div>
  );
};

export default Suggestions;