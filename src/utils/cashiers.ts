import * as XLSX from 'xlsx';
import { CashierEntry, Counter } from '../types';

// Cashier lists were saved as plain names before codes existed; read both shapes.
export function cashierEntries(counter?: Counter | null): CashierEntry[] {
  const out: CashierEntry[] = [];
  const seen = new Set<string>();
  (counter?.cashiers || []).forEach((c) => {
    const e: CashierEntry = typeof c === 'string' ? { name: c } : { name: c?.name || '', code: c?.code };
    e.name = (e.name || '').trim();
    e.code = (e.code || '').trim() || undefined;
    if (!e.name || seen.has(e.name)) return;
    seen.add(e.name);
    out.push(e);
  });
  return out;
}

const norm = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, '');

/** Exact match on employee code first, then on name. Used for scans and Enter. */
export function findCashier(list: CashierEntry[], value: string): CashierEntry | undefined {
  const v = norm(value);
  if (!v) return undefined;
  return list.find((c) => c.code && norm(c.code) === v) || list.find((c) => norm(c.name) === v);
}

export function searchCashiers(list: CashierEntry[], query: string): CashierEntry[] {
  const q = norm(query);
  if (!q) return list;
  return list.filter((c) => norm(c.name).includes(q) || (c.code && norm(c.code).includes(q)));
}

/** Add new people and fill in codes for names already on the list. */
export function mergeCashiers(current: CashierEntry[], incoming: CashierEntry[]): CashierEntry[] {
  const out = current.map((c) => ({ ...c }));
  incoming.forEach((n) => {
    const byName = out.find((c) => norm(c.name) === norm(n.name));
    if (byName) {
      if (n.code) byName.code = n.code;
      return;
    }
    const byCode = n.code ? out.find((c) => c.code && norm(c.code) === norm(n.code)) : undefined;
    if (byCode) {
      byCode.name = n.name;
      return;
    }
    out.push({ name: n.name, ...(n.code ? { code: n.code } : {}) });
  });
  return out;
}

export interface CashierImportRow extends CashierEntry {
  branch?: string;
}

const NAME_COLS = ['ชื่อแคชเชียร์', 'ชื่อพนักงาน', 'ชื่อ-นามสกุล', 'ชื่อ', 'แคชเชียร์', 'พนักงาน', 'name', 'cashier', 'staff'];
const CODE_COLS = ['รหัสพนักงาน', 'รหัสแคชเชียร์', 'รหัส', 'บาร์โค้ด', 'code', 'id', 'barcode', 'employee'];
const BRANCH_COLS = ['สาขา', 'branch', 'store', 'shop'];

function findCol(header: string[], keys: string[]): number {
  for (const k of keys) {
    const i = header.findIndex((h) => norm(h) === norm(k));
    if (i >= 0) return i;
  }
  for (const k of keys) {
    const i = header.findIndex((h) => norm(h).includes(norm(k)));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Reads cashier names from an Excel/CSV file.
 * Columns are found by header (ชื่อ / รหัส / สาขา). Without a header row,
 * one column = names, two columns = code + name.
 */
export async function parseCashierFile(file: File): Promise<CashierImportRow[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const rows: CashierImportRow[] = [];
  wb.SheetNames.forEach((sn) => {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: false, defval: '' })
      .map((r) => (r as unknown[]).map((v) => String(v ?? '').trim()))
      .filter((r) => r.some(Boolean));
    if (!aoa.length) return;
    // header = the early row that names the most of our columns (skips a title row above it)
    const score = (r: string[]) =>
      findCol(r, NAME_COLS) < 0 ? 0 : 1 + (findCol(r, CODE_COLS) >= 0 ? 1 : 0) + (findCol(r, BRANCH_COLS) >= 0 ? 1 : 0) + (r.filter(Boolean).length > 1 ? 1 : 0);
    let h = -1;
    aoa.slice(0, 10).forEach((r, i) => {
      if (score(r) > (h < 0 ? 0 : score(aoa[h]))) h = i;
    });
    let nameI: number, codeI: number, branchI: number;
    if (h >= 0) {
      const header = aoa[h];
      nameI = findCol(header, NAME_COLS);
      codeI = findCol(header, CODE_COLS);
      branchI = findCol(header, BRANCH_COLS);
      if (codeI === nameI) codeI = -1;
    } else {
      h = -1;
      const width = Math.max(...aoa.map((r) => r.filter(Boolean).length));
      nameI = width >= 2 ? 1 : 0;
      codeI = width >= 2 ? 0 : -1;
      branchI = -1;
    }
    aoa.slice(h + 1).forEach((r) => {
      const name = r[nameI] || '';
      if (!name) return;
      rows.push({
        name,
        code: codeI >= 0 ? r[codeI] || undefined : undefined,
        branch: branchI >= 0 ? r[branchI] || undefined : undefined,
      });
    });
  });
  return rows;
}

// Thai branch names people may type in a sheet, mapped to the English words used in counter names
const BRANCH_TH: Record<string, string> = {
  'ปัตตานี': 'PATTANI', 'นราธิวาส': 'NARATHIWAT', 'ยะลา': 'YALA', 'หาดใหญ่': 'HATYAI',
  'ดิจิตอล': 'DIGITAL', 'ดิจิทัล': 'DIGITAL', 'มิสทีน': 'MISTINE', 'กระบี่': 'KRABI', 'เดอะมอลล์': 'THE MALL',
};

/** Does a branch written in the sheet refer to this counter? */
export function branchMatches(counter: Counter, sheetBranch: string): boolean {
  const s = norm(sheetBranch);
  if (!s) return false;
  const names = [counter.branchName, counter.name].map(norm).filter(Boolean);
  if (names.some((n) => n === s || n.includes(s) || s.includes(n))) return true;
  const en = Object.entries(BRANCH_TH).find(([th]) => s.includes(norm(th)));
  return !!en && names.some((n) => n.includes(norm(en[1])));
}

export function downloadCashierTemplate(counters: Counter[]) {
  const rows = [['สาขา', 'รหัสพนักงาน', 'ชื่อแคชเชียร์']];
  counters.forEach((c) => rows.push([c.branchName || c.name, '', '']));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'แคชเชียร์');
  XLSX.writeFile(wb, 'cashier-template.xlsx');
}
