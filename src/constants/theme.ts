import { ThemeColor } from '../types';

export interface ThemeConfig {
  id: ThemeColor;
  nameThai: string;
  colorSwatch: string; // Tailwind class e.g. bg-teal-500
  bgGradient: string;
  headerBg: string;
  primaryBg: string;
  primaryText: string;
  badgeBg: string;
  accentRing: string;
  activeBorder: string;
  glowColor: string;
}

export const THEMES: Record<ThemeColor, ThemeConfig> = {
  pink: {
    id: 'pink',
    nameThai: 'ชมพู NUH (NUH Pink)',
    colorSwatch: 'bg-pink-600',
    bgGradient: 'from-pink-50 via-rose-50 to-slate-100',
    headerBg: 'border-pink-200/80',
    primaryBg: 'bg-pink-600 hover:bg-pink-700',
    primaryText: 'text-pink-600',
    badgeBg: 'bg-pink-100 text-pink-800',
    accentRing: 'focus:ring-pink-500',
    activeBorder: 'border-pink-500',
    glowColor: 'rgba(236, 72, 153, 0.2)',
  },
  teal: {
    id: 'teal',
    nameThai: 'ฟ้าอมเขียว (Teal)',
    colorSwatch: 'bg-teal-500',
    bgGradient: 'from-cyan-50 via-teal-50 to-slate-100',
    headerBg: 'border-teal-200/80',
    primaryBg: 'bg-teal-600 hover:bg-teal-700',
    primaryText: 'text-teal-600',
    badgeBg: 'bg-teal-100 text-teal-800',
    accentRing: 'focus:ring-teal-500',
    activeBorder: 'border-teal-500',
    glowColor: 'rgba(20, 184, 166, 0.2)',
  },
  emerald: {
    id: 'emerald',
    nameThai: 'เขียวมรกต (Emerald)',
    colorSwatch: 'bg-emerald-500',
    bgGradient: 'from-emerald-50 via-teal-50 to-slate-100',
    headerBg: 'border-emerald-200/80',
    primaryBg: 'bg-emerald-600 hover:bg-emerald-700',
    primaryText: 'text-emerald-600',
    badgeBg: 'bg-emerald-100 text-emerald-800',
    accentRing: 'focus:ring-emerald-500',
    activeBorder: 'border-emerald-500',
    glowColor: 'rgba(16, 185, 129, 0.2)',
  },
  indigo: {
    id: 'indigo',
    nameThai: 'น้ำเงินหรูหรา (Indigo)',
    colorSwatch: 'bg-indigo-600',
    bgGradient: 'from-indigo-50 via-blue-50 to-slate-100',
    headerBg: 'border-indigo-200/80',
    primaryBg: 'bg-indigo-600 hover:bg-indigo-700',
    primaryText: 'text-indigo-600',
    badgeBg: 'bg-indigo-100 text-indigo-800',
    accentRing: 'focus:ring-indigo-500',
    activeBorder: 'border-indigo-500',
    glowColor: 'rgba(79, 70, 229, 0.2)',
  },
  purple: {
    id: 'purple',
    nameThai: 'ม่วงพรีเมียม (Purple)',
    colorSwatch: 'bg-purple-600',
    bgGradient: 'from-purple-50 via-fuchsia-50 to-slate-100',
    headerBg: 'border-purple-200/80',
    primaryBg: 'bg-purple-600 hover:bg-purple-700',
    primaryText: 'text-purple-600',
    badgeBg: 'bg-purple-100 text-purple-800',
    accentRing: 'focus:ring-purple-500',
    activeBorder: 'border-purple-500',
    glowColor: 'rgba(147, 51, 234, 0.2)',
  },
  rose: {
    id: 'rose',
    nameThai: 'ชมพูสดใส (Rose Pink)',
    colorSwatch: 'bg-rose-500',
    bgGradient: 'from-rose-50 via-pink-50 to-slate-100',
    headerBg: 'border-rose-200/80',
    primaryBg: 'bg-rose-600 hover:bg-rose-700',
    primaryText: 'text-rose-600',
    badgeBg: 'bg-rose-100 text-rose-800',
    accentRing: 'focus:ring-rose-500',
    activeBorder: 'border-rose-500',
    glowColor: 'rgba(225, 29, 72, 0.2)',
  },
  amber: {
    id: 'amber',
    nameThai: 'ส้มอบอุ่น (Amber Gold)',
    colorSwatch: 'bg-amber-500',
    bgGradient: 'from-amber-50 via-orange-50 to-slate-100',
    headerBg: 'border-amber-200/80',
    primaryBg: 'bg-amber-600 hover:bg-amber-700',
    primaryText: 'text-amber-600',
    badgeBg: 'bg-amber-100 text-amber-800',
    accentRing: 'focus:ring-amber-500',
    activeBorder: 'border-amber-500',
    glowColor: 'rgba(217, 119, 6, 0.2)',
  },
  slate: {
    id: 'slate',
    nameThai: 'เทาเข้มโมเดิร์น (Slate)',
    colorSwatch: 'bg-slate-700',
    bgGradient: 'from-slate-100 via-gray-100 to-slate-200',
    headerBg: 'border-slate-300',
    primaryBg: 'bg-slate-800 hover:bg-slate-900',
    primaryText: 'text-slate-800',
    badgeBg: 'bg-slate-200 text-slate-800',
    accentRing: 'focus:ring-slate-500',
    activeBorder: 'border-slate-700',
    glowColor: 'rgba(51, 65, 85, 0.2)',
  },
};
