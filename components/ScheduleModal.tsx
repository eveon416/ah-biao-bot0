
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, UserCircle, Terminal, MessageSquare, ArrowRight, Server, Users, Plus, Trash2, Globe, Sparkles, CheckSquare, Square, Settings, RefreshCw, AlertCircle, ShieldAlert, Edit3, Sliders, UserPlus, Minus, CalendarDays, ListOrdered, CalendarCheck, Save, Check, Repeat, RotateCw } from 'lucide-react';

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

type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly';

interface ScheduledTask {
  id: string;
  type: 'weekly' | 'suspend' | 'general';
  targetDate: string; // YYYY-MM-DD
  targetTime: string; // HH:mm
  info: string;
  targetGroupNames: string[];
  targetGroupIds: string[];
  createdAt: string;
  repeatType: RepeatType;
  repeatDays?: number[]; // 0-6 for weekly
  repeatDate?: number;   // 1-31 for monthly
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

const DAYS_OF_WEEK = [
    { label: '日', value: 0 },
    { label: '一', value: 1 },
    { label: '二', value: 2 },
    { label: '三', value: 3 },
    { label: '四', value: 4 },
    { label: '五', value: 5 },
    { label: '六', value: 6 }
];

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
  const [overridePerson, setOverridePerson] = useState<string>(''); 
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0); 
  
  const [isSkipWeek, setIsSkipWeek] = useState(false); 
  const [forceSuspend, setForceSuspend] = useState(false); 
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
  const [repeatType, setRepeatType] = useState<RepeatType>('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatMonthlyDate, setRepeatMonthlyDate] = useState<number>(1);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);

  // Editing State for Queue
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editInfo, setEditInfo] = useState('');
  const [editRepeatType, setEditRepeatType] = useState<RepeatType>('none');
  const [editRepeatDays, setEditRepeatDays] = useState<number[]>([]);
  const [editRepeatMonthlyDate, setEditRepeatMonthlyDate] = useState<number>(1);

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
      setEditingTaskId(null);
      setRepeatType('none');
      setRepeatDays([]);
      
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
         
         const totalWeeks = rawWeeks + calibrationOffset;

         let targetIndex = (anchorIndex + totalWeeks) % staffList.length;
         if (targetIndex < 0) targetIndex = targetIndex + staffList.length;
         setDutyPerson(`${staffList[targetIndex]} (系統預估)`);
     }
  }, [previewDate, forceSuspend, calibrationOffset, staffList]);

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

  // 修正刪除預約任務邏輯：確保事件不冒泡，並正確過濾 state 與 localStorage
  const handleDeleteTask = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!window.confirm('確定要刪除此預約發送任務嗎？')) return;
    
    setScheduledTasks(prevTasks => {
      const updated = prevTasks.filter(t => t.id !== taskId);
      localStorage.setItem('scheduled_tasks_v1', JSON.stringify(updated));
      return updated;
    });
    
    addLog(`🗑️ 已從佇列移除任務：${taskId.substring(0, 8)}...`, true);
  };

  // 編輯任務邏輯
  const handleStartEdit = (task: ScheduledTask) => {
      setEditingTaskId(task.id);
      setEditDate(task.targetDate);
      setEditTime(task.targetTime);
      setEditInfo(task.info);
      setEditRepeatType(task.repeatType || 'none');
      setEditRepeatDays(task.repeatDays || []);
      setEditRepeatMonthlyDate(task.repeatDate || 1);
  };

  const handleSaveEdit = () => {
      if (!editingTaskId) return;
      setScheduledTasks(prev => {
          const updated = prev.map(t => 
              t.id === editingTaskId 
              ? { 
                  ...t, 
                  targetDate: editDate, 
                  targetTime: editTime, 
                  info: editInfo,
                  repeatType: editRepeatType,
                  repeatDays: editRepeatType === 'weekly' ? editRepeatDays : undefined,
                  repeatDate: editRepeatType === 'monthly' ? editRepeatMonthlyDate : undefined
                } 
              : t
          );
          localStorage.setItem('scheduled_tasks_v1', JSON.stringify(updated));
          return updated;
      });
      setEditingTaskId(null);
      addLog(`📝 已更新預約任務：${editingTaskId.substring(0, 8)}...`, true);
  };

  const toggleRepeatDay = (day: number, isEdit: boolean = false) => {
      if (isEdit) {
          setEditRepeatDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
      } else {
          setRepeatDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
      }
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
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      targetDate: previewDate,
      targetTime: scheduleTime,
      info: infoText,
      targetGroupNames: groupNames,
      targetGroupIds: [...selectedGroupIds], 
      createdAt: new Date().toISOString(),
      repeatType: repeatType,
      repeatDays: repeatType === 'weekly' ? repeatDays : undefined,
      repeatDate: repeatType === 'monthly' ? repeatMonthlyDate : undefined
    };

    const updated = [...scheduledTasks, newTask];
    setScheduledTasks(updated);
    localStorage.setItem('scheduled_tasks_v1', JSON.stringify(updated));
    addLog(`📅 已加入預約佇列：${newTask.targetDate} ${newTask.targetTime}${repeatType !== 'none' ? ` (${repeatType})` : ''}`);
    setIsScheduleMode(false);
    
    alert(`任務已存入佇列！系統會在指定時間${repeatType !== 'none' ? '定期' : ''}自動發送。`);
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

      let baseUrl = '';
      if (connectionMode === 'remote') {
          baseUrl = remoteUrl.replace(/\/$/, ''); 
      }

      const apiPath = '/api/cron'; 
      const targetUrl = `${baseUrl}${apiPath}`;
      
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
          const data = await res.json();
          if (data.success) {
              addLog(`✅ 發送成功！已推送至 ${data.sentTo?.length || 0} 個群組`, true);
              let infoText = (type === 'weekly') ? (overridePerson || dutyPerson) : (type === 'suspend' ? (customReason || "特殊事由") : generalContent);
              onGenerate(type as any, infoText);
              setTimeout(() => onClose(), 2000);
          } else {
              throw new Error(data.message || '未知錯誤');
          }
      } catch (error: any) {
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
                 <h2 className="text-lg font-bold tracking-wide official-font text-white">排程廣播控制台</h2>
                 <p className="text-[10px] text-white opacity-95 uppercase font-bold tracking-wider">Cron Job Manager (Advanced)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:text-emerald-300 p-1 rounded-full transition-colors"><X size={20} /></button>
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
                                 <button onClick={() => setConnectionMode('local')} className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'local' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>同源</button>
                                 <button onClick={() => setConnectionMode('remote')} className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'remote' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>雲端</button>
                             </div>
                         </div>
                         {connectionMode === 'remote' && (
                             <div className="mt-3 flex gap-2">
                                 <input type="text" value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} className="flex-1 px-3 py-1.5 text-xs border rounded bg-slate-50 text-slate-900 font-mono" placeholder="Vercel App URL"/>
                                 <button onClick={() => { localStorage.setItem('remote_api_url', remoteUrl); alert('已儲存'); }} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded text-xs font-bold">儲存</button>
                             </div>
                         )}
                    </div>

                    {/* Target Groups */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Users size={14} /> 發送目標群組</label>
                            {!isAddingGroup && <button onClick={() => setIsAddingGroup(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"><Plus size={12} /> 新增</button>}
                        </div>
                        {isAddingGroup && (
                            <div className="bg-white p-3 rounded border border-indigo-100 shadow-sm mb-3 space-y-2">
                                <input type="text" placeholder="群組名稱" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded"/>
                                <input type="text" placeholder="Line Group ID" value={newGroupId} onChange={e => setNewGroupId(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded font-mono"/>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setIsAddingGroup(false)} className="px-2 py-1 text-xs text-slate-500 font-bold">取消</button>
                                    <button onClick={handleSaveGroup} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded font-bold">儲存</button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {[...PRESET_GROUPS, ...savedGroups].map(group => {
                                const isSelected = selectedGroupIds.includes(group.groupId);
                                return (
                                    <div key={group.id} onClick={() => toggleGroupSelection(group.groupId)} className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                        <div className="flex items-center gap-2">
                                            {isSelected ? <CheckSquare size={14} className="text-indigo-600"/> : <Square size={14} className="text-slate-300" />}
                                            <span className="text-xs font-bold">{group.name}</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-400">{group.groupId.substring(0, 8)}...</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-slate-200 rounded-lg p-1 mb-4">
                        <button onClick={() => setActiveTab('roster')} className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'roster' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}><UserCircle size={14} /> 科務會議輪值</button>
                        <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'general' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}><MessageSquare size={14} /> 一般公告</button>
                    </div>

                    {/* Content Area (深色底圖配淺色文字修正) */}
                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 shadow-inner">
                        {activeTab === 'roster' ? (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                                      <CalendarDays size={12} className="text-indigo-400"/> 科務會議輪值日期
                                    </label>
                                    <input 
                                      type="date" 
                                      value={previewDate} 
                                      onChange={e => setPreviewDate(e.target.value)} 
                                      className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded outline-none focus:border-indigo-500 transition-all shadow-sm font-bold"
                                    />
                                </div>
                                <div className={`p-4 rounded border ${forceSuspend || isSkipWeek ? 'bg-red-900/40 border-red-800' : 'bg-slate-800 border-slate-700'} shadow-inner`}>
                                    <div className="text-[10px] font-bold text-slate-300 mb-1 uppercase tracking-wider">自動推算輪值人員</div>
                                    <div className="font-bold text-xl text-white tracking-wide">{overridePerson || dutyPerson}</div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-100">備註事由 (選填)</label>
                                    <input 
                                      type="text" 
                                      placeholder="例：適逢國定假日順延" 
                                      value={customReason} 
                                      onChange={e => setCustomReason(e.target.value)} 
                                      className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded outline-none focus:border-indigo-500 transition-all font-medium placeholder-slate-500"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-100">一般公告內容</label>
                                <textarea 
                                  value={generalContent} 
                                  onChange={e => setGeneralContent(e.target.value)} 
                                  placeholder="請在此輸入廣播公告內容..." 
                                  className="w-full min-h-[160px] px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded resize-none outline-none focus:border-indigo-500 transition-all font-medium leading-relaxed placeholder-slate-500"
                                />
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
                                <div className="text-[10px] text-indigo-700 font-bold">系統將於指定時間自動執行廣播</div>
                            </div>
                        </div>
                        <button onClick={() => setIsScheduleMode(!isScheduleMode)} className={`w-12 h-6 rounded-full transition-all relative ${isScheduleMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isScheduleMode ? 'left-7' : 'left-1'}`}></div>
                        </button>
                    </div>

                    {isScheduleMode && (
                        <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4 animate-in fade-in slide-in-from-bottom-2 shadow-inner">
                             <div className="flex items-center gap-6">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-slate-100 block mb-1.5 uppercase tracking-wider">發送時間 (HH:mm)</label>
                                    <input 
                                    type="time" 
                                    value={scheduleTime} 
                                    onChange={e => setScheduleTime(e.target.value)} 
                                    className="w-full px-3 py-1.5 bg-slate-800 text-white border border-slate-600 rounded text-sm focus:border-indigo-500 outline-none font-bold"
                                    />
                                </div>
                                <div className="flex-1 border-l border-slate-700 pl-6">
                                    <label className="text-[10px] font-bold text-slate-100 block mb-1.5 uppercase tracking-wider">啟始日期</label>
                                    <div className="text-sm font-bold text-white py-1.5 px-1">{previewDate}</div>
                                </div>
                             </div>

                             {/* 重複選項 */}
                             <div className="pt-2 border-t border-slate-800">
                                <div className="flex items-center gap-2 mb-2">
                                    <Repeat size={12} className="text-indigo-400" />
                                    <label className="text-[10px] font-bold text-slate-100 uppercase tracking-wider">重複週期</label>
                                </div>
                                <div className="flex gap-2">
                                    {(['none', 'daily', 'weekly', 'monthly'] as RepeatType[]).map(type => (
                                        <button 
                                          key={type}
                                          onClick={() => setRepeatType(type)}
                                          className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition-all border ${repeatType === type ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                                        >
                                            {type === 'none' ? '單次' : type === 'daily' ? '每日' : type === 'weekly' ? '每週' : '每月'}
                                        </button>
                                    ))}
                                </div>

                                {repeatType === 'weekly' && (
                                    <div className="mt-3 flex gap-1 justify-between">
                                        {DAYS_OF_WEEK.map(d => (
                                            <button 
                                              key={d.value}
                                              onClick={() => toggleRepeatDay(d.value)}
                                              className={`w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center transition-all border ${repeatDays.includes(d.value) ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                            >
                                                {d.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {repeatType === 'monthly' && (
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 font-bold">每月第</span>
                                        <input 
                                          type="number" 
                                          min="1" 
                                          max="31" 
                                          value={repeatMonthlyDate} 
                                          onChange={e => setRepeatMonthlyDate(parseInt(e.target.value, 10) || 1)}
                                          className="w-16 bg-slate-800 text-white border border-slate-700 rounded px-2 py-1 text-xs font-bold outline-none focus:border-indigo-500"
                                        />
                                        <span className="text-[10px] text-slate-400 font-bold">日發送</span>
                                    </div>
                                )}
                             </div>
                        </div>
                    )}

                    <button 
                      onClick={handleTrigger} 
                      disabled={isTriggering || (activeTab === 'general' && !generalContent.trim())} 
                      className={`w-full py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${isTriggering ? 'bg-slate-100 text-slate-400' : (isScheduleMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white')}`}
                    >
                         {isTriggering ? <RefreshCw size={18} className="animate-spin" /> : (isScheduleMode ? <CalendarCheck size={18} /> : <ArrowRight size={18} />)}
                         {isTriggering ? '連線中...' : (isScheduleMode ? '確認加入預約排程' : '立即廣播發送')}
                    </button>
                </div>
            </div>

            {/* Right Panel: Console (深色底圖配淺色文字) */}
            <div className="hidden md:flex flex-col md:w-[40%] bg-slate-950 font-mono text-xs z-10 border-l border-slate-700">
                {/* Upper: Terminal Logs */}
                <div className="h-1/2 flex flex-col border-b border-slate-800 overflow-hidden">
                    <div className="p-2.5 bg-slate-900 border-b border-slate-800 text-emerald-300 text-[10px] flex justify-between shrink-0 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><Terminal size={12}/> Terminal Out</span>
                        <span className="text-slate-100 opacity-80 font-bold">API: {connectionMode.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-1.5">
                        {logs.length === 0 && <div className="text-slate-400 text-center mt-12 italic opacity-60">Awaiting remote connection...</div>}
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex gap-3 leading-relaxed ${log.success === false ? 'text-rose-400 font-bold' : (log.success === true ? 'text-emerald-300 font-bold' : 'text-slate-100')}`}>
                                <span className="text-slate-600 font-bold shrink-0">[{log.time}]</span>
                                <span className="break-all">{log.msg}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

                {/* Lower: Pending Queue (帶編輯與重複功能) */}
                <div className="h-1/2 flex flex-col overflow-hidden bg-slate-950">
                    <div className="p-2.5 bg-slate-900 border-b border-slate-800 text-amber-300 text-[10px] flex justify-between shrink-0 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><ListOrdered size={12}/> Pending Queue</span>
                        <span className="text-slate-100 opacity-80 font-bold">{scheduledTasks.length} Active Tasks</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {scheduledTasks.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-100 text-center p-6 space-y-3">
                                <CalendarDays size={40} className="opacity-30 text-white"/>
                                <p className="opacity-70 text-white font-bold text-sm">目前佇列中無排定任務</p>
                            </div>
                        )}
                        {scheduledTasks.map((task) => (
                            <div key={task.id} className={`bg-slate-900/90 border rounded-lg p-3.5 relative group transition-all shadow-lg hover:bg-slate-800 ${editingTaskId === task.id ? 'border-amber-500 bg-slate-800 ring-1 ring-amber-500/30' : 'border-slate-800 hover:border-amber-600/50'}`}>
                                
                                {editingTaskId === task.id ? (
                                    /* 編輯模式 */
                                    <div className="space-y-3 animate-in fade-in duration-200">
                                        <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5"><Edit3 size={12}/> 正在修改任務內容</span>
                                            <div className="flex gap-2">
                                                <button onClick={() => setEditingTaskId(null)} className="p-1 text-slate-400 hover:text-white transition-colors"><X size={16}/></button>
                                                <button onClick={handleSaveEdit} className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"><Check size={18}/></button>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[9px] text-slate-400 block mb-1 font-bold">日期</label>
                                                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full bg-slate-950 text-white text-[11px] px-2 py-1 border border-slate-700 rounded outline-none focus:border-amber-500 font-bold"/>
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-400 block mb-1 font-bold">時間</label>
                                                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="w-full bg-slate-950 text-white text-[11px] px-2 py-1 border border-slate-700 rounded outline-none focus:border-amber-500 font-bold"/>
                                            </div>
                                        </div>

                                        <div className="space-y-2 py-2 border-t border-slate-700/50">
                                            <label className="text-[9px] text-slate-400 block font-bold">重複週期設定</label>
                                            <div className="flex gap-1 flex-wrap">
                                                {(['none', 'daily', 'weekly', 'monthly'] as RepeatType[]).map(type => (
                                                    <button 
                                                      key={type}
                                                      onClick={() => setEditRepeatType(type)}
                                                      className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${editRepeatType === type ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                                                    >
                                                        {type === 'none' ? '單次' : type === 'daily' ? '每日' : type === 'weekly' ? '每週' : '每月'}
                                                    </button>
                                                ))}
                                            </div>
                                            {editRepeatType === 'weekly' && (
                                                <div className="flex gap-1 justify-between pt-1">
                                                    {DAYS_OF_WEEK.map(d => (
                                                        <button 
                                                          key={d.value}
                                                          onClick={() => toggleRepeatDay(d.value, true)}
                                                          className={`w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center transition-all border ${editRepeatDays.includes(d.value) ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}
                                                        >
                                                            {d.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {editRepeatType === 'monthly' && (
                                                <div className="flex items-center gap-2 pt-1">
                                                    <span className="text-[9px] text-slate-500">每月第</span>
                                                    <input type="number" min="1" max="31" value={editRepeatMonthlyDate} onChange={e => setEditRepeatMonthlyDate(parseInt(e.target.value, 10) || 1)} className="w-12 bg-slate-950 text-white border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-bold"/>
                                                    <span className="text-[9px] text-slate-500">日發送</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div>
                                            <label className="text-[9px] text-slate-400 block mb-1 font-bold">發送內容摘要</label>
                                            <textarea value={editInfo} onChange={e => setEditInfo(e.target.value)} className="w-full bg-slate-950 text-white text-[11px] px-2 py-1 border border-slate-700 rounded outline-none focus:border-amber-500 min-h-[60px] resize-none font-bold leading-relaxed"/>
                                        </div>
                                        
                                        <button onClick={handleSaveEdit} className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]">
                                            <Save size={12}/> 儲存變更
                                        </button>
                                    </div>
                                ) : (
                                    /* 檢視模式 */
                                    <>
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold uppercase tracking-tight ${task.type === 'weekly' ? 'bg-indigo-900 text-indigo-100' : task.type === 'suspend' ? 'bg-rose-900 text-rose-100' : 'bg-emerald-900 text-emerald-100'}`}>
                                                    {task.type}
                                                </span>
                                                <span className="text-amber-200 font-bold text-[11px] flex items-center gap-1.5">
                                                    <Clock size={11}/> {task.targetDate} {task.targetTime}
                                                </span>
                                                {task.repeatType !== 'none' && (
                                                    <span className="bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1">
                                                        <RotateCw size={9} className="animate-spin-slow" />
                                                        {task.repeatType === 'daily' ? '每日' : task.repeatType === 'weekly' ? `每週(${task.repeatDays?.map(d => DAYS_OF_WEEK.find(dw => dw.value === d)?.label).join(',')})` : `每月(${task.repeatDate}日)`}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button 
                                                  onClick={() => handleStartEdit(task)} 
                                                  className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-900/30 rounded-md transition-all active:scale-90 bg-slate-800/50 border border-slate-700/50"
                                                  title="修改此項預約"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button 
                                                  onClick={(e) => handleDeleteTask(e, task.id)} 
                                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-900/50 rounded-md transition-all active:scale-90 bg-slate-800/50 border border-slate-700/50"
                                                  title="刪除此項預約"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-white text-[12px] font-bold border-l-2 border-amber-600/60 pl-2.5 mb-2.5 line-clamp-2 leading-relaxed italic">
                                            {task.info}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {task.targetGroupNames.map((g, i) => (
                                                <span key={i} className="text-[9px] bg-black text-slate-100 px-2 py-0.5 rounded border border-slate-700 font-bold">@{g}</span>
                                            ))}
                                        </div>
                                    </>
                                )}
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
