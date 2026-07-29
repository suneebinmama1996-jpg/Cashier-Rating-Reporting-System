export type RatingLevel = 'excellent' | 'good' | 'neutral' | 'poor' | 'very_poor';

export interface RatingOption {
  level: RatingLevel;
  score: number; // 5 to 1
  labelThai: string;
  labelEnglish?: string;
  emoji: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  hoverColor: string;
}

export interface RatingRecord {
  id: string;
  orderNumber?: string; // เลขออเดอร์ / เลขใบเสร็จ e.g. ORD-10023
  timestamp: string; // ISO string e.g. 2026-07-28T10:30:00.000Z
  counterId: string;
  counterName: string;
  cashierName: string;
  branchName?: string; // สาขา
  score: number; // 1 to 5
  level: RatingLevel;
  tags?: string[];
  comment?: string;
}

export interface Counter {
  id: string;
  name: string;
  cashierName: string;
  branchName: string; // สาขา
  isOnline: boolean;
  isFallbackError?: boolean;
}

export interface ReportFilter {
  startDate: string;
  endDate: string;
  counterId: string;
  branchName?: string; // สาขา
  periodType: 'daily' | 'monthly';
}


export interface HourlyStats {
  hour: string; // "08:00", "09:00"...
  excellent: number;
  good: number;
  neutral: number;
  poor: number;
  very_poor: number;
  total: number;
  avgScore: number;
}

export interface DailyStats {
  date: string; // "YYYY-MM-DD"
  dateFormatted: string; // "28 ก.ย." or "28/07/2026"
  excellent: number;
  good: number;
  neutral: number;
  poor: number;
  very_poor: number;
  total: number;
  avgScore: number;
  satisfactionRate: number; // % of excellent + good
}

export type ThemeColor = 'pink' | 'teal' | 'emerald' | 'indigo' | 'purple' | 'rose' | 'amber' | 'slate';

export interface SystemSettings {
  logoUrl: string | null;
  orgName: string;
  branches?: string[]; // Legacy, branches are now managed via Counters
  themeColor: ThemeColor;
  adminPin: string;
}

export interface MonthlyStats {
  monthKey: string; // "YYYY-MM"
  monthName: string; // "มกราคม 2026", "กุมภาพันธ์ 2026"...
  excellent: number;
  good: number;
  neutral: number;
  poor: number;
  very_poor: number;
  total: number;
  avgScore: number;
  satisfactionRate: number;
}
