import React from 'react';
import { X, Shield, AlertTriangle, Scale, BookOpen, CheckCircle2, Database, FileText } from 'lucide-react';

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

          {/* Section 2: Priority Rules */}
          <section>
            <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-lg border-b pb-1">
              <Database className="w-5 h-5 text-indigo-600" />
              資料引用優先順序
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                 <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <div className="h-full w-0.5 bg-indigo-200 my-1"></div>
                 </div>
                 <div className="pb-4">
                   <strong className="block text-slate-900 text-base">內建知識庫 (Internal Knowledge)</strong>
                   <p className="text-slate-600">系統內建之採購門檻、公文規範及使用者提供之五份關鍵內部文件為第一優先引用來源。</p>
                 </div>
              </div>
              <div className="flex gap-3">
                 <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">2</div>
                 </div>
                 <div>
                   <strong className="block text-slate-900 text-base">外部法規查核 (Official Search)</strong>
                   <p className="text-slate-600">輔助驗證。僅在搜尋結果明確指出「法規已修法/廢止」時，才可覆寫內部資料。</p>
                 </div>
              </div>
            </div>
          </section>

          {/* Section 3: Conflict Resolution */}
          <section>
             <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-lg border-b pb-1">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              衝突仲裁機制
            </h3>
             <div className="bg-amber-50 p-3 rounded border border-amber-100 text-sm">
                <p className="mb-2">當<strong>內建資料</strong>與<strong>網路搜尋結果</strong>不一致時：</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    <li>若網路資訊顯示法規已於<strong>更晚日期</strong>修正，則以最新法規為準，並提示使用者。</li>
                    <li>若網路資訊模糊或非官方來源，則<strong>堅持使用內建知識庫</strong>數據。</li>
                </ul>
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