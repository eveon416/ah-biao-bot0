
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, UserCircle, Terminal, MessageSquare, ArrowRight, Server, Users, Plus, Trash2, Laptop2, Sparkles, CheckSquare, Square, Globe } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 通知父層生成公告
  onGenerate: (type: 'weekly' | 'suspend' | 'general', info: string) => void;
  // 請求父層幫忙潤飾文字
  onRequestRefine?: (text: string) => void;
}

interface Group {
  id: string; // 識別用 (時間戳或固定字串)
  name: string;
  groupId: string; // LINE Group ID
  isPreset?: boolean;
}

// 預設群組定義
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

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate, onRequestRefine }) => {
  // Tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');

  // Roster State
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [isSkipWeek, setIsSkipWeek] = useState(false);
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

  // Environment State
  const [isLocalhost, setIsLocalhost] = useState(false);
  // 預設直接填入您的專案網址，方便本機測試
  const [remoteUrl, setRemoteUrl] = useState('https://ah-biao-bot0.vercel.app'); 
  const [showConfig, setShowConfig] = useState(false);

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
      
      // Detect Environment
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || 
                      hostname === '127.0.0.1' || 
                      hostname.startsWith('192.168.') ||
                      hostname === '0.0.0.0';
      setIsLocalhost(isLocal);
      
      // Load saved groups
      const saved = localStorage.getItem('line_groups_v1');
      let loadedGroups: Group[] = [];
      if (saved) {
        try {
           loadedGroups = JSON.parse(saved);
        } catch (e) {
           console.error("Failed to load custom groups", e);
        }
      }
      setSavedGroups(loadedGroups);
      
      // Load remote URL if saved, otherwise keep the default
      const savedUrl = localStorage.getItem('remote_api_url');
      if (savedUrl) setRemoteUrl(savedUrl);
      
      // 若在本機，預設展開設定讓使用者確認網址
      if (isLocal) setShowConfig(true);
    }
  }, [isOpen]);

  // Determine effective duty person when date changes
  useEffect(() => {
     if (!previewDate) return;
     const dateObj = new Date(previewDate);
     
     // 1. Check Skip
     const SKIP_WEEKS = ['2025-01-27', '2026-02-16'];
     const dayOfWeek = dateObj.getDay(); 
     const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
     const monday = new Date(dateObj);
     monday.setDate(dateObj.getDate() + diffToMon);
     const mStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
     
     const skip = SKIP_WEEKS.includes(mStr);
     setIsSkipWeek(skip);

     // 2. Calculate Person
     if (skip) {
         setDutyPerson('暫停 (自動)');
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
  }, [previewDate]);

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
          setIdError('ID 格式錯誤 (應為 C 或 U 開頭的 33 碼字串)');
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

  const handleSaveRemoteUrl = () => {
      let url = remoteUrl.trim();
      if (url && !url.startsWith('http')) {
          url = 'https://' + url;
      }
      url = url.replace(/\/$/, '');
      
      setRemoteUrl(url);
      localStorage.setItem('remote_api_url', url);
      setShowConfig(false);
      addLog(`已儲存遠端網址: ${url}`, true);
  };

  // === 核心功能：手動觸發排程 ===
  const handleTrigger = async () => {
      if (selectedGroupIds.length === 0) {
          alert("請至少選擇一個發送目標群組");
          return;
      }
      
      // 本機環境防呆
      if (isLocalhost && !remoteUrl) {
          alert("【環境設定錯誤】\n本機環境無法直接發送，請先確認「遠端 API 網址」已設定為您的 Vercel 網址。");
          setShowConfig(true);
          return;
      }

      setIsTriggering(true);
      setLogs([]); 
      addLog('🚀 開始執行手動廣播排程...');
      
      const isManualSuspend = activeTab === 'roster' && isSkipWeek;
      
      let type = 'weekly';
      if (activeTab === 'general') type = 'general';
      else if (isManualSuspend) type = 'suspend';
      else type = 'weekly';

      // Construct URL
      const apiPath = '/api/cron'; 
      // 若在本機且有設定 remoteUrl，則使用 remoteUrl；否則使用相對路徑 (同源)
      const baseUrl = (isLocalhost && remoteUrl) ? remoteUrl : '';
      const targetUrl = `${baseUrl}${apiPath}`;

      if (isLocalhost) {
          addLog(`正在連線至遠端 API: ${baseUrl}`);
      } else {
          addLog(`正在連線至 [同源] 後端 API...`);
      }
      
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
                   errorMsg = "找不到 API (404)。請確認網址正確且已部署至 Vercel。";
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
              
              setTimeout(() => {
                  onClose();
              }, 2500);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <div>
                 <h2 className="text-lg font-bold tracking-wide official-font">排程廣播控制台</h2>
                 <p className="text-[10px] text-emerald-200 opacity-80">CRON JOB MANAGER</p>
            </div>
          </div>
          <button onClick={onClose} className="text-emerald-200 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* Left Panel: Controls */}
            <div className="w-full md:w-2/3 p-6 overflow-y-auto border-r border-slate-100 bg-slate-50">
                
                {/* Localhost Config */}
                {isLocalhost && (
                    <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
                         <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2 text-orange-800 font-bold text-xs">
                                 <Laptop2 size={14} />
                                 <span>本機開發模式 (Localhost)</span>
                             </div>
                             <button onClick={() => setShowConfig(!showConfig)} className="text-[10px] text-orange-600 underline">
                                 {showConfig ? '隱藏設定' : '設定遠端網址'}
                             </button>
                         </div>
                         
                         {showConfig && (
                             <div className="bg-white p-2 rounded border border-orange-200 animate-in fade-in slide-in-from-top-1">
                                 <label className="block text-[10px] text-slate-500 mb-1">
                                     請輸入您的 Vercel 專案網址 (以連線至雲端 API):
                                 </label>
                                 <div className="flex gap-2">
                                     <div className="flex-1 relative">
                                        <Globe size={14} className="absolute left-2 top-1.5 text-slate-400"/>
                                        <input 
                                            type="text" 
                                            value={remoteUrl} 
                                            onChange={e => setRemoteUrl(e.target.value)}
                                            className="w-full pl-7 pr-2 py-1 border rounded text-xs bg-white text-slate-900 font-mono"
                                            placeholder="https://ah-biao-bot0.vercel.app"
                                        />
                                     </div>
                                     <button onClick={handleSaveRemoteUrl} className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700">確認</button>
                                 </div>
                                 <p className="text-[10px] text-orange-400 mt-1">* 系統已預填為您的專案網址，確認無誤後請按確認。</p>
                             </div>
                         )}
                    </div>
                )}

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
                        <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm mb-3 animate-in fade-in slide-in-from-top-1">
                            <div className="space-y-2">
                                <input type="text" placeholder="群組名稱 (例: 會計室)" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded bg-white text-slate-900"/>
                                <input type="text" placeholder="Line Group ID (U... or C...)" value={newGroupId} onChange={e => setNewGroupId(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded font-mono bg-white text-slate-900"/>
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
                                     ${isSelected ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                    <div className="flex items-center gap-2">
                                        {isSelected ? <CheckSquare size={14} className="text-emerald-600"/> : <Square size={14} />}
                                        <span className="text-xs font-medium">{group.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono opacity-50">{group.groupId.substring(0, 4)}...</span>
                                        {!group.isPreset && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                                                className="text-slate-300 hover:text-red-500 p-1"
                                            >
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

                {/* Content Area */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm min-h-[200px]">
                    {activeTab === 'roster' ? (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-500">預定發送日期 (Date)</label>
                                <input 
                                    type="date" 
                                    value={previewDate}
                                    onChange={e => setPreviewDate(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border rounded focus:border-indigo-500 outline-none bg-white text-slate-900"
                                />
                            </div>
                            
                            <div className="p-3 bg-slate-50 rounded border border-slate-200">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-500">系統推算輪值人員</span>
                                    {isSkipWeek && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">暫停週</span>}
                                </div>
                                <div className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                    {dutyPerson}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-500">
                                        {isSkipWeek ? '暫停原因 (必填)' : '特殊備註 (選填)'}
                                    </label>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder={isSkipWeek ? "例：春節連假、颱風停班..." : "例：如遇颱風順延..."}
                                    value={customReason}
                                    onChange={e => setCustomReason(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border rounded focus:border-indigo-500 outline-none bg-white text-slate-900"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 h-full flex flex-col">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-500">公告內容 (支援純文字)</label>
                                {onRequestRefine && generalContent && (
                                    <button 
                                        onClick={() => onRequestRefine(generalContent)}
                                        className="text-[10px] flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors"
                                    >
                                        <Sparkles size={10} /> AI 潤飾 (請阿標幫忙)
                                    </button>
                                )}
                            </div>
                            <textarea 
                                value={generalContent}
                                onChange={e => setGeneralContent(e.target.value)}
                                placeholder="請輸入要廣播給所有人的公告事項..."
                                className="w-full flex-1 min-h-[120px] px-3 py-2 text-sm border rounded focus:border-indigo-500 outline-none resize-none bg-white text-slate-900"
                            />
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <button 
                        onClick={handleTrigger}
                        disabled={isTriggering || (activeTab === 'general' && !generalContent.trim())}
                        className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all
                        ${isTriggering 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
                    >
                         {isTriggering ? <Server size={18} className="animate-pulse" /> : <ArrowRight size={18} />}
                         {isTriggering ? '正在連線發送...' : '立即發送廣播 (Execute)'}
                    </button>
                </div>

            </div>

            {/* Right Panel: Full Height Console (Classic Black) */}
            <div className="hidden md:flex flex-col md:w-1/3 border-l border-slate-200 bg-black text-gray-200 font-mono text-xs z-10 h-full">
                <div className="p-3 border-b border-gray-800 bg-gray-900 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-green-400" />
                        <span className="font-bold text-white">System Console</span>
                    </div>
                    <div className="flex gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-50"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-50"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                    </div>
                </div>
                <div className="flex-1 p-4 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {logs.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center opacity-30 gap-2 text-gray-500">
                            <Server size={24} />
                            <p>Ready to transmit.</p>
                            <p className="text-[10px] text-center max-w-[150px]">
                                {isLocalhost 
                                    ? `Target: ${remoteUrl || 'Not Set'}` 
                                    : 'Target: Local API'}
                            </p>
                        </div>
                    )}
                    {logs.map((log, idx) => (
                        <div key={idx} className={`flex gap-3 ${log.success === false ? 'text-red-400 font-bold' : (log.success === true ? 'text-green-400 font-bold' : 'text-gray-300')}`}>
                            <span className="text-gray-600 shrink-0">[{log.time}]</span>
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
