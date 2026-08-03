import { RatingRecord, Counter, DailyStats, MonthlyStats, HourlyStats, SystemSettings, POSReconciliation } from '../types';
import { INITIAL_COUNTERS, DEFAULT_BRANCHES } from '../constants/ratingOptions';
import { generateInitialRatings } from '../data/mockData';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  writeBatch,
  getDocFromServer
} from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Don't throw here to avoid crashing the whole React app on background sync errors
}

const RATINGS_KEY = 'cashier_rating_records_v1';
const RECONCILIATIONS_KEY = 'cashier_rating_reconciliations_v1';

export function getStoredReconciliations(): POSReconciliation[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(RECONCILIATIONS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export async function saveReconciliationRecord(record: POSReconciliation): Promise<POSReconciliation> {
  const current = getStoredReconciliations();
  const updated = [record, ...current];
  localStorage.setItem(RECONCILIATIONS_KEY, JSON.stringify(updated));

  try {
    await setDoc(doc(db, 'reconciliations', record.id), record);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `reconciliations/${record.id}`);
  }

  return record;
}

export function subscribeToReconciliations(callback: (recs: POSReconciliation[]) => void) {
  const q = query(collection(db, 'reconciliations'), orderBy('timestamp', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const recs = snapshot.docs.map(doc => doc.data() as POSReconciliation);
    localStorage.setItem(RECONCILIATIONS_KEY, JSON.stringify(recs));
    callback(recs);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'reconciliations');
  });
}

const COUNTERS_KEY = 'cashier_rating_counters_v1';
const ACTIVE_COUNTER_KEY = 'cashier_rating_active_counter_id';
const SETTINGS_KEY = 'cashier_rating_system_settings_v1';

export const DEFAULT_SETTINGS: SystemSettings = {
  logoUrl: '/nuh-logo.svg',
  orgName: 'NUH International',
  themeColor: 'pink',
  adminPin: '1234',
};

export function getStoredSettings(): SystemSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: Partial<SystemSettings>): SystemSettings {
  const current = getStoredSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));

  // Sync with Firestore asynchronously
  const path = 'config/settings';
  setDoc(doc(db, 'config', 'settings'), updated, { merge: true }).catch((e) => {
    console.error('Firestore save settings error:', e);
  });

  return updated;
}

// Thai month names
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export function isRealRatingRecord(r: any): boolean {
  if (!r || typeof r !== 'object') return false;
  if (!r.id || typeof r.id !== 'string') return false;
  if (!r.timestamp || typeof r.timestamp !== 'string') return false;
  // Filter out any legacy mock records starting with 'rec-'
  if (r.id.startsWith('rec-')) return false;
  return true;
}

export function getStoredRatings(): RatingRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(RATINGS_KEY);
    if (!data) return [];
    const parsed: RatingRecord[] = JSON.parse(data);
    return parsed.filter(isRealRatingRecord);
  } catch {
    return [];
  }
}

export async function saveRatingRecord(created: RatingRecord): Promise<RatingRecord> {
  const current = getStoredRatings();
  const updated = [created, ...current];
  localStorage.setItem(RATINGS_KEY, JSON.stringify(updated));

  // Save to Firestore - Real-time sync
  try {
    await setDoc(doc(db, 'ratings', created.id), created);
  } catch (e) {
    console.error('Firestore save rating error:', e);
  }

  return created;
}

export async function deleteRatingRecord(id: string): Promise<void> {
  const current = getStoredRatings();
  const updated = current.filter((r) => r.id !== id);
  localStorage.setItem(RATINGS_KEY, JSON.stringify(updated));

  try {
    await deleteDoc(doc(db, 'ratings', id));
  } catch (e) {
    console.error('Firestore delete rating record error:', e);
  }
}

export function resetRatingsToSample(): RatingRecord[] {
  localStorage.setItem(RATINGS_KEY, JSON.stringify([]));
  return [];
}

export async function clearAllRatings(): Promise<void> {
  localStorage.setItem(RATINGS_KEY, JSON.stringify([]));

  try {
    const snapshot = await getDocs(collection(db, 'ratings'));
    if (snapshot.docs.length > 0) {
      // Delete all documents in parallel
      const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
    }
  } catch (e) {
    console.error('Firestore clear error:', e);
  }
}

export function getStoredCounters(): Counter[] {
  if (typeof window === 'undefined') return INITIAL_COUNTERS;
  try {
    const data = localStorage.getItem(COUNTERS_KEY);
    if (!data) {
      localStorage.setItem(COUNTERS_KEY, JSON.stringify(INITIAL_COUNTERS));
      return INITIAL_COUNTERS;
    }
    return JSON.parse(data);
  } catch {
    return INITIAL_COUNTERS;
  }
}

export function saveCounters(counters: Counter[]): void {
  localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters));

  // Save to Firestore
  const path = 'config/counters';
  setDoc(doc(db, 'config', 'counters'), { list: counters }).catch((e) => {
    console.error('Firestore save counters error:', e);
  });
}

export function getActiveCounterId(): string {
  if (typeof window === 'undefined') return INITIAL_COUNTERS[0].id;
  const stored = localStorage.getItem(ACTIVE_COUNTER_KEY);
  return stored || INITIAL_COUNTERS[0].id;
}

export function setActiveCounterId(counterId: string): void {
  localStorage.setItem(ACTIVE_COUNTER_KEY, counterId);
}

export async function fetchRatingsFromFirestore(): Promise<RatingRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, 'ratings'));
    const records: RatingRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as RatingRecord;
      if (isRealRatingRecord(data)) {
        records.push(data);
      }
    });
    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    localStorage.setItem(RATINGS_KEY, JSON.stringify(records));
    return records;
  } catch (e) {
    console.error('Fetch ratings from Firestore error:', e);
    return getStoredRatings();
  }
}

// Subscribe to Config (Counters & Settings)
export function subscribeToConfig(
  onCountersUpdate: (counters: Counter[]) => void,
  onSettingsUpdate: (settings: SystemSettings) => void
) {
  // 1. Counters listener
  const countersPath = 'config/counters';
  const unsubscribeCounters = onSnapshot(doc(db, 'config', 'counters'), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      if (data && Array.isArray(data.list) && data.list.length > 0) {
        localStorage.setItem(COUNTERS_KEY, JSON.stringify(data.list));
        onCountersUpdate(data.list);
      }
    } else {
      // Initialize counters in Firestore IF it's empty
      const local = getStoredCounters();
      if (local.length > 0) {
        setDoc(doc(db, 'config', 'counters'), { list: local }).catch(() => {});
      }
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, countersPath);
  });

  // 2. Settings listener
  const settingsPath = 'config/settings';
  const unsubscribeSettings = onSnapshot(doc(db, 'config', 'settings'), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data() as SystemSettings;
      const merged = { ...DEFAULT_SETTINGS, ...data };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      onSettingsUpdate(merged);
    } else {
      const local = getStoredSettings();
      setDoc(doc(db, 'config', 'settings'), local).catch(() => {});
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, settingsPath);
  });

  return () => {
    unsubscribeCounters();
    unsubscribeSettings();
  };
}

// Subscribe to Ratings
export function subscribeToRatings(
  onRatingsUpdate: (ratings: RatingRecord[]) => void,
  branchFilter?: string | null
) {
  const ratingsPath = 'ratings';
  let qRatings = query(collection(db, 'ratings'));
  
  if (branchFilter && branchFilter !== 'all') {
    // If we have a branch filter, we could theoretically use Firestore where() 
    // but it requires a composite index if combined with orderBy.
    // For now, we'll fetch and filter client-side if the dataset is small, 
    // OR we can try to use a simple where filter if possible.
    // However, to keep it simple and robust (no missing indexes errors), 
    // we'll stick to full sync but allow future optimization.
  }
  
  const unsubscribeRatings = onSnapshot(qRatings, (snapshot) => {
    const records: RatingRecord[] = [];
    const mockRefsToDelete: any[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as RatingRecord;
      if (!isRealRatingRecord(data)) {
        mockRefsToDelete.push(docSnap.ref);
      } else {
        // Filter by branch client-side to ensure no index errors
        if (!branchFilter || branchFilter === 'all' || data.branchName === branchFilter) {
          records.push(data);
        }
      }
    });

    // Delete mock docs in background batches if found in Firestore
    if (mockRefsToDelete.length > 0) {
      console.log(`Cleaning up ${mockRefsToDelete.length} legacy mock records from Firestore...`);
      for (let i = 0; i < mockRefsToDelete.length; i += 400) {
        const chunk = mockRefsToDelete.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(ref => batch.delete(ref));
        batch.commit().catch(e => console.error('Error deleting mock docs:', e));
      }
    }

    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    localStorage.setItem(RATINGS_KEY, JSON.stringify(records));
    onRatingsUpdate(records);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, ratingsPath);
  });

  return unsubscribeRatings;
}

// Format Thai Date string (e.g., "28 ก.ค. 2569")
export function formatThaiDate(dateIsoStr: string, includeTime = false): string {
  const d = new Date(dateIsoStr);
  if (isNaN(d.getTime())) return '-';
  const day = d.getDate();
  const month = THAI_MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear() + 543; // Buddhist Era
  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${mins} น.`;
  }
  return `${day} ${month} ${year}`;
}

// Aggregate Daily Stats for a given date range
export function getDailyStats(ratings: RatingRecord[], startDateIso: string, endDateIso: string, counterId?: string): DailyStats[] {
  const filtered = ratings.filter(r => {
    const d = r.timestamp.slice(0, 10);
    const matchCounter = !counterId || counterId === 'all' || r.counterId === counterId;
    return d >= startDateIso && d <= endDateIso && matchCounter;
  });

  const grouped: Record<string, DailyStats> = {};

  filtered.forEach(r => {
    const dateKey = r.timestamp.slice(0, 10);
    const dateObj = new Date(r.timestamp);
    const formatted = `${dateObj.getDate()} ${THAI_MONTHS_SHORT[dateObj.getMonth()]}`;

    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        date: dateKey,
        dateFormatted: formatted,
        excellent: 0,
        good: 0,
        neutral: 0,
        poor: 0,
        very_poor: 0,
        total: 0,
        avgScore: 0,
        satisfactionRate: 0,
      };
    }

    const item = grouped[dateKey];
    item.total += 1;
    if (r.level === 'excellent') item.excellent += 1;
    else if (r.level === 'good') item.good += 1;
    else if (r.level === 'neutral') item.neutral += 1;
    else if (r.level === 'poor') item.poor += 1;
    else if (r.level === 'very_poor') item.very_poor += 1;
  });

  // Sort by date ascending and calculate averages
  return Object.values(grouped)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => {
      const sumScores = (item.excellent * 5) + (item.good * 4) + (item.neutral * 3) + (item.poor * 2) + (item.very_poor * 1);
      const avg = item.total > 0 ? Number((sumScores / item.total).toFixed(2)) : 0;
      const satRate = item.total > 0 ? Number((((item.excellent + item.good) / item.total) * 100).toFixed(1)) : 0;
      return {
        ...item,
        avgScore: avg,
        satisfactionRate: satRate,
      };
    });
}

// Aggregate Hourly Stats for a specific single day
export function getHourlyStats(ratings: RatingRecord[], dateIso: string, counterId?: string): HourlyStats[] {
  const filtered = ratings.filter(r => {
    const matchDate = r.timestamp.slice(0, 10) === dateIso;
    const matchCounter = !counterId || counterId === 'all' || r.counterId === counterId;
    return matchDate && matchCounter;
  });

  const hours = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00 to 20:00
  const result: HourlyStats[] = hours.map(h => {
    const hourLabel = `${String(h).padStart(2, '0')}:00`;
    return {
      hour: hourLabel,
      excellent: 0,
      good: 0,
      neutral: 0,
      poor: 0,
      very_poor: 0,
      total: 0,
      avgScore: 0,
    };
  });

  filtered.forEach(r => {
    const d = new Date(r.timestamp);
    const h = d.getHours();
    const idx = h - 8;
    if (idx >= 0 && idx < result.length) {
      const item = result[idx];
      item.total += 1;
      if (r.level === 'excellent') item.excellent += 1;
      else if (r.level === 'good') item.good += 1;
      else if (r.level === 'neutral') item.neutral += 1;
      else if (r.level === 'poor') item.poor += 1;
      else if (r.level === 'very_poor') item.very_poor += 1;
    }
  });

  return result.map(item => {
    const sumScores = (item.excellent * 5) + (item.good * 4) + (item.neutral * 3) + (item.poor * 2) + (item.very_poor * 1);
    const avg = item.total > 0 ? Number((sumScores / item.total).toFixed(2)) : 0;
    return { ...item, avgScore: avg };
  });
}

// Aggregate Monthly Stats
export function getMonthlyStats(ratings: RatingRecord[], counterId?: string): MonthlyStats[] {
  const filtered = ratings.filter(r => !counterId || counterId === 'all' || r.counterId === counterId);

  const grouped: Record<string, MonthlyStats> = {};

  filtered.forEach(r => {
    const monthKey = r.timestamp.slice(0, 7); // "YYYY-MM"
    const [year, month] = monthKey.split('-').map(Number);
    const monthIndex = month - 1;
    const monthName = `${THAI_MONTHS_FULL[monthIndex]} ${year + 543}`;

    if (!grouped[monthKey]) {
      grouped[monthKey] = {
        monthKey,
        monthName,
        excellent: 0,
        good: 0,
        neutral: 0,
        poor: 0,
        very_poor: 0,
        total: 0,
        avgScore: 0,
        satisfactionRate: 0,
      };
    }

    const item = grouped[monthKey];
    item.total += 1;
    if (r.level === 'excellent') item.excellent += 1;
    else if (r.level === 'good') item.good += 1;
    else if (r.level === 'neutral') item.neutral += 1;
    else if (r.level === 'poor') item.poor += 1;
    else if (r.level === 'very_poor') item.very_poor += 1;
  });

  return Object.values(grouped)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map(item => {
      const sumScores = (item.excellent * 5) + (item.good * 4) + (item.neutral * 3) + (item.poor * 2) + (item.very_poor * 1);
      const avg = item.total > 0 ? Number((sumScores / item.total).toFixed(2)) : 0;
      const satRate = item.total > 0 ? Number((((item.excellent + item.good) / item.total) * 100).toFixed(1)) : 0;
      return {
        ...item,
        avgScore: avg,
        satisfactionRate: satRate,
      };
    });
}

// Export CSV with UTF-8 BOM so Thai text displays cleanly in MS Excel
export function exportRatingsToCSV(ratings: RatingRecord[]): void {
  const headers = ['ลำดับ', 'เลขออเดอร์/ใบเสร็จ', 'วัน-เวลา', 'ชื่อสาขา', 'พนักงานผู้ให้บริการ', 'ระดับการประเมิน', 'คะแนน (1-5)'];

  const levelMap: Record<string, string> = {
    excellent: 'ดีมาก',
    good: 'ดี',
    neutral: 'พอใช้',
    poor: 'แย่',
    very_poor: 'แย่มาก',
  };

  const rows = ratings.map((r, idx) => [
    idx + 1,
    `"${r.orderNumber || '-'}"`,
    `"${formatThaiDate(r.timestamp, true)}"`,
    `"${r.counterName}"`,
    `"${r.cashierName}"`,
    `"${levelMap[r.level] || r.level}"`,
    r.score,
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

  // Add UTF-8 BOM \uFEFF
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `รายงานการประเมินพนักงาน_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
