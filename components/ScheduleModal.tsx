
import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, UserCircle, Terminal, AlertOctagon, MessageSquare, Edit3, ArrowRight, Server, Users, Plus, Trash2, Save, Laptop2, FileType, Sparkles, Settings, AlertCircle, StopCircle, CheckSquare, Square } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 通知父層生成公告
  onGenerate: (type: 'weekly' | 'suspend' | 'general', info: string) => void;
  // 新增：請求父層幫忙潤飾文字
  onRequestRefine?: (text: string) => void;
}

interface Group {
  id: string; // 識別用 (時間戳或固定字串)
  name: string;
  groupId: string; // LINE Group ID
  isPreset?: boolean;
}

// 預設群組定義 (根據使用者提供之資訊)
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

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, onGenerate, onRequestRefine }) => {
  // Tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'general'>('roster');

  // Roster State
  const [previewDate, setPreviewDate] = useState<string>('');
  const [dutyPerson, setDutyPerson] = useState<string>('');
  const [isSkipWeek, setIsSkipWeek] = useState(false);
  const [customReason, setCustomReason] = useState('');

  // General Announcement State
  const [generalContent, setGeneralContent] = useState('');
  
  // Group Management State
  const [savedGroups, setSavedGroups] = useState<Group[]>([]);
  // 改為多選：儲存被選中的 groupId 字串陣列 (預設選取行政科)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([PRESET_GROUPS[0].groupId]); 
  
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [idError, setIdError] = useState('');

  // Environment State
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [showConfig, setShowConfig] = useState(false);

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
      
      // Detect Environment
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || 
                      hostname === '127.0.0.1' || 
                      hostname.startsWith('192.168.') ||
                      hostname === '0.0.0.0';
      setIsLocalhost(isLocal);
      
      // Load saved groups
      const saved = localStorage.getItem('line_groups_v1');
      let loadedGroups: Group[] = [];
      if (saved) {
        try {
           loadedGroups = JSON.parse(saved);
        } catch (e) {
           console.error("Failed to load custom groups", e);
        }
      }
      setSavedGroups(loadedGroups);
      
      // Load remote URL if saved
      const savedUrl = localStorage.getItem('remote_api_url');
      if (savedUrl) setRemoteUrl(savedUrl