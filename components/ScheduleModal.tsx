
import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, UserCircle, Terminal, MessageSquare, ArrowRight, Server, Users, Plus, Trash2, Globe, Sparkles, CheckSquare, Square, Settings, RefreshCw, AlertCircle, ShieldAlert, Edit3, Sliders, UserPlus, Minus, CalendarDays, Timer } from 'lucide-react';

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

const DEFAULT_STAFF_LIST = ['林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰', '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'];
const DEFAULT_REMOTE_URL = 'https://ah-biao-bot0.vercel.app';

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate, onRequestRefine }) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');
  const [staffList, setStaffList] = useState<string[]>(DEFAULT_STAFF_LIST);
  const [isManageStaffOpen, setIsManageStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');

  // Roster State
  const [previewDate, setPreviewDate] = useState<string>('');
  const [previewTime, setPreviewTime] = useState<string>('09:00'); 
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [overridePerson, setOverridePerson] = useState<string>(''); 
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0); 
  const [isSkipWeek, setIsSkipWeek] = useState(false); 
  const [forceSuspend, setForceSuspend] = useState(false); 
  const [customReason, setCustomReason] = useState('');

  // General Announcement State
  const [generalContent, setGeneralContent] = useState('');
  const [savedGroups, setSavedGroups] = useState<Group[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([PRESET_GROUPS[0].groupId]); 
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  // Connection State
  const [connectionMode, setConnectionMode] = useState<'remote' | 'local'>('remote');
  const [remoteUrl, setRemoteUrl] = useState(DEFAULT_REMOTE_URL); 
  const [isTriggering, setIsTriggering] = useState(false);
  const [logs, setLogs] = useState<Array<{time: string, msg: string, success: boolean | null}>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      setPreviewDate(today.toISOString().split('T')[0]);
      
      const savedOffset = localStorage.getItem('roster_calibration_offset');
      setCalibrationOffset(savedOffset ? parseInt(savedOffset, 10) || 0 : 0);
      const savedStaff = localStorage.getItem('roster_staff_list');
      if (savedStaff) try { setStaffList(JSON.parse(savedStaff)); } catch(e) {}

      const savedUrl = localStorage.getItem('remote_api_url');
      if (savedUrl) setRemoteUrl(savedUrl);
      
      const savedGroupsData = localStorage.getItem('line_groups_v1');
      if (savedGroupsData) try { setSavedGroups(JSON.parse(savedGroupsData)); } catch (e) {}
    }
  }, [isOpen]);

  useEffect(() => {
     if (!previewDate) return;
     // 確保以台北時間計算
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

  const setQuickDate = (mode: 'today' | 'thisMon' | 'nextMon') => {
      const now = new Date();
      if (mode === 'today') {
          setPreviewDate(now.toISOString().split('T')[0]);
      } else if (mode === 'thisMon' || mode === 'nextMon') {
          const day = now.getDay();
          const diff = (day === 0 ? -6 : 1) - day;
          const target = new Date(now);
          target.setDate(now.getDate() + diff + (mode === 'nextMon' ? 7 : 0));
          setPreviewDate(target.toISOString().split('T')[0]);
      }
      setPreviewTime('09:00');
  };

  const handleTrigger = async () => {
      if (selectedGroupIds.length === 0) { alert("請選擇目標群組"); return; }
      setIsTriggering(true);
      setLogs([]); 
      addLog('🚀 開始執行手動廣播...');

      let type = activeTab === 'general' ? 'general' : (isSkipWeek || (forceSuspend && !overridePerson) ? 'suspend' : 'weekly');
      let baseUrl = connectionMode === 'remote' ? remoteUrl.replace(/\/$/, '') : '';
      const fullUrl = `${baseUrl}/api/cron`;

      const params = new URLSearchParams({
          manual: 'true',
          type,
          date: `${previewDate}T${previewTime}:00`,
          reason: customReason,
          content: generalContent,
          groupId: selectedGroupIds.join(','),
          shift: calibrationOffset.toString(),
          staffList: staffList.join(',')
      });
      if (overridePerson) params.append('person', overridePerson);

      try {
          const res = await fetch(`${fullUrl}?${params.toString()}`);
          const data = await res.json();
          if (data.success) {
              addLog(`✅ 發送成功！`, true);
              onGenerate(type as any, overridePerson || dutyPerson || generalContent);
              setTimeout(() => onClose(), 2000);
          } else { throw new Error(data.message); }
      } catch (error: any) { addLog(`❌ 失敗: ${error.message}`, false); } finally { setIsTriggering(false); }
  };

  const addLog = (msg: string, success: boolean | null = null) => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, success }]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold official-font">排程廣播控制台</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            <div className="w-full md:w-2/3 flex flex-col bg-slate-50 border-r border-slate-200 overflow-y-auto p-6">
                
                <div className="mb-6 bg-indigo-900 text-indigo-100 p-4 rounded-xl shadow-inner border border-indigo-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-700 p-2 rounded-lg"><CalendarDays size={20}/></div>
                        <div>
                            <p className="text-[10px] uppercase font-bold opacity-60">System Automated Schedule</p>
                            <p className="text-sm font-bold">每週一 上午 09:00 (TPE)</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] opacity-60">Status</p>
                        <p className="text-xs font-mono text-emerald-400">Ready</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <label className="text-xs font-bold text-slate-500 mb-2 block">連線模式</label>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button onClick={()=>setConnectionMode('local')} className={`flex-1 py-1 text-[10px] font-bold rounded ${connectionMode==='local'?'bg-white shadow text-indigo-600':'text-slate-400'}`}>LOCAL</button>
                            <button onClick={()=>setConnectionMode('remote')} className={`flex-1 py-1 text-[10px] font-bold rounded ${connectionMode==='remote'?'bg-white shadow text-emerald-600':'text-slate-400'}`}>REMOTE</button>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <label className="text-xs font-bold text-slate-500 mb-2 block">發送目標</label>
                        <select className="w-full text-xs border-none bg-slate-50 rounded p-1 outline-none" onChange={(e)=>setSelectedGroupIds([e.target.value])}>
                            {[...PRESET_GROUPS, ...savedGroups].map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex bg-slate-200 rounded-lg p-1 mb-4">
                    <button onClick={()=>setActiveTab('roster')} className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${activeTab==='roster'?'bg-white shadow-sm':'text-slate-500'}`}>科務會議輪值</button>
                    <button onClick={()=>setActiveTab('general')} className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${activeTab==='general'?'bg-white shadow-sm':'text-slate-500'}`}>一般公告</button>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
                    {activeTab === 'roster' ? (
                        <>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><CalendarDays size={14}/> 預定發送日期及時間</label>
                                    <div className="flex gap-1">
                                        <button onClick={()=>setQuickDate('today')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded border border-slate-200">今天</button>
                                        <button onClick={()=>setQuickDate('thisMon')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded border border-slate-200">本週一</button>
                                        <button onClick={()=>setQuickDate('nextMon')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded border border-slate-200">下週一</button>
                                    </div>
                                </div>
                                
                                {/* 調整日期與時間的寬度比例：60% / 40% */}
                                <div className="flex gap-3">
                                    <div className="w-3/5 relative">
                                        <input 
                                            type="date" 
                                            value={previewDate} 
                                            onChange={e=>setPreviewDate(e.target.value)} 
                                            className="w-full pl-3 pr-3 py-2 text-sm border rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                        />
                                    </div>
                                    <div className="w-2/5 relative">
                                        <div className="absolute left-2 top-2.5 text-slate-400 pointer-events-none"><Timer size={14}/></div>
                                        <input 
                                            type="time" 
                                            value={previewTime} 
                                            onChange={e=>setPreviewTime(e.target.value)} 
                                            className="w-full pl-8 pr-2 py-2 text-sm border rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border-2 transition-all ${forceSuspend || isSkipWeek ? 'bg-rose-50 border-rose-200' : 'bg-indigo-50 border-indigo-100'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] uppercase font-bold text-indigo-400">Estimated Duty Person</span>
                                    {isSkipWeek && <span className="text-[9px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold">國定假暫停</span>}
                                </div>
                                <div className="text-2xl font-black text-slate-800 tracking-tight">
                                    {overridePerson || dutyPerson}
                                </div>
                                
                                <div className="mt-4 flex gap-3 items-center">
                                     <select value={overridePerson} onChange={e=>setOverridePerson(e.target.value)} className="flex-1 text-xs p-2 border rounded bg-white shadow-sm outline-none">
                                         <option value="">-- 自動推算人員 --</option>
                                         {staffList.map(p => <option key={p} value={p}>{p}</option>)}
                                     </select>
                                     <button onClick={()=>setForceSuspend(!forceSuspend)} className={`p-2 rounded-lg border transition-colors ${forceSuspend?'bg-rose-600 text-white border-rose-600':'bg-white text-rose-600 border-rose-200'}`} title="強制暫停本週公告">
                                         <ShieldAlert size={18}/>
                                     </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500">備註事由 (僅內部紀錄)</label>
                                <input type="text" placeholder="例：颱風順延、補發通知..." value={customReason} onChange={e=>setCustomReason(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"/>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col h-full space-y-3">
                            <label className="text-xs font-bold text-slate-500">公告內容</label>
                            <textarea value={generalContent} onChange={e=>setGeneralContent(e.target.value)} className="w-full flex-1 min-h-[150px] p-3 text-sm border rounded-lg bg-slate-50 resize-none outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="請輸入欲廣播之內容..."/>
                        </div>
                    )}
                </div>

                <div className="mt-6">
                    <button onClick={handleTrigger} disabled={isTriggering} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-indigo-700 active:scale-[0.98] transition-all">
                        {isTriggering ? <RefreshCw className="animate-spin"/> : <ArrowRight/>}
                        {isTriggering ? '發送指令執行中...' : '手動執行當前廣播'}
                    </button>
                </div>
            </div>

            <div className="hidden md:flex flex-col md:w-1/3 bg-slate-900 text-emerald-400 font-mono text-[10px] p-4 space-y-2">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-2">
                    <Terminal size={14}/> <span>SYSTEM_LOG_STREAM</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                    {logs.map((log, idx) => (
                        <div key={idx} className={log.success===false?'text-rose-400':(log.success===true?'text-emerald-300':'text-slate-500')}>
                            [{log.time}] {log.msg}
                        </div>
                    ))}
                    <div ref={logsEndRef}/>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
