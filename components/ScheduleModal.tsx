
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, UserCircle, Terminal, MessageSquare, ArrowRight, Server, Users, Plus, Trash2, Globe, Sparkles, CheckSquare, Square, Settings, RefreshCw, AlertCircle, ShieldAlert, Edit3, Sliders, UserPlus, Minus, CalendarDays, ListOrdered, CalendarCheck, Save, Check, Repeat, RotateCw, Play, ShieldOff, Info } from 'lucide-react';

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
  repeatDays?: number[]; 
  repeatDate?: number;   
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
    { id: 'preset_admin', name: '行政科 (AdminHome)', groupId: 'Cb35ecb9f86b1968dd51e476fdc819655', isPreset: true },
    { id: 'preset_test', name: '測試群 (Test)', groupId: 'C7e04d9539515b89958d12658b938acce', isPreset: true }
];

const DEFAULT_STAFF_LIST = ['林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰', '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'];
const DEFAULT_REMOTE_URL = 'https://ah-biao-bot0.vercel.app';

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate, onRequestRefine, tasks, setTasks }) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');
  const [staffList, setStaffList] = useState<string[]>(DEFAULT_STAFF_LIST);
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [overridePerson, setOverridePerson] = useState<string>(''); 
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0); 
  const [forceSuspend, setForceSuspend] = useState(false); 
  const [customReason, setCustomReason] = useState('');
  const [generalContent, setGeneralContent] = useState('');
  const [savedGroups, setSavedGroups] = useState<Group[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([PRESET_GROUPS[0].groupId]); 
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [isScheduleMode, setIsScheduleMode] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('08:30');
  const [repeatType, setRepeatType] = useState<RepeatType>('none');
  const [isLocalProcessorEnabled, setIsLocalProcessorEnabled] = useState(true);
  
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editInfo, setEditInfo] = useState('');

  const [connectionMode, setConnectionMode] = useState<'remote' | 'local'>('remote');
  const [remoteUrl, setRemoteUrl] = useState(DEFAULT_REMOTE_URL); 
  const [isTriggering, setIsTriggering] = useState(false);
  const [logs, setLogs] = useState<Array<{time: string, msg: string, success: boolean | null}>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      setPreviewDate(today.toISOString().split('T')[0]);
      const savedProcessor = localStorage.getItem('local_processor_enabled');
      setIsLocalProcessorEnabled(savedProcessor !== 'false');
      
      const savedGroupsData = localStorage.getItem('line_groups_v1');
      if (savedGroupsData) { try { setSavedGroups(JSON.parse(savedGroupsData)); } catch (e) {} }
      const savedUrl = localStorage.getItem('remote_api_url');
      if (savedUrl) setRemoteUrl(savedUrl);
    }
  }, [isOpen]);

  useEffect(() => {
     if (!previewDate) return;
     const dateObj = new Date(previewDate);
     const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
     const anchorIndex = 6;
     const oneWeekMs = 604800000;
     const rawDiffTime = dateObj.getTime() - anchorDate.getTime();
     const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);
     const totalWeeks = rawWeeks + calibrationOffset;
     let targetIndex = (anchorIndex + totalWeeks) % staffList.length;
     if (targetIndex < 0) targetIndex = targetIndex + staffList.length;
     setDutyPerson(`${staffList[targetIndex]}`);
  }, [previewDate, calibrationOffset, staffList]);

  const addLog = (msg: string, success: boolean | null = null) => {
    const time = new Date().toLocaleTimeString('zh-TW', {hour12: false});
    setLogs(prev => [...prev, { time, msg, success }]);
  };

  const handleSaveGroup = () => {
      if (!newGroupName.trim() || !newGroupId.trim()) return;
      const newG: Group = { id: Date.now().toString(), name: newGroupName.trim(), groupId: newGroupId.trim() };
      const updated = [...savedGroups, newG];
      setSavedGroups(updated);
      localStorage.setItem('line_groups_v1', JSON.stringify(updated));
      setNewGroupName(''); setNewGroupId(''); setIsAddingGroup(false);
      setSelectedGroupIds(prev => [...prev, newG.groupId]);
  };

  const handleDeleteTask = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!window.confirm('確定要取消此項預約任務嗎？')) return;
    const updated = tasks.filter(t => t.id !== taskId);
    setTasks(updated);
    addLog(`🗑️ 已成功撤銷預約任務：${taskId.substring(0, 8)}`, true);
  };

  const handleToggleProcessor = () => {
      const newState = !isLocalProcessorEnabled;
      setIsLocalProcessorEnabled(newState);
      localStorage.setItem('local_processor_enabled', String(newState));
      addLog(`⚙️ 背景處理器已${newState ? '啟動' : '關閉'}`);
  };

  const handleAddToQueue = () => {
    if (selectedGroupIds.length === 0) { alert("請至少選擇一個發送目標群組"); return; }
    let type: 'weekly' | 'suspend' | 'general' = activeTab === 'general' ? 'general' : (forceSuspend ? 'suspend' : 'weekly');
    if (type === 'suspend' && !customReason.trim()) { alert('請輸入暫停原因'); return; }
    
    const allGroups = [...PRESET_GROUPS, ...savedGroups];
    const groupNames = selectedGroupIds.map(id => allGroups.find(g => g.groupId === id)?.name || id);
    let infoText = type === 'weekly' ? (overridePerson || dutyPerson) : (type === 'suspend' ? (customReason || "特殊事由") : generalContent);

    const newTask: ScheduledTask = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type, targetDate: previewDate, targetTime: scheduleTime, info: infoText,
      targetGroupNames: groupNames, targetGroupIds: [...selectedGroupIds],
      createdAt: new Date().toISOString(), repeatType
    };

    setTasks([...tasks, newTask]);
    addLog(`📅 已排入預約清單：${newTask.targetDate} ${newTask.targetTime}`);
    setIsScheduleMode(false);
  };

  const handleTrigger = async () => {
      if (isScheduleMode) { handleAddToQueue(); return; }
      if (selectedGroupIds.length === 0) { alert("請至少選擇一個發送目標群組"); return; }
      setIsTriggering(true); setLogs([]); addLog('🚀 啟動即時發送程序...');
      let type = activeTab === 'general' ? 'general' : (forceSuspend ? 'suspend' : 'weekly');
      const baseUrl = connectionMode === 'remote' ? remoteUrl.replace(/\/$/, '') : window.location.origin;
      const params = new URLSearchParams();
      params.append('manual', 'true'); params.append('type', type); params.append('date', previewDate);
      params.append('reason', customReason); params.append('content', generalContent); params.append('groupId', selectedGroupIds.join(','));
      if (type === 'weekly') params.append('person', overridePerson || dutyPerson);

      try {
          const res = await fetch(`${baseUrl}/api/cron?${params.toString()}`);
          const data = await res.json();
          if (data.success) {
              addLog(`✅ 廣播發送成功！`, true);
              onGenerate(type as any, (type === 'weekly' ? (overridePerson || dutyPerson) : (type === 'suspend' ? (customReason || "特殊事由") : generalContent)));
              setTimeout(() => onClose(), 1500);
          } else { throw new Error(data.message || '連線失敗'); }
      } catch (error: any) { addLog(`❌ 錯誤: ${error.message}`, false); } finally { setIsTriggering(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-6xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <div>
                 <h2 className="text-lg font-bold official-font">排程廣播控制台</h2>
                 <p className="text-[10px] opacity-70 uppercase font-bold tracking-widest">Manual Broadcast & Pending Queue</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:text-emerald-300 transition-colors"><X size={20} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            <div className="w-full md:w-[60%] flex flex-col bg-slate-50 border-r border-slate-200">
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-6 bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between shadow-sm">
                         <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><Settings size={14}/> API 連線</div>
                         <div className="flex bg-slate-100 rounded p-1">
                             <button onClick={() => setConnectionMode('local')} className={`px-3 py-1 rounded text-[10px] font-bold ${connectionMode === 'local' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>同源</button>
                             <button onClick={() => setConnectionMode('remote')} className={`px-3 py-1 rounded text-[10px] font-bold ${connectionMode === 'remote' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>雲端</button>
                         </div>
                    </div>

                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Users size={14} /> 發送目標</label>
                            <button onClick={() => setIsAddingGroup(!isAddingGroup)} className="text-xs text-indigo-600 font-bold flex items-center gap-1"><Plus size={12} /> 新增</button>
                        </div>
                        {isAddingGroup && (
                            <div className="bg-white p-3 rounded border border-indigo-100 mb-3 space-y-2">
                                <input type="text" placeholder="名稱" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded"/>
                                <input type="text" placeholder="ID" value={newGroupId} onChange={e => setNewGroupId(e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded font-mono"/>
                                <button onClick={handleSaveGroup} className="w-full py-1.5 bg-indigo-600 text-white rounded text-xs font-bold">儲存</button>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {[...PRESET_GROUPS, ...savedGroups].map(group => (
                                <button key={group.id} onClick={() => setSelectedGroupIds(prev => prev.includes(group.groupId) ? prev.filter(id => id !== group.groupId) : [...prev, group.groupId])} className={`px-3 py-1.5 rounded-full border text-[10px] font-bold transition-all ${selectedGroupIds.includes(group.groupId) ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600'}`}>
                                    {group.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex bg-slate-200 rounded-lg p-1 mb-4">
                        <button onClick={() => setActiveTab('roster')} className={`flex-1 py-2 rounded-md text-xs font-bold ${activeTab === 'roster' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'}`}>週一輪值公告</button>
                        <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 rounded-md text-xs font-bold ${activeTab === 'general' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'}`}>一般文字公告</button>
                    </div>

                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-700 shadow-inner">
                        {activeTab === 'roster' ? (
                            <div className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-300">輪值發布日期</label>
                                    <input type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded outline-none font-bold" />
                                </div>
                                <div className="p-4 rounded border bg-slate-800 border-slate-700">
                                    <div className="text-[10px] font-bold text-slate-400 mb-1">即將發送人員</div>
                                    <div className="font-bold text-xl text-white">{overridePerson || dutyPerson}</div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-300">指定人員 (選填)</label>
                                    <input type="text" placeholder="若非自動推算請在此輸入姓名" value={overridePerson} onChange={e => setOverridePerson(e.target.value)} className="w-full px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded outline-none" />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-300">公告內容</label>
                                <textarea value={generalContent} onChange={e => setGeneralContent(e.target.value)} placeholder="請輸入廣播內容..." className="w-full min-h-[160px] px-3 py-2 text-sm bg-slate-800 text-white border border-slate-700 rounded resize-none outline-none font-medium" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 bg-white space-y-4">
                    <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-indigo-600" />
                            <div>
                                <div className="text-xs font-bold text-indigo-900">排定發送日期與時間</div>
                                <div className="text-[10px] text-indigo-700 font-bold">啟動後，本機網頁將於時間點自動廣播</div>
                            </div>
                        </div>
                        <button onClick={() => setIsScheduleMode(!isScheduleMode)} className={`w-12 h-6 rounded-full transition-all relative ${isScheduleMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isScheduleMode ? 'left-7' : 'left-1'}`}></div>
                        </button>
                    </div>

                    {isScheduleMode && (
                        <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-slate-400 block mb-1">預約時間</label>
                                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full px-3 py-1.5 bg-slate-800 text-white border border-slate-600 rounded text-sm font-bold" />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-slate-400 block mb-1">重複週期</label>
                                <select value={repeatType} onChange={e => setRepeatType(e.target.value as RepeatType)} className="w-full px-3 py-1.5 bg-slate-800 text-white border border-slate-600 rounded text-sm font-bold">
                                    <option value="none">單次任務</option>
                                    <option value="daily">每日執行</option>
                                    <option value="weekly">每週(本週同日)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <button onClick={handleTrigger} disabled={isTriggering} className={`w-full py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${isTriggering ? 'bg-slate-100 text-slate-400' : (isScheduleMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700')}`}>
                         {isTriggering ? <RefreshCw size={18} className="animate-spin" /> : (isScheduleMode ? <CalendarCheck size={18} /> : <ArrowRight size={18} />)}
                         {isTriggering ? '處理中...' : (isScheduleMode ? '加入預約排程' : '立即執行廣播')}
                    </button>
                </div>
            </div>

            <div className="hidden md:flex flex-col md:w-[40%] bg-slate-950 font-mono text-[10px] border-l border-slate-800">
                <div className="h-1/3 flex flex-col border-b border-slate-800 overflow-hidden">
                    <div className="p-3 bg-slate-900 text-emerald-400 font-bold uppercase border-b border-slate-800 flex justify-between">
                        <span>Terminal Output</span>
                        <span>API: {connectionMode.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-1 text-slate-300">
                        {logs.map((log, idx) => (
                            <div key={idx} className={`${log.success === false ? 'text-rose-400' : (log.success === true ? 'text-emerald-400' : '')}`}>
                                <span className="opacity-50">[{log.time}]</span> {log.msg}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

                <div className="h-2/3 flex flex-col overflow-hidden bg-slate-950">
                    <div className="p-3 bg-slate-900 text-amber-400 font-bold uppercase border-b border-slate-800 flex justify-between">
                        <span>預約佇列 (Pending Queue)</span>
                        <div className="flex gap-2">
                             <button onClick={handleToggleProcessor} className={`px-2 py-0.5 rounded text-[8px] border transition-all ${isLocalProcessorEnabled ? 'bg-emerald-900/40 border-emerald-700 text-emerald-400' : 'bg-rose-900/40 border-rose-700 text-rose-400'}`}>{isLocalProcessorEnabled ? '處理器：運行中' : '處理器：暫停'}</button>
                             <span>{tasks.length} 筆</span>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 p-3 border-b border-slate-800">
                        <div className="flex items-center gap-2 text-rose-400 text-[10px] font-bold">
                            <ShieldOff size={12}/> 系統全域自動排程：
                            <span className="text-slate-500 line-through">每週一 09:00 (已取消)</span>
                        </div>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto space-y-3">
                        {tasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50 space-y-2">
                                <Info size={32}/>
                                <p>目前無預約中任務</p>
                            </div>
                        ) : (
                            tasks.map((task) => (
                                <div key={task.id} className="bg-slate-900 border border-slate-800 rounded p-3 relative group hover:border-slate-700 transition-all">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase ${task.type === 'weekly' ? 'bg-indigo-900 text-indigo-300' : 'bg-emerald-900 text-emerald-300'}`}>{task.type}</span>
                                            <span className="text-amber-200 font-bold">{task.targetDate} {task.targetTime}</span>
                                            {task.repeatType !== 'none' && <RotateCw size={10} className="text-emerald-500" />}
                                        </div>
                                        <button onClick={(e) => handleDeleteTask(e, task.id)} className="text-slate-500 hover:text-rose-500"><Trash2 size={14} /></button>
                                    </div>
                                    <div className="text-white font-bold border-l border-amber-500/50 pl-2 mb-2 italic truncate">{task.info}</div>
                                    <div className="flex flex-wrap gap-1">
                                        {task.targetGroupNames.map((g, i) => (
                                            <span key={i} className="text-[8px] bg-black text-slate-500 px-1 py-0.5 rounded">@{g}</span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
