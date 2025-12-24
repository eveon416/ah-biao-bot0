
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, UserCircle, Terminal, MessageSquare, ArrowRight, Server, Users, Plus, Trash2, Globe, Sparkles, CheckSquare, Square, Settings, RefreshCw, AlertCircle, ShieldAlert, Edit3, Sliders, UserPlus, Minus, CalendarDays, ListOrdered, CalendarCheck } from 'lucide-react';

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

interface ScheduledTask {
  id: string;
  type: 'weekly' | 'suspend' | 'general';
  targetDate: string; // YYYY-MM-DD
  targetTime: string; // HH:mm
  info: string;
  targetGroupNames: string[];
  createdAt: string;
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

const DEFAULT_STAFF_LIST = ['林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰', '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'];

const DEFAULT_REMOTE_URL = 'https://ah-biao-bot0.vercel.app';

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate, onRequestRefine }) => {
  // Tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');

  // Staff Management State
  const [staffList, setStaffList] = useState<string[]>(DEFAULT_STAFF_LIST);
  const [isManageStaffOpen, setIsManageStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');

  // Roster State
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [overridePerson, setOverridePerson] = useState<string>(''); // 手動指定的人員
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0); // 校正偏移量 (週)
  
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

  // Scheduling State
  const [isScheduleMode, setIsScheduleMode] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('08:30');
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);

  // Connection State
  const [connectionMode, setConnectionMode] = useState<'remote' | 'local'>('remote');
  const [remoteUrl, setRemoteUrl] = useState(DEFAULT_REMOTE_URL); 

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
      setOverridePerson('');
      setIsScheduleMode(false);
      
      // Load settings from localStorage
      const savedOffset = localStorage.getItem('roster_calibration_offset');
      setCalibrationOffset(savedOffset ? parseInt(savedOffset, 10) || 0 : 0);

      const savedStaff = localStorage.getItem('roster_staff_list');
      if (savedStaff) {
          try { setStaffList(JSON.parse(savedStaff)); } catch(e) {}
      } else {
          setStaffList(DEFAULT_STAFF_LIST);
      }

      const savedTasks = localStorage.getItem('scheduled_tasks_v1');
      if (savedTasks) {
          try { setScheduledTasks(JSON.parse(savedTasks)); } catch(e) {}
      }

      const hostname = window.location.hostname;
      if (hostname.includes('vercel.app')) {
          setConnectionMode('local');
      } else {
          setConnectionMode('remote');
      }

      const savedGroupsData = localStorage.getItem('line_groups_v1');
      if (savedGroupsData) {
        try { setSavedGroups(JSON.parse(savedGroupsData)); } catch (e) {}
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

     if (systemSkip) {
         setDutyPerson('暫停 (系統預設)');
     } else if (forceSuspend) {
         setDutyPerson('暫停 (手動強制)');
     } else {
         const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
         const anchorIndex = 6;
         const oneWeekMs = 604800000;
         const rawDiffTime = dateObj.getTime() - anchorDate.getTime();
         const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);
         
         // Apply calibration offset locally for preview
         const totalWeeks = rawWeeks + calibrationOffset;

         let targetIndex = (anchorIndex + totalWeeks) % staffList.length;
         if (targetIndex < 0) targetIndex = targetIndex + staffList.length;
         setDutyPerson(`${staffList[targetIndex]} (系統預估)`);
     }
  }, [previewDate, forceSuspend, calibrationOffset, staffList]);

  const handleCalibrationChange = (delta: number) => {
      const newOffset = calibrationOffset + delta;
      setCalibrationOffset(newOffset);
      localStorage.setItem('roster_calibration_offset', newOffset.toString());
  };

  const handleSetOverrideAsAnchor = () => {
      if (!overridePerson || !previewDate) return;
      if (!window.confirm(`確定要將「${overridePerson}」設為本週 (${previewDate}) 的起始點嗎？\n此操作將會重置整個輪值順序，未來將依此順序遞延。`)) return;

      const dateObj = new Date(previewDate);
      const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
      const anchorIndex = 6; 
      const oneWeekMs = 604800000;
      const rawDiffTime = dateObj.getTime() - anchorDate.getTime();
      const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);

      const targetIndex = staffList.indexOf(overridePerson);
      if (targetIndex === -1) return;

      let newOffset = (targetIndex - anchorIndex - rawWeeks) % staffList.length;
      if (newOffset < 0) newOffset += staffList.length;
      if (newOffset > staffList.length / 2) newOffset -= staffList.length;

      setCalibrationOffset(newOffset);
      localStorage.setItem('roster_calibration_offset', newOffset.toString());
      setOverridePerson(''); 
      alert(`已重置順序！偏移量更新為: ${newOffset} 週`);
  };

  const handleAddStaff = () => {
      if (!newStaffName.trim()) return;
      const updated = [...staffList, newStaffName.trim()];
      setStaffList(updated);
      localStorage.setItem('roster_staff_list', JSON.stringify(updated));
      setNewStaffName('');
  };

  const handleDeleteStaff = (index: number) => {
      if (!window.confirm('確定移除此人員？')) return;
      const updated = staffList.filter((_, i) => i !== index);
      setStaffList(updated);
      localStorage.setItem('roster_staff_list', JSON.stringify(updated));
  };

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

  const handleAddToQueue = () => {
    if (selectedGroupIds.length === 0) {
        alert("請至少選擇一個發送目標群組");
        return;
    }

    const isEffectiveSuspend = isSkipWeek || (forceSuspend && !overridePerson);
    const isManualSuspendMode = activeTab === 'roster' && isEffectiveSuspend;
    
    let type: 'weekly' | 'suspend' | 'general' = 'weekly';
    if (activeTab === 'general') type = 'general';
    else if (isManualSuspendMode) type = 'suspend';
    else type = 'weekly';

    if (isManualSuspendMode && !customReason.trim()) {
        alert('請輸入暫停原因 (例如：颱風停班停課)');
        return;
    }

    const allGroups = [...PRESET_GROUPS, ...savedGroups];
    const groupNames = selectedGroupIds.map(id => allGroups.find(g => g.groupId === id)?.name || id);

    let infoText = "";
    if (type === 'weekly') infoText = overridePerson || dutyPerson;
    else if (type === 'suspend') infoText = customReason || "特殊事由";
    else infoText = generalContent;

    const newTask: ScheduledTask = {
      id: Date.now().toString(),
      type,
      targetDate: previewDate,
      targetTime: scheduleTime,
      info: infoText,
      targetGroupNames: groupNames,
      createdAt: new Date().toISOString()
    };

    const updated = [...scheduledTasks, newTask];
    setScheduledTasks(updated);
    localStorage.setItem('scheduled_tasks_v1', JSON.stringify(updated));
    addLog(`📅 已將任務加入預約佇列：${newTask.targetDate} ${newTask.targetTime}`);
    setIsScheduleMode(false);
  };

  const handleDeleteTask = (taskId: string) => {
    if (!window.confirm('確定刪除此預約任務？')) return;
    const updated = scheduledTasks.filter(t => t.id !== taskId);
    setScheduledTasks(updated);
    localStorage.setItem('scheduled_tasks_v1', JSON.stringify(updated));
    addLog(`🗑️ 已移除預約任務：${taskId.substring(0,6)}`);
  };

  const handleTrigger = async () => {
      if (isScheduleMode) {
          handleAddToQueue();
          return;
      }

      if (selectedGroupIds.length === 0) {
          alert("請至少選擇一個發送目標群組");
          return;
      }
      
      setIsTriggering(true);
      setLogs([]); 
      addLog('🚀 開始執行手動廣播排程...');
      
      const isEffectiveSuspend = isSkipWeek || (forceSuspend && !overridePerson);
      const isManualSuspendMode = activeTab === 'roster' && isEffectiveSuspend;
      
      let type = 'weekly';
      if (activeTab === 'general') type = 'general';
      else if (isManualSuspendMode) type = 'suspend';
      else type = 'weekly';

      if (isManualSuspendMode && !customReason.trim()) {
          addLog('❌ 錯誤：暫停週請務必填寫「原因」', false);
          alert('請輸入暫停原因 (例如：颱風停班停課)');
          setIsTriggering(false);
          return;
      }

      let baseUrl = '';
      if (connectionMode === 'remote') {
          baseUrl = remoteUrl.replace(/\/$/, ''); 
      }

      const apiPath = '/api/cron'; 
      const targetUrl = `${baseUrl}${apiPath}`;
      
      addLog(`正在連線至: ${connectionMode === 'remote' ? baseUrl : '[同源本地]'}`);
      addLog(`執行模式: ${type}`);
      if (type === 'weekly' && calibrationOffset !== 0) {
          addLog(`🔧 輪值校正: ${calibrationOffset > 0 ? '+' : ''}${calibrationOffset} 週`);
      }
      if (type === 'weekly' && overridePerson) {
          addLog(`📝 指定人員: ${overridePerson}`);
      }

      const params = new URLSearchParams();
      params.append('manual', 'true');
      params.append('type', type);
      params.append('date', previewDate);
      params.append('reason', customReason);
      params.append('content', generalContent);
      params.append('groupId', selectedGroupIds.join(','));
      
      if (calibrationOffset !== 0) {
          params.append('shift', calibrationOffset.toString());
      }
      
      if (type === 'weekly' && overridePerson) {
          params.append('person', overridePerson);
      }

      params.append('staffList', staffList.join(','));

      const fullUrl = `${targetUrl}?${params.toString()}`;

      try {
          const res = await fetch(fullUrl, { method: 'GET' });
          
          if (!res.ok) {
               let errorMsg = `HTTP ${res.status} ${res.statusText}`;
               if (res.status === 404) {
                   errorMsg = `404 找不到路徑。請檢查網址或部署狀態`;
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
              if (type === 'weekly') infoText = overridePerson || dutyPerson;
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
      <div className="bg-white w-full max-w-6xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <div>
                 <h2 className="text-lg font-bold tracking-wide official-font">排程廣播控制台</h2>
                 <p className="text-[10px] text-slate-400 opacity-80">CRON JOB MANAGER (ADVANCED)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-full transition-colors"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* Left Panel: Settings & Input */}
            <div className="w-full md:w-[60%] flex flex-col bg-slate-50 border-r border-slate-200">
                <div className="flex-1 overflow-y-auto p-6">
                    
                    {/* Connection Config */}
                    <div className="mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <Settings size={16} className="text-slate-500"/>
                                <span className="text-xs font-bold text-slate-700">API 連線設定</span>
                             </div>
                             <div className="flex bg-slate-100 rounded p-1">
                                 <button onClick={() => setConnectionMode('local')} className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'local' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>同源</button>
                                 <button onClick={() => setConnectionMode('remote')} className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'remote' ? 'bg-white shadow text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}>雲端</button>
                             </div>
                         </div>
                         {connectionMode === 'remote' && (
                             <div className="mt-3">
                                 <div className="flex gap-2">
                                     <input type="text" value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} className="flex-1 px-3 py-1.5 text-xs border rounded bg-slate-50 text-slate-900 font-mono" placeholder="Vercel App URL"/>
                                     <button onClick={() => { localStorage.setItem('remote_api_url', remoteUrl); alert('已儲存'); }} className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs">儲存</button>
                                 </div>
                             </div>
                         )}
                    </div>

                    {/* Target Groups */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Users size={14} /> 發送目標群組</label>
                            {!isAddingGroup && <button onClick={() => setIsAddingGroup(true)} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><Plus size={12} /> 新增</button>}
                        </div>
                        {isAddingGroup && (
                            <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm mb-3 space-y-2">
                                <input type="text" placeholder="群組名稱" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded"/>
                                <input type="text" placeholder="Line Group ID" value={newGroupId} onChange={e => setNewGroupId(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded font-mono"/>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setIsAddingGroup(false)} className="px-2 py-1 text-xs text-slate-500">取消</button>
                                    <button onClick={handleSaveGroup} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded">儲存</button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {[...PRESET_GROUPS, ...savedGroups].map(group => {
                                const isSelected = selectedGroupIds.includes(group.groupId);
                                return (
                                    <div key={group.id} onClick={() => toggleGroupSelection(group.groupId)} className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-900' : 'bg-white border-slate-200 text-slate-500'}`}>
                                        <div className="flex items-center gap-2">
                                            {isSelected ? <CheckSquare size={14} className="text-indigo-600"/> : <Square size={14} />}
                                            <span className="text-xs font-medium">{group.name}</span>
                                        </div>
                                        <span className="text-[10px] font-mono opacity-50">{group.groupId.substring(0, 4)}...</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-slate-200 rounded-lg p-1 mb-4">
                        <button onClick={() => setActiveTab('roster')} className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 ${activeTab === 'roster' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}><UserCircle size={14} /> 科務會議輪值</button>
                        <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}><MessageSquare size={14} /> 一般公告</button>
                    </div>

                    {/* Content Area */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        {activeTab === 'roster' ? (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-500">日期</label>
                                    <input type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} className="w-full px-3 py-2 text-sm border rounded"/>
                                </div>
                                <div className={`p-3 rounded border ${forceSuspend || isSkipWeek ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="text-[10px] font-bold text-slate-400 mb-1">推算輪值</div>
                                    <div className="font-bold text-lg text-slate-800">{overridePerson || dutyPerson}</div>
                                    <div className="mt-2 flex gap-2">
                                        <select value={overridePerson} onChange={e => {setOverridePerson(e.target.value); if(e.target.value) setForceSuspend(false);}} className="flex-1 px-2 py-1.5 text-xs border rounded">
                                            <option value="">-- 使用推算 --</option>
                                            {staffList.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 p-2 rounded-lg border border-orange-100 bg-orange-50 cursor-pointer" onClick={() => !overridePerson && !isSkipWeek && setForceSuspend(!forceSuspend)}>
                                    <div className={`w-4 h-4 rounded border bg-white flex items-center justify-center ${forceSuspend ? 'border-orange-500' : 'border-slate-300'}`}>
                                        {forceSuspend && <div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div>}
                                    </div>
                                    <span className="text-xs font-bold text-orange-800">突發強制暫停</span>
                                </div>
                                <input type="text" placeholder="原因/備註" value={customReason} onChange={e => setCustomReason(e.target.value)} className="w-full px-3 py-2 text-sm border rounded"/>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <textarea value={generalContent} onChange={e => setGeneralContent(e.target.value)} placeholder="公告內容..." className="w-full min-h-[120px] px-3 py-2 text-sm border rounded resize-none outline-none"/>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-6 border-t border-slate-200 bg-white space-y-4">
                    <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-indigo-600" />
                            <div>
                                <div className="text-xs font-bold text-indigo-900">預約發送模式</div>
                                <div className="text-[10px] text-indigo-600">將任務存入本機排程佇列中</div>
                            </div>
                        </div>
                        <button onClick={() => setIsScheduleMode(!isScheduleMode)} className={`w-12 h-6 rounded-full transition-all relative ${isScheduleMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isScheduleMode ? 'left-7' : 'left-1'}`}></div>
                        </button>
                    </div>

                    {isScheduleMode && (
                        <div className="p-3 bg-white border border-indigo-200 rounded-lg flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2">
                             <div className="flex-1">
                                 <label className="text-[10px] font-bold text-slate-500 block mb-1">預約發送時間</label>
                                 <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm"/>
                             </div>
                             <div className="flex-1">
                                 <label className="text-[10px] font-bold text-slate-500 block mb-1">預約發送日期</label>
                                 <div className="text-xs font-bold text-slate-800 py-1.5">{previewDate}</div>
                             </div>
                        </div>
                    )}

                    <button 
                        onClick={handleTrigger}
                        disabled={isTriggering || (activeTab === 'general' && !generalContent.trim())}
                        className={`w-full py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all
                        ${isTriggering ? 'bg-slate-100 text-slate-400' : (isScheduleMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white')}`}
                    >
                         {isTriggering ? <RefreshCw size={18} className="animate-spin" /> : (isScheduleMode ? <CalendarCheck size={18} /> : <ArrowRight size={18} />)}
                         {isTriggering ? '執行中...' : (isScheduleMode ? '加入預約排程佇列' : '確認發送廣播 (立刻)' )}
                    </button>
                </div>
            </div>

            {/* Right Panel: Split Console */}
            <div className="hidden md:flex flex-col md:w-[40%] bg-black font-mono text-xs z-10 border-l border-slate-700">
                
                {/* Upper: Terminal Logs */}
                <div className="h-1/2 flex flex-col border-b border-slate-800 overflow-hidden">
                    <div className="p-2 bg-slate-900 border-b border-gray-800 text-emerald-500 text-[10px] flex justify-between shrink-0">
                        <span className="flex items-center gap-1"><Terminal size={10}/> TERMINAL OUT</span>
                        <span className="opacity-50">{connectionMode.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto space-y-1 text-emerald-500/90">
                        {logs.length === 0 && <div className="text-gray-700 opacity-30 text-center mt-10 italic">Awaiting actions...</div>}
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex gap-2 ${log.success === false ? 'text-red-500' : (log.success === true ? 'text-emerald-400' : 'text-gray-300')}`}>
                                <span className="opacity-40">[{log.time}]</span>
                                <span className="break-all">{log.msg}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

                {/* Lower: Pending Scheduled Tasks */}
                <div className="h-1/2 flex flex-col overflow-hidden bg-slate-950">
                    <div className="p-2 bg-slate-900 border-b border-slate-800 text-amber-500 text-[10px] flex justify-between shrink-0">
                        <span className="flex items-center gap-1"><ListOrdered size={10}/> PENDING SCHEDULES (預排佇列)</span>
                        <span className="text-slate-500">{scheduledTasks.length} Tasks</span>
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto space-y-3">
                        {scheduledTasks.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 text-slate-500 text-center p-4">
                                <CalendarDays size={32} className="mb-2"/>
                                <p>目前無預約排程</p>
                            </div>
                        )}
                        {scheduledTasks.map((task) => (
                            <div key={task.id} className="bg-slate-900 border border-slate-800 rounded p-2.5 relative group hover:border-amber-900/50 transition-colors">
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-1.5 py-0.5 rounded-[3px] text-[8px] font-bold uppercase ${
                                            task.type === 'weekly' ? 'bg-indigo-900 text-indigo-300' : 
                                            task.type === 'suspend' ? 'bg-red-900 text-red-300' : 'bg-emerald-900 text-emerald-300'
                                        }`}>
                                            {task.type}
                                        </span>
                                        <span className="text-amber-500 font-bold text-[10px] flex items-center gap-1">
                                            <Clock size={10}/> {task.targetDate} {task.targetTime}
                                        </span>
                                    </div>
                                    <button onClick={() => handleDeleteTask(task.id)} className="text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 size={12}/>
                                    </button>
                                </div>
                                <div className="text-slate-300 text-[11px] font-medium border-l-2 border-slate-700 pl-2 mb-2 line-clamp-2">
                                    {task.info}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {task.targetGroupNames.map((g, i) => (
                                        <span key={i} className="text-[8px] bg-slate-800 text-slate-500 px-1 py-0.5 rounded">@{g}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
