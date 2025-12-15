import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Bell, UserCircle, ArrowRight, Play, CheckCircle2, AlertTriangle, Loader2, WifiOff } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose }) => {
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  
  // Manual Trigger State
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{success: boolean; message: string; type?: 'local' | 'remote'} | null>(null);

  // 初始化日期為今天
  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      setPreviewDate(today.toISOString().split('T')[0]);
      setTriggerResult(null); // Reset trigger result on open
    }
  }, [isOpen]);

  // 當日期改變時，重新計算輪值人員
  useEffect(() => {
    if (previewDate) {
      calculateDuty(new Date(previewDate));
    }
  }, [previewDate]);

  const calculateDuty = (targetDate: Date) => {
    const staffList = [
      '林唯農', '宋憲昌', '江開承', '吳怡慧', '胡蔚杰',
      '陳頤恩', '陳怡妗', '陳薏雯', '游智諺', '陳美杏'
    ];
    // 設定錨點：2025-12-08 (週一) -> Index 6 (陳怡妗)
    const anchorDate = new Date('2025-12-08T00:00:00+08:00'); 
    const anchorIndex = 6;

    const targetTime = targetDate.getTime();
    const anchorTime = anchorDate.getTime();
    const oneWeekMs = 604800000; 

    const diffWeeks = Math.floor((targetTime - anchorTime) / oneWeekMs);
    let targetIndex = (anchorIndex + diffWeeks) % staffList.length;
    if (targetIndex < 0) targetIndex = targetIndex + staffList.length;

    setDutyPerson(staffList[targetIndex]);
  };

  const handleManualTrigger = async () => {
    // 簡單確認
    if (!confirm('【手動執行確認】\n您確定要立即觸發「本週輪值公告」至 LINE 群組嗎？')) return;

    setIsTriggering(true);
    setTriggerResult(null);

    // 1. 檢查是否為 Localhost (本機環境無法呼叫 Vercel Serverless Function)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      // 模擬延遲與成功回應
      setTimeout(() => {
        setTriggerResult({ 
          success: true, 
          message: `(本機模擬) 發送成功！輪值人員：${dutyPerson}`,
          type: 'local'
        });
        setIsTriggering(false);
      }, 1500);
      return;
    }

    // 2. 正式環境呼叫
    try {
      const response = await fetch('/api/cron?manual=true', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      // 嘗試解析 JSON，若失敗(例如回傳 404 HTML)則捕捉錯誤
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`伺服器回應格式錯誤 (Status: ${response.status})。可能 API 路徑不存在。`);
      }

      if (response.ok && data.success) {
        setTriggerResult({ 
          success: true, 
          message: `發送成功！輪值人員：${data.duty}`,
          type: 'remote'
        });
      } else {
        setTriggerResult({ 
          success: false, 
          message: data.message || data.error || '未知的伺服器錯誤' 
        });
      }
    } catch (error: any) {
      console.error("Trigger Error:", error);
      setTriggerResult({ 
        success: false, 
        message: `連線失敗：${error.message || '請檢查網路狀態'}` 
      });
    } finally {
      setIsTriggering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold tracking-wide official-font">系統自動排程與輪值管理</h2>
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
          
          {/* Section 1: Active Schedules */}
          <section>
             <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-sm uppercase tracking-wider">
               <Clock className="w-4 h-4 text-emerald-600" />
               目前運行中之排程 (Active Crons)
             </h3>
             <div className="grid grid-cols-1 gap-4">
                {/* Weekly Task */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden group">
                   <div className="absolute top-0 right-0 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-bl">每週執行</div>
                   <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                          <div className="bg-emerald-50 p-2 rounded-full text-emerald-600">
                            <UserCircle size={24} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800">科務會議輪值公告</h4>
                            <p className="text-xs text-slate-500 mt-1">每週一 上午 09:00 (UTC 01:00)</p>
                            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                              自動計算當週輪值人員，並發送 Flex Message 卡片至 LINE 群組。
                            </p>
                          </div>
                      </div>

                      {/* Manual Trigger Button */}
                      <div className="w-full sm:w-auto flex flex-col items-end">
                        <button 
                          onClick={handleManualTrigger}
                          disabled={isTriggering}
                          className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all w-full sm:w-auto
                            ${isTriggering 
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow hover:shadow-md active:scale-95'
                            }`}
                        >
                          {isTriggering ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                          <span>{isTriggering ? '連線中...' : '⚡ 立即手動執行'}</span>
                        </button>
                        
                        {/* Result Message */}
                        {triggerResult && (
                           <div className={`mt-2 text-[10px] px-2 py-1.5 rounded border flex items-start gap-1.5 animate-in slide-in-from-top-1 max-w-[200px] sm:max-w-none
                             ${triggerResult.success 
                                ? (triggerResult.type === 'local' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-green-50 text-green-700 border-green-200')
                                : 'bg-red-50 text-red-700 border-red-200'}`}>
                             
                             {triggerResult.success 
                                ? (triggerResult.type === 'local' ? <WifiOff size={12} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={12} className="shrink-0 mt-0.5" />)
                                : <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                             }
                             <span className="leading-tight">{triggerResult.message}</span>
                           </div>
                        )}
                      </div>
                   </div>
                </div>
             </div>
          </section>

          {/* Section 2: Roster Simulator */}
          <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider border-b border-slate-100 pb-2">
               <UserCircle className="w-4 h-4 text-indigo-600" />
               輪值人員模擬試算 (Roster Simulator)
             </h3>
             
             <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">選擇預覽日期</label>
                  <input 
                    type="date" 
                    value={previewDate}
                    onChange={(e) => setPreviewDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                    系統將自動計算該日期「所屬該週」的輪值人員。
                  </p>
                </div>

                <div className="hidden sm:block text-slate-300">
                  <ArrowRight size={24} />
                </div>

                <div className="flex-1 w-full bg-slate-50 rounded-lg border border-slate-200 p-4 flex flex-col items-center justify-center text-center">
                   <span className="text-xs text-slate-500 font-medium mb-1">該週輪值人員</span>
                   <div className="text-3xl font-bold text-rose-600 official-font animate-in zoom-in duration-300 key={dutyPerson}">
                     {dutyPerson}
                   </div>
                   <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100 shadow-sm">
                     <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                     系統推算正常
                   </div>
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