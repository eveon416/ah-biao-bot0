
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Terminal, RefreshCw, ShieldAlert, CalendarDays, Timer, Settings2, CheckCircle2, Info, SendHorizonal, ListOrdered, CalendarCheck, Trash2, Plus, Users, Globe, UserPlus, UserMinus, Edit3, ArrowUp, ArrowDown, AlertCircle } from 'lucide-react';

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
  date: string;
  time: string;
  type: string;
  content: string;
  targetName: string;
}

const PRESET_GROUPS: Group[] = [
    { id: 'preset_admin', name: '行政科 (AdminHome)', groupId: 'Cb35ecb9f86b1968dd51e476fdc819655', isPreset: true },
    { id: 'preset_test', name: '測試群 (Test)', groupId: 'C7e04d9539515b89958d12658b938acce', isPreset: true }
];

const DEFAULT_STAFF_LIST = ['林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰', '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'];

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');
  const [staffList, setStaffList] = useState<string[]>(DEFAULT_STAFF_LIST);
  const [isEditingStaff, setIsEditingStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  
  // 排程基準設定
  const [configDay, setConfigDay] = useState<number>(1); 
  const [configTime, setConfigTime] = useState<string>('09:00');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // 群組管理
  const [savedGroups, setSavedGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(PRESET_GROUPS[0].groupId);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  // 當前操作狀態
  const [previewDate, setPreviewDate] = useState<string>('');
  const [previewTime, setPreviewTime] = useState<string>('09:00'); 
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [overridePerson, setOverridePerson] = useState<string>(''); 
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0); 
  const [isSkipWeek, setIsSkipWeek] = useState(false); 
  const [forceSuspend, setForceSuspend] = useState(false); 
  const [customReason, setCustomReason] = useState('');

  // 公告與連線
  const [generalContent, setGeneralContent] = useState('');
  const [remoteUrl, setRemoteUrl] = useState(''); // 預設留空，提示使用者設定
  const [isTriggering, setIsTriggering] = useState(false);
  
  // 任務與日誌
  const [logs, setLogs] = useState<Array<{time: string, msg: string, success: boolean | null}>>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      setPreviewDate(today.toISOString().split('T')[0]);
      
      const savedDay = localStorage.getItem('cfg_schedule_day');
      if (savedDay) setConfigDay(parseInt(savedDay, 10));
      const savedTime = localStorage.getItem('cfg_schedule_time');
      if (savedTime) setConfigTime(savedTime);
      
      const savedGroupsData = localStorage.getItem('line_groups_v1');
      if (savedGroupsData) try { setSavedGroups(JSON.parse(savedGroupsData)); } catch (e) {}

      const savedTasks = localStorage.getItem('cfg_scheduled_tasks_v3');
      if (savedTasks) try { setScheduledTasks(JSON.parse(savedTasks)); } catch(e) {}

      // 嘗試獲取目前部署的 URL
      const currentUrl = window.location.origin;
      const savedUrl = localStorage.getItem('remote_api_url') || currentUrl;
      setRemoteUrl(savedUrl);
      
      const savedOffset = localStorage.getItem('roster_calibration_offset');
      setCalibrationOffset(savedOffset ? parseInt(savedOffset, 10) || 0 : 0);

      const savedStaff = localStorage.getItem('cfg_staff_list_v1');
      if (savedStaff) try { setStaffList(JSON.parse(savedStaff)); } catch(e) {}
    }
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('cfg_schedule_day', configDay.toString());
    localStorage.setItem('cfg_schedule_time', configTime);
  }, [configDay, configTime]);

  useEffect(() => {
    localStorage.setItem('cfg_scheduled_tasks_v3', JSON.stringify(scheduledTasks));
  }, [scheduledTasks]);

  useEffect(() => {
    localStorage.setItem('cfg_staff_list_v1', JSON.stringify(staffList));
  }, [staffList]);

  useEffect(() => {
     if (!previewDate) return;
     const dateObj = new Date(`${previewDate}T${previewTime}:00`);
     const SKIP_WEEKS = ['2025-01-27', '2026-02-16'];
     
     const dayOfWeek = dateObj.getDay(); 
     const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
     const monday = new Date(dateObj);
     monday.setDate(dateObj.getDate() + diffToMon);
     const mStr = monday.toISOString().split('T')[0];
     
     const systemSkip = SKIP_WEEKS.includes(mStr);
     setIsSkipWeek(systemSkip);

     if (systemSkip) {
         setDutyPerson('暫停 (系統預設)');
     } else if (forceSuspend) {
         setDutyPerson('暫停 (手動強制)');
     } else {
         const anchorDate = new Date('2025-12-08T09:00:00+08:00'); 
         const anchorIndex = 6;
         const oneWeekMs = 604800000;
         const rawDiffTime = dateObj.getTime() - anchorDate.getTime();
         const rawWeeks = Math.floor(rawDiffTime / oneWeekMs);
         const totalWeeks = rawWeeks + calibrationOffset;

         let targetIndex = (anchorIndex + totalWeeks) % staffList.length;
         if (targetIndex < 0) targetIndex += staffList.length;
         setDutyPerson(`${staffList[targetIndex]} (系統預估)`);
     }
  }, [previewDate, previewTime, forceSuspend, calibrationOffset, staffList]);

  const addLog = (msg: string, success: boolean | null = null) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, msg, success }]);
    // 立即滾動到最新一筆
    setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 10);
  };

  const handleAddStaff = () => {
    if (newStaffName.trim()) {
      setStaffList([...staffList, newStaffName.trim()]);
      setNewStaffName('');
      addLog(`👤 已新增輪值人員：${newStaffName}`);
    }
  };

  const handleRemoveStaff = (name: string) => {
    if (window.confirm(`確定要將「${name}」從輪值名單中刪除嗎？`)) {
      setStaffList(staffList.filter(s => s !== name));
      addLog(`👤 已刪除輪值人員：${name}`);
    }
  };

  const moveStaff = (index: number, direction: 'up' | 'down') => {
    const newList = [...staffList];
    if (direction === 'up' && index > 0) {
      [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
    } else if (direction === 'down' && index < newList.length - 1) {
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    }
    setStaffList(newList);
  };

  const handleAddGroup = () => {
      if (!newGroupName || !newGroupId) return;
      const group: Group = { id: Date.now().toString(), name: newGroupName, groupId: newGroupId };
      const updated = [...savedGroups, group];
      setSavedGroups(updated);
      localStorage.setItem('line_groups_v1', JSON.stringify(updated));
      setNewGroupName(''); setNewGroupId(''); setIsAddingGroup(false);
  };

  const setQuickDate = (mode: 'today' | 'thisMon' | 'nextMon') => {
      const now = new Date();
      if (mode === 'today') {
          setPreviewDate(now.toISOString().split('T')[0]);
      } else {
          const day = now.getDay();
          const diff = (day === 0 ? -6 : 1) - day;
          const target = new Date(now);
          target.setDate(now.getDate() + diff + (mode === 'nextMon' ? 7 : 0));
          setPreviewDate(target.toISOString().split('T')[0]);
      }
      setPreviewTime(configTime); 
  };

  const formatDisplayTime = (timeStr: string) => {
      if (!timeStr) return '--:--';
      const [h, m] = timeStr.split(':');
      const hour = parseInt(h);
      const suffix = hour >= 12 ? '下午' : '上午';
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      return `${suffix} ${String(displayHour).padStart(2, '0')}:${m}`;
  };

  const handleImmediateSend = async () => {
      const targetName = [...PRESET_GROUPS, ...savedGroups].find(g => g.groupId === selectedGroupId)?.name || '未知群組';
      if (!window.confirm(`報告同仁：這將會【立即】發送公告訊息至 ${targetName}，是否執行？`)) return;
      await triggerApi(true);
  };

  const handleScheduleTask = () => {
      const targetName = [...PRESET_GROUPS, ...savedGroups].find(g => g.groupId === selectedGroupId)?.name || '未知群組';
      const contentText = activeTab === 'roster' ? (overridePerson || dutyPerson) : generalContent.substring(0, 20) + (generalContent.length > 20 ? '...' : '');
      const newTask: ScheduledTask = {
          id: Date.now().toString(),
          date: previewDate,
          time: previewTime,
          type: activeTab === 'roster' ? '輪值公告' : '一般行政',
          content: contentText,
          targetName: targetName
      };
      setScheduledTasks(prev => [newTask, ...prev]);
      addLog(`📅 已錄入預定任務：${previewDate} ${formatDisplayTime(previewTime)}`);
  };

  const triggerApi = async (isManual: boolean) => {
      setIsTriggering(true);
      // 確保日誌立即出現
      addLog(isManual ? '🚀 啟動即時發送程序...' : '🤖 啟動排程模擬程序...');

      const baseUrl = remoteUrl.replace(/\/$/, '');
      const fullUrl = `${baseUrl}/api/cron`;

      if (baseUrl.includes('ah-biao-bot0.vercel.app')) {
          addLog(`⚠️ 偵測到使用預設範例網址，請確認您的 Vercel 部署路徑是否已正確填寫於「遠端 URL」。`, false);
      }

      const type = activeTab === 'general' ? 'general' : (isSkipWeek || (forceSuspend && !overridePerson) ? 'suspend' : 'weekly');
      const params = new URLSearchParams({
          manual: isManual.toString(),
          type,
          date: `${previewDate}T${previewTime}:00`,
          reason: customReason,
          content: generalContent,
          groupId: selectedGroupId,
          shift: calibrationOffset.toString(),
          staffList: staffList.join(',')
      });
      if (overridePerson) params.append('person', overridePerson);

      try {
          addLog(`📡 連線中：${fullUrl}`);
          const res = await fetch(`${fullUrl}?${params.toString()}`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              mode: 'cors',
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errorText || '連線拒絕'}`);
          }
          
          const data = await res.json();
          if (data.success) {
              addLog(`✅ LINE 公告發送成功！`, true);
              onGenerate(type as any, overridePerson || dutyPerson || generalContent);
          } else { 
              throw new Error(data.message || 'API 回傳邏輯錯誤'); 
          }
      } catch (error: any) { 
          addLog(`❌ 發送失敗：${error.message}`, false);
          addLog(`💡 建議：請確認遠端服務器是否已部署且 .env 變數 (TOKEN) 已設定。`);
          console.error("API Call Error:", error);
      } finally { 
          setIsTriggering(false); 
      }
  };

  const removeTask = (id: string) => {
      setScheduledTasks(prev => prev.filter(t => t.id !== id));
  };

  const getDayName = (d: number) => ["週日", "週一", "週二", "週三", "週四", "週五", "週六"][d];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-6xl rounded-xl shadow-2xl flex flex-col h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold official-font">排程廣播控制台</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Left Main Content */}
            <div className="w-full md:w-2/3 flex flex-col bg-slate-50 border-r border-slate-200 overflow-y-auto p-6 scroll-smooth">
                
                {/* 1. 系統基準與群組設定 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* 排程基準 */}
                    <div className={`p-4 rounded-xl border transition-all ${isConfigOpen ? 'bg-white border-indigo-500 shadow-md' : 'bg-indigo-900 border-indigo-800 text-indigo-100'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarDays size={18} className={isConfigOpen ? 'text-indigo-600' : 'text-indigo-300'}/>
                                <span className="text-xs font-bold">自動發送基準時間</span>
                            </div>
                            <button onClick={()=>setIsConfigOpen(!isConfigOpen)} className="text-[10px] underline opacity-70 hover:opacity-100">
                                {isConfigOpen ? '完成' : '修改設定'}
                            </button>
                        </div>
                        <p className="mt-1 text-sm font-bold">每{getDayName(configDay)} {formatDisplayTime(configTime)}</p>
                        
                        {isConfigOpen && (
                            <div className="mt-3 grid grid-cols-2 gap-2 animate-in slide-in-from-top-1">
                                <select value={configDay} onChange={e=>setConfigDay(parseInt(e.target.value))} className="p-1.5 text-[10px] border rounded bg-slate-50 text-slate-800 outline-none">
                                    {[1,2,3,4,5,6,0].map(d => <option key={d} value={d}>每{getDayName(d)}</option>)}
                                </select>
                                <input type="time" value={configTime} onChange={e=>setConfigTime(e.target.value)} className="p-1.5 text-[10px] border rounded bg-slate-50 text-slate-800 outline-none" />
                            </div>
                        )}
                    </div>

                    {/* 發布目標群組 */}
                    <div className="p-4 rounded-xl border bg-white border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-indigo-600">
                                <Globe size={18}/>
                                <span className="text-xs font-bold">發布目標群組</span>
                            </div>
                            <button onClick={()=>setIsAddingGroup(!isAddingGroup)} className="p-1 hover:bg-slate-100 rounded text-indigo-600 transition-colors">
                                <Plus size={16}/>
                            </button>
                        </div>
                        <select value={selectedGroupId} onChange={e=>setSelectedGroupId(e.target.value)} className="w-full p-2 text-xs border rounded bg-slate-50 outline-none cursor-pointer">
                            {[...PRESET_GROUPS, ...savedGroups].map(g => (
                                <option key={g.groupId} value={g.groupId}>{g.name}</option>
                            ))}
                        </select>
                        
                        <div className="mt-2 bg-slate-50 p-2 rounded border border-slate-100">
                            <p className="text-[9px] text-slate-400 font-mono uppercase tracking-tighter">Group ID / Token:</p>
                            <p className="text-[10px] text-indigo-600 font-mono break-all">{selectedGroupId}</p>
                        </div>
                        
                        {isAddingGroup && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 animate-in zoom-in-95">
                                <input type="text" placeholder="群組名稱" value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} className="w-full p-1.5 text-[10px] border rounded outline-none" />
                                <input type="text" placeholder="LINE Group ID / Token" value={newGroupId} onChange={e=>setNewGroupId(e.target.value)} className="w-full p-1.5 text-[10px] border rounded outline-none" />
                                <button onClick={handleAddGroup} className="w-full py-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded">儲存群組</button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex bg-slate-200 rounded-lg p-1 mb-6 shrink-0">
                    <button onClick={()=>setActiveTab('roster')} className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${activeTab==='roster'?'bg-white shadow-sm':'text-slate-500'}`}>科務會議輪值公告</button>
                    <button onClick={()=>setActiveTab('general')} className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${activeTab==='general'?'bg-white shadow-sm':'text-slate-500'}`}>一般行政公告</button>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
                    {activeTab === 'roster' ? (
                        <>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Clock size={14}/> 1. 設定發布日期與時間</label>
                                    <div className="flex gap-1">
                                        <button onClick={()=>setQuickDate('today')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded border border-slate-200 transition-colors">今天</button>
                                        <button onClick={()=>setQuickDate('thisMon')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded border border-slate-200 transition-colors">本週基準</button>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="w-[50%] relative">
                                        <input type="date" value={previewDate} onChange={e=>setPreviewDate(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                                    </div>
                                    <div className="w-[50%] relative">
                                        <div className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none"><Timer size={14}/></div>
                                        <input type="time" value={previewTime} onChange={e=>setPreviewTime(e.target.value)} className="w-full pl-9 pr-2 py-2 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20" />
                                    </div>
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border-2 transition-all ${forceSuspend || isSkipWeek ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-100'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className={`text-[10px] uppercase font-bold ${forceSuspend || isSkipWeek ? 'text-rose-400' : 'text-emerald-500'}`}>擬定輪值人員</span>
                                    <div className="flex items-center gap-2">
                                        <button onClick={()=>setIsEditingStaff(!isEditingStaff)} className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors">
                                            <Edit3 size={10}/> {isEditingStaff ? '儲存並關閉' : '編輯/排位名單'}
                                        </button>
                                        {isSkipWeek && <span className="text-[9px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold">預定暫停</span>}
                                    </div>
                                </div>
                                
                                {isEditingStaff ? (
                                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-3 animate-in fade-in max-h-60 overflow-y-auto custom-scrollbar">
                                        <div className="flex gap-2 sticky top-0 bg-white pb-2 border-b">
                                            <input type="text" placeholder="輸入人員姓名" value={newStaffName} onChange={e=>setNewStaffName(e.target.value)} className="flex-1 p-2 text-xs border rounded outline-none" />
                                            <button onClick={handleAddStaff} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"><UserPlus size={16}/></button>
                                        </div>
                                        <div className="space-y-1">
                                            {staffList.map((name, i) => (
                                                <div key={i} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded border border-slate-200 group hover:border-indigo-300 transition-colors">
                                                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-2">
                                                        <span className="text-[9px] text-slate-300 font-mono">#{i+1}</span>
                                                        {name}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={()=>moveStaff(i, 'up')} disabled={i===0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors"><ArrowUp size={12}/></button>
                                                        <button onClick={()=>moveStaff(i, 'down')} disabled={i===staffList.length-1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors"><ArrowDown size={12}/></button>
                                                        <button onClick={()=>handleRemoveStaff(name)} className="p-1 text-rose-300 hover:text-rose-600 ml-1 transition-colors"><UserMinus size={12}/></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2 py-2">
                                        {overridePerson || dutyPerson}
                                        {!forceSuspend && !isSkipWeek && <CheckCircle2 size={20} className="text-emerald-500 animate-in zoom-in duration-300"/>}
                                    </div>
                                )}
                                
                                <div className="mt-4 flex gap-3 items-center">
                                     <select value={overridePerson} onChange={e=>setOverridePerson(e.target.value)} className="flex-1 text-xs p-2.5 border rounded-lg bg-white shadow-sm outline-none cursor-pointer">
                                         <option value="">-- 手動更換為其他同仁 --</option>
                                         {staffList.map(p => <option key={p} value={p}>{p}</option>)}
                                     </select>
                                     <button onClick={()=>setForceSuspend(!forceSuspend)} className={`p-2.5 rounded-lg border transition-all ${forceSuspend?'bg-rose-600 text-white border-rose-600':'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`} title="強制標記為暫停">
                                         <ShieldAlert size={20}/>
                                     </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-500">2. 備註事由 (選填)</label>
                                    <input type="text" placeholder="例：補發公告、日期異動說明..." value={customReason} onChange={e=>setCustomReason(e.target.value)} className="w-full px-4 py-2 mt-1 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"/>
                                </div>
                                <button onClick={handleScheduleTask} className="w-full py-3 bg-white border-2 border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]">
                                    <CalendarCheck size={18}/> 錄入臨時預定任務 (顯示於右側清單)
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col h-full space-y-4">
                            <label className="text-xs font-bold text-slate-500">公告文字內容</label>
                            <textarea value={generalContent} onChange={e=>setGeneralContent(e.target.value)} className="w-full flex-1 min-h-[160px] p-4 text-sm border rounded-lg bg-slate-50 resize-none outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="報告同仁，請注意以下事項..."/>
                            <button onClick={handleScheduleTask} className="w-full py-3 bg-white border-2 border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]">
                                <CalendarCheck size={18}/> 錄入此公告發布時間
                            </button>
                        </div>
                    )}
                </div>

                {/* Bottom Action */}
                <div className="mt-8 space-y-4">
                    <div className="p-3 bg-slate-100 rounded-lg border flex items-center gap-3">
                        <div className="bg-slate-200 p-2 rounded text-slate-500"><Globe size={16}/></div>
                        <div className="flex-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">遠端 API URL (Vercel Endpoint)</p>
                            <input type="text" value={remoteUrl} onChange={e=>setRemoteUrl(e.target.value)} className="w-full bg-transparent border-none text-[11px] font-mono text-indigo-600 p-0 outline-none" placeholder="https://your-app.vercel.app" />
                        </div>
                        <button onClick={()=>localStorage.setItem('remote_api_url', remoteUrl)} className="text-[10px] text-indigo-600 underline font-bold">儲存路徑</button>
                    </div>

                    <button onClick={handleImmediateSend} disabled={isTriggering} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-3 shadow-xl hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50">
                        {isTriggering ? <RefreshCw className="animate-spin" size={20}/> : <SendHorizonal size={20}/>}
                        <div className="text-left">
                            <p className="text-sm">立即發送至 LINE 群組 (手動執行)</p>
                            <p className="text-[10px] opacity-60 font-normal">直接連線 Vercel API 發送訊息，不經由前端模擬</p>
                        </div>
                    </button>
                </div>
            </div>

            {/* Right Side Info Bar */}
            <div className="hidden md:flex flex-col md:w-1/3 bg-slate-900 overflow-hidden shrink-0">
                {/* 上半部：詳細執行日誌 */}
                <div className="h-1/3 p-4 flex flex-col border-b border-slate-800 bg-slate-950/50">
                    <div className="flex items-center justify-between text-emerald-400 font-mono text-[10px] mb-2 uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                            <Terminal size={12}/> <span>System_Execution_Log</span>
                        </div>
                        {isTriggering && <div className="animate-pulse flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> BUSY</div>}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[10px] custom-scrollbar pr-1 bg-black/30 p-2 rounded border border-white/5 shadow-inner">
                        {logs.length === 0 && <div className="text-slate-700 italic opacity-40">>> 等待操作指令中...</div>}
                        {logs.map((log, idx) => (
                            <div key={idx} className={`leading-relaxed ${log.success===false?'text-rose-400':(log.success===true?'text-emerald-300':'text-slate-500')}`}>
                                <span className="opacity-30">[{log.time}]</span> <span className="ml-1">{log.msg}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef}/>
                    </div>
                </div>

                {/* 下半部：預定發布任務預覽 */}
                <div className="h-2/3 p-4 flex flex-col overflow-hidden bg-slate-900/50">
                    <div className="flex items-center justify-between text-indigo-300 font-bold text-xs mb-3">
                        <div className="flex items-center gap-2"><ListOrdered size={14}/> 預定發布任務預覽</div>
                        <span className="bg-indigo-900 text-[10px] px-2 py-0.5 rounded border border-indigo-800">{scheduledTasks.length}</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                        {scheduledTasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700 italic text-[10px] space-y-2">
                                <CalendarDays size={20} className="opacity-10"/>
                                <p>目前尚無預定發布的紀錄</p>
                            </div>
                        ) : (
                            scheduledTasks.map((task) => (
                                <div key={task.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3 relative group hover:border-indigo-500/50 transition-all shadow-inner animate-in slide-in-from-right-2">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-indigo-400 text-[9px] font-bold px-1.5 py-0.5 bg-indigo-950 rounded border border-indigo-900">
                                            {task.type}
                                        </span>
                                        <button onClick={() => removeTask(task.id)} className="text-slate-600 hover:text-rose-400 transition-colors"><Trash2 size={12}/></button>
                                    </div>
                                    <div className="text-white text-xs font-bold my-1.5 flex items-center gap-1.5">
                                        <CalendarDays size={10} className="text-slate-500"/> {task.date}
                                        <span className="text-slate-600">|</span>
                                        <Timer size={10} className="text-slate-500"/> {formatDisplayTime(task.time)}
                                    </div>
                                    <div className="text-slate-400 text-[10px] line-clamp-2 border-t border-slate-700/50 pt-1.5 mt-1 font-serif italic">
                                        內容：{task.content}
                                    </div>
                                    <div className="text-[9px] text-emerald-500/70 mt-2 uppercase tracking-tighter flex items-center gap-1">
                                        <Users size={10}/> 對象：{task.targetName}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    
                    <div className="pt-2 text-[9px] text-slate-600 border-t border-slate-800 mt-2 italic leading-relaxed">
                        <div className="flex gap-1 items-start">
                            <AlertCircle size={10} className="shrink-0 mt-0.5"/>
                            <span>註：此清單僅供瀏覽預覽。正式發送將依照基準時間自動執行，或透過左側按鈕手動即時發送。</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
