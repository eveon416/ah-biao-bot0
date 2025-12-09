import React from 'react';
import { X, Shield, AlertTriangle, Scale, BookOpen, CheckCircle2 } from 'lucide-react';

interface SystemRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SystemRulesModal: React.FC<SystemRulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">系統作業與判定準則</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700">
          
          {/* Section 1: Role */}
          <section className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-2">
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">角色設定</span>
              資深行政主管「阿標」
            </h3>
            <p className="text-sm leading-relaxed">
              服務公職逾 20 年，個性沉穩剛正。專精《政府採購法》、《文書處理手冊》及《機關檔案管理》。
              以督導立場協助同仁，語氣專業且具教育性質。
            </p>
          </section>

          {/* Section 2: Critical Rules */}
          <section>
            <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-lg border-b pb-1">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              最高指導原則：版本控制與仲裁
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="min-w-[4px] bg-amber-500 rounded-full"></div>
                <div>
                  <strong className="block text-slate-900">衝突仲裁機制</strong>
                  <p>若內部知識庫檔案日期較舊，但網路搜尋發現法規已修法，<span className="text-red-600 font-bold">強制引用最新搜尋結果</span>，並警示使用者。</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="min-w-[4px] bg-amber-500 rounded-full"></div>
                <div>
                  <strong className="block text-slate-900">數據雙重查核</strong>
                  <p>針對「金額門檻」、「薪資標準」、「罰則數字」，回答前<span className="text-red-600 font-bold">強制執行 Google Search</span> 雙重確認。</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="min-w-[4px] bg-amber-500 rounded-full"></div>
                <div>
                  <strong className="block text-slate-900">網域限制</strong>
                  <p>僅引用 <code>.gov.tw</code> 政府官方網站資訊，嚴禁引用部落格或懶人包。</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Knowledge Base */}
          <section>
            <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-lg border-b pb-1">
              <Scale className="w-5 h-5 text-indigo-500" />
              內建採購金額基準 (112.01.01)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-indigo-50 p-3 rounded border border-indigo-100">
                <span className="block text-xs text-indigo-600 mb-1">工程 / 財物採購</span>
                <span className="font-bold text-slate-800">查核金額：5,000 萬元</span>
              </div>
              <div className="bg-indigo-50 p-3 rounded border border-indigo-100">
                <span className="block text-xs text-indigo-600 mb-1">勞務採購</span>
                <span className="font-bold text-slate-800">查核金額：1,000 萬元</span>
              </div>
              <div className="bg-emerald-50 p-3 rounded border border-emerald-100">
                <span className="block text-xs text-emerald-600 mb-1">公告金額</span>
                <span className="font-bold text-slate-800">150 萬元</span>
              </div>
              <div className="bg-emerald-50 p-3 rounded border border-emerald-100">
                <span className="block text-xs text-emerald-600 mb-1">中央機關小額採購</span>
                <span className="font-bold text-slate-800">15 萬元以下</span>
                <span className="text-xs text-slate-500 ml-1">(得逕洽廠商)</span>
              </div>
            </div>
          </section>

           {/* Section 4: Response Format */}
           <section>
            <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-lg border-b pb-1">
              <BookOpen className="w-5 h-5 text-slate-500" />
              標準回復格式
            </h3>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-600" />
                <span><strong className="text-slate-800">🎯 核心結論</strong>：直接回答 可/不可 或 具體數字。</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-600" />
                <span><strong className="text-slate-800">⚖️ 法令依據</strong>：引用具體條號與函釋字號。</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-600" />
                <span><strong className="text-slate-800">💡 作業建議</strong>：條列式步驟與避雷提醒。</span>
              </li>
            </ul>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors text-sm font-medium"
          >
            了解，返回系統
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemRulesModal;