import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

export const TopPerformers: React.FC<Props> = ({ ratings, branch }) => {
  const yesterday = shift(dayOf(Date.now()), -1);
  const [from, setFrom] = useState(yesterday.slice(0, 8) + '01');
  const [to, setTo] = useState(yesterday);
  const [pos, setPos] = useState<PosBranch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [cols, setCols] = useState<ColState>(loadCols);
  const [showCols, setShowCols] = useState(false);
  const [detail, setDetail] = useState<{ title: string; groups: DupGroup[] } | null>(null);

  const toggle = (part: 'b' | 's', k: string) =>
    setCols((c) => {
      const next = { ...c, [part]: { ...c[part], [k]: !c[part][k] } };
      try {
        localStorage.setItem(COLS_KEY, JSON.stringify(next));
      } catch {
        /* not saved, still applies now */
      }
      return next;
    });

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

  const R = useMemo(() => {
    if (!pos) return null;
    const A = analyzePos(pos, ratings, from, to, branch);

    const branches = A.rows
      .map((x) => {
        const mine = A.byBranch.get(x.code) || [];
        const n = mine.length;
        const d = duplicates(mine);
        const cov = x.bills ? Math.min(1, x.rated / x.bills) : 0;
        const nodup = n ? 1 - d.extra / n : 0;
        const nm = n ? mine.filter(named).length / n : 0;
        const avg = n ? mine.reduce((s, r) => s + (+r.score || 0), 0) / n : 0;
        const score = x.bills ? weighted(BRANCH_COLS, cols.b, { cov, dup: nodup, named: nm, sat: avg / 5 }) : null;
        return { code: x.code, label: x.label, bills: x.bills, rated: x.rated, n, cov, nm, avg, dup: d, score };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.cov - a.cov);

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
      const avg = s.list.reduce((t, r) => t + (+r.score || 0), 0) / n;
      return { ...s, n, dup: d, avg, score: weighted(STAFF_COLS, cols.s, { dup: 1 - d.extra / n, sat: avg / 5 }) };
    });
    const ranked = staff.filter((s) => s.n >= MIN_STAFF).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.n - a.n);
    const few = staff.filter((s) => s.n < MIN_STAFF).sort((a, b) => b.n - a.n);
    const noName = A.rows.reduce((s, x) => s + (A.byBranch.get(x.code) || []).filter((r) => !named(r)).length, 0);
    return { branches, ranked, few, noName };
  }, [pos, ratings, from, to, branch, cols]);

  const th = 'py-2.5 px-3 font-bold text-slate-400 text-[11px] whitespace-nowrap';
  const td = 'py-2 px-3';
  const bar = (v: number | null) =>
    v == null ? (
      <span className="text-slate-500">–</span>
    ) : (
      <div className="flex items-center gap-2 justify-end">
        <span className="tabular-nums font-bold text-white">{v}</span>
        <div className="w-14 h-1.5 rounded bg-slate-700 overflow-hidden">
          <div className={`h-full ${v >= 80 ? 'bg-emerald-400' : v >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: v + '%' }} />
        </div>
      </div>
    );
  const tone = (v: number, good: number, ok: number) => (v >= good ? 'text-emerald-300' : v >= ok ? 'text-amber-300' : 'text-rose-300');
  const dupCell = (d: { groups: DupGroup[]; extra: number }, title: string) =>
    d.groups.length ? (
      <button onClick={() => setDetail({ title, groups: d.groups })} className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold underline decoration-dotted hover:bg-rose-500/30" title="กดเพื่อดูรายละเอียด">
        {d.groups.length} เลข
      </button>
    ) : (
      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold">0</span>
    );
  const B = cols.b, S = cols.s;

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-bold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              สาขา / พนักงานดีเด่น
            </h3>
            <p className="text-xs text-slate-400 mt-1">วัดจากการปฏิบัติหน้าที่ครบถ้วน: ขอให้ลูกค้าประเมินครบทุกบิล ไม่ประเมินเลข POS ซ้ำ และใส่ชื่อพนักงาน · เทียบกับบิล POS จากระบบปิดยอดอัตโนมัติ</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-slate-300">ตั้งแต่ <input type="date" value={from} onChange={(e) => e.target.value && setRange(e.target.value, to)} className="bg-slate-900 text-white border border-slate-600 rounded-lg px-2 py-1" /></label>
            <label className="text-slate-300">ถึง <input type="date" value={to} onChange={(e) => e.target.value && setRange(from, e.target.value)} className="bg-slate-900 text-white border border-slate-600 rounded-lg px-2 py-1" /></label>
            <button onClick={() => setRange(yesterday.slice(0, 8) + '01', yesterday)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold">เดือนนี้</button>
            <button
              onClick={() => {
                const last = shift(yesterday.slice(0, 8) + '01', -1);
                setRange(last.slice(0, 8) + '01', last);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold"
            >
              เดือนก่อน
            </button>
            <button onClick={() => setShowCols((v) => !v)} className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${showCols ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
              <Columns3 className="w-3.5 h-3.5" />
              เลือกคอลัมน์
            </button>
            <button onClick={reload} disabled={loading} className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold flex items-center gap-1 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              ดึงบิลใหม่
            </button>
          </div>
        </div>
        {showCols && (
          <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-3 grid md:grid-cols-2 gap-3 text-xs text-slate-200">
            {([['b', 'ตารางสาขาดีเด่น', BRANCH_COLS], ['s', 'ตารางพนักงานดีเด่น', STAFF_COLS]] as const).map(([part, title, list]) => (
              <div key={part}>
                <div className="font-bold text-white mb-1.5">{title}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {list.map((c) => (
                    <label key={c.k} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!cols[part][c.k]} onChange={() => toggle(part, c.k)} className="accent-pink-500" />
                      {c.l}
                      {c.w > 0 && <span className="text-slate-500">(คิดคะแนน)</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="md:col-span-2 text-[11px] text-slate-500">ปิดคอลัมน์ที่คิดคะแนน คะแนนจะคำนวณใหม่จากคอลัมน์ที่เปิดอยู่ · ระบบจำการตั้งค่าไว้ในเครื่องนี้</div>
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2 text-xs">
            <AlertTriangle className="w-4 h-4" /> {err}
          </div>
        )}
        <div className="text-[11px] text-slate-500">
          {branch && branch !== 'all' ? `สาขา ${branch} · ` : 'ทุกสาขา · '}
          {from === to ? `วันที่ ${thai(from)}` : `${thai(from)} – ${thai(to)}`}
          {loading && !pos ? ' · กำลังดึงบิล…' : ''}
        </div>
      </div>

      {R && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-1 mb-3">
            <h4 className="text-white font-bold text-sm">🏆 สาขาดีเด่น</h4>
            <span className="text-[11px] text-slate-400">{formula(BRANCH_COLS, B)}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900">
                <tr>
                  <th className={th + ' text-center'}>อันดับ</th>
                  <th className={th}>สาขา</th>
                  <th className={th + ' text-right'}>คะแนน</th>
                  {B.cov && <th className={th + ' text-right'}>ประเมินครบ (บิล)</th>}
                  {B.dup && <th className={th + ' text-center'}>เลข POS ซ้ำ</th>}
                  {B.named && <th className={th + ' text-right'}>ใส่ชื่อพนักงาน</th>}
                  {B.sat && <th className={th + ' text-right'}>ความพึงพอใจ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {R.branches.map((b, i) => (
                  <tr key={b.code} className={i < 3 && (b.score ?? 0) > 0 ? 'bg-emerald-500/5' : ''}>
                    <td className={td + ' text-center text-base'}>{b.bills ? medal(i) : '–'}</td>
                    <td className={td + ' font-semibold text-white'}>{b.label}</td>
                    <td className={td}>{b.bills ? bar(b.score) : <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-semibold whitespace-nowrap">ยังไม่มีบิลในช่วงนี้</span>}</td>
                    {B.cov && (
                      <td className={td + ' text-right tabular-nums'}>
                        {b.bills ? (
                          <>
                            <span className={'font-bold ' + tone(b.cov, 0.9, 0.7)}>{pct(b.cov)}</span>
                            <div className="text-[10px] text-slate-500">{b.rated.toLocaleString()}/{b.bills.toLocaleString()} บิล</div>
                          </>
                        ) : (
                          '–'
                        )}
                      </td>
                    )}
                    {B.dup && <td className={td + ' text-center'}>{dupCell(b.dup, `เลข POS ซ้ำ · สาขา${b.label}`)}</td>}
                    {B.named && <td className={td + ' text-right tabular-nums'}><span className={'font-bold ' + tone(b.nm, 0.98, 0.9)}>{b.n ? pct(b.nm) : '–'}</span></td>}
                    {B.sat && <td className={td + ' text-right tabular-nums'}>{b.n ? b.avg.toFixed(2) : '–'}</td>}
                  </tr>
                ))}
                {!R.branches.length && (
                  <tr><td colSpan={7} className={td + ' text-slate-400'}>ไม่มีข้อมูลในช่วงนี้</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {R && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-1 mb-3">
            <h4 className="text-white font-bold text-sm">⭐ พนักงานดีเด่น</h4>
            <span className="text-[11px] text-slate-400">{formula(STAFF_COLS, S)} · จัดอันดับเมื่อมีอย่างน้อย {MIN_STAFF} ใบ</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900">
                <tr>
                  <th className={th + ' text-center'}>อันดับ</th>
                  <th className={th}>พนักงาน</th>
                  <th className={th}>สาขา</th>
                  <th className={th + ' text-right'}>คะแนน</th>
                  {S.n && <th className={th + ' text-right'}>ใบประเมิน</th>}
                  {S.dup && <th className={th + ' text-center'}>เลข POS ซ้ำ</th>}
                  {S.sat && <th className={th + ' text-right'}>ความพึงพอใจ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {R.ranked.map((s, i) => (
                  <tr key={s.label + s.name} className={i < 3 ? 'bg-emerald-500/5' : ''}>
                    <td className={td + ' text-center text-base'}>{medal(i)}</td>
                    <td className={td + ' font-semibold text-white'}>{s.name}</td>
                    <td className={td}>{s.label}</td>
                    <td className={td}>{bar(s.score)}</td>
                    {S.n && <td className={td + ' text-right tabular-nums'}>{s.n.toLocaleString()}</td>}
                    {S.dup && <td className={td + ' text-center'}>{dupCell(s.dup, `เลข POS ซ้ำ · ${s.name} (${s.label})`)}</td>}
                    {S.sat && <td className={td + ' text-right tabular-nums'}>{s.avg.toFixed(2)}</td>}
                  </tr>
                ))}
                {!R.ranked.length && (
                  <tr><td colSpan={7} className={td + ' text-slate-400'}>ยังไม่มีพนักงานที่มีใบประเมินถึง {MIN_STAFF} ใบในช่วงนี้</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {(R.few.length > 0 || R.noName > 0) && (
            <div className="mt-3 text-[11px] text-slate-400 flex gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                {R.few.length > 0 && <div>ใบประเมินยังไม่ถึง {MIN_STAFF} ใบ: {R.few.map((s) => `${s.name} (${s.n})`).join(' · ')}</div>}
                {R.noName > 0 && <div className="text-amber-300">ใบประเมินที่ไม่มีชื่อพนักงาน {R.noName.toLocaleString()} ใบ ไม่นับในอันดับพนักงาน</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
              <div>
                <div className="text-white font-bold text-sm">{detail.title}</div>
                <div className="text-[11px] text-slate-400">
                  {detail.groups.length} เลข POS · ใบประเมินรวม {detail.groups.reduce((s, g) => s + g.list.length, 0)} ใบ · {from === to ? thai(from) : `${thai(from)} – ${thai(to)}`}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300" aria-label="ปิด">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto p-4 space-y-3">
              {detail.groups.map((g) => {
                const sameSec = new Set(g.list.map((r) => String(r.timestamp).slice(0, 19))).size === 1;
                return (
                  <div key={g.pos} className="rounded-xl border border-slate-700 overflow-hidden">
                    <div className="bg-slate-900 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-white">POS {g.pos}</span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">ประเมิน {g.list.length} ครั้ง</span>
                      {sameSec && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">บันทึกในวินาทีเดียวกัน (อาจกดซ้ำ)</span>}
                    </div>
                    <table className="w-full text-left text-xs text-slate-200">
                      <thead className="text-slate-400">
                        <tr>
                          <th className={th}>เวลาประเมิน</th><th className={th}>สาขา / จุดบริการ</th><th className={th}>พนักงาน</th><th className={th + ' text-center'}>คะแนน</th><th className={th}>ช่องทาง</th><th className={th}>เครื่อง</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/60">
                        {g.list.map((r) => (
                          <tr key={r.id}>
                            <td className={td + ' font-mono whitespace-nowrap'}>{when(r.timestamp)}</td>
                            <td className={td}>{r.branchName || r.counterName}</td>
                            <td className={td}>{named(r) ? r.cashierName : <span className="text-slate-500">ไม่ระบุ</span>}</td>
                            <td className={td + ' text-center'}>{r.score}</td>
                            <td className={td}>{r.source === 'link' ? 'ลิงก์ออนไลน์' : r.source === 'kiosk' ? 'หน้าร้าน' : '–'}</td>
                            <td className={td + ' font-mono text-[10px] text-slate-400'}>{r.deviceId ? r.deviceId.slice(0, 10) : '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
