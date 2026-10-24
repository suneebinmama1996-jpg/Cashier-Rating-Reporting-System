import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Trophy, AlertTriangle, Info, Columns3, X } from 'lucide-react';
import { RatingRecord } from '../types';
import { analyzePos, billKey, dayOf, loadPosIndex, PosBranch, shift, thai } from './AutoPosCheck';

/*
 * Branches and cashiers who did their job completely:
 * asked every customer to rate (coverage against POS bills), entered the cashier,
 * and did not rate the same POS number twice. Columns can be switched on/off;
 * the score only uses the columns that are switched on.
 */

const MIN_STAFF = 10; // fewer ratings than this = not enough data to rank a cashier
const COLS_KEY = 'top_performers_cols_v1';
const WIDTHS_KEY = 'top_performers_widths_v1';

type ColKey = 'cov' | 'dup' | 'named' | 'sat' | 'n';
const BRANCH_COLS: { k: ColKey; l: string; w: number }[] = [
  { k: 'cov', l: 'ประเมินครบทุกบิล', w: 60 },
  { k: 'dup', l: 'เลข POS ซ้ำ', w: 30 },
  { k: 'named', l: 'ใส่ชื่อพนักงาน', w: 10 },
  { k: 'sat', l: 'ความพึงพอใจ', w: 0 },
];
const STAFF_COLS: { k: ColKey; l: string; w: number }[] = [
  { k: 'n', l: 'จำนวนใบประเมิน', w: 0 },
  { k: 'dup', l: 'เลข POS ซ้ำ', w: 60 },
  { k: 'sat', l: 'ความพึงพอใจ', w: 40 },
];
type ColState = { b: Record<string, boolean>; s: Record<string, boolean> };
const DEFAULT_COLS: ColState = {
  b: Object.fromEntries(BRANCH_COLS.map((c) => [c.k, true])),
  s: Object.fromEntries(STAFF_COLS.map((c) => [c.k, true])),
};
function loadCols(): ColState {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY) || 'null');
    if (v && v.b && v.s) return { b: { ...DEFAULT_COLS.b, ...v.b }, s: { ...DEFAULT_COLS.s, ...v.s } };
  } catch {
    /* use defaults */
  }
  return DEFAULT_COLS;
}

type Widths = Record<string, Record<string, number>>; // table -> column id -> px
function loadWidths(): Widths {
  try {
    const v = JSON.parse(localStorage.getItem(WIDTHS_KEY) || 'null');
    if (v && typeof v === 'object') return v;
  } catch {
    /* use defaults */
  }
  return {};
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* not saved, still applies now */
  }
}

interface Props {
  ratings: RatingRecord[];
  branch?: string;
}

type DupGroup = { pos: string; list: RatingRecord[] };

const named = (r: RatingRecord) => {
  const n = String(r.cashierName || '').trim();
  return !!n && n !== '-';
};
const medal = (i: number) => ['🥇', '🥈', '🥉'][i] || String(i + 1);
const pct = (v: number) => Math.round(v * 100) + '%';
const when = (iso: string) => {
  const t = Date.parse(iso);
  return isNaN(t) ? iso : thai(dayOf(t)) + ' ' + new Date(t + 7 * 3600e3).toISOString().slice(11, 19);
};

// Ratings sharing one POS number: groups with 2+ ratings, and how many ratings are extra copies
function duplicates(list: RatingRecord[]): { groups: DupGroup[]; extra: number } {
  const m = new Map<string, RatingRecord[]>();
  list.forEach((r) => {
    const k = billKey(r.orderNumber);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  });
  const groups = [...m.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([pos, l]) => ({ pos, list: l.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }))
    .sort((a, b) => b.list.length - a.list.length || a.pos.localeCompare(b.pos));
  return { groups, extra: groups.reduce((s, g) => s + g.list.length - 1, 0) };
}

// Weighted score over the switched-on columns only (weights rescaled to 100)
function weighted(cols: { k: ColKey; w: number }[], on: Record<string, boolean>, val: Partial<Record<ColKey, number>>) {
  const use = cols.filter((c) => c.w > 0 && on[c.k]);
  const tw = use.reduce((s, c) => s + c.w, 0);
  if (!tw) return null;
  return Math.round((100 * use.reduce((s, c) => s + c.w * (val[c.k] || 0), 0)) / tw);
}
function formula(cols: { k: ColKey; l: string; w: number }[], on: Record<string, boolean>) {
  const use = cols.filter((c) => c.w > 0 && on[c.k]);
  const tw = use.reduce((s, c) => s + c.w, 0);
  if (!tw) return 'ไม่มีคอลัมน์ที่ใช้คิดคะแนน';
  return 'คะแนน = ' + use.map((c) => `${c.k === 'dup' ? 'ไม่มีเลข POS ซ้ำ' : c.l} ${Math.round((100 * c.w) / tw)}%`).join(' + ');
}

type Head = { id: string; label: string; align?: 'left' | 'right' | 'center' };
const alignCls = (a?: Head['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

// Table whose column widths can be dragged at the right edge of each header.
// The first drag freezes every column at its current width, so only the dragged one moves.
const ResizableTable: React.FC<{
  heads: Head[];
  widths?: Record<string, number>;
  onWidths: (w: Record<string, number>, done: boolean) => void;
  children: React.ReactNode;
}> = ({ heads, widths, onWidths, children }) => {
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const fixed = !!widths && heads.every((h) => widths[h.id]);
  const total = fixed ? heads.reduce((s, h) => s + widths![h.id], 0) : undefined;

  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const base: Record<string, number> = {};
    heads.forEach((h) => (base[h.id] = (fixed && widths![h.id]) || Math.round(thRefs.current[h.id]?.getBoundingClientRect().width || 100)));
    const x0 = e.clientX, w0 = base[id];
    let cur = base;
    const move = (ev: PointerEvent) => {
      cur = { ...base, [id]: Math.max(56, Math.round(w0 + ev.clientX - x0)) };
      onWidths(cur, false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onWidths(cur, true);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    onWidths(base, false);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="text-left text-sm text-slate-700" style={fixed ? { tableLayout: 'fixed', width: total, minWidth: '100%' } : { width: '100%' }}>
        {fixed && (
          <colgroup>
            {heads.map((h) => (
              <col key={h.id} style={{ width: widths![h.id] }} />
            ))}
          </colgroup>
        )}
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {heads.map((h) => (
              <th key={h.id} ref={(el) => { thRefs.current[h.id] = el; }} className={`relative py-3 px-4 font-bold text-slate-600 text-[13px] whitespace-nowrap ${alignCls(h.align)}`}>
                <span className="block overflow-hidden text-ellipsis">{h.label}</span>
                <span
                  onPointerDown={(e) => startDrag(e, h.id)}
                  className="absolute top-0 right-0 h-full w-2.5 cursor-col-resize group flex justify-center touch-none"
                  title="ลากเพื่อปรับความกว้าง"
                >
                  <span className="w-0.5 h-full bg-slate-200 group-hover:bg-pink-400" />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
};

export const TopPerformers: React.FC<Props> = ({ ratings, branch }) => {
  const yesterday = shift(dayOf(Date.now()), -1);
  const [from, setFrom] = useState(yesterday.slice(0, 8) + '01');
  const [to, setTo] = useState(yesterday);
  const [pos, setPos] = useState<PosBranch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [cols, setCols] = useState<ColState>(loadCols);
  const [widths, setWidths] = useState<Widths>(loadWidths);
  const [showCols, setShowCols] = useState(false);
  const [detail, setDetail] = useState<{ title: string; groups: DupGroup[] } | null>(null);

  const setCol = (part: 'b' | 's', k: string, on: boolean) =>
    setCols((c) => {
      const next = { ...c, [part]: { ...c[part], [k]: on } };
      save(COLS_KEY, next);
      return next;
    });
  const setTableWidths = (t: string) => (w: Record<string, number>, done: boolean) =>
    setWidths((all) => {
      const next = { ...all, [t]: w };
      if (done) save(WIDTHS_KEY, next);
      return next;
    });
  const resetWidths = () => {
    setWidths({});
    save(WIDTHS_KEY, {});
  };

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setPos(await loadPosIndex());
    } catch (e: any) {
      setErr(e?.message || 'โหลดบิล POS ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const setRange = (f: string, t: string) => {
    if (f > t) [f, t] = [t, f];
    setFrom(f);
    setTo(t);
  };

  // Heavy part: match ratings to POS bills. Does not depend on the column switches,
  // so ticking a column only re-scores and never re-runs the matching.
  const base = useMemo(() => {
    if (!pos) return null;
    const A = analyzePos(pos, ratings, from, to, branch);
    const branches = A.rows.map((x) => {
      const mine = A.byBranch.get(x.code) || [];
      const n = mine.length;
      const d = duplicates(mine);
      return {
        code: x.code,
        label: x.label,
        bills: x.bills,
        rated: x.rated,
        n,
        dup: d,
        cov: x.bills ? Math.min(1, x.rated / x.bills) : 0,
        nodup: n ? 1 - d.extra / n : 0,
        nm: n ? mine.filter(named).length / n : 0,
        avg: n ? mine.reduce((s, r) => s + (+r.score || 0), 0) / n : 0,
      };
    });
    const staffMap = new Map<string, { name: string; label: string; list: RatingRecord[] }>();
    A.rows.forEach((x) =>
      (A.byBranch.get(x.code) || []).filter(named).forEach((r) => {
        const name = String(r.cashierName).trim();
        const key = x.code + '|' + name.toUpperCase();
        const s = staffMap.get(key) || { name, label: x.label, list: [] };
        s.list.push(r);
        staffMap.set(key, s);
      })
    );
    const staff = [...staffMap.values()].map((s) => {
      const n = s.list.length, d = duplicates(s.list);
      return { name: s.name, label: s.label, n, dup: d, nodup: 1 - d.extra / n, avg: s.list.reduce((t, r) => t + (+r.score || 0), 0) / n };
    });
    const noName = A.rows.reduce((s, x) => s + (A.byBranch.get(x.code) || []).filter((r) => !named(r)).length, 0);
    return { branches, staff, noName };
  }, [pos, ratings, from, to, branch]);

  const R = useMemo(() => {
    if (!base) return null;
    const branches = base.branches
      .map((b) => ({ ...b, score: b.bills ? weighted(BRANCH_COLS, cols.b, { cov: b.cov, dup: b.nodup, named: b.nm, sat: b.avg / 5 }) : null }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.cov - a.cov);
    const staff = base.staff.map((s) => ({ ...s, score: weighted(STAFF_COLS, cols.s, { dup: s.nodup, sat: s.avg / 5 }) }));
    const ranked = staff.filter((s) => s.n >= MIN_STAFF).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.n - a.n);
    const few = staff.filter((s) => s.n < MIN_STAFF).sort((a, b) => b.n - a.n);
    return { branches, ranked, few, noName: base.noName };
  }, [base, cols]);

  const td = 'py-3 px-4 overflow-hidden text-ellipsis';
  const bar = (v: number | null) =>
    v == null ? (
      <span className="text-slate-400">–</span>
    ) : (
      <div className="flex items-center gap-2.5 justify-end">
        <span className="tabular-nums font-bold text-slate-900 text-base">{v}</span>
        <div className="w-20 h-2.5 rounded-full bg-slate-200 overflow-hidden">
          <div className={`h-full rounded-full ${v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: v + '%' }} />
        </div>
      </div>
    );
  const tone = (v: number, good: number, ok: number) => (v >= good ? 'text-emerald-700' : v >= ok ? 'text-amber-600' : 'text-rose-600');
  const dupCell = (d: { groups: DupGroup[]; extra: number }, title: string) =>
    d.groups.length ? (
      <button
        onClick={() => setDetail({ title, groups: d.groups })}
        className="px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold hover:bg-rose-100 whitespace-nowrap"
        title="กดเพื่อดูรายละเอียด"
      >
        {d.groups.length} เลข ›
      </button>
    ) : (
      <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">0</span>
    );
  const B = cols.b, S = cols.s;

  const bHeads: Head[] = [
    { id: 'rank', label: 'อันดับ', align: 'center' },
    { id: 'name', label: 'สาขา' },
    { id: 'score', label: 'คะแนน', align: 'right' },
    ...(B.cov ? [{ id: 'cov', label: 'ประเมินครบ (บิล)', align: 'right' as const }] : []),
    ...(B.dup ? [{ id: 'dup', label: 'เลข POS ซ้ำ', align: 'center' as const }] : []),
    ...(B.named ? [{ id: 'named', label: 'ใส่ชื่อพนักงาน', align: 'right' as const }] : []),
    ...(B.sat ? [{ id: 'sat', label: 'ความพึงพอใจ', align: 'right' as const }] : []),
  ];
  const sHeads: Head[] = [
    { id: 'rank', label: 'อันดับ', align: 'center' },
    { id: 'name', label: 'พนักงาน' },
    { id: 'branch', label: 'สาขา' },
    { id: 'score', label: 'คะแนน', align: 'right' },
    ...(S.n ? [{ id: 'n', label: 'ใบประเมิน', align: 'right' as const }] : []),
    ...(S.dup ? [{ id: 'dup', label: 'เลข POS ซ้ำ', align: 'center' as const }] : []),
    ...(S.sat ? [{ id: 'sat', label: 'ความพึงพอใจ', align: 'right' as const }] : []),
  ];
  const btn = 'px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 border';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-slate-900 font-bold text-xl flex items-center gap-2">
              <Trophy className="w-6 h-6 text-amber-500" />
              สาขา / พนักงานดีเด่น
            </h3>
            <p className="text-sm text-slate-500 mt-1">วัดจากการปฏิบัติหน้าที่ครบถ้วน: ขอให้ลูกค้าประเมินครบทุกบิล ไม่ประเมินเลข POS ซ้ำ และใส่ชื่อพนักงาน · เทียบกับบิล POS จากระบบปิดยอดอัตโนมัติ</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-slate-600 font-semibold">ตั้งแต่ <input type="date" value={from} onChange={(e) => e.target.value && setRange(e.target.value, to)} className="bg-white text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1.5" /></label>
            <label className="text-slate-600 font-semibold">ถึง <input type="date" value={to} onChange={(e) => e.target.value && setRange(from, e.target.value)} className="bg-white text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1.5" /></label>
            <button onClick={() => setRange(yesterday.slice(0, 8) + '01', yesterday)} className={btn + ' bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}>เดือนนี้</button>
            <button
              onClick={() => {
                const last = shift(yesterday.slice(0, 8) + '01', -1);
                setRange(last.slice(0, 8) + '01', last);
              }}
              className={btn + ' bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}
            >
              เดือนก่อน
            </button>
            <button onClick={() => setShowCols((v) => !v)} className={btn + (showCols ? ' bg-amber-100 border-amber-300 text-amber-800' : ' bg-white border-slate-300 text-slate-700 hover:bg-slate-50')}>
              <Columns3 className="w-4 h-4" />
              เลือกคอลัมน์
            </button>
            <button onClick={reload} disabled={loading} className={btn + ' bg-pink-600 border-pink-600 hover:bg-pink-500 text-white disabled:opacity-50'}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              ดึงบิลใหม่
            </button>
          </div>
        </div>
        {showCols && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 grid md:grid-cols-2 gap-4 text-sm text-slate-700">
            {([['b', 'ตารางสาขาดีเด่น', BRANCH_COLS], ['s', 'ตารางพนักงานดีเด่น', STAFF_COLS]] as const).map(([part, title, list]) => (
              <div key={part}>
                <div className="font-bold text-slate-900 mb-2">{title}</div>
                <div className="flex flex-wrap gap-2">
                  {list.map((c) => {
                    const on = !!cols[part][c.k];
                    return (
                      <label key={c.k} className={`flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-lg border ${on ? 'bg-white border-pink-300 text-slate-900' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                        <input type="checkbox" checked={on} onChange={(e) => setCol(part, c.k, e.target.checked)} className="w-4 h-4 accent-pink-600" />
                        {c.l}
                        {c.w > 0 && <span className="text-xs text-slate-400">(คิดคะแนน)</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>ปิดคอลัมน์ที่คิดคะแนน คะแนนจะคำนวณใหม่จากคอลัมน์ที่เปิดอยู่ · ลากเส้นขอบหัวตารางเพื่อปรับความกว้าง · ระบบจำการตั้งค่าไว้ในเครื่องนี้</span>
              <button onClick={resetWidths} className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 font-semibold">คืนความกว้างเดิม</button>
            </div>
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-sm">
            <AlertTriangle className="w-4 h-4" /> {err}
          </div>
        )}
        <div className="text-sm text-slate-500">
          {branch && branch !== 'all' ? `สาขา ${branch} · ` : 'ทุกสาขา · '}
          {from === to ? `วันที่ ${thai(from)}` : `${thai(from)} – ${thai(to)}`}
          {loading && !pos ? ' · กำลังดึงบิล…' : ''}
        </div>
      </div>

      {R && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-1 mb-3">
            <h4 className="text-slate-900 font-bold text-lg">🏆 สาขาดีเด่น</h4>
            <span className="text-sm text-slate-500">{formula(BRANCH_COLS, B)}</span>
          </div>
          <ResizableTable heads={bHeads} widths={widths.b} onWidths={setTableWidths('b')}>
            <tbody className="divide-y divide-slate-100">
              {R.branches.map((b, i) => (
                <tr key={b.code} className={`hover:bg-slate-50 ${i < 3 && (b.score ?? 0) > 0 ? 'bg-amber-50/50' : ''}`}>
                  <td className={td + ' text-center text-xl'}>{b.bills ? medal(i) : '–'}</td>
                  <td className={td + ' font-bold text-slate-900 text-base'}>{b.label}</td>
                  <td className={td}>{b.bills ? bar(b.score) : <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-semibold whitespace-nowrap">ยังไม่มีบิลในช่วงนี้</span>}</td>
                  {B.cov && (
                    <td className={td + ' text-right tabular-nums'}>
                      {b.bills ? (
                        <>
                          <span className={'font-bold text-base ' + tone(b.cov, 0.9, 0.7)}>{pct(b.cov)}</span>
                          <div className="text-xs text-slate-500">{b.rated.toLocaleString()}/{b.bills.toLocaleString()} บิล</div>
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                  )}
                  {B.dup && <td className={td + ' text-center'}>{dupCell(b.dup, `เลข POS ซ้ำ · สาขา${b.label}`)}</td>}
                  {B.named && <td className={td + ' text-right tabular-nums'}><span className={'font-bold ' + tone(b.nm, 0.98, 0.9)}>{b.n ? pct(b.nm) : '–'}</span></td>}
                  {B.sat && <td className={td + ' text-right tabular-nums font-semibold'}>{b.n ? b.avg.toFixed(2) : '–'}</td>}
                </tr>
              ))}
              {!R.branches.length && (
                <tr><td colSpan={bHeads.length} className={td + ' text-slate-500'}>ไม่มีข้อมูลในช่วงนี้</td></tr>
              )}
            </tbody>
          </ResizableTable>
        </div>
      )}

      {R && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-1 mb-3">
            <h4 className="text-slate-900 font-bold text-lg">⭐ พนักงานดีเด่น</h4>
            <span className="text-sm text-slate-500">{formula(STAFF_COLS, S)} · จัดอันดับเมื่อมีอย่างน้อย {MIN_STAFF} ใบ</span>
          </div>
          <ResizableTable heads={sHeads} widths={widths.s} onWidths={setTableWidths('s')}>
            <tbody className="divide-y divide-slate-100">
              {R.ranked.map((s, i) => (
                <tr key={s.label + s.name} className={`hover:bg-slate-50 ${i < 3 ? 'bg-amber-50/50' : ''}`}>
                  <td className={td + ' text-center text-xl'}>{medal(i)}</td>
                  <td className={td + ' font-bold text-slate-900 text-base'}>{s.name}</td>
                  <td className={td}>{s.label}</td>
                  <td className={td}>{bar(s.score)}</td>
                  {S.n && <td className={td + ' text-right tabular-nums'}>{s.n.toLocaleString()}</td>}
                  {S.dup && <td className={td + ' text-center'}>{dupCell(s.dup, `เลข POS ซ้ำ · ${s.name} (${s.label})`)}</td>}
                  {S.sat && <td className={td + ' text-right tabular-nums font-semibold'}>{s.avg.toFixed(2)}</td>}
                </tr>
              ))}
              {!R.ranked.length && (
                <tr><td colSpan={sHeads.length} className={td + ' text-slate-500'}>ยังไม่มีพนักงานที่มีใบประเมินถึง {MIN_STAFF} ใบในช่วงนี้</td></tr>
              )}
            </tbody>
          </ResizableTable>
          {(R.few.length > 0 || R.noName > 0) && (
            <div className="mt-3 text-sm text-slate-500 flex gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                {R.few.length > 0 && <div>ใบประเมินยังไม่ถึง {MIN_STAFF} ใบ: {R.few.map((s) => `${s.name} (${s.n})`).join(' · ')}</div>}
                {R.noName > 0 && <div className="text-amber-700 font-semibold">ใบประเมินที่ไม่มีชื่อพนักงาน {R.noName.toLocaleString()} ใบ ไม่นับในอันดับพนักงาน</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <div className="text-slate-900 font-bold text-lg">{detail.title}</div>
                <div className="text-sm text-slate-500">
                  {detail.groups.length} เลข POS · ใบประเมินรวม {detail.groups.reduce((s, g) => s + g.list.length, 0)} ใบ · {from === to ? thai(from) : `${thai(from)} – ${thai(to)}`}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="ปิด">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-5 space-y-4 bg-slate-50">
              {detail.groups.map((g) => {
                const sameSec = new Set(g.list.map((r) => String(r.timestamp).slice(0, 19))).size === 1;
                return (
                  <div key={g.pos} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 text-sm flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">POS {g.pos}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold">ประเมิน {g.list.length} ครั้ง</span>
                      {sameSec && <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-bold">บันทึกในวินาทีเดียวกัน (อาจกดซ้ำ)</span>}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-slate-700">
                        <thead className="text-slate-500 text-[13px]">
                          <tr>
                            {['เวลาประเมิน', 'สาขา / จุดบริการ', 'พนักงาน', 'คะแนน', 'ช่องทาง', 'เครื่อง'].map((h) => (
                              <th key={h} className={`py-2 px-4 font-bold whitespace-nowrap ${h === 'คะแนน' ? 'text-center' : ''}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.list.map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 px-4 font-mono whitespace-nowrap">{when(r.timestamp)}</td>
                              <td className="py-2 px-4">{r.branchName || r.counterName}</td>
                              <td className="py-2 px-4">{named(r) ? r.cashierName : <span className="text-slate-400">ไม่ระบุ</span>}</td>
                              <td className="py-2 px-4 text-center font-bold">{r.score}</td>
                              <td className="py-2 px-4">{r.source === 'link' ? 'ลิงก์ออนไลน์' : r.source === 'kiosk' ? 'หน้าร้าน' : '–'}</td>
                              <td className="py-2 px-4 font-mono text-xs text-slate-500">{r.deviceId ? r.deviceId.slice(0, 10) : '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
