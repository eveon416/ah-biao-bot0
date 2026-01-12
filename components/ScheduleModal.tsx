
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, UserCircle, Terminal, MessageSquare, ArrowRight, Server, Users, Plus, Trash2, Globe, Sparkles, CheckSquare, Square, Settings, RefreshCw, AlertCircle, ShieldAlert, Edit3, Sliders, UserPlus, Minus, CalendarDays, ListOrdered, CalendarCheck, Save, Check, Repeat, RotateCw, Play } from 'lucide-react';

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

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (type: 'weekly' | 'suspend' | 'general', info: string) => void;
  onRequestRefine?: (text: string) => void;
  tasks: ScheduledTask[];
  setTasks: (tasks: ScheduledTask[]) => void;
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

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate, onRequestRefine, tasks, setTasks }) => {
  // Tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');

  // Staff Management State
  const [staffList, setStaffList] = useState<string[]>(DEFAULT_STAFF_LIST);
  const [isManageStaffOpen, setIsManageStaffOpen] = useState(false);

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

  const addLog = (msg: string, success: boolean | null = null) => {
    const time = new Date().toLocaleTimeString('zh-TW', {hour12: false});
    setLogs(prev => [...prev, { time, msg, success }]);
  };

  const toggleGroupSelection = (gid: string) => {
     setSelectedGroupIds(prev => prev.includes(gid) ? prev.filter(id => id !== gid) : [...prev, gid]);
  };

  const handleSaveGroup = () => {
      if (!newGroupName.trim() || !newGroupId.trim()) return;
      if (!/^C[0-9a-f]{32}$/.test(newGroupId.trim()) && !/^U[0-9a-f]{32}$/.test(newGroupId.trim())) {
          setIdError('ID 格式錯誤');
          return;
      }
      const newG: Group = { id: Date.now().toString(), name: newGroupName.trim(), groupId: newGroupId.trim() };
      const updated = [...savedGroups, newG];
      setSavedGroups(updated);
      localStorage.setItem('line_groups_v1', JSON.stringify(updated));
      setNewGroupName(''); setNewGroupId(''); setIsAddingGroup(false); setIdError('');
      setSelectedGroupIds(prev => [...prev, newG.groupId]);
  };

  // 修正問題 2：刪除預約按鈕失效問題 (確保正確調用父元件更新)
  const handleDeleteTask = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault(); 
    e.stopPropagation();
    if (!window.confirm('確定要刪除此預約發送任務嗎？')) return;
    const updated = tasks.filter(t => t.id !== taskId);
    setTasks(updated); // 透過 props 傳回 App 更新 state 並儲存
    addLog(`🗑️ 已從佇列移除任務：${taskId.substring(0, 8)}...`, true);
  };

  // 修正問題 1：立即測試按鈕失效問題 (優化連線邏輯)
  const handleTestTask = async (task: ScheduledTask) => {
    if (!window.confirm(`確定要立即測試任務「${task.info.substring(0, 8)}...」嗎？\n這將會立即發送至指定的 LINE 群組。`)) return;
    addLog(`🧪 開始測試預約任務：${task.id.substring(0, 8)}...`);
    
    // 構造 API 路徑
    const baseUrl = connectionMode === 'remote' ? remoteUrl.replace(/\/$/, '') : window.location.origin;
    
    const params = new URLSearchParams();
    params.append('manual', 'true');
    params.append('type', task.type);
    params.append('date', task.targetDate);
    if (task.type === 'suspend') params.append('reason', task.info);
    if (task.type === 'general') params.append('content', task.info);
    if (task.type === 'weekly') params.append('person', task.info);
    
    if (task.targetGroupIds && task.targetGroupIds.length > 0) {
        params.append('groupId', task.targetGroupIds.join(','));
    }

    try {
        const fullUrl = `${baseUrl}/api/cron?${params.toString()}`;
        console.log(`[Test] Triggering URL: ${fullUrl}`);
        const res = await fetch(fullUrl, { method: 'GET' });
        const data = await res.json();
        if (data.success) {
            addLog(`✅ 測試發送成功！已推送至群組。`, true);
            onGenerate(task.type, task.info); // 同時在對話視窗產生回饋
        } else {
            throw new Error(data.message || 'API 回傳異常');
        }
    } catch (err: any) {
        console.error(`[Test] Failed:`, err);
        addLog(`❌ 測試失敗: ${err.message}`, false);
        alert(`發送失敗，請檢查連線設定：${err.message}`);
    }
  };

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
      const updated = tasks.map(t => 
          t.id === editingTaskId 
          ? { 
              ...t, targetDate: editDate, targetTime: editTime, info: editInfo,
              repeatType: editRepeatType,
              repeatDays: editRepeatType === 'weekly' ? editRepeatDays : undefined,
              repeatDate: editRepeatType === 'monthly' ? editRepeatMonthlyDate : undefined
            } : t
      );
      setTasks(updated);
      setEditingTaskId(null);
      addLog(`📝 已更新預約任務：${editingTaskId.substring(0, 8)}...`, true);
  };

  const toggleRepeatDay = (day: number, isEdit: boolean = false) => {
      if (isEdit) setEditRepeatDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
      else setRepeatDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleAddToQueue = () => {
    if (selectedGroupIds.length === 0) { alert("請至少選擇一個發送目標群組"); return; }
    const isEffectiveSuspend = isSkipWeek || (forceSuspend && !overridePerson);
    let type: 'weekly' | 'suspend' | 'general' = activeTab === 'general' ? 'general' : (isEffectiveSuspend ? 'suspend' : 'weekly');
    if (type === 'suspend' && !customReason.trim()) { alert('請輸入暫停原因'); return; }

    const allGroups = [...PRESET_GROUPS, ...savedGroups];
    const groupNames = selectedGroupIds.map(id => allGroups.find(g => g.groupId === id)?.name || id);
    let infoText = type === 'weekly' ? (overridePerson || dutyPerson) : (type === 'suspend' ? (customReason || "特殊事由") : generalContent);

    const newTask: ScheduledTask = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type, targetDate: previewDate, targetTime: scheduleTime, info: infoText,
      targetGroupNames: groupNames, targetGroupIds: [...selectedGroupIds], 
      createdAt: new Date().toISOString(), repeatType,
      repeatDays: repeatType === 'weekly' ? repeatDays : undefined,
      repeatDate: repeatType === 'monthly' ? repeatMonthlyDate : undefined
    };
    setTasks([...tasks, newTask]);
    addLog(`📅 已加入預約佇列：${newTask.targetDate} ${newTask.targetTime}`);
    setIsScheduleMode(false);
  };

  const handleTrigger = async () => {
      if (isScheduleMode) { handleAddToQueue(); return; }
      if (selectedGroupIds.length === 0) { alert("請至少選擇一個發送目標群組"); return; }
      setIsTriggering(true); setLogs([]); addLog('🚀 開始執行手動廣播排程...');
      const isEffectiveSuspend = isSkipWeek || (forceSuspend && !overridePerson);
      let type = activeTab === 'general' ? 'general' : (isEffectiveSuspend ? 'suspend' : 'weekly');
      const baseUrl = connectionMode === 'remote' ? remoteUrl.replace(/\/$/, '') : window.location.origin;
      const params = new URLSearchParams();
      params.append('manual', 'true'); params.append('type', type); params.append('date', previewDate);
      params.append('reason', customReason); params.append('content', generalContent); params.append('groupId', selectedGroupIds.join(','));
      
      try {
          const res = await fetch(`${baseUrl}/api/cron?${params.toString()}`);
          const data = await res.json();
          if (data.success) {
              addLog(`✅ 發送成功！已推送至 ${data.sentTo?.length || 0} 個群組`, true);
              onGenerate(type as any, (type === 'weekly' ? (overridePerson || dutyPerson) : (type === 'suspend' ? (customReason || "特殊事由") : generalContent)));
              setTimeout(() => onClose(), 2000);
          } else { throw new Error(data.message || '未知錯誤'); }
      } catch (error: any) { addLog(`❌ 執行失敗: ${error.message}`, false); } finally { setIsTriggering(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-6xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
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

        <div className="flex flex-1 overflow-hidden">
            <div className="w-full md:w-[60%] flex flex-col bg-slate-50 border-r border-slate-200">
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2"><Settings size={16} className="text-slate-500"/><span className="text-xs font-bold text-slate-700">API 連線設定</span></div>
                             <div className="flex bg-slate-100 rounded p-1">
                                 <button onClick={() => setConnectionMode('local')} className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'local' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>同源</button>
                                 <button onClick={() => setConnectionMode('remote')} className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${connectionMode === 'remote' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>雲端</button>
                             </div>
                         </div>
                         {connectionMode === 'remote' && (
                             <div className="mt-3 flex gap-2">
                                 <input type="text" value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} className="flex-1 px-3 py-1.5 text-xs border rounded bg-slate-50 text-slate-900 font-mono" />
                                 <button onClick={() => { localStorage.setItem('remote_api_url', remoteUrl); alert('已儲存'); }} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded text-xs font-bold">儲存</button>
                             </div>
                         )}
                    </div>

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
                                        <div className="flex items-center gap-2">{isSelected ? <CheckSquare size={14} className="text-indigo-600"/> : <Square size={14} className="text-slate-300" />}<span className="text-xs font-bold">{group.name}</span></div>
                                        <span className="text-[10px] font-mono text-slate-400">{group.groupId.substring(0, 8)}...</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex bg-slate-200 rounded-lg p-1 mb-4">
                        <button onClick={() => setActiveTab('roster')} className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'roster' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}><UserCircle size={14} /> 科務會議輪值</button>
                        <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'general' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}><MessageSquare size={14} /> 一般公告</button>
                    </div>

                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 shadow-inner">
                        {activeTab === 'roster' ? (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-100 flex items-center gap-1.5"><CalendarDays size={12} className="text-indigo-400"/> 科務會議輪值日期</label>
                                    <input type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded outline-none focus:border-indigo-500 transition-all font-bold"/>
                                </div>
                                <div className={`p-4 rounded border ${forceSuspend || isSkipWeek ? 'bg-red-900/40 border-red-800' : 'bg-slate-800 border-slate-700'} shadow-inner`}>
                                    <div className="text-[10px] font-bold text-slate-300 mb-1 uppercase tracking-wider">自動推算輪值人員</div>
                                    <div className="font-bold text-xl text-white tracking-wide">{overridePerson || dutyPerson}</div>
                                </div>
                                <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-slate-100">備註事由 (選填)</label><input type="text" placeholder="例：適逢國定假日順延" value={customReason} onChange={e => setCustomReason(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded outline-none focus:border-indigo-500 font-medium"/></div>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-100">一般公告內容</label>
                                <textarea value={generalContent} onChange={e => setGeneralContent(e.target.value)} placeholder="請在此輸入廣播公告內容..." className="w-full min-h-[160px] px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded resize-none outline-none focus:border-indigo-500 transition-all font-medium leading-relaxed"/>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 bg-white space-y-4">
                    <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                        <div className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-indigo-600" /><div><div className="text-xs font-bold text-indigo-900">預約發送模式</div><div className="text-[10px] text-indigo-700 font-bold">系統將於指定時間自動執行廣播</div></div></div>
                        <button onClick={() => setIsScheduleMode(!isScheduleMode)} className={`w-12 h-6 rounded-full transition-all relative ${isScheduleMode ? 'bg-indigo-600' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isScheduleMode ? 'left-7' : 'left-1'}`}></div></button>
                    </div>
                    {isScheduleMode && (
                        <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4 shadow-inner">
                             <div className="flex items-center gap-6">
                                <div className="flex-1"><label className="text-[10px] font-bold text-slate-100 block mb-1.5 uppercase tracking-wider">發送時間 (HH:mm)</label><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full px-3 py-1.5 bg-slate-800 text-white border border-slate-600 rounded text-sm outline-none font-bold"/></div>
                                <div className="flex-1 border-l border-slate-700 pl-6"><label className="text-[10px] font-bold text-slate-100 block mb-1.5 uppercase tracking-wider">啟始日期</label><div className="text-sm font-bold text-white py-1.5 px-1">{previewDate}</div></div>
                             </div>
                             <div className="pt-2 border-t border-slate-800">
                                <div className="flex gap-2">{(['none', 'daily', 'weekly', 'monthly'] as RepeatType[]).map(type => (<button key={type} onClick={() => setRepeatType(type)} className={`flex-1 py-1 px-2 rounded text-[10px] font-bold transition-all border ${repeatType === type ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{type === 'none' ? '單次' : type === 'daily' ? '每日' : type === 'weekly' ? '每週' : '每月'}</button>))}</div>
                             </div>
                        </div>
                    )}
                    <button onClick={handleTrigger} disabled={isTriggering || (activeTab === 'general' && !generalContent.trim())} className={`w-full py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${isTriggering ? 'bg-slate-100 text-slate-400' : (isScheduleMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white')}`}>{isTriggering ? <RefreshCw size={18} className="animate-spin" /> : (isScheduleMode ? <CalendarCheck size={18} /> : <ArrowRight size={18} />)}{isTriggering ? '連線中...' : (isScheduleMode ? '確認加入預約排程' : '立即廣播發送')}</button>
                </div>
            </div>

            <div className="hidden md:flex flex-col md:w-[40%] bg-slate-950 font-mono text-xs z-10 border-l border-slate-700">
                <div className="h-1/3 flex flex-col border-b border-slate-800 overflow-hidden">
                    <div className="p-2.5 bg-slate-900 border-b border-slate-800 text-emerald-300 text-[10px] flex justify-between shrink-0 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><Terminal size={12}/> Terminal Out</span>
                        <span className="text-slate-100 opacity-80 font-bold">API: {connectionMode.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-1.5">
                        {logs.length === 0 && <div className="text-slate-400 text-center mt-4 italic opacity-60">Awaiting connection...</div>}
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex gap-3 leading-relaxed ${log.success === false ? 'text-rose-400 font-bold' : (log.success === true ? 'text-emerald-300 font-bold' : 'text-slate-100')}`}>
                                <span className="text-slate-600 font-bold shrink-0">[{log.time}]</span>
                                <span className="break-all">{log.msg}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

                <div className="h-2/3 flex flex-col overflow-hidden bg-slate-950">
                    <div className="p-2.5 bg-slate-900 border-b border-slate-800 text-amber-300 text-[10px] flex justify-between shrink-0 font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><ListOrdered size={12}/> Pending Queue</span>
                        <span className="text-slate-100 opacity-80 font-bold">{tasks.length} Active Tasks</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {tasks.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-100 text-center opacity-40 font-bold text-sm p-6">目前無預約任務</div>}
                        {tasks.map((task) => (
                            <div key={task.id} className={`bg-slate-900/90 border rounded-lg p-3.5 relative group transition-all shadow-lg hover:bg-slate-800 ${editingTaskId === task.id ? 'border-amber-500' : 'border-slate-800'}`}>
                                {editingTaskId === task.id ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5"><Edit3 size={12}/> 修改內容</span>
                                            <div className="flex gap-2">
                                                <button onClick={() => setEditingTaskId(null)} className="p-1 text-slate-400 hover:text-white"><X size={16}/></button>
                                                <button onClick={handleSaveEdit} className="p-1 text-emerald-400 hover:text-emerald-300"><Check size={18}/></button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-slate-950 text-white text-[11px] px-2 py-1 border border-slate-700 rounded font-bold"/>
                                            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="bg-slate-950 text-white text-[11px] px-2 py-1 border border-slate-700 rounded font-bold"/>
                                        </div>
                                        <textarea value={editInfo} onChange={e => setEditInfo(e.target.value)} className="w-full bg-slate-950 text-white text-[11px] px-2 py-1 border border-slate-700 rounded min-h-[60px] resize-none font-bold"/>
                                        <button onClick={handleSaveEdit} className="w-full py-1.5 bg-amber-600 text-white text-[10px] font-bold rounded shadow-md transition-all active:scale-95"><Save size={12}/> 儲存變更</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold uppercase tracking-tight ${task.type === 'weekly' ? 'bg-indigo-900 text-indigo-100' : task.type === 'suspend' ? 'bg-rose-900 text-rose-100' : 'bg-emerald-900 text-emerald-100'}`}>
                                                    {task.type}
                                                </span>
                                                <span className="text-amber-200 font-bold text-[11px] flex items-center gap-1.5"><Clock size={11}/> {task.targetDate} {task.targetTime}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button 
                                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTestTask(task); }} 
                                                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded-md transition-all active:scale-90 bg-slate-800/50 border border-slate-700/50" 
                                                  title="測試發送"
                                                >
                                                    <Play size={14} />
                                                </button>
                                                <button 
                                                  onClick={() => handleStartEdit(task)} 
                                                  className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-900/30 rounded-md transition-all active:scale-90 bg-slate-800/50 border border-slate-700/50" 
                                                  title="修改預約"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button 
                                                  onClick={(e) => handleDeleteTask(e, task.id)} 
                                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-900/50 rounded-md transition-all active:scale-90 bg-slate-800/50 border border-slate-700/50" 
                                                  title="刪除預約"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-white text-[12px] font-bold border-l-2 border-amber-600/60 pl-2.5 mb-2.5 line-clamp-2 leading-relaxed italic">{task.info}</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {task.targetGroupNames.map((g, i) => (<span key={i} className="text-[9px] bg-black text-slate-100 px-2 py-0.5 rounded border border-slate-700 font-bold">@{g}</span>))}
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
