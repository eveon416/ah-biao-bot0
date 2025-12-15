import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, UserCircle, Play, StopCircle, Terminal, AlertOctagon, Info, MessageSquare, Edit3, CheckCircle2, ArrowRight, Server, Users, Plus, Trash2, Save, AlertTriangle, HelpCircle, Laptop2, Rocket, Globe, Settings } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 通知父層生成公告
  onGenerate: (type: 'weekly' | 'suspend', info: string) => void;
}

interface SavedGroup {
  id: string;
  name: string;
  groupId: string;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [isSkipWeek, setIsSkipWeek] = useState(false);
  const [customReason, setCustomReason] = useState('');
  
  // Group Management State
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('default'); // 'default' = use env var
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [idError, setIdError] = useState('');

  // Environment State
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [showConfig, setShowConfig] = useState(false); // 手動控制設定面板

  // Manual Trigger State
  const [isTriggering, setIsTriggering] = useState(false);
  // success 狀態: true=綠, false=紅, null=黃(警告/模擬)
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
      
      // Detect Environment (寬鬆判定)
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || 
                      hostname === '127.0.0.1' || 
                      hostname.startsWith('192.168.') ||
                      hostname === '0.0.0.0';
      setIsLocalhost(isLocal);
      
      // Load saved groups from localStorage
      const saved = localStorage.getItem('line_groups_v1');
      if (saved) {
        try {
            setSavedGroups(JSON.parse(saved));
        } catch (e) { console.error('Failed to parse groups', e); }
      }
      
      // Load saved remote URL
      const savedUrl = localStorage.getItem('line_remote_url');
      if (savedUrl) {
          setRemoteUrl(savedUrl);
      }
      
      // 如果是本機或已有設定 URL，預設展開設定面板
      if (isLocal || savedUrl) {
          setShowConfig(true);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (previewDate) {
      calculateDuty(new Date(previewDate));
    }
  }, [previewDate]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Save URL when changed
  const handleRemoteUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const url = e.target.value;
      setRemoteUrl(url);
      localStorage.setItem('line_remote_url', url);
  };

  // ID Validation Logic
  useEffect(() => {
      if (!newGroupId) {
          setIdError('');
          return;
      }
      // LINE ID Regex: Starts with U, C, or R, followed by 32 hex chars (total 33 chars)
      const isValid = /^[UCR][0-9a-f]{32}$/.test(newGroupId);
      if (!isValid) {
          setIdError('格式錯誤：需以 U/C/R 開頭，共 33 碼');
      } else {
          setIdError('');
      }
  }, [newGroupId]);

  const addLog = (msg: string, success: boolean | null) => {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    setLogs(prev => [...prev, { time, msg, success }]);
  };

  const handleSaveGroup = () => {
      if (!newGroupName.trim() || !newGroupId.trim() || idError) return;
      
      // Check for duplicate ID
      if (savedGroups.some(g => g.groupId === newGroupId.trim())) {
          alert('此 Group ID 已存在於清單中');
          return;
      }

      const newGroup: SavedGroup = {
          id: Date.now().toString(),
          name: newGroupName.trim(),
          groupId: newGroupId.trim()
      };
      const updated = [...savedGroups, newGroup];
      setSavedGroups(updated);
      localStorage.setItem('line_groups_v1', JSON.stringify(updated));
      setNewGroupName('');
      setNewGroupId('');
      setIsAddingGroup(false);
      setSelectedGroupId(newGroup.groupId); // Auto select new group
  };

  const handleDeleteGroup = (id: string) => {
      if (!window.confirm('確定要刪除此群組設定嗎？')) return;
      const updated = savedGroups.filter(g => g.id !== id);
      setSavedGroups(updated);
      localStorage.setItem('line_groups_v1', JSON.stringify(updated));
      if (selectedGroupId === savedGroups.find(g => g.id === id)?.groupId) {
          setSelectedGroupId('default');
      }
  };

  // 核心邏輯：計算輪值
  const calculateDuty = (targetDate: Date) => {
    const SKIP_WEEKS = ['2025-01-27', '2026-02-16']; 

    const dayOfWeek = targetDate.getDay(); 
    const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(targetDate);
    monday.setDate(targetDate.getDate() + diffToMon);
    const mStr = monday.toISOString().split('T')[0];

    if (SKIP_WEEKS.includes(mStr)) {
        setIsSkipWeek(true);
        setDutyPerson("⛔ 本週暫停辦理");
        if (mStr === '2025-01-27' || mStr === '2026-02-16') {
             setCustomReason("農曆春節連假");
        } else {
             setCustomReason("國定假日");
        }
        return;
    }
    
    setIsSkipWeek(false);
    if (customReason === "農曆春節連假") {
        setCustomReason("");
    }

    const staffList = [
      '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
      '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
    ];
    const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
    const anchorIndex = 6;

    const oneWeekMs = 604800000; 
    const targetTime = targetDate.getTime();
    const anchorTime = anchorDate.getTime();
    
    const rawWeeks = Math.floor((targetTime - anchorTime) / oneWeekMs);

    let skipCount = 0;
    const start = targetTime > anchorTime ? anchorDate : targetDate;
    const end = targetTime > anchorTime ? targetDate : anchorDate;

    SKIP_WEEKS.forEach(skipStr => {
        const sDate = new Date(skipStr + 'T00:00:00+08:00');
        if (sDate >= start && sDate < end) {
            skipCount++;
        }
    });

    let effectiveWeeks = rawWeeks;
    if (targetTime > anchorTime) effectiveWeeks -= skipCount;
    else effectiveWeeks += skipCount;

    let targetIndex = (anchorIndex + effectiveWeeks) % staffList.length;
    if (targetIndex < 0) targetIndex = targetIndex + staffList.length;

    setDutyPerson(staffList[targetIndex]);
  };

  const handleManualTrigger = async (type: 'weekly' | 'suspend') => {
    if (isTriggering) return;
    setIsTriggering(true);
    
    const typeLabel = type === 'weekly' ? '輪值公告' : '暫停公告';
    const targetName = selectedGroupId === 'default' 
        ? '預設主群組' 
        : (savedGroups.find(g => g.groupId === selectedGroupId)?.name || '指定群組');

    // 1. 本機 UI 擬稿
    try {
        if (type === 'weekly') {
            if (isSkipWeek) {
                onGenerate('suspend', customReason || '春節/國定假日');
            } else {
                onGenerate('weekly', dutyPerson);
            }
        } else {
             const finalReason = customReason.trim() || '特殊行政事由';
             onGenerate('suspend', finalReason);
        }
    } catch(e) { console.error(e); }

    // === Localhost 模擬 vs 真實發送判斷 ===
    const effectiveRemoteUrl = remoteUrl.trim().replace(/\/$/, ''); // Remove trailing slash
    
    if (isLocalhost && !effectiveRemoteUrl) {
        addLog(`🔧 [模擬模式] 準備發送至 ${targetName}...`, null);
        setTimeout(() => {
            addLog(`✅ 模擬發送成功 (未消耗 API)`, true);
            addLog(`ℹ️ 若要真實發送，請上方輸入正式站台網址。`, null);
        }, 800);
        setIsTriggering(false);
        return;
    }

    // === 正式環境發送 (Local + RemoteURL 或 Production) ===
    addLog(`正在連線至 ${effectiveRemoteUrl ? `[遠端: ${new URL(effectiveRemoteUrl).hostname}]` : '[後端 API]'} 並廣播...`, true);
    
    try {
      const reasonParam = encodeURIComponent(customReason || '');
      const groupParam = selectedGroupId === 'default' ? '' : `&groupId=${selectedGroupId}`;
      
      // 若有 Remote URL 則使用之，否則使用相對路徑
      const baseUrl = effectiveRemoteUrl || '';
      const url = `${baseUrl}/api/cron?manual=true&type=${type}&date=${previewDate}&reason=${reasonParam}${groupParam}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 404) {
         addLog(`❌ 找不到 API (404)`, false);
         if (isLocalhost) {
             addLog(`💡 請確認上方「正式站台網址」是否正確。`, null);
             setShowConfig(true); // 自動展開設定
         }
         setIsTriggering(false);
         return;
      }

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error(`伺服器回傳格式錯誤 (${response.status})`);
      }

      if (response.status === 500) {
          addLog(`❌ 發送失敗`, false);
          addLog(`📝 原因: ${data.message}`, false);
          if (data.message.includes('機器人未加入') || data.message.includes('not a member')) {
               addLog(`💡 請檢查機器人是否已在群組內`, null);
          }
          setIsTriggering(false);
          return;
      }

      if (response.ok && data.success) {
        addLog(`✅ 廣播成功 (目標: ${targetName})`, true);
      } else {
        addLog(`❌ 發送失敗：${data.message || '未知錯誤'}`, false);
      }
    } catch (error: any) {
      addLog(`❌ 連線異常：${error.message}`, false);
      if (error.message.includes('Failed to fetch')) {
          addLog(`⚠️ 跨域錯誤或網址無效。`, null);
          addLog(`💡 請確認該站台已部署且支援 CORS。`, null);
      }
    } finally {
      setIsTriggering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm transition-all">
      <div className="bg-slate-50 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
        
        {/* Header */}
        <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500 rounded-lg text-white">
                <Calendar className="w-5 h-5" />
            </div>
            <div>
                <h2 className="text-lg font-bold tracking-wide official-font leading-none">排程指揮中心</h2>
                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">Command & Control Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
                onClick={() => setShowConfig(!showConfig)}
                className={`p-2 rounded-full transition-colors ${showConfig ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                title="連線設定"
            >
                <Settings size={20} />
            </button>
            <button 
                onClick={onClose}
                className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
            >
                <X size={20} />
            </button>
          </div>
        </div>

        {/* Dashboard Layout */}
        <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Panel: Controls */}
            <div className="flex flex-col gap-4 overflow-y-auto pr-2">
                
                {/* Localhost Warning Banner & Remote Config */}
                {showConfig && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm animate-in slide-in-from-top-2">
                        <div className="flex items-start gap-3 mb-3">
                             <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0">
                                <Laptop2 size={20} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-amber-800 mb-1">連線設定 (Connection Config)</h3>
                                <p className="text-xs text-amber-700 leading-relaxed">
                                    若您在本機環境 (Local) 或後端 API 路徑不同，請輸入完整網址以進行遠端呼叫。
                                </p>
                            </div>
                        </div>
                        
                        <div className="relative">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Globe size={14} className="text-amber-500" />
                            </div>
                            <input 
                                type="text" 
                                value={remoteUrl}
                                onChange={handleRemoteUrlChange}
                                placeholder="請輸入正式站台網址，例：https://myapp.vercel.app"
                                className="w-full pl-9 pr-3 py-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none bg-white placeholder-slate-400"
                            />
                        </div>
                        {isLocalhost && !remoteUrl && (
                             <div className="mt-2 text-[10px] text-amber-600 font-bold text-right">
                                * 目前為模擬模式 (Simulation Mode)
                             </div>
                        )}
                    </div>
                )}

                {/* 1. Target Group Selection */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="flex items-center gap-2 font-bold text-slate-800 text-sm uppercase tracking-wider">
                            <Users className="w-4 h-4 text-sky-500" />
                            發送對象 (群組通訊錄)
                        </h3>
                        <button 
                            onClick={() => setIsAddingGroup(!isAddingGroup)}
                            className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                        >
                            {isAddingGroup ? <X size={14}/> : <Plus size={14}/>}
                            {isAddingGroup ? '取消' : '新增'}
                        </button>
                    </div>

                    {/* Add Group Form */}
                    {isAddingGroup && (
                        <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 animate-in slide-in-from-top-2">
                             <div className="flex items-start gap-2 mb-3 bg-amber-50 p-2 rounded text-[10px] text-amber-700 leading-tight">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                <span>請確保機器人<strong>已加入</strong>該群組，否則無法發送。ID 格式為 C/R/U 開頭共 33 碼。</span>
                            </div>

                            <div className="space-y-2 mb-2">
                                <input 
                                    type="text" 
                                    placeholder="群組名稱 (例: 會計室)" 
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    className="w-full text-xs px-2 py-1.5 rounded border border-slate-300 focus:border-indigo-500 outline-none"
                                />
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        placeholder="群組 ID (例: C123...)" 
                                        value={newGroupId}
                                        onChange={(e) => setNewGroupId(e.target.value)}
                                        className={`w-full text-xs px-2 py-1.5 rounded border outline-none font-mono
                                            ${idError ? 'border-rose-300 focus:border-rose-500 bg-rose-50' : 'border-slate-300 focus:border-indigo-500'}`}
                                    />
                                    {idError && <span className="text-[9px] text-rose-500 absolute right-2 top-2">{idError}</span>}
                                </div>
                            </div>
                            <button 
                                onClick={handleSaveGroup}
                                disabled={!newGroupName || !newGroupId || !!idError}
                                className="w-full flex items-center justify-center gap-1 bg-indigo-600 text-white text-xs py-1.5 rounded hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                            >
                                <Save size={12} />
                                儲存至通訊錄
                            </button>
                        </div>
                    )}

                    {/* Group List */}
                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        <label className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all
                            ${selectedGroupId === 'default' ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-500/20' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                            <input 
                                type="radio" 
                                name="targetGroup" 
                                value="default"
                                checked={selectedGroupId === 'default'}
                                onChange={() => setSelectedGroupId('default')}
                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                            />
                            <div className="flex-1">
                                <div className="text-sm font-bold text-slate-700">預設主群組 (Env)</div>
                                <div className="text-[10px] text-slate-400">使用 Vercel 環境變數設定</div>
                            </div>
                        </label>

                        {savedGroups.map(group => (
                            <div key={group.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all group
                                ${selectedGroupId === group.groupId ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-500/20' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                <label className="flex items-center gap-3 flex-1 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="targetGroup" 
                                        value={group.groupId}
                                        checked={selectedGroupId === group.groupId}
                                        onChange={() => setSelectedGroupId(group.groupId)}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                    />
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-slate-700 truncate">{group.name}</div>
                                        <div className="text-[10px] text-slate-400 truncate font-mono">{group.groupId}</div>
                                    </div>
                                </label>
                                <button 
                                    onClick={() => handleDeleteGroup(group.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                    title="刪除"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Date Selection */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-2 text-sm uppercase tracking-wider">
                        <Clock className="w-4 h-4 text-indigo-500" />
                        日期設定
                    </h3>
                    <div className="space-y-2">
                        <input 
                            type="date" 
                            value={previewDate}
                            onChange={(e) => setPreviewDate(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-sm focus:border-indigo-500 outline-none"
                        />
                        {isSkipWeek && (
                            <div className="text-[10px] text-rose-500 font-bold flex items-center gap-1 bg-rose-50 p-2 rounded">
                                <AlertOctagon size={12} />
                                系統提示：選定日期為春節暫停週
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Actions */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col">
                     <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider">
                        <Edit3 className="w-4 h-4 text-rose-500" />
                        發送操作
                    </h3>
                    
                    <div className="mb-4">
                        <input 
                            type="text" 
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                            placeholder="暫停事由 (選填，例: 颱風)"
                            className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-slate-800 text-sm outline-none
                                ${isSkipWeek ? 'border-rose-300' : 'border-slate-300 focus:border-rose-400'}`}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-auto">
                        <button 
                            onClick={() => handleManualTrigger('weekly')}
                            disabled={isTriggering}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-bold bg-white border shadow-sm active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed
                                ${isLocalhost && !remoteUrl ? 'text-slate-600 border-slate-300 hover:bg-slate-50' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300'}`}
                        >
                            <span className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" />
                                {isLocalhost && !remoteUrl ? '模擬輪值公告' : '發送輪值公告'}
                            </span>
                            <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>

                        <button 
                            onClick={() => handleManualTrigger('suspend')}
                            disabled={isTriggering}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-bold bg-white border shadow-sm active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed
                                ${isLocalhost && !remoteUrl ? 'text-slate-600 border-slate-300 hover:bg-slate-50' : 'text-rose-700 border-rose-200 hover:bg-rose-50 hover:border-rose-300'}`}
                        >
                            <span className="flex items-center gap-2">
                                <StopCircle className="w-4 h-4" />
                                {isLocalhost && !remoteUrl ? '模擬暫停公告' : '發送暫停公告'}
                            </span>
                            <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    </div>
                </div>

            </div>

            {/* Right Panel: Preview & Logs */}
            <div className="flex flex-col gap-6 h-full overflow-hidden">
                
                {/* 1. Preview Card */}
                <div className={`relative flex-1 rounded-xl border-2 flex flex-col items-center justify-center text-center p-6 transition-all duration-500 overflow-hidden group
                    ${isSkipWeek ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'}`}>
                   
                   <div className={`absolute top-0 right-0 p-10 opacity-5 transform translate-x-1/3 -translate-y-1/3 transition-colors duration-500
                       ${isSkipWeek ? 'text-rose-900' : 'text-slate-900'}`}>
                       <UserCircle size={200} />
                   </div>

                   <div className="relative z-10">
                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3 border
                            ${isSkipWeek ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            Preview
                        </span>
                        
                        <h4 className={`text-sm font-bold mb-2 ${isSkipWeek ? 'text-rose-400' : 'text-slate-400'}`}>
                            {selectedGroupId === 'default' ? '發送至: 預設群組 (Env)' : `發送至: ${savedGroups.find(g => g.groupId === selectedGroupId)?.name || '未知群組'}`}
                        </h4>
                        
                        <div className={`text-3xl sm:text-4xl font-bold official-font mb-2 transition-all duration-300
                            ${isSkipWeek ? 'text-rose-600' : 'text-slate-800'}`}>
                            {dutyPerson}
                        </div>

                        {(customReason && isSkipWeek) || (customReason && !dutyPerson) ? (
                             <div className="mt-3 text-sm text-rose-500 font-medium bg-white/80 px-3 py-1 rounded-lg border border-rose-100 shadow-sm">
                                事由：{customReason}
                             </div>
                        ) : null}
                   </div>
                </div>

                {/* 2. System Log Console */}
                <div className="h-48 bg-slate-900 rounded-xl p-4 font-mono text-[10px] text-slate-300 shadow-lg flex flex-col shrink-0">
                    <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2 text-slate-400 uppercase tracking-widest text-[9px]">
                        <div className="flex items-center gap-2">
                            <Terminal size={12} className="text-emerald-500" />
                            Activity Log
                        </div>
                        <div className="flex gap-2">
                             <span className="flex items-center gap-1 text-[9px] text-slate-500">
                                <div className={`w-1.5 h-1.5 rounded-full ${isLocalhost && !remoteUrl ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                                {isLocalhost && !remoteUrl ? 'Simulation Mode' : remoteUrl ? 'Remote Mode' : 'Production'}
                             </span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent pr-2">
                        {logs.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 italic gap-2">
                                <Server size={16} className="opacity-20" />
                                <span>Ready...</span>
                            </div>
                        )}
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex gap-2 animate-in slide-in-from-left-2 duration-200 border-l-2 pl-2 
                                ${log.success === true ? 'border-emerald-500/50 text-emerald-400' : 
                                  log.success === false ? 'border-rose-500/50 text-rose-400' : 
                                  'border-amber-500/50 text-amber-400'}`}>
                                <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                                <span className="break-all">{log.msg}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

            </div>
        </div>

      </div>
    </div>
  );
};

export default ScheduleModal;