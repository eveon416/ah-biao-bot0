import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, UserCircle, ArrowRight, Play, StopCircle, Terminal, AlertOctagon, Info, MessageSquare } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 新增 Prop：通知父層生成公告
  onGenerate: (type: 'weekly' | 'suspend', info: string) => void;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [isSkipWeek, setIsSkipWeek] = useState(false);
  
  // Manual Trigger State
  const [isTriggering, setIsTriggering] = useState(false);
  const [logs, setLogs] = useState<Array<{time: string, msg: string, success: boolean}>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      // 預設日期：處理時區問題，確保是當地日期
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setPreviewDate(`${yyyy}-${mm}-${dd}`);
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

  const addLog = (msg: string, success: boolean) => {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    setLogs(prev => [...prev, { time, msg, success }]);
  };

  // 核心邏輯：計算輪值 (需與 api/cron.js 同步)
  const calculateDuty = (targetDate: Date) => {
    // 1. 定義暫停週 (週一日期)
    // 2025 春節: 1/27 起始週
    // 2026 春節: 2/16 起始週
    const SKIP_WEEKS = ['2025-01-27', '2026-02-16']; 

    // 2. 檢查當前選擇的日期是否在暫停週內
    // 計算該日期所屬的週一
    const dayOfWeek = targetDate.getDay(); 
    const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(targetDate);
    monday.setDate(targetDate.getDate() + diffToMon);
    const mStr = monday.toISOString().split('T')[0];

    if (SKIP_WEEKS.includes(mStr)) {
        setIsSkipWeek(true);
        setDutyPerson("⛔ 本週暫停辦理 (春節/國定假日)");
        return;
    }
    setIsSkipWeek(false);

    // 3. 正常計算 (需扣除暫停週)
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

    // 計算中間經過幾個 skip weeks
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

    // 1. 直接觸發主視窗生成 (指揮中心模式)
    try {
        if (type === 'weekly') {
            if (isSkipWeek) {
                // 若使用者在暫停週堅持發輪值公告，系統自動轉為發送暫停公告
                addLog(`⚠️ 偵測到本週為暫停週，自動轉為暫停公告`, false);
                onGenerate('suspend', '春節/國定假日');
            } else {
                onGenerate('weekly', dutyPerson);
            }
        } else {
            // 強制發送暫停
             onGenerate('suspend', isSkipWeek ? '春節/國定假日' : '特殊事由');
        }
        
        // 模擬一點處理時間
        setTimeout(() => {
             addLog(`✅ 擬稿完成！請查看主視窗`, true);
             setIsTriggering(false);
        }, 800);

    } catch (e) {
        addLog(`❌ 擬稿失敗`, false);
        setIsTriggering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">排程指揮中心</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-emerald-200 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto bg-slate-50 space-y-6">
          
          {/* Section 1: Console */}
          <section>
             <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-sm uppercase tracking-wider">
               <Clock className="w-4 h-4 text-emerald-600" />
               操作控制台 (Command Console)
             </h3>
             <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                
                <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => handleManualTrigger('weekly')}
                      disabled={isTriggering}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-lg text-sm font-bold transition-all bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <MessageSquare className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span>生成本週輪值公告</span>
                    </button>

                    <button 
                      onClick={() => handleManualTrigger('suspend')}
                      disabled={isTriggering}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-lg text-sm font-bold transition-all bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <StopCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span>生成暫停辦理公告</span>
                    </button>
                </div>

                {/* Log Area */}
                <div className="mt-4 bg-slate-900 rounded-md p-3 font-mono text-[10px] text-slate-300 relative">
                    <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-2 text-slate-400 uppercase tracking-widest text-[9px]">
                        <Terminal size={10} />
                        System Logs
                    </div>
                    <div className="h-[120px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent pr-2">
                        {logs.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 italic">
                                <span>等待指令...</span>
                            </div>
                        )}
                        {logs.map((log, idx) => (
                            <div key={idx} className={`flex gap-2 animate-in slide-in-from-left-2 duration-200 ${log.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                                <span className="text-slate-500 shrink-0">[{log.time}]</span>
                                <span>{log.msg}</span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

             </div>
          </section>

          {/* Section 2: Simulator */}
          <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider border-b border-slate-100 pb-2">
               <UserCircle className="w-4 h-4 text-indigo-600" />
               輪值狀態預覽 (Preview)
             </h3>
             
             <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">選擇擬稿日期</label>
                  <input 
                    type="date" 
                    value={previewDate}
                    onChange={(e) => setPreviewDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                  <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 flex items-start gap-1.5">
                     <Info size={12} className="shrink-0 mt-0.5 text-blue-500" />
                     <p>系統已設定 <strong>2025/1/27</strong> 及 <strong>2026/2/16</strong> 為春節暫停週。選定日期後，上方按鈕將依此日期生成對應內容。</p>
                  </div>
                </div>

                <div className="hidden sm:block text-slate-300">
                  <ArrowRight size={24} />
                </div>

                <div className={`flex-1 w-full rounded-lg border p-4 flex flex-col items-center justify-center text-center transition-colors duration-300
                  ${isSkipWeek ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                   <span className={`text-xs font-medium mb-1 ${isSkipWeek ? 'text-rose-600' : 'text-slate-500'}`}>
                     該週輪值人員
                   </span>
                   <div className={`text-2xl font-bold official-font animate-in zoom-in duration-300 key={dutyPerson}
                      ${isSkipWeek ? 'text-rose-600' : 'text-slate-800'}`}>
                     {dutyPerson}
                   </div>
                   {isSkipWeek && (
                      <div className="mt-2 text-[10px] text-rose-600 font-bold bg-white px-2 py-0.5 rounded-full border border-rose-200 shadow-sm flex items-center gap-1">
                        <AlertOctagon size={10} />
                        輪值順序遞延 (Skip)
                      </div>
                   )}
                </div>
             </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex justify-end">
          <button 
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 text-white hover:bg-slate-800 rounded-lg transition-colors text-sm font-bold shadow-sm active:scale-95"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;