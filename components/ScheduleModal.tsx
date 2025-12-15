import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, UserCircle, Play, StopCircle, Terminal, AlertOctagon, Info, MessageSquare, Edit3, CheckCircle2, ArrowRight } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 通知父層生成公告
  onGenerate: (type: 'weekly' | 'suspend', info: string) => void;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [isSkipWeek, setIsSkipWeek] = useState(false);
  const [customReason, setCustomReason] = useState('');
  
  // Manual Trigger State
  const [isTriggering, setIsTriggering] = useState(false);
  const [logs, setLogs] = useState<Array<{time: string, msg: string, success: boolean}>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      // 確保時區正確
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setPreviewDate(`${yyyy}-${mm}-${dd}`);
      setCustomReason(''); // 重置理由
    }
  }, [isOpen]);

  // 當日期變更時，重新計算，並自動帶入預設理由
  useEffect(() => {
    if (previewDate) {
      calculateDuty(new Date(previewDate));
    }
  }, [previewDate]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string, success: boolean) => {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    setLogs(prev => [...prev, { time, msg, success }]);
  };

  // 核心邏輯：計算輪值
  const calculateDuty = (targetDate: Date) => {
    const SKIP_WEEKS = ['2025-01-27', '2026-02-16']; 

    const dayOfWeek = targetDate.getDay(); 
    const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(targetDate);
    monday.setDate(targetDate.getDate() + diffToMon);
    const mStr = monday.toISOString().split('T')[0];

    // 判斷是否為內建的暫停週
    if (SKIP_WEEKS.includes(mStr)) {
        setIsSkipWeek(true);
        setDutyPerson("⛔ 本週暫停辦理");
        // 自動帶入理由，但允許使用者修改
        if (mStr === '2025-01-27' || mStr === '2026-02-16') {
             setCustomReason("農曆春節連假");
        } else {
             setCustomReason("國定假日");
        }
        return;
    }
    
    // 若不是 Skip Week，清空理由 (除非使用者自己打字，這裡我們選擇切換日期就清空，避免混淆)
    // 但為了體驗好一點，如果使用者已經輸入了文字，切換日期時保留文字？
    // 這裡策略：如果是「系統偵測到的正常週」，且原本理由是「春節」，則清空。
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
    addLog(`正在擬定 ${typeLabel}...`, true);

    try {
        if (type === 'weekly') {
            if (isSkipWeek) {
                // 若系統判定是暫停週，但使用者硬要按輪值，給予警示後轉為暫停
                addLog(`⚠️ 偵測到 ${customReason || '暫停週'}，已轉為暫停公告`, false);
                const finalReason = customReason.trim() || '國定假日或特殊事由';
                onGenerate('suspend', finalReason);
            } else {
                onGenerate('weekly', dutyPerson);
            }
        } else {
            // 強制暫停：使用使用者輸入的理由
            const finalReason = customReason.trim() || '特殊行政事由';
            onGenerate('suspend', finalReason);
        }
        
        setTimeout(() => {
             addLog(`✅ 擬稿完成！請查看主視窗`, true);
             setIsTriggering(false);
        }, 600);

    } catch (e) {
        addLog(`❌ 擬稿失敗`, false);
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
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dashboard Layout: Left (Controls) & Right (Preview) */}
        <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Panel: Settings & Inputs */}
            <div className="flex flex-col gap-6 overflow-y-auto pr-2">
                
                {/* 1. Date Selection */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-4 text-sm uppercase tracking-wider">
                        <Clock className="w-4 h-4 text-indigo-500" />
                        基準日期設定
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">選擇擬稿日期</label>
                            <input 
                                type="date" 
                                value={previewDate}
                                onChange={(e) => setPreviewDate(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>
                        {/* Info Box */}
                        <div className="text-[11px] text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2 leading-relaxed">
                            <Info size={14} className="shrink-0 mt-0.5 text-blue-500" />
                            <p>系統已自動鎖定 <strong>2025/1/27</strong> 及 <strong>2026/2/16</strong> 為春節暫停週。若選擇此區間，下方將自動切換為暫停模式。</p>
                        </div>
                    </div>
                </div>

                {/* 2. Actions & Custom Reason */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col">
                     <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-4 text-sm uppercase tracking-wider">
                        <Edit3 className="w-4 h-4 text-rose-500" />
                        公告生成設定
                    </h3>
                    
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1 flex justify-between">
                            <span>暫停事由 (若欲發送暫停公告請填寫)</span>
                            <span className="text-slate-400 font-normal">非必填</span>
                        </label>
                        <input 
                            type="text" 
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                            placeholder="例如：颱風停班停課、辦公室整修、春節連假..."
                            className={`w-full px-3 py-2.5 bg-slate-50 border rounded-lg text-slate-800 transition-all outline-none
                                ${isSkipWeek ? 'border-rose-300 ring-2 ring-rose-500/10' : 'border-slate-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10'}`}
                        />
                        {isSkipWeek && (
                            <p className="mt-1.5 text-[10px] text-rose-500 font-bold flex items-center gap-1">
                                <AlertOctagon size={10} />
                                系統偵測為暫停週，已自動帶入建議事由。
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 mt-auto">
                        <button 
                            onClick={() => handleManualTrigger('weekly')}
                            disabled={isTriggering}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 shadow-sm active:scale-[0.98] group"
                        >
                            <span className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" />
                                生成本週輪值公告
                            </span>
                            <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                        </button>

                        <button 
                            onClick={() => handleManualTrigger('suspend')}
                            disabled={isTriggering}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 hover:border-rose-300 shadow-sm active:scale-[0.98] group"
                        >
                            <span className="flex items-center gap-2">
                                <StopCircle className="w-4 h-4" />
                                生成暫停辦理公告
                            </span>
                            <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>

            </div>

            {/* Right Panel: Preview & Logs */}
            <div className="flex flex-col gap-6 h-full overflow-hidden">
                
                {/* 1. Visual Preview Card */}
                <div className={`relative flex-1 rounded-xl border-2 flex flex-col items-center justify-center text-center p-6 transition-all duration-500 overflow-hidden group
                    ${isSkipWeek ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'}`}>
                   
                   {/* Background pattern decoration */}
                   <div className={`absolute top-0 right-0 p-10 opacity-5 transform translate-x-1/3 -translate-y-1/3 transition-colors duration-500
                       ${isSkipWeek ? 'text-rose-900' : 'text-slate-900'}`}>
                       <UserCircle size={200} />
                   </div>

                   <div className="relative z-10">
                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3 border
                            ${isSkipWeek ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            Status Preview
                        </span>
                        
                        <h4 className={`text-sm font-bold mb-2 ${isSkipWeek ? 'text-rose-400' : 'text-slate-400'}`}>
                            該週預定狀態
                        </h4>
                        
                        <div className={`text-3xl sm:text-4xl font-bold official-font mb-2 transition-all duration-300
                            ${isSkipWeek ? 'text-rose-600' : 'text-slate-800'}`}>
                            {dutyPerson}
                        </div>

                        {/* 如果有自訂理由，顯示在預覽卡片上 */}
                        {(customReason && isSkipWeek) || (customReason && !dutyPerson) ? (
                             <div className="mt-3 text-sm text-rose-500 font-medium bg-white/80 px-3 py-1 rounded-lg border border-rose-100 shadow-sm">
                                事由：{customReason}
                             </div>
                        ) : null}

                        {!isSkipWeek && (
                            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                                <CheckCircle2 size={12} className="text-emerald-500" />
                                輪值順序正常
                            </div>
                        )}
                   </div>
                </div>

                {/* 2. System Log Console */}
                <div className="h-48 bg-slate-900 rounded-xl p-4 font-mono text-[10px] text-slate-300 shadow-lg flex flex-col shrink-0">
                    <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2 text-slate-400 uppercase tracking-widest text-[9px]">
                        <div className="flex items-center gap-2">
                            <Terminal size={12} className="text-emerald-500" />
                            System Activity Log
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-500/20"></div>
                            <div className="w-2 h-2 rounded-full bg-yellow-500/20"></div>
                            <div className="w-2 h-2 rounded-full bg-green-500/20"></div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent pr-2">
                        {logs.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 italic gap-2">
                                <Play size={16} className="opacity-20" />
                                <span>等待指令輸入...</span>
                            </div>
                        )}
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex gap-2 animate-in slide-in-from-left-2 duration-200 border-l-2 pl-2 ${log.success ? 'border-emerald-500/50 text-emerald-400' : 'border-rose-500/50 text-rose-400'}`}>
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