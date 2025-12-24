
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

interface ScheduledTask {
  id: string;
  date: string;
  time: string;
  type: string;
  content: string;
  targetName: string;
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

  const addLog = (msg: string, success: boolean | null = null) => {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    setLogs(prev => [...prev, { time, msg, success }]);
    
    setTimeout(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, 50);
  };

  const handleImmediateSend = async () => {
      const targetName = overridePerson || (dutyPerson.includes('暫停') ? null : dutyPerson.split(' ')[0]);
      const actionType = forceSuspend || isSkipWeek ? 'suspend' : activeTab === 'roster' ? 'weekly' : 'general';
      
      setIsTriggering(true);
      addLog(`準備發送 ${actionType === 'weekly' ? '週知公告' : actionType === 'suspend' ? '暫停公告' : '一般公告'}...`);

      try {
          const params = new URLSearchParams({
              manual: 'true',
              type: actionType,
              groupId: selectedGroupId,
              person: targetName || '',
              reason: customReason || '國定假日或事宜',
              content: generalContent,
              staffList: staffList.join(',')
          });

          const url = connectionMode === 'local' 
            ? `/api/cron?${params.toString()}`
            : `${remoteUrl}?${params.toString()}`;

          const response = await fetch(url);
          const result = await response.json();

          if (result.success) {
              addLog('發送成功！LINE 已送達。', true);
              onGenerate(actionType as any, targetName || customReason || generalContent || '本週暫停');
          } else {
              addLog(`發送失敗: ${result.message}`, false);
          }
      } catch (error: any) {
          addLog(`連線出錯: ${error.message}`, false);
      } finally {
          setIsTriggering(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">機關排程與即時公告管理</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
          
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex gap-4">
                  <button onClick={() => setActiveTab('roster')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'roster' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>輪值管理</button>
                  <button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'general' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>一般公告</button>
              </div>
              <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">發送目標：</span>
                  <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)} className="text-xs border rounded px-2 py-1 bg-slate-50 outline-none">
                      {PRESET_GROUPS.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
                      {savedGroups.map(g => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
                  </select>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Form */}
              <div className="lg:col-span-2 space-y-6">
                  {activeTab === 'roster' ? (
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Clock size={16}/> 輪值推算與預覽</h3>
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">預覽日期</label>
                                  <input type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">預覽時間</label>
                                  <input type="time" value={previewTime} onChange={e => setPreviewTime(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                              </div>
                          </div>
                          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
                              <div>
                                  <p className="text-xs text-indigo-600 font-bold mb-1">推算輪值人員</p>
                                  <div className="text-2xl font-black text-indigo-900">{dutyPerson}</div>
                              </div>
                              <div className="flex flex-col gap-2">
                                  <button onClick={() => setCalibrationOffset(prev => prev + 1)} className="p-1 hover:bg-indigo-200 rounded text-indigo-600"><ArrowUp size={16}/></button>
                                  <button onClick={() => setCalibrationOffset(prev => prev - 1)} className="p-1 hover:bg-indigo-200 rounded text-indigo-600"><ArrowDown size={16}/></button>
                              </div>
                          </div>
                          <div className="flex gap-4">
                             <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                 <input type="checkbox" checked={forceSuspend} onChange={e => setForceSuspend(e.target.checked)} className="rounded" />
                                 手動標記暫停辦理
                             </label>
                          </div>
                      </div>
                  ) : (
                      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Edit3 size={16}/> 公告內容撰寫</h3>
                          <textarea 
                            value={generalContent} 
                            onChange={e => setGeneralContent(e.target.value)} 
                            placeholder="請輸入欲公告之事項..." 
                            className="w-full border rounded-xl p-4 text-sm min-h-[150px] outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                      </div>
                  )}

                  <div className="bg-slate-800 rounded-xl p-4 text-emerald-400 font-mono text-xs overflow-hidden flex flex-col h-[200px]">
                      <div className="flex items-center justify-between mb-2 border-b border-slate-700 pb-1 shrink-0">
                          <div className="flex items-center gap-2"><Terminal size={14}/> SYSTEM_LOGS</div>
                          <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-white">CLEAR</button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1">
                          {logs.map((log, i) => (
                              <div key={i} className="flex gap-2">
                                  <span className="text-slate-500">[{log.time}]</span>
                                  <span className={log.success === true ? 'text-emerald-400' : log.success === false ? 'text-rose-400' : 'text-slate-300'}>
                                      {log.msg}
                                  </span>
                              </div>
                          ))}
                          <div ref={logsEndRef} />
                      </div>
                  </div>
              </div>

              {/* Right Column: Actions */}
              <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MonitorCheck size={16}/> 執行控制台</h3>
                      <button 
                        onClick={handleImmediateSend}
                        disabled={isTriggering}
                        className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-emerald-500 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                      >
                        {isTriggering ? <RefreshCw size={20} className="animate-spin" /> : <SendHorizonal size={20} />}
                        立即發送至 LINE
                      </button>
                      <p className="text-[10px] text-slate-400 mt-4 text-center leading-relaxed italic">
                        ※ 點擊按鈕將跨過排程佇列，直接連動 LINE 機器人。
                      </p>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><Settings2 size={16}/> 系統全域設定</h3>
                      <div className="space-y-3">
                          <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">自動排程基準</span>
                              <span className="text-xs font-bold text-slate-900">{getDayName(configDay)} {configTime}</span>
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-500">連線模式</span>
                              <span className="text-xs font-bold bg-slate-100 px-2 py-0.5 rounded uppercase tracking-tighter">{connectionMode}</span>
                          </div>
                      </div>
                      <button onClick={() => setIsConfigOpen(!isConfigOpen)} className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">修改基準設定</button>
                  </div>
              </div>
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">離開視窗</button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
