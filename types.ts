export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

export enum LawCategory {
  PROCUREMENT = '採購管理',
  DOCUMENT = '公文製作',
  ADMIN = '行政庶務',
  LABOR = '勞動基準',
  FINANCE = '出納薪資',
}

export interface PresetQuestion {
  category: LawCategory;
  question: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
}