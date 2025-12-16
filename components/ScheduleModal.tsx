
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, UserCircle, Terminal, MessageSquare, ArrowRight, Server, Users, Plus, Trash2, Globe, Sparkles, CheckSquare, Square, Settings, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (type: 'weekly' | 'suspend' | 'general', info: string) => void;
  onRequestRefine?: (text: string) => void;
}

interface Group {
  id: string; 
  name: string;
  groupId: string; 
  isPreset?: boolean;
}

const PRESET_GROUPS: Group[] = [
    { 
        id: 'preset_admin', 
        name: '行政科 (AdminHome)', 
        groupId: 'Cb35ecb9f86b1968dd51e476fdc819655', 
        isPreset: true 
    },
    { 
        id: 'preset_test', 
        name: '測試群 (Test)', 
        groupId: 'C7e04d9539515b89958d12658b938acce', 
        isPreset: true 
    }
];

const DEFAULT_REMOTE_URL = 'https://ah-biao-bot0.vercel.app';

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate, onRequestRefine }) => {
  // Tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');

  // Roster State
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [isSkipWeek, setIsSkipWeek] = useState(false); // 系統內建的暫停 (如春節)
  const [forceSuspend, setForceSuspend] = useState(false); // 手動強制暫停 (如颱風)
  const [customReason, setCustomReason] = useState('');

  // General Announcement State
  const [generalContent, setGeneralContent] = useState('');
  
  // Group Management State
  const [savedGroups, setSavedGroups] = useState<Group[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([PRESET_GROUPS[0].groupId]); 
  
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [idError, setIdError] = useState('');

  // Connection State
  // mode: 'remote' (強制連線到 Vercel), 'local' (連線到同源/api)
  const [connectionMode, setConnectionMode] = useState<'remote' | 'local'>('remote');
  const [remoteUrl, setRemoteUrl] = useState(DEFAULT_REMOTE_URL); 
  const [showDebug, setShowDebug] = useState(false);

  // Manual Trigger State
  const [isTriggering, setIsTriggering] = useState(false);
  const [logs, setLogs] = useState<Array<{time: string, msg: string, success: boolean | null}>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize
  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setPreviewDate(`${yyyy}-${mm}-${dd}`);
      setCustomReason(''); 
      setForceSuspend(false);
      
      // Auto-detect environment preference
      const hostname = window.location.hostname;
      // 只要不是部署在 Vercel 上，就預設使用 Remote 模式，避免本機 404
      if (hostname.includes('vercel.app')) {
          setConnectionMode('local');
      } else {
          setConnectionMode('remote');
      }

      // Load saved groups
      const saved = localStorage.getItem('line_groups_v1');
      if (saved) {
        try { setSavedGroups(JSON.parse(saved)); } catch (e) {}
      }
      
      const savedUrl = localStorage.getItem('remote_api_url');
      if (savedUrl) setRemoteUrl(savedUrl);
    }
  }, [isOpen]);

  // Determine effective duty person
  useEffect(() => {
     if (!previewDate) return;
     const dateObj = new Date(previewDate);
     
     const SKIP_WEEKS = ['2025-01-27', '2026-02-16'];
     const dayOfWeek = dateObj.getDay(); 
     const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
     const monday = new Date(dateObj);
     monday.setDate(dateObj.getDate() + diffToMon);
     const mStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
     
     const systemSkip = SKIP_WEEKS.includes(mStr);
     setIsSkipWeek(systemSkip);

     // 計算邏輯：系統內建暫停 OR 使用者強制暫停
     if (systemSkip) {
         setDutyPerson('暫停 (系統預設)');
         // 如果是系統預設暫停，強制勾選狀態不需要開啟，避免邏輯混亂，但可以讓使用者知道
     } else if (forceSuspend) {
         setDutyPerson('暫停 (手動強制)');
     } else {
         const staffList = ['林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰', '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'];
         const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
         const anchorIndex = 6;
         const oneWeekMs = 604800000;
         const rawDiffTime = dateObj.getTime() - anchorDate.getTime();
         const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);
         let targetIndex = (anchorIndex + rawWeeks) % staffList.length;
         if (targetIndex < 0) targetIndex = targetIndex + staffList.length;
         setDutyPerson(`${staffList[targetIndex]} (預估)`);
     }
  }, [previewDate, forceSuspend]);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const addLog = (msg: string, success: boolean | null = null) => {
    const time = new Date().toLocaleTimeString('zh-TW', {hour12: false});
    setLogs(prev => [...prev, { time, msg, success }]);
  };

  const toggleGroupSelection = (gid: string) => {
     setSelectedGroupIds(prev => {
         if (prev.includes(gid)) return prev.filter(id => id !== gid);
         return [...prev, gid];
     });
  };

  const handleSaveGroup = () => {
      if (!newGroupName.trim() || !newGroupId.trim()) return;
      if (!/^C[0-9a-f]{32}$/.test(newGroupId.trim()) && !/^U[0-9a-f]{32}$/.test(newGroupId.trim())) {
          setIdError('ID 格式錯誤');
          return;
      }
      const newG: Group = {
          id: Date.now().toString(),
          name: newGroupName.trim(),
          groupId: newGroupId.trim()
      };
      const updated = [...savedGroups, newG];
      setSavedGroups(updated);
      localStorage.setItem('line_groups_v1', JSON.stringify(updated));
      setNewGroupName('');
      setNewGroupId('');
      setIsAddingGroup(false);
      setIdError('');
      setSelectedGroupIds(prev => [...prev, newG.groupId]);
  };

  const handleDeleteGroup = (id: string) => {
      if(!window.confirm('確定刪除此群組設定？')) return;
      const updated = savedGroups.filter(g => g.id !== id);
      setSavedGroups(updated);
      localStorage.setItem('line_groups_v1', JSON.stringify(updated));
  };

  const handleTrigger = async () => {
      if (selectedGroupIds.length === 0) {
          alert("請至少選擇一個發送目標群組");
          return;
      }
      
      setIsTriggering(true);
      setLogs([]); 
      addLog('🚀 開始執行手動廣播排程...');
      
      // 判定是否為暫停週：系統內建暫停 OR 手動強制暫停
      const isEffectiveSuspend = isSkipWeek || forceSuspend;
      const isManualSuspendMode = activeTab === 'roster' && isEffectiveSuspend;
      
      let type = 'weekly';
      if (activeTab === 'general') type = 'general';
      else if (isManualSuspendMode) type = 'suspend';
      else type = 'weekly';

      // 檢查強制暫停時的原因必填
      if (isManualSuspendMode && !customReason.trim()) {
          addLog('❌ 錯誤：暫停週請務必填寫「原因」', false);
          alert('請輸入暫停原因 (例如：颱風停班停課)');
          setIsTriggering(false);
          return;
      }

      // 決定 API Base URL
      let baseUrl = '';
      if (connectionMode === 'remote') {
          baseUrl = remoteUrl.replace(/\/$/, ''); // 確保無結尾斜線
      }
      // 若 connectionMode 為 local，baseUrl 為空字串，代表相對路徑

      const apiPath = '/api/cron'; 
      const targetUrl = `${baseUrl}${apiPath}`;
      
      addLog(`正在連線至: ${connectionMode === 'remote' ? baseUrl : '[同源本地]'}`);
      addLog(`目標路徑: ${apiPath}`);
      addLog(`執行模式: ${type} ${forceSuspend ? '(強制暫停)' : ''}`);

      const params = new URLSearchParams();
      params.append('manual', 'true');
      params.append('type', type);
      params.append('date', previewDate);
      params.append('reason', customReason);
      params.append('content', generalContent);
      params.append('groupId', selectedGroupIds.join(','));

      const fullUrl = `${targetUrl}?${params.toString()}`;

      try {
          const res = await fetch(fullUrl, { method: 'GET' });
          
          if (!res.ok) {
               let errorMsg = `HTTP ${res.status} ${res.statusText}`;
               if (res.status === 404) {
                   errorMsg = `404 找不到路徑。請檢查: \n1. Vercel 專案網址是否正確 (${baseUrl})\n2. API 是否已部署`;
               }
               try {
                   const errJson = await res.json();
                   if (errJson.message) errorMsg += ` - ${errJson.message}`;
               } catch (e) {}
               throw new Error(errorMsg);
          }

          const data = await res.json();
          if (data.success) {
              addLog(`✅ 發送成功！已推送至 ${data.sentTo?.length || 0} 個群組`, true);
              if (data.errors) {
                  data.errors.forEach((err: string) => addLog(`⚠️ 部分失敗: ${err}`, false));
              }
              
              let infoText = "";
              if (type === 'weekly') infoText = dutyPerson;
              else if (type === 'suspend') infoText = customReason || "特殊事由";
              else infoText = generalContent;
              
              onGenerate(type as any, infoText);
              setTimeout(() => onClose(), 3000);
          } else {
              throw new Error(data.message || '未知錯誤');
          }

      } catch (error: any) {
          console.error(error);
          addLog(`❌ 執行失敗: ${error.message}`, false);
      } finally {
          setIsTriggering(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <div>
                 <h2 className="text-lg font-bold tracking-wide official-font">排程廣播控制台</h2>
                 <p className="text-[10px] text-slate-400 opacity-80">CRON JOB MANAGER</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-full transition-colors"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* Left Panel: Settings & Input */}
            <div className="w-full md:w-2/3 flex flex-col bg-slate-50 border-r border-slate-200">
                <div className="flex-1 overflow-y-auto p-6">
                    
                    {/* Connection Config Toggle */}
                    <div className="mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <Settings size={16} className="text-slate-500"/>
                                <span className="text-xs font-bold text-slate-700">API 連線設定</span>
                             </div>
                             <div className="flex bg-slate-100 rounded p-1">
                                 <button 
                                     onClick={() => setConnectionMode('local')}
                                     className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'local' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                 >
                                     同源 (Local)
                                 </button>
                                 <button 
                                     onClick={() => setConnectionMode('remote')}
                                     className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'remote' ? 'bg-white shadow text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                                 >
                                     雲端 (Remote)
                                 </button>
                             </div>
                         </div>
                         
                         {connectionMode === 'remote' && (
                             <div className="mt-3 animate-in fade-in slide-in-from-top-1">
                                 <label className="block text-[10px] text-slate-500 mb-1">Vercel 專案網址 (無需 /api 結尾)</label>
                                 <div className="flex gap-2">
                                     <input 
                                         type="text" 
                                         value={remoteUrl} 
                                         onChange={e => setRemoteUrl(e.target.value)}
                                         className="flex-1 px-3 py-1.5 text-xs border rounded bg-slate-50 text-slate-900 font-mono"
                                         placeholder="https://your-project.vercel.app"
                                     />
                                     <button 
                                         onClick={() => { localStorage.setItem('remote_api_url', remoteUrl); alert('已儲存'); }}
                                         className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs hover:bg-slate-300"
                                     >
                                         儲存
                                     </button>
                                 </div>
                                 <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                                    <CheckSquare size={10} /> 將強制發送請求至此網址
                                 </p>
                             </div>
                         )}
                         {connectionMode === 'local' && (
                             <p className="text-[10px] text-slate-400 mt-2 px-1">
                                 * 僅適用於已部署至 Vercel 的環境，或本地有啟動 API Server 時使用。
                             </p>
                         )}
                    </div>

                    {/* Target Groups */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                <Users size={14} /> 發送目標群組
                            </label>
                            {!isAddingGroup && (
                                <button onClick={() => setIsAddingGroup(true)} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800">
                                    <Plus size={12} /> 新增
                                </button>
                            )}
                        </div>
                        
                        {isAddingGroup && (
                            <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm mb-3">
                                <div className="space-y-2">
                                    <input type="text" placeholder="群組名稱" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded"/>
                                    <input type="text" placeholder="Line Group ID (U... or C...)" value={newGroupId} onChange={e => setNewGroupId(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded font-mono"/>
                                    {idError && <p className="text-[10px] text-red-500">{idError}</p>}
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setIsAddingGroup(false)} className="px-2 py-1 text-xs text-slate-500">取消</button>
                                        <button onClick={handleSaveGroup} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded">儲存</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {[...PRESET_GROUPS, ...savedGroups].map(group => {
                                const isSelected = selectedGroupIds.includes(group.groupId);
                                return (
                                    <div key={group.id} 
                                         onClick={() => toggleGroupSelection(group.groupId)}
                                         className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all select-none
                                         ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-900' : 'bg-white border-slate-200 text-slate-500'}`}>
                                        <div className="flex items-center gap-2">
                                            {isSelected ? <CheckSquare size={14} className="text-indigo-600"/> : <Square size={14} />}
                                            <span className="text-xs font-medium">{group.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono opacity-50">{group.groupId.substring(0, 4)}...</span>
                                            {!group.isPreset && (
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }} className="text-slate-300 hover:text-red-500 p-1">
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-slate-200 rounded-lg p-1 mb-4">
                        <button 
                            onClick={() => setActiveTab('roster')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
                            ${activeTab === 'roster' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <UserCircle size={14} /> 科務會議輪值
                        </button>
                        <button 
                             onClick={() => setActiveTab('general')}
                             className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold transition-all
                             ${activeTab === 'general' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <MessageSquare size={14} /> 一般公告
                        </button>
                    </div>

                    {/* Content Input */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[200px]">
                        {activeTab === 'roster' ? (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-500">預定發送日期</label>
                                    <input type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} className="w-full px-3 py-2 text-sm border rounded bg-white text-slate-900"/>
                                </div>
                                <div className={`p-3 rounded border transition-colors ${forceSuspend || isSkipWeek ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-xs ${forceSuspend || isSkipWeek ? 'text-red-700 font-bold' : 'text-slate-500'}`}>
                                            系統推算輪值人員
                                        </span>
                                        {isSkipWeek && <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-bold">系統內建暫停</span>}
                                    </div>
                                    <div className={`font-bold text-lg ${forceSuspend || isSkipWeek ? 'text-red-600' : 'text-slate-800'}`}>
                                        {dutyPerson}
                                    </div>
                                </div>
                                
                                {/* 突發暫停開關 */}
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-50 border border-orange-100 cursor-pointer" onClick={() => !isSkipWeek && setForceSuspend(!forceSuspend)}>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center bg-white ${forceSuspend ? 'border-orange-500' : 'border-slate-300'}`}>
                                         {forceSuspend && <div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-orange-800 flex items-center gap-1">
                                            <ShieldAlert size={12}/> 
                                            突發狀況 (強制暫停)
                                        </div>
                                        <div className="text-[10px] text-orange-600 opacity-80">
                                            如遇颱風、天災，請勾選此項並填寫下方原因。
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-500">
                                        {(isSkipWeek || forceSuspend) ? '暫停原因 (必填)' : '特殊備註 (選填)'}
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder={(isSkipWeek || forceSuspend) ? "請輸入原因 (例：凱米颱風停班停課)..." : "例：如遇颱風順延..."} 
                                        value={customReason} 
                                        onChange={e => setCustomReason(e.target.value)} 
                                        className={`w-full px-3 py-2 text-sm border rounded bg-white text-slate-900 ${(isSkipWeek || forceSuspend) && !customReason ? 'border-red-300 focus:border-red-500' : ''}`}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 h-full flex flex-col">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-500">公告內容</label>
                                    {onRequestRefine && generalContent && (
                                        <button onClick={() => onRequestRefine(generalContent)} className="text-[10px] flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors">
                                            <Sparkles size={10} /> AI 潤飾
                                        </button>
                                    )}
                                </div>
                                <textarea 
                                    value={generalContent}
                                    onChange={e => setGeneralContent(e.target.value)}
                                    placeholder="請輸入公告內容..."
                                    className="w-full flex-1 min-h-[120px] px-3 py-2 text-sm border rounded resize-none bg-white text-slate-900 focus:border-indigo-500 outline-none"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 bg-white">
                    <button 
                        onClick={handleTrigger}
                        disabled={isTriggering || (activeTab === 'general' && !generalContent.trim())}
                        className={`w-full py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all
                        ${isTriggering 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
                    >
                         {isTriggering ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                         {isTriggering ? '發送中 (Transmitting)...' : '確認發送廣播 (Execute)'}
                    </button>
                </div>
            </div>

            {/* Right Panel: Classic Console (Black, Full Height, No Header) */}
            <div className="hidden md:flex flex-col md:w-1/3 bg-black text-emerald-500 font-mono text-xs z-10 border-l border-slate-700">
                <div className="p-2 bg-gray-900 border-b border-gray-800 text-gray-500 text-[10px] flex justify-between">
                    <span>TERMINAL OUT</span>
                    <span className={connectionMode === 'remote' ? 'text-orange-400' : 'text-blue-400'}>
                         MODE: {connectionMode.toUpperCase()}
                    </span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent font-medium">
                    {logs.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 text-gray-500">
                            <Terminal size={32} />
                            <p className="text-sm">Awaiting Command...</p>
                            <div className="text-[10px] text-center max-w-[200px] border border-gray-700 p-2 rounded">
                                Target:<br/>
                                {connectionMode === 'remote' ? remoteUrl : '[Localhost/Relative]'}
                            </div>
                        </div>
                    )}
                    {logs.map((log, idx) => (
                        <div key={idx} className={`flex gap-2 leading-relaxed ${log.success === false ? 'text-red-500' : (log.success === true ? 'text-emerald-400' : 'text-gray-300')}`}>
                            <span className="opacity-50 shrink-0">[{log.time}]</span>
                            <span className="break-all whitespace-pre-wrap">{log.msg}</span>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
