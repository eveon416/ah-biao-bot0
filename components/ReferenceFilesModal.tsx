import React, { useState, useEffect } from 'react';
import { X, FileText, Calendar, ShieldCheck, AlertCircle, Plus, Trash2, Save, FolderOpen } from 'lucide-react';

interface ReferenceFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DocFile {
  id?: string;
  title: string;
  date: string;
  desc: string;
  highlight: boolean;
  category?: string; // 用於自定義文件的分類
  isCustom?: boolean;
}

const CATEGORIES = [
  "機關專屬規範與系統 (Internal)",
  "政府採購 (核心法規)",
  "政府採購 (作業指引)",
  "薪資出納與其他"
];

const ReferenceFilesModal: React.FC<ReferenceFilesModalProps> = ({ isOpen, onClose }) => {
  // State for Custom Files
  const [customFiles, setCustomFiles] = useState<DocFile[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');

  // Load custom files on mount
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('custom_docs_v1');
      if (saved) {
        try {
          setCustomFiles(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to load custom docs", e);
        }
      }
    }
  }, [isOpen]);

  const handleSaveCustomDoc = () => {
    if (!newTitle.trim() || !newDesc.trim()) {
      alert("請填寫文件標題與說明");
      return;
    }
    
    const doc: DocFile = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      category: newCategory,
      date: newDate || new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      desc: newDesc.trim(),
      highlight: true,
      isCustom: true
    };

    const updated = [...customFiles, doc];
    setCustomFiles(updated);
    localStorage.setItem('custom_docs_v1', JSON.stringify(updated));
    
    // Reset Form
    setIsAdding(false);
    setNewTitle('');
    setNewDesc('');
    setNewDate('');
  };

  const handleDeleteCustomDoc = (id: string) => {
    if (!window.confirm("確定要刪除此文件紀錄嗎？")) return;
    const updated = customFiles.filter(f => f.id !== id);
    setCustomFiles(updated);
    localStorage.setItem('custom_docs_v1', JSON.stringify(updated));
  };

  if (!isOpen) return null;

  // Built-in Files
  const builtInGroups = [
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

  // Merge Custom Files into Groups
  const mergedGroups = builtInGroups.map(group => {
    const groupCustomFiles = customFiles.filter(f => f.category === group.category);
    return {
      ...group,
      files: [...groupCustomFiles, ...group.files]
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">機關知識庫管理</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-indigo-200 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
          
          <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-800">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <p>
              下列文件已寫入系統核心記憶。系統將<strong>強制優先引用</strong>這些文件內容（權重高於網路搜尋）。
              <br/>
              您可以點擊下方按鈕新增臨時性的機關內部文件。
            </p>
          </div>

          {/* Add Document Section */}
          <div className="mb-6">
              {!isAdding ? (
                 <button 
                    onClick={() => setIsAdding(true)}
                    className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-lg text-indigo-600 font-bold text-sm hover:bg-indigo-50 hover:border-indigo-300 transition-all flex items-center justify-center gap-2"
                 >
                    <Plus size={16} />
                    新增內部參考文件 (Upload Reference)
                 </button>
              ) : (
                 <div className="bg-white p-4 rounded-lg border border-indigo-200 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-slate-800 text-sm">新增文件資料</h3>
                        <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                    </div>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input 
                                type="text" 
                                placeholder="文件標題 (例: 115年度預算編列注意事項)" 
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:border-indigo-500 outline-none"
                            />
                            <select 
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:border-indigo-500 outline-none bg-white"
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                             <input 
                                type="text" 
                                placeholder="版本日期 (例: 114.12.25)" 
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:border-indigo-500 outline-none"
                            />
                             <div className="flex items-center text-xs text-slate-500 px-2">
                                * 此文件將標示為 [最新]
                             </div>
                        </div>
                        <textarea 
                            placeholder="文件重點摘要或規範內容..." 
                            value={newDesc}
                            onChange={e => setNewDesc(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:border-indigo-500 outline-none min-h-[80px]"
                        />
                        <button 
                            onClick={handleSaveCustomDoc}
                            className="w-full bg-indigo-600 text-white py-2 rounded text-sm font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
                        >
                            <Save size={16} />
                            儲存文件
                        </button>
                    </div>
                 </div>
              )}
          </div>

          <div className="space-y-6">
            {mergedGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
                  <FolderOpen size={14} />
                  {group.category}
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {group.files.map((file: any, index: number) => (
                    <div key={index} className={`bg-white p-3 rounded-lg border shadow-sm flex flex-col sm:flex-row gap-3 transition-colors group relative
                        ${file.isCustom ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200 hover:border-indigo-300'}`}>
                      
                      <div className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-colors mt-1
                          ${file.isCustom ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>
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
                           {file.isCustom && (
                             <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                               自訂
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

                      {/* Delete Button for Custom Files */}
                      {file.isCustom && (
                          <button 
                            onClick={() => handleDeleteCustomDoc(file.id)}
                            className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                            title="刪除文件"
                          >
                            <Trash2 size={14} />
                          </button>
                      )}
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