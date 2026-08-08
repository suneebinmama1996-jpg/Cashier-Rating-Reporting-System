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

export function normalizeBranchName(name: string | undefined): string {
  if (!name) return 'unknown';
  // Standardize branch names for reliable comparison across various formats (PATTANI, NUNUH_PATTANI, NUNUH PATTANI)
  return name
    .toString()
    .replace(/[\s\u00A0\u200B_]+/g, ' ')
    .replace(/^NUNUH\s*/i, '')
    .trim()
    .toLowerCase();
}

export function cleanStr(s: string | undefined | null): string {
  if (!s) return '';
  return s.toString().replace(/[\s\u00A0\u200B_]+/g, ' ').trim().toLowerCase();
}

const DELETED_RATINGS_KEY = 'cashier_deleted_rating_ids_v1';

export function getDeletedRatingIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_RATINGS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markRatingAsDeleted(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  const deleted = getDeletedRatingIds();
  deleted.add(id);
  localStorage.setItem(DELETED_RATINGS_KEY, JSON.stringify(Array.from(deleted)));
}

const BRANCH_KEYWORD_GROUPS: string[][] = [
  ['narathiwat', 'นราธิวาส'],
  ['pattani', 'ปัตตานี'],
  ['yala', 'ยะลา'],
  ['hatyai', 'hat yai', 'หาดใหญ่'],
  ['betong', 'เบตง'],
  ['sungaikolok', 'sungai kolok', 'สุไหงโก-ลก'],
  ['digital', 'ดิจิทัล'],
  ['mistine', 'มิสทีน'],
  ['krabi', 'กระบี่'],
];

export function matchesBranch(recordBranch: string | undefined | null, filterBranch: string | undefined | null): boolean {
  if (!filterBranch || filterBranch === 'all' || filterBranch.trim() === '') return true;
  if (!recordBranch) return false;
  
  const rRaw = cleanStr(recordBranch);
  const fRaw = cleanStr(filterBranch);
  
  if (!fRaw || fRaw === 'all') return true;
  if (!rRaw) return false;
  if (rRaw === fRaw) return true;
  
  const normR = normalizeBranchName(recordBranch);
  const normF = normalizeBranchName(filterBranch);
  
  if (!normF || normF === 'all') return true;
  if (normR === normF) return true;

  // Normalized substring check (avoiding single words like 'nunuh' from matching all branches)
  if (normR && normF && normR !== 'unknown' && normF !== 'unknown') {
    if (normR === normF) return true;
    if (normR.length >= 3 && normF.length >= 3 && normR !== 'nunuh' && normF !== 'nunuh') {
      if (normR.includes(normF) || normF.includes(normR)) return true;
    }
  }

  // Cross-lingual keyword alias matching (e.g., NARATHIWAT <-> นราธิวาส)
  for (const group of BRANCH_KEYWORD_GROUPS) {
    const filterInGroup = group.some(kw => fRaw.includes(kw) || normF.includes(kw));
    if (filterInGroup) {
      const recordInGroup = group.some(kw => rRaw.includes(kw) || normR.includes(kw));
      if (recordInGroup) return true;
    }
  }
  
  return false;
}

export function recordMatchesBranch(
  r: RatingRecord,
  filterBranch: string | undefined | null,
  counters: Counter[] = []
): boolean {
  if (!r) return false;
  if (!filterBranch || filterBranch === 'all' || filterBranch.trim() === '') {
    return true;
  }

  const fBranch = filterBranch.trim();
  if (cleanStr(fBranch) === 'all') return true;

  // Combine passed counters with INITIAL_COUNTERS to ensure we always have complete catalog metadata
  const allKnownCounters = [...counters, ...INITIAL_COUNTERS];

  // 1. Collect all target filter values (e.g. if filterBranch is 'n-02', add 'NUNUH NARATHIWAT', 'n-02')
  const filterTargets = new Set<string>();
  filterTargets.add(fBranch);

  allKnownCounters.forEach((c) => {
    if (c.id === fBranch || cleanStr(c.id) === cleanStr(fBranch)) {
      if (c.branchName) filterTargets.add(c.branchName);
      if (c.name) filterTargets.add(c.name);
      if (c.id) filterTargets.add(c.id);
    } else if (
      (c.branchName && matchesBranch(c.branchName, fBranch)) ||
      (c.name && matchesBranch(c.name, fBranch))
    ) {
      if (c.branchName) filterTargets.add(c.branchName);
      if (c.name) filterTargets.add(c.name);
      if (c.id) filterTargets.add(c.id);
    }
  });

  // 2. Collect all record values
  const recordValues = new Set<string>();
  if (r.branchName) recordValues.add(r.branchName);
  if (r.counterName) recordValues.add(r.counterName);
  if (r.cashierName) recordValues.add(r.cashierName);
  if (r.counterId) recordValues.add(r.counterId);

  // If record has counterId, find corresponding counter and add its branchName/name
  if (r.counterId) {
    allKnownCounters.forEach((c) => {
      if (c.id === r.counterId || cleanStr(c.id) === cleanStr(r.counterId)) {
        if (c.branchName) recordValues.add(c.branchName);
        if (c.name) recordValues.add(c.name);
      }
    });
  }

  // 3. Test if ANY recordValue matches ANY filterTarget
  for (const rVal of recordValues) {
    for (const fTarget of filterTargets) {
      if (cleanStr(rVal) === cleanStr(fTarget)) return true;
      if (rVal === fTarget) return true;
      if (matchesBranch(rVal, fTarget)) return true;
      if (matchesBranch(fTarget, rVal)) return true;
    }
  }

  return false;
}

/**
 * Normalizes a timestamp or date string to YYYY-MM-DD for consistent comparison
 * Uses Asia/Bangkok timezone to match local user expectations (+07:00)
 */
export function normalizeDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return dateStr.split('T')[0] || '';
    }
    
    // Use Intl.DateTimeFormat to get parts for YYYY-MM-DD in Bangkok timezone
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    
    return `${year}-${month}-${day}`;
  } catch (e) {
    return dateStr ? dateStr.split('T')[0] : '';
  }
}

/**
 * Checks if a timestamp falls within a start date and end date range (inclusive, 00:00:00 to 23:59:59.999 in Bangkok timezone +07:00)
 */
export function isRecordInDateRange(
  timestampStr: string | undefined,
  startDateStr: string | undefined | null,
  endDateStr: string | undefined | null
): boolean {
  if (!timestampStr) return false;
  
  const sDate = startDateStr ? startDateStr.trim() : '';
  const eDate = endDateStr ? endDateStr.trim() : '';

  if (!sDate && !eDate) return true;

  // 1. Date string check (YYYY-MM-DD in Asia/Bangkok timezone)
  const rDateStr = normalizeDate(timestampStr);
  if (sDate && rDateStr < sDate) return false;
  if (eDate && rDateStr > eDate) return false;
  
  // 2. Epoch milliseconds check (00:00:00.000 to 23:59:59.999 Asia/Bangkok timezone)
  try {
    const d = new Date(timestampStr);
    const t = d.getTime();
    if (!isNaN(t)) {
      if (sDate) {
        const [sy, sm, sd] = sDate.split('-').map(Number);
        if (sy && sm && sd) {
          const startMs = Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0) - (7 * 60 * 60 * 1000);
          if (t < startMs) return false;
        }
      }
      if (eDate) {
        const [ey, em, ed] = eDate.split('-').map(Number);
        if (ey && em && ed) {
          const endMs = Date.UTC(ey, em - 1, ed, 23, 59, 59, 999) - (7 * 60 * 60 * 1000);
          if (t > endMs) return false;
        }
      }
    }
  } catch (e) {
    // fallback
  }

  return true;
}

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    console.log(`Fetch failed, retrying... (${retries} left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(fn, retries - 1, delay * 1.5);
  }
}

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
  const q = query(collection(db, 'reconciliations'));
  
  return onSnapshot(q, (snapshot) => {
    const recs = snapshot.docs.map(doc => doc.data() as POSReconciliation);
    recs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
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
    const keys = [SETTINGS_KEY, 'cashier_rating_system_settings', 'settings', 'config'];
    let data = null;
    for (const key of keys) {
      data = localStorage.getItem(key);
      if (data) break;
    }

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
  
  // Filter out any ID explicitly marked as mock
  if (r.id.startsWith('mock-') || r.id.startsWith('rec-')) return false;
  
  // Filter out legacy mock branches
  if (isMockBranch(r.branchName)) return false;
  
  return true;
}

export function getStoredRatings(): RatingRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    // Deep migration: Check multiple possible legacy keys
    const keys = [RATINGS_KEY, 'cashier_rating_records', 'ratings', 'records'];
    let data = null;
    for (const key of keys) {
      data = localStorage.getItem(key);
      if (data) break;
    }
    
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
    
    // Optional Dual Backup - Webhook
    const webhookUrl = (window as any).WEBHOOK_BACKUP_URL || '';
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(created)
      }).catch(err => console.error('Webhook backup error:', err));
    }
  } catch (e) {
    console.error('Firestore save rating error:', e);
  }

  return created;
}

export async function deleteRatingRecord(id: string): Promise<void> {
  if (!id) return;

  // 1. Permanently mark this ID as deleted locally so sync logic never restores it
  markRatingAsDeleted(id);

  // 2. Clean up from current storage AND all legacy local storage keys
  const keys = [RATINGS_KEY, 'cashier_rating_records', 'ratings', 'records'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter((r: any) => r && r.id !== id);
          localStorage.setItem(key, JSON.stringify(updated));
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Delete directly from Firestore
  try {
    await deleteDoc(doc(db, 'ratings', id));
    console.log(`Rating document ${id} successfully deleted from Firestore.`);
  } catch (e) {
    console.error('Firestore delete rating record error:', e);
    handleFirestoreError(e, OperationType.DELETE, `ratings/${id}`);
  }
}

export function resetRatingsToSample(): RatingRecord[] {
  localStorage.setItem(RATINGS_KEY, JSON.stringify([]));
  return [];
}

export async function clearAllRatings(): Promise<void> {
  const current = getStoredRatings();
  current.forEach((r) => markRatingAsDeleted(r.id));

  const keys = [RATINGS_KEY, 'cashier_rating_records', 'ratings', 'records'];
  keys.forEach((k) => localStorage.setItem(k, JSON.stringify([])));

  try {
    const snapshot = await getDocs(collection(db, 'ratings'));
    if (snapshot.docs.length > 0) {
      const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
    }
  } catch (e) {
    console.error('Firestore clear error:', e);
  }
}

const MOCK_BRANCHES_TO_REMOVE = ['สาขาหลัก (Headquarters)', 'สาขาสยามพารากอน', 'สาขาเซ็นทรัลเวิลด์', 'สาขาบางนา'];

function isMockBranch(branchName: string | undefined): boolean {
  if (!branchName) return false;
  return MOCK_BRANCHES_TO_REMOVE.includes(branchName);
}

export function getStoredCounters(): Counter[] {
  if (typeof window === 'undefined') return INITIAL_COUNTERS;
  try {
    const keys = [COUNTERS_KEY, 'cashier_rating_counters', 'counters', 'branches'];
    let data = null;
    for (const key of keys) {
      data = localStorage.getItem(key);
      if (data) break;
    }

    if (!data) {
      localStorage.setItem(COUNTERS_KEY, JSON.stringify(INITIAL_COUNTERS));
      return INITIAL_COUNTERS;
    }
    
    let parsed: Counter[] = JSON.parse(data);
    // Filter out mock branches
    parsed = parsed.filter(c => !isMockBranch(c.branchName));
    
    if (parsed.length === 0) {
      localStorage.setItem(COUNTERS_KEY, JSON.stringify(INITIAL_COUNTERS));
      return INITIAL_COUNTERS;
    }
    
    return parsed;
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
  const fetchTask = async () => {
    // Try multiple collections for legacy support
    const collections = ['ratings', 'rating_records', 'records', 'cashier_ratings'];
    let allRecords: RatingRecord[] = [];
    
    for (const colName of collections) {
      try {
        const snapshot = await getDocs(collection(db, colName));
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data && data.id && data.timestamp && isRealRatingRecord(data)) {
            allRecords.push(data);
          }
        });
      } catch (e) {
        console.warn(`Failed to fetch from collection ${colName}:`, e);
      }
    }

    // De-duplicate by ID
    const uniqueMap = new Map<string, RatingRecord>();
    allRecords.forEach(r => uniqueMap.set(r.id, r));
    const records = Array.from(uniqueMap.values());

    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (records.length > 0) {
      localStorage.setItem(RATINGS_KEY, JSON.stringify(records));
    }
    return records;
  };

  try {
    return await fetchWithRetry(fetchTask);
  } catch (e) {
    console.error('Final Fetch ratings failure:', e);
    return getStoredRatings();
  }
}

export async function fetchConfigFromFirestore(): Promise<{ counters: Counter[], settings: SystemSettings }> {
  const fetchTask = async () => {
    // Try multiple paths for counters
    const counterPaths = [
      doc(db, 'config', 'counters'),
      doc(db, 'counters', 'list'),
      doc(db, 'config', 'branches'),
      doc(db, 'branches', 'all'),
      doc(db, 'settings', 'counters')
    ];
    
    let counters = getStoredCounters();
    for (const p of counterPaths) {
      const snap = await getDocFromServer(p).catch(() => null);
      if (snap && snap.exists()) {
        const data = snap.data();
        let list: Counter[] = [];
        if (data && Array.isArray(data.list)) list = data.list;
        else if (Array.isArray(data)) list = data;
        else if (data && Array.isArray(data.counters)) list = data.counters;

        list = list.filter(c => !isMockBranch(c.branchName));
        if (list.length > 0) {
          counters = list;
          localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters));
          break;
        }
        if (data && Array.isArray(data.counters)) {
          counters = data.counters;
          localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters));
          break;
        }
      }
    }

    // Try multiple paths for settings
    const settingsPaths = [
      doc(db, 'config', 'settings'),
      doc(db, 'settings', 'global'),
      doc(db, 'config', 'system'),
      doc(db, 'system', 'settings')
    ];
    
    let settings = getStoredSettings();
    for (const p of settingsPaths) {
      const snap = await getDocFromServer(p).catch(() => null);
      if (snap && snap.exists()) {
        const data = snap.data() as SystemSettings;
        settings = { ...DEFAULT_SETTINGS, ...data };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        break;
      }
    }

    return { counters, settings };
  };

  try {
    return await fetchWithRetry(fetchTask);
  } catch (e) {
    console.error('Final Fetch config failure:', e);
    return { counters: getStoredCounters(), settings: getStoredSettings() };
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
      if (data && Array.isArray(data.list)) {
        let list = data.list.filter((c: any) => !isMockBranch(c.branchName));
        if (list.length === 0) {
          list = INITIAL_COUNTERS;
          setDoc(doc(db, 'config', 'counters'), { list }).catch(() => {});
        }
        localStorage.setItem(COUNTERS_KEY, JSON.stringify(list));
        onCountersUpdate(list);
      }
    } else {
      // Initialize counters in Firestore IF it's empty
      const local = getStoredCounters();
      if (local && local.length > 0) {
        console.log('Initializing Firestore counters from local storage...');
        setDoc(doc(db, 'config', 'counters'), { list: local }).catch((e) => {
          console.error('Initial counters sync error:', e);
        });
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
  
  const unsubscribeRatings = onSnapshot(qRatings, (snapshot) => {
    const deletedIds = getDeletedRatingIds();
    const allFirestoreRecords: RatingRecord[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as RatingRecord;
      const recId = docSnap.id || data?.id;

      // If document was marked deleted, ensure deleteDoc is executed on Firestore & ignore it
      if (deletedIds.has(recId) || (data && deletedIds.has(data.id))) {
        deleteDoc(doc(db, 'ratings', docSnap.id)).catch(() => {});
        return;
      }

      if (isRealRatingRecord(data)) {
        allFirestoreRecords.push(data);
      }
    });

    // 1. Get current local records (excluding any marked as deleted)
    const localRecords = getStoredRatings().filter(r => r && !deletedIds.has(r.id));
    
    // 2. Merge logic: If Firestore has data, it's the source of truth for those records.
    // However, if we have local records NOT yet in Firestore, we should preserve them and upload them.
    const firestoreIds = new Set(allFirestoreRecords.map(r => r.id));
    const pendingUpload = localRecords.filter(r => !firestoreIds.has(r.id) && !deletedIds.has(r.id));
    
    // Upload pending records to Firestore
    if (pendingUpload.length > 0) {
      console.log(`Uploading ${pendingUpload.length} pending local records to Firestore...`);
      pendingUpload.forEach(r => {
        setDoc(doc(db, 'ratings', r.id), r).catch(e => console.error('Auto-sync error:', e));
      });
    }

    // 3. The final combined set for storage is EVERYTHING in Firestore + anything pending upload
    const combined = [...allFirestoreRecords, ...pendingUpload];
    combined.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    // 4. Save COMPLETE set to local storage (NEVER save a filtered subset)
    localStorage.setItem(RATINGS_KEY, JSON.stringify(combined));

    // 5. Always emit 100% complete dataset so state is never truncated or lost
    onRatingsUpdate(combined);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, ratingsPath);
  });

  return unsubscribeRatings;
}

// Format Thai Date string (e.g., "28 ก.ค. 2569")
export function formatThaiDate(dateIsoStr: string, includeTime = false): string {
  try {
    const d = new Date(dateIsoStr);
    if (isNaN(d.getTime())) return '-';
    
    // Use Intl.DateTimeFormat for consistent Asia/Bangkok timezone handling
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = false;
    }
    
    const formatter = new Intl.DateTimeFormat('th-TH', options);
    const parts = formatter.formatToParts(d);
    
    const day = parts.find(p => p.type === 'day')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const yearVal = parts.find(p => p.type === 'year')?.value || '0';
    
    // Ensure Buddhist Era year (CE + 543)
    let year = parseInt(yearVal);
    if (year < 2400) year += 543;
    
    if (includeTime) {
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      return `${day} ${month} ${year} ${hour}:${minute} น.`;
    }
    
    return `${day} ${month} ${year}`;
  } catch (e) {
    return dateIsoStr ? dateIsoStr.split('T')[0] : '-';
  }
}

// Aggregate Daily Stats for a given date range
export function getDailyStats(ratings: RatingRecord[], startDateIso: string, endDateIso: string, counterId?: string, counters: Counter[] = []): DailyStats[] {
  const filtered = ratings.filter(r => {
    const d = normalizeDate(r.timestamp);
    const matchCounter = !counterId || counterId === 'all' || r.counterId === counterId || recordMatchesBranch(r, counterId, counters);
    const matchStartDate = !startDateIso || d >= startDateIso;
    const matchEndDate = !endDateIso || d <= endDateIso;
    return matchStartDate && matchEndDate && matchCounter;
  });

  const grouped: Record<string, DailyStats> = {};

  filtered.forEach(r => {
    const dateKey = normalizeDate(r.timestamp);
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
export function getHourlyStats(ratings: RatingRecord[], dateIso: string, counterId?: string, counters: Counter[] = []): HourlyStats[] {
  const filtered = ratings.filter(r => {
    const matchDate = normalizeDate(r.timestamp) === dateIso;
    const matchCounter = !counterId || counterId === 'all' || r.counterId === counterId || recordMatchesBranch(r, counterId, counters);
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
export function getMonthlyStats(ratings: RatingRecord[], counterId?: string, counters: Counter[] = []): MonthlyStats[] {
  const filtered = ratings.filter(r => !counterId || counterId === 'all' || r.counterId === counterId || recordMatchesBranch(r, counterId, counters));

  const grouped: Record<string, MonthlyStats> = {};

  filtered.forEach(r => {
    try {
      const d = new Date(r.timestamp);
      if (isNaN(d.getTime())) return;
      
      // Normalize to Thai timezone for month grouping (YYYY-MM)
      const monthKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit'
      }).format(d);

      const [yearStr, monthStr] = monthKey.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
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
    } catch (e) {
      console.warn('Error grouping monthly stat:', e);
    }
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
  const headers = ['ลำดับ', 'เลขออเดอร์/ใบเสร็จ', 'วัน-เวลา', 'สาขา / จุดบริการ', 'พนักงานผู้ให้บริการ', 'ระดับการประเมิน', 'คะแนน (1-5)'];

  const levelMap: Record<string, string> = {
    excellent: 'ดีมาก',
    good: 'ดี',
    neutral: 'พอใช้',
    poor: 'แย่',
    very_poor: 'แย่มาก',
  };

  const rows = ratings.map((r, idx) => {
    let branchInfo = r.branchName || r.counterName || '-';
    if (r.branchName && r.counterName && r.branchName !== r.counterName) {
      branchInfo = `${r.branchName} (${r.counterName})`;
    }
    return [
      idx + 1,
      `"${r.orderNumber || '-'}"`,
      `"${formatThaiDate(r.timestamp, true)}"`,
      `"${branchInfo}"`,
      `"${r.cashierName || '-'}"`,
      `"${levelMap[r.level] || r.level}"`,
      r.score,
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

  // Add UTF-8 BOM \uFEFF for Excel Thai support
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `รายงานการประเมิน_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
