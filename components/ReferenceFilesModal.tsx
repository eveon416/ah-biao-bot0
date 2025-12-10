import React from 'react';
import { X, FileText, Calendar, ShieldCheck, AlertCircle } from 'lucide-react';

interface ReferenceFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ReferenceFilesModal: React.FC<ReferenceFilesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const fileGroups = [
    {
      category: "機關專屬規範與系統 (Internal)",
      files: [
        {
          title: "科務會議輪值表",
          date: "114年12月8日基準",
          desc: "行政科共 10 人循環輪值表 (基準週 12/8-12/14 為陳怡妗)。",
          highlight: true
        },
        {
          title: "花蓮縣衛生局所會計室辦理採購付款(會辦)案件審核重點",
          date: "114年12月起適用",
          desc: "包含契約變更、驗收事項、履約期限及保險等審核關鍵項目。",
          highlight: true
        },
        {
          title: "花蓮縣衛生局所採購付款案應敘明事項及應備文件檢查表",
          date: "114年12月起適用",
          desc: "採購核銷必備文件清單（如核准簽文、契約書、驗收紀錄、計價單等）。",
          highlight: true
        },
        {
          title: "薪資管理系統操作手冊",
          date: "Ver 1.12A",
          desc: "人員資料維護、每月薪資批次、年終考績獎金、二代健保及所得扣繳操作說明。",
          highlight: true
        }
      ]
    },
    {
      category: "政府採購 (核心法規)",
      files: [
        {
          title: "政府採購法",
          date: "108年05月22日修正",
          desc: "政府採購之根本大法。",
          highlight: false
        },
        {
          title: "政府採購法施行細則",
          date: "110年07月14日修正",
          desc: "補充母法之執行細節規定。",
          highlight: false
        },
        {
          title: "投標廠商資格與特殊或巨額採購認定標準",
          date: "104年10月29日修正",
          desc: "訂定廠商基本資格與特定資格之依據。",
          highlight: false
        },
        {
          title: "中央機關未達公告金額採購招標辦法",
          date: "107年03月08日修正",
          desc: "未達公告金額之採購方式與程序。",
          highlight: false
        },
        {
          title: "政府採購法之查核金額、公告金額及中央機關小額採購金額",
          date: "111年12月23日發布",
          desc: "定義查核金額、公告金額及小額採購之門檻。",
          highlight: false
        }
      ]
    },
    {
      category: "政府採購 (作業指引)",
      files: [
        {
          title: "最有利標評選辦法",
          date: "114年01月21日修正",
          desc: "評選項目、配分權重及評定方式之最新規範。",
          highlight: true
        },
        {
          title: "依政府採購法第58條處理總標價低於底價80%案件執行程序",
          date: "114年01月14日修正",
          desc: "標價偏低時之通知說明、差額保證金處理流程。",
          highlight: true
        },
        {
          title: "政府採購錯誤行為態樣",
          date: "113年12月公布",
          desc: "彙整招標、審標、決標常見錯誤。",
          highlight: true
        },
        {
          title: "採購契約變更或加減價核准監辦備查規定一覽表",
          date: "91年03月29日修正",
          desc: "契約變更之核准與監辦權責劃分。",
          highlight: false
        },
        {
          title: "中央政府各機關工程管理費支用要點",
          date: "110年11月04日修正",
          desc: "工程管理費之支用項目與提列比例。",
          highlight: false
        }
      ]
    },
    {
      category: "薪資出納與其他",
      files: [
        {
          title: "現行公務人員給與簡明表",
          date: "114年01月01日生效",
          desc: "公務人員及技工工友薪俸標準。",
          highlight: true
        },
        {
          title: "114年軍公教人員年終工作獎金發給注意事項",
          date: "114年10月02日",
          desc: "114年度年終獎金發放核心依據。",
          highlight: true
        },
        {
          title: "薪資管理系統年終工作獎金發放作業說明",
          date: "114年11月",
          desc: "系統操作流程與計算範例。",
          highlight: true
        },
        {
          title: "機關檔案管理作業手冊",
          date: "107年12月編印",
          desc: "檔案點收、立案、編目及銷毀移轉規範。",
          highlight: false
        },
        {
          title: "文書處理手冊",
          date: "108年11月25日修正",
          desc: "公文製作、用印及機密文書處理。",
          highlight: false
        }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">已載入機關規範文件 (共 {fileGroups.reduce((acc, group) => acc + group.files.length, 0)} 份)</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-indigo-200 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto bg-slate-50">
          
          <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-800">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <p>
              下列文件已全數寫入系統核心記憶。系統將<strong>強制優先引用</strong>這些文件內容（包含 114 年最新修正之採購法規與機關內部審核重點），其權重高於網路搜尋結果。
            </p>
          </div>

          <div className="space-y-6">
            {fileGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 ml-1">
                  {group.category}
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {group.files.map((file, index) => (
                    <div key={index} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 hover:border-indigo-300 transition-colors group">
                      <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors mt-1">
                        <FileText size={20} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-900 text-sm truncate pr-2">
                            {file.title}
                          </h4>
                          {file.highlight && (
                             <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 shrink-0">
                               <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                                </span>
                               最新
                             </span>
                          )}
                        </div>
                        
                        <p className="text-xs text-slate-600 mb-2 leading-relaxed line-clamp-2">
                          {file.desc}
                        </p>

                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded w-fit border border-slate-100">
                          <Calendar size={10} />
                          <span>版本：</span>
                          <span className="font-mono font-bold text-slate-700">{file.date}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded transition-colors text-sm font-medium"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferenceFilesModal;