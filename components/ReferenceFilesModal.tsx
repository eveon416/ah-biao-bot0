
import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Calendar, ShieldCheck, AlertCircle, Plus, Trash2, Save, FolderOpen, Layers, Upload, FileCheck } from 'lucide-react';

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
  category?: string; 
  isCustom?: boolean;
  fileName?: string;
}

const CATEGORIES = [
  "機關專屬規範與系統 (Internal)",
  "政府採購 (核心法規)",
  "政府採購 (作業指引)",
  "薪資出納與其他",
  "機關檔案管理與文書"
];

const ReferenceFilesModal: React.FC<ReferenceFilesModalProps> = ({ isOpen, onClose }) => {
  const [customFiles, setCustomFiles] = useState<DocFile[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[3]);
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('custom_docs_v1');
      if (saved) {
        try { setCustomFiles(JSON.parse(saved)); } catch (e) {}
      }
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setSelectedFileName(file.name);
          if (!newTitle) setNewTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
  };

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
      isCustom: true,
      fileName: selectedFileName || undefined
    };

    const updated = [...customFiles, doc];
    setCustomFiles(updated);
    localStorage.setItem('custom_docs_v1', JSON.stringify(updated));
    
    // Reset Form
    setIsAdding(false);
    setNewTitle('');
    setNewDesc('');
    setNewDate('');
    setSelectedFileName(null);
  };

  const handleDeleteCustomDoc = (id: string) => {
    if (!window.confirm("確定要刪除此文件紀錄嗎？")) return;
    const updated = customFiles.filter(f => f.id !== id);
    setCustomFiles(updated);
    localStorage.setItem('custom_docs_v1', JSON.stringify(updated));
  };

  if (!isOpen) return null;

  const builtInGroups = [
    {
      category: "機關專屬規範與系統 (Internal)",
      files: [
        { title: "科務會議輪值表", date: "114年12月8日基準", desc: "行政科共 10 人循環輪值表 (基準週 12/8 為陳怡妗)。", highlight: true },
        { title: "薪資管理系統操作手冊", date: "Ver 1.12A", desc: "人員資料維護、每月薪資批次、年終考績獎金、所得扣繳操作說明。", highlight: true },
        { title: "花蓮縣衛生局所會計室辦理採購付款案件審核重點", date: "114年12月起適用", desc: "包含契約變更、驗收事項、履約期限及保險等審核關鍵項目。", highlight: true },
        { title: "花蓮縣衛生局所採購付款案應敘明事項及應備文件檢查表", date: "114年12月起適用", desc: "採購核銷必備文件清單（如核准簽文、契約書、驗收紀錄、計價單等）。", highlight: true }
      ]
    },
    {
      category: "薪資出納與其他",
      files: [
        { title: "所得稅法", date: "113.08.07 修正", desc: "規範個人及營利事業所得稅、免稅項目及房地合一稅之母法。", highlight: true },
        { title: "所得稅法施行細則", date: "111.02.21 修正", desc: "補充母法細節，包含國外稅額扣抵公式、信託所得及固定資產折舊等規定。", highlight: true },
        { title: "現行公務人員給與簡明表", date: "114.01.01 生效", desc: "公務人員及技工工友薪俸、專業加給標準。", highlight: true },
        { title: "114年軍公教人員年終工作獎金發給注意事項", date: "114.10.02", desc: "114年度年終獎金發放核心依據。", highlight: true },
        { title: "薪資管理系統年終工作獎金發放作業說明", date: "114.11", desc: "系統操作流程與計算範例。", highlight: true }
      ]
    },
    {
      category: "政府採購 (核心法規)",
      files: [
        { title: "政府採購法", date: "108.05.22 修正", desc: "政府採購之根本大法。", highlight: false },
        { title: "政府採購法施行細則", date: "110.07.14 修正", desc: "補充母法之執行細節規定。", highlight: false },
        { title: "投標廠商資格與特殊或巨額採購認定標準", date: "104.10.29 修正", desc: "廠商基本資格與特定資格之依據。", highlight: false },
        { title: "中央機關未達公告金額採購招標辦法", date: "107.03.08 修正", desc: "未達公告金額之採購方式與程序。", highlight: false },
        { title: "政府採購法之查核金額、公告金額及小額採購金額", date: "111.12.23 發布", desc: "定義各項金額門檻(150萬/15萬等)。", highlight: false }
      ]
    },
    {
      category: "政府採購 (作業指引)",
      files: [
        { title: "最有利標評選辦法", date: "114.01.21 修正", desc: "評選項目、配分權重及評定方式之最新規範。", highlight: true },
        { title: "依政府採購法第58條處理總標價低於底價80%案件執行程序", date: "114.01.14 修正", desc: "標價偏低時之通知說明、差額保證金處理流程。", highlight: true },
        { title: "政府採購錯誤行為態樣", date: "113.12 公布", desc: "彙整招標、審標、決標常見錯誤。", highlight: true },
        { title: "採購契約變更或加減價核准監辦備查規定一覽表", date: "91.03.29 修正", desc: "契約變更權責劃分。", highlight: false },
        { title: "中央政府各機關工程管理費支用要點", date: "110.11.04 修正", desc: "工程管理費支用與提列。", highlight: false }
      ]
    },
    {
      category: "機關檔案管理與文書",
      files: [
        { title: "機關檔案管理作業手冊", date: "107.12 編印", desc: "檔案點收、立案、編目及銷毀移轉規範。", highlight: false },
        { title: "文書處理手冊", date: "108.11.25 修正", desc: "公文製作、用印及機密文書處理。", highlight: false }
      ]
    }
  ];

  const mergedGroups = builtInGroups.map(group => {
    const groupCustomFiles = customFiles.filter(f => f.category === group.category);
    return {
      ...group,
      files: [...groupCustomFiles, ...group.files]
    };
  });

  const totalFilesCount = mergedGroups.reduce((acc, group) => acc + group.files.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">機關知識庫管理</h2>
            <div className="flex items-center gap-1 bg-indigo-800 px-2 py-0.5 rounded-full text-[10px] ml-2 border border-indigo-700">
                <Layers size={10} className="text-indigo-300"/>
                <span className="text-indigo-200 font-mono">{totalFilesCount} Files</span>
            </div>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white p-1 rounded-full transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto bg-slate-100 flex-1">
          <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <p>下列共計 <strong>{totalFilesCount}</strong> 份法規與文件已納入記憶。系統將<strong>優先引用</strong>內部文件。</p>
          </div>

          <div className="mb-8">
              {!isAdding ? (
                 <button onClick={() => setIsAdding(true)} className="w-full py-3 border-2 border-dashed border-indigo-300 rounded-lg text-indigo-700 font-bold text-sm hover:bg-white transition-all flex items-center justify-center gap-2">
                    <Plus size={16} /> 新增機關文件或函釋 (錄入庫)
                 </button>
              ) : (
                 <div className="bg-slate-900 p-6 rounded-xl border-2 border-emerald-500/50 shadow-2xl animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                        <h3 className="font-bold text-emerald-400 text-sm flex items-center gap-2">
                            <Upload size={14}/> 錄入新資料
                        </h3>
                        <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-white"><X size={16}/></button>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                             <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                             <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-emerald-400 hover:bg-slate-700 transition-colors">
                                <Upload size={14} /> 選擇檔案附件
                             </button>
                             {selectedFileName && <div className="text-emerald-400 text-xs font-mono">{selectedFileName}</div>}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-slate-300 ml-1">文件標題</label>
                                <input type="text" placeholder="例: 114年度出納作業規範" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded focus:border-emerald-500 outline-none"/>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-slate-300 ml-1">分類歸檔</label>
                                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded focus:border-emerald-500 outline-none">
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-slate-300 ml-1">版本日期</label>
                            <input type="text" placeholder="例: 114.12.30" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded focus:border-emerald-500 outline-none"/>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-slate-300 ml-1">規範內容或重點摘要</label>
                            <textarea placeholder="請輸入文件核心要點..." value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded focus:border-emerald-500 outline-none min-h-[100px] resize-none"/>
                        </div>

                        <button onClick={handleSaveCustomDoc} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-500 shadow-lg transition-all active:scale-95">
                            <Save size={18} /> 確認寫入系統核心
                        </button>
                    </div>
                 </div>
              )}
          </div>

          <div className="space-y-8">
            {mergedGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2"><FolderOpen size={14} /> {group.category}</h3>
                <div className="grid grid-cols-1 gap-4">
                  {group.files.map((file: any, index: number) => (
                    <div key={index} className={`bg-white p-4 rounded-xl border shadow-sm flex flex-col sm:flex-row gap-4 transition-all group relative ${file.isCustom ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 hover:border-indigo-400'}`}>
                      <div className={`shrink-0 flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${file.isCustom ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>
                        <FileText size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <h4 className="font-bold text-slate-900 text-sm truncate pr-2 official-font">{file.title}</h4>
                          {file.highlight && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">最新</span>}
                          {file.isCustom && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-600 text-white">自訂</span>}
                        </div>
                        <p className="text-xs text-slate-600 mb-3 leading-relaxed">{file.desc}</p>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded w-fit border border-slate-100"><Calendar size={10} /> <span>版本：{file.date}</span></div>
                      </div>
                      {file.isCustom && (
                          <button onClick={() => handleDeleteCustomDoc(file.id)} className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors text-sm font-bold">關閉</button>
        </div>
      </div>
    </div>
  );
};

export default ReferenceFilesModal;
