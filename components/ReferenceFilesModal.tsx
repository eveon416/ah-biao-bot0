
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
      alert("請填寫內容");
      return;
    }
    const doc: DocFile = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      category: newCategory,
      date: newDate || new Date().toLocaleDateString('zh-TW'),
      desc: newDesc.trim(),
      highlight: true,
      isCustom: true,
      fileName: selectedFileName || undefined
    };
    const updated = [...customFiles, doc];
    setCustomFiles(updated);
    localStorage.setItem('custom_docs_v1', JSON.stringify(updated));
    setIsAdding(false);
    setNewTitle(''); setNewDesc(''); setNewDate(''); setSelectedFileName(null);
  };

  if (!isOpen) return null;

  // Add explicit type to builtInGroups to ensure all members are treated as DocFile compatible
  const builtInGroups: { category: string; files: DocFile[] }[] = [
    {
      category: "機關專屬規範與系統 (Internal)",
      files: [
        { title: "科務會議輪值表", date: "114.12.08 基準", desc: "行政科 10 人循環輪值表。", highlight: true },
        { title: "薪資管理系統操作手冊", date: "Ver 1.12A", desc: "人員、每月薪資、考績、所得扣繳操作。", highlight: true },
        { title: "會計室辦理採購付款審核重點", date: "114.12 起適用", desc: "契約變更、驗收、保險等審核項。", highlight: true },
        { title: "採購付款案應備文件檢查表", date: "114.12 起適用", desc: "核銷必備文件清單清單。", highlight: true }
      ]
    },
    {
      category: "薪資出納與其他",
      files: [
        { title: "所得稅法", date: "113.08.07 修正", desc: "所得稅核心母法，含免稅與房地合一規定。", highlight: true },
        { title: "所得稅法施行細則", date: "111.02.21 修正", desc: "國外稅額扣抵、折舊計算等細節。", highlight: true },
        { title: "現行公務人員給與簡明表", date: "114.01.01 生效", desc: "最新薪俸、專業加給標準。", highlight: true },
        { title: "軍公教年終工作獎金發給注意事項", date: "114.10.02", desc: "114年度年終獎金發放基準。", highlight: true },
        { title: "薪資系統年終獎金發放作業說明", date: "114.11", desc: "操作流程與計算範例。", highlight: true }
      ]
    },
    {
      category: "政府採購 (核心法規)",
      files: [
        { title: "政府採購法", date: "108.05.22 修正", desc: "採購根本大法。", highlight: false },
        { title: "政府採購法施行細則", date: "110.07.14 修正", desc: "母法執行細節。", highlight: false },
        { title: "投標廠商資格與特殊採購認定標準", date: "104.10.29", desc: "廠商基本與特定資格。", highlight: false },
        { title: "中央機關未達公告金額採購招標辦法", date: "107.03.08", desc: "未達公告金額程序。", highlight: false },
        { title: "政府採購法各項金額門檻", date: "111.12.23", desc: "查核、公告、小額採購門檻。", highlight: false }
      ]
    },
    {
      category: "政府採購 (作業指引)",
      files: [
        { title: "最有利標評選辦法", date: "114.01.21 修正", desc: "最新評選項目與權重規範。", highlight: true },
        { title: "採購法第58條處理執行程序", date: "114.01.14 修正", desc: "總標價低於底價80%處理。", highlight: true },
        { title: "政府採購錯誤行為態樣", date: "113.12 公布", desc: "常見錯誤彙整。", highlight: true },
        { title: "採購契約變更權責劃分表", date: "91.03.29", desc: "變更核准監辦規定。", highlight: false },
        { title: "中央機關工程管理費支用要點", date: "110.11.04", desc: "支用項目與提列比例。", highlight: false }
      ]
    },
    {
      category: "機關檔案管理與文書",
      files: [
        { title: "機關檔案管理作業手冊", date: "107.12", desc: "點收、立案、編目及銷毀。", highlight: false },
        { title: "文書處理手冊", date: "108.11.25", desc: "公文製作、用印及機密處理。", highlight: false }
      ]
    }
  ];

  const mergedGroups = builtInGroups.map(group => ({
    ...group,
    files: [...customFiles.filter(f => f.category === group.category), ...group.files]
  }));

  const totalFilesCount = mergedGroups.reduce((acc, g) => acc + g.files.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="bg-indigo-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold official-font">機關知識庫管理</h2>
            <span className="bg-indigo-800 px-2 py-0.5 rounded-full text-[10px] ml-2 border border-indigo-700">{totalFilesCount} Files</span>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto bg-slate-100 flex-1">
          <div className="mb-6 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800 flex gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <p>系統目前納入 21 份法規檔案。排程時間固定為 <strong>每週一 09:00 TPE</strong>。</p>
          </div>

          <div className="mb-8">
              {!isAdding ? (
                 <button onClick={() => setIsAdding(true)} className="w-full py-3 border-2 border-dashed border-indigo-300 rounded-lg text-indigo-700 font-bold text-sm hover:bg-white transition-all flex items-center justify-center gap-2">
                    <Plus size={16} /> 錄入新公文或函釋
                 </button>
              ) : (
                 <div className="bg-slate-900 p-6 rounded-xl border-2 border-emerald-500/50 shadow-2xl animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                        <h3 className="font-bold text-emerald-400 text-sm flex items-center gap-2"><Upload size={14}/> 錄入新資料</h3>
                        <button onClick={() => setIsAdding(false)} className="text-slate-500 hover:text-white"><X size={16}/></button>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                             <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                             <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-emerald-400">選擇附件</button>
                             {selectedFileName && <span className="text-emerald-400 text-xs font-mono">{selectedFileName}</span>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <input type="text" placeholder="文件標題" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded outline-none" />
                            <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded">
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <input type="text" placeholder="版本日期 (例: 114.03.10)" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded outline-none" />
                        <textarea placeholder="規範要點..." value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-3 py-2 text-sm bg-black text-white border border-slate-800 rounded min-h-[100px] resize-none outline-none" />
                        <button onClick={handleSaveCustomDoc} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-500">確認寫入</button>
                    </div>
                 </div>
              )}
          </div>

          <div className="space-y-8">
            {mergedGroups.map((group, idx) => (
              <div key={idx}>
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><FolderOpen size={14} /> {group.category}</h3>
                <div className="grid grid-cols-1 gap-4">
                  {group.files.map((file, fIdx) => (
                    <div key={fIdx} className={`bg-white p-4 rounded-xl border flex gap-4 relative group ${file.isCustom ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 hover:border-indigo-400'}`}>
                      <div className={`shrink-0 flex items-center justify-center w-12 h-12 rounded-xl ${file.isCustom ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}><FileText size={24} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h4 className="font-bold text-slate-900 text-sm truncate official-font">{file.title}</h4>
                          {file.highlight && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700">最新</span>}
                        </div>
                        <p className="text-xs text-slate-600 mb-2 leading-relaxed line-clamp-2">{file.desc}</p>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded w-fit border"><Calendar size={10} /> <span>版本：{file.date}</span></div>
                      </div>
                      {file.isCustom && <button onClick={() => {}} className="absolute top-3 right-3 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">關閉</button>
        </div>
      </div>
    </div>
  );
};

export default ReferenceFilesModal;