import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Terminal, RefreshCw, ShieldAlert, CalendarDays, Timer, Settings2, CheckCircle2, Info, SendHorizonal, ListOrdered, CalendarCheck, Trash2, Plus, Users, Globe, UserPlus, UserMinus, Edit3, ArrowUp, ArrowDown, AlertCircle, Activity, Link2, MonitorCheck } from 'lucide-react';

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

// Helper function to map day numbers (0-6) to localized string names
const getDayName = (day: number): string => {
  const dayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  return dayNames[day] || '';
};

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
  
  const [configDay, setConfigDay] = useState<number>(1); 
  const [configTime, setConfigTime] = useState<string>('09:00');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const [savedGroups, setSavedGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(PRESET_GROUPS[0].groupId);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  const [previewDate, setPreviewDate] = useState<string>('');
  const [previewTime, setPreviewTime] = useState<string>('09:00'); 
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [overridePerson, setOverridePerson] = useState<string>(''); 
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0); 
  const [isSkipWeek, setIsSkipWeek] = useState(false); 
  const [forceSuspend, setForceSuspend] = useState(false); 
  const [customReason, setCustomReason] = useState('');

  const [generalContent, setGeneralContent] = useState('');
  const [connectionMode, setConnectionMode] = useState<'local' | 'remote'>('local');
  const [remoteUrl, setRemoteUrl] = useState(''); 
  const [isTriggering, setIsTriggering] = useState(false);
  
  const [logs, setLogs] = useState<Array<{time: string, msg: string, success: boolean | null}>>([]);
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

      const savedUrl = localStorage.getItem('remote_api_url') || '';
      setRemoteUrl(savedUrl);
      
      const savedMode = localStorage.getItem('cfg_conn_mode') as 'local' | 'remote';
      if (savedMode) setConnectionMode(savedMode);

      const savedOffset = localStorage.getItem('roster_calibration_offset');
      setCalibrationOffset(savedOffset ? parseInt(savedOffset, 10) || 0 : 0);

      const savedStaff = localStorage.getItem('cfg_staff_list_v1');
      if (savedStaff) try { setStaffList(JSON.parse(savedStaff)); } catch(e) {}
    }
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('cfg_schedule_day', configDay.toString());
    localStorage.setItem('cfg_schedule_time', configTime);
    localStorage.setItem('cfg_conn_mode', connectionMode);
  }, [configDay, configTime, connectionMode]);

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

  // 修復日誌無反應：確保 state 變更即時反應
  const addLog = (msg: string, success: boolean | null = null) => {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    setLogs(prev => [...prev, { time, msg, success }]);
    console.log(`[Admin_System] ${msg}`);
    
    // 使用微任務確保日誌捲動
    setTimeout(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, 50);
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

  const handleImmediateSend = async () => {
      const targetName = [...PRESET_GROUPS, ...savedGroups].find(g => g.groupId === selectedGroupId)?.name || '未知群組';
      if (!window.confirm(`報告同仁：這將會【立即】發送公告訊息至 ${targetName}，是否執行？`)) return;
      
      // 清除舊日誌並開始發送程序
      setLogs([]);
      await triggerApi(true);
  };

  const triggerApi = async (isManual: boolean) => {
      setIsTriggering(true);
      
      // 1. 立即輸出啟動日誌，不等待非同步
      addLog(`🚀 [系統啟動] 啟動公告發送程序...`);
      addLog(`🔍 [連線診斷] 模式: ${connectionMode === 'remote' ? '遠端部署' : '在地路徑'}`);

      // 2. 判定路徑位址
      const baseUrl = connectionMode === 'remote' 
        ? remoteUrl.trim().replace(/\/$/, '') 
        : window.location.origin;
      
      const fullUrl = `${baseUrl}/api/cron`;
      addLog(`📡 [路徑檢核] 標的網址: ${fullUrl}`);

      const type = activeTab === 'general' ? 'general' : (isSkipWeek || (forceSuspend && !overridePerson) ? 'suspend' : 'weekly');
      const params = new URLSearchParams({
          manual: isManual.toString(),
          type,
          date: `${previewDate}T${previewTime}:00`,
          reason: customReason || '國定假日或特殊事宜',
          content: generalContent,
          groupId: selectedGroupId,
          shift: calibrationOffset.toString(),
          staffList: staffList.join(',')
      });
      if (overridePerson) params.append('person', overridePerson);

      try {
          addLog(`🌐 [網路連線] 正在發送 GET 請求至後端...`);
          const res = await fetch(`${fullUrl}?${params.toString()}`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              mode: 'cors',
          });
          
          if (!res.ok) {
            let errorText = `HTTP ${res.status}`;
            try {
                const errData = await res.json();
                errorText += `: ${errData.message || '伺服器拒絕請求'}`;
            } catch(e) {
                // 如果不是 JSON，試著讀取文字
                const text = await res.text();
                if (text) errorText += `: ${text.substring(0, 50)}...`;
            }
            throw new Error(errorText);
          }
          
          const data = await res.json();
          if (data.success) {
              addLog(`✅ [發送成功] LINE 公告已順利推播！`, true);
              onGenerate(type as any, overridePerson || dutyPerson || generalContent || '本週暫停');
          } else { 
              throw new Error(data.message || 'API 回傳邏輯異常'); 
          }
      } catch (error: any) { 
          addLog(`❌ [發送失敗] ${error.message}`, false);
          addLog(`💡 [建議] 1. 請檢查 LINE Bot Token 是否失效。 2. 嘗試手動重整頁面後再試。`);
      } finally { 
          setIsTriggering(false); 
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">機關排程與即時公告管理</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
          
          {/* Tab Switcher & Target Selector */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
              <div className="flex gap-4">
                  <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'roster' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>科務輪值公告</button>
                  <button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'general' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>一般行政公告</button>
              </div>
              <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter">發送標的：</span>
                  <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)} className="text-xs border rounded-lg px-3 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-indigo-500">
                      {PRESET_GROUPS.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
                      {savedGroups.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
                  </select>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Config Forms */}
              <div className="lg:col-span-2 space-y-6">
                  {activeTab === 'roster' ? (
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                          <div className="flex justify-between items-center mb-2">
                              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Clock size={16}/> 輪值推算與預覽</h3>
                              <div className="flex gap-1">
                                  <button onClick={()=>setQuickDate('today')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded border">今日</button>
                                  <button onClick={()=>setQuickDate('thisMon')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] rounded border">本週基準</button>
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">預覽日期 (基準日)</label>
                                  <input type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">預覽時間</label>
                                  <input type="time" value={previewTime} onChange={e => setPreviewTime(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                              </div>
                          </div>
                          <div className={`p-5 rounded-xl border-2 flex items-center justify-between transition-all ${forceSuspend || isSkipWeek ? 'bg-rose-50 border-rose-100' : 'bg-indigo-50 border-indigo-100'}`}>
                              <div>
                                  <p className={`text-xs font-bold mb-1 ${forceSuspend || isSkipWeek ? 'text-rose-600' : 'text-indigo-600'}`}>擬定輪值人員</p>
                                  <div className={`text-3xl font-black ${forceSuspend || isSkipWeek ? 'text-rose-900' : 'text-indigo-900'}`}>{overridePerson || dutyPerson}</div>
                              </div>
                              <div className="flex flex-col gap-2">
                                  <button onClick={() => setCalibrationOffset(prev => prev + 1)} className="p-1.5 hover:bg-indigo-200 rounded text-indigo-600 transition-colors" title="輪值名單向後推一位"><ArrowUp size={18}/></button>
                                  <button onClick={() => setCalibrationOffset(prev => prev - 1)} className="p-1.5 hover:bg-indigo-200 rounded text-indigo-600 transition-colors" title="輪值名單向前推一位"><ArrowDown size={18}/></button>
                              </div>
                          </div>
                          <div className="flex gap-4 items-center">
                             <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer group">
                                 <input type="checkbox" checked={forceSuspend} onChange={e => setForceSuspend(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                 <span className="group-hover:text-indigo-600 transition-colors">標記暫停辦理 (例如適逢國定假日)</span>
                             </label>
                          </div>
                      </div>
                  ) : (
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Edit3 size={16}/> 公告內容撰寫</h3>
                          <textarea 
                            value={generalContent} 
                            onChange={e => setGeneralContent(e.target.value)} 
                            placeholder="請在此輸入欲公告之內容，系統將會自動套用【行政公告】標題發送..." 
                            className="w-full border rounded-xl p-4 text-sm min-h-[180px] outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-300"
                          />
                      </div>
                  )}

                  {/* 核心診斷區：System Logs */}
                  <div className="bg-slate-900 rounded-xl p-4 text-emerald-400 font-mono text-[11px] overflow-hidden flex flex-col h-[220px] shadow-inner border border-slate-800">
                      <div className="flex items-center justify-between mb-2 border-b border-slate-700 pb-1.5 shrink-0">
                          <div className="flex items-center gap-2"><Terminal size={14} className="text-emerald-500"/> SYSTEM_EXECUTION_LOG</div>
                          <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-white transition-colors">CLEAR_LOGS</button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
                          {logs.length === 0 && <div className="text-slate-700 italic opacity-40">>> 等待執行指令...</div>}
                          {logs.map((log, i) => (
                              <div key={i} className="flex gap-3 leading-relaxed">
                                  <span className="text-slate-600 shrink-0">[{log.time}]</span>
                                  <span className={log.success === true ? 'text-emerald-400' : log.success === false ? 'text-rose-400' : 'text-slate-300'}>
                                      {log.msg}
                                  </span>
                              </div>
                          ))}
                          <div ref={logsEndRef} />
                      </div>
                      <div className="mt-2 text-[9px] text-slate-600 uppercase tracking-widest border-t border-slate-800 pt-1 flex justify-between">
                          <span>Status: {isTriggering ? 'Running...' : 'Ready'}</span>
                          <span>V1.4.2-STABLE</span>
                      </div>
                  </div>
              </div>

              {/* Right Column: Execution Control */}
              <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-md">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MonitorCheck size={16} className="text-emerald-500"/> 執行控制台</h3>
                      <button 
                        onClick={handleImmediateSend}
                        disabled={isTriggering}
                        className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                      >
                        <div className="flex items-center gap-3">
                           {isTriggering ? <RefreshCw size={20} className="animate-spin" /> : <SendHorizonal size={20} />}
                           <span>立即發送至 LINE</span>
                        </div>
                        <span className="text-[10px] font-normal opacity-80">(繞過佇列，直接連動機器人)</span>
                      </button>
                      <div className="mt-6 space-y-3">
                          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 flex gap-2">
                              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                              <p className="text-[10px] text-amber-800 leading-normal">
                                點擊按鈕將會依照當前「左側面板」預覽內容，透過 LINE Messaging API 即時推播至選定群組。
                              </p>
                          </div>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 font-bold text-slate-800 border-b pb-2 mb-2">
                         <Settings2 size={16} className="text-indigo-500"/>
                         <h3>連線模式診斷</h3>
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-lg mb-2">
                          <button onClick={() => setConnectionMode('local')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${connectionMode === 'local' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>在地路徑</button>
                          <button onClick={() => setConnectionMode('remote')} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${connectionMode === 'remote' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>遠端部署</button>
                      </div>
                      {connectionMode === 'remote' ? (
                        <div className="space-y-2 animate-in slide-in-from-top-1">
                            <input 
                              type="text" 
                              value={remoteUrl} 
                              onChange={e => setRemoteUrl(e.target.value)} 
                              placeholder="https://your-api-endpoint.com"
                              className="w-full border rounded-lg px-2 py-1.5 text-[10px] font-mono outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button onClick={() => { localStorage.setItem('remote_api_url', remoteUrl); addLog('💾 遠端端點網址已更新存儲'); }} className="w-full py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100 hover:bg-indigo-100 transition-colors">儲存端點位址</button>
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-50 rounded border border-dashed text-[9px] text-slate-400 font-mono">
                            Base: {window.location.origin}/api/cron
                        </div>
                      )}
                  </div>
              </div>
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors">離開視窗</button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;