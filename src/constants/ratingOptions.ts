import { RatingOption } from '../types';

export const RATING_OPTIONS: RatingOption[] = [
  {
    level: 'excellent',
    score: 5,
    labelThai: 'ดีมาก',
    labelEnglish: 'Excellent',
    emoji: '😁',
    bgColor: 'bg-emerald-500 hover:bg-emerald-600',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-400',
    hoverColor: 'hover:border-emerald-500 hover:shadow-emerald-200',
  },
  {
    level: 'good',
    score: 4,
    labelThai: 'ดี',
    labelEnglish: 'Good',
    emoji: '😊',
    bgColor: 'bg-teal-500 hover:bg-teal-600',
    textColor: 'text-teal-700',
    borderColor: 'border-teal-400',
    hoverColor: 'hover:border-teal-500 hover:shadow-teal-200',
  },
  {
    level: 'neutral',
    score: 3,
    labelThai: 'พอใช้',
    labelEnglish: 'Fair',
    emoji: '😐',
    bgColor: 'bg-slate-400 hover:bg-slate-500',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-300',
    hoverColor: 'hover:border-slate-400 hover:shadow-slate-200',
  },
  {
    level: 'poor',
    score: 2,
    labelThai: 'แย่',
    labelEnglish: 'Poor',
    emoji: '🙁',
    bgColor: 'bg-amber-500 hover:bg-amber-600',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-400',
    hoverColor: 'hover:border-amber-500 hover:shadow-amber-200',
  },
  {
    level: 'very_poor',
    score: 1,
    labelThai: 'แย่มาก',
    labelEnglish: 'Very Poor',
    emoji: '😡',
    bgColor: 'bg-rose-500 hover:bg-rose-600',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-400',
    hoverColor: 'hover:border-rose-500 hover:shadow-rose-200',
  },
];

export const DEFAULT_BRANCHES = [
  'สาขาหลัก (Headquarters)',
  'สาขาสยามพารากอน',
  'สาขาเซ็นทรัลเวิลด์',
  'สาขาบางนา',
];

export const INITIAL_COUNTERS = [
  { id: 'b1', name: 'สาขาหลัก (Headquarters)', cashierName: '-', branchName: 'สาขาหลัก (Headquarters)', isOnline: true },
  { id: 'b2', name: 'สาขาสยามพารากอน', cashierName: '-', branchName: 'สาขาสยามพารากอน', isOnline: true },
  { id: 'b3', name: 'สาขาเซ็นทรัลเวิลด์', cashierName: '-', branchName: 'สาขาเซ็นทรัลเวิลด์', isOnline: true },
];
