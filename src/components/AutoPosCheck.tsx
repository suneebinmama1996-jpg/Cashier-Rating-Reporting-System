import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { RatingRecord } from '../types';
import { BRANCH_TH } from '../utils/cashiers';

/*
 * Automatic cross-check of ratings against POS bills from the closing report.
 * The closing report publishes posindex/<branch> (bill numbers with ship and
 * bill date/time only). Bills are counted by ship date and a rating is compared
 * with the ship time (bill time when the order file has no ship time).
 */
const POS_API = 'https://worker.nuhinternational-center.workers.dev/api/doc?p=posindex/';
const BRANCH_CODES = Array.from({ length: 12 }, (_, i) => 'b' + (i + 1));
const LATE_MIN = 5;
const BURST_S = 20;
const CLOCK_MIN = 2;
const SKEW_MS = 60000;
const BKK_MS = 7 * 3600e3;

type Bill = { n: string; day: string; ms: number | null; kind: 'ship' | 'bill' };
type PosBranch = { code: string; label: string; bills: Map<string, Bill>; at?: string };
type Flag = { text: string; high: boolean };
type Flagged = { code: string; r: RatingRecord; t: number; day: string; bill?: Bill; flags: Flag[] };

const dayOf = (ms: number) => new Date(ms + BKK_MS).toISOString().slice(0, 10);
const hms = (ms: number) => new Date(ms + BKK_MS).toISOString().slice(11, 19);
const shift = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = a; d <= b && out.length < 370; d = shift(d, 1)) out.push(d);
  return out;
};
const thai = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}/${m}/${y + 543}`;
};
const toMs = (iso: string, time: string) => {
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time || '');
  if (!iso || !t) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d, +t[1], +t[2], +(t[3] || 0)) - BKK_MS;
};
const dur = (ms: number) => {
  const m = Math.abs(ms) / 60000;
  return m < 60 ? `${Math.round(m)} นาที` : m < 2880 ? `${(m / 60).toFixed(1)} ชม.` : `${Math.round(m / 1440)} วัน`;
};
const billKey = (s?: string) => {
  const n = String(s || '').trim().replace(/^JST\s*/i, '').replace(/^#/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^[A-Z]{0,2}(\d{5,9})$/.exec(n);
  return m ? m[1] : n;
};

function branchOfRating(r: RatingRecord, branches: PosBranch[]): string | null {
  const s = String(r.branchName || r.counterName || '').toUpperCase();
  for (const b of branches) {
    const en = BRANCH_TH[b.label];
    if ((en && s.includes(en)) || s.includes(b.label.toUpperCase())) return b.code;
  }
  return null;
}

async function loadPosIndex(): Promise<PosBranch[]> {
  const res = await Promise.all(
    BRANCH_CODES.map(async (code) => {
      const r = await fetch(POS_API + code, { cache: 'no-store' });
      if (!r.ok) throw new Error(`โหลดบิล POS ไม่สำเร็จ (${r.status})`);
      const j = await r.json();
      if (!j.exists || !j.data || !Array.isArray(j.data.bills)) return null;
      const bills = new Map<string, Bill>();
      (j.data.bills as string[][]).forEach(([n, d, t, bd, bt]) => {
        const ship = t ? toMs(d, t) : null;
        const v: Bill = ship != null ? { n, day: d, ms: ship, kind: 'ship' } : { n, day: d, ms: toMs(bd, bt), kind: 'bill' };
        const cur = bills.get(n);
        if (!cur || (v.ms != null && (cur.ms == null || v.ms < cur.ms))) bills.set(n, v);
      });
      return { code, label: String(j.data.branch || code), bills, at: j.data.at } as PosBranch;
    })
  );
  return res.filter((x): x is PosBranch => !!x);
}

interface Props {
  ratings: RatingRecord[]; // already limited to the admin's branch view
}

export const AutoPosCheck: React.FC<Props> = ({ ratings }) => {
  const yesterday = shift(dayOf(Date.now()), -1);
  const [from, setFrom] = useState(yesterday.slice(0, 8) + '01');
  const [to, setTo] = useState(yesterday);
  const [pos, setPos] = useState<PosBranch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [loadedAt, setLoadedAt] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setPos(await loadPosIndex());
      setLoadedAt(new Date().toLocaleTimeString('th-TH'));
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

  const A = useMemo(() => {
    if (!pos) return null;
    const days = daysBetween(from, to);
    const inRange = (d: string) => d >= from && d <= to;
    const list = ratings.filter((r) => {
      if (r.voided) return false;
      const t = Date.parse(r.timestamp);
      return !isNaN(t) && inRange(dayOf(t));
    });
    const allBills = new Map<string, string>();
    pos.forEach((b) => b.bills.forEach((_, k) => allBills.set(k, b.code)));
    const cnt = new Map<string, number>();
    const sameSec = new Map<string, string | false>();
    list.forEach((r) => {
      const k = billKey(r.orderNumber);
      if (!k) return;
      cnt.set(k, (cnt.get(k) || 0) + 1);
      const ts = String(r.timestamp).slice(0, 19);
      sameSec.set(k, sameSec.has(k) ? (sameSec.get(k) === ts ? ts : false) : ts);
    });
    // Burst: 3+ ratings within BURST_S seconds on one counter or device (exact same-second duplicates count once)
    const seen = new Set<string>();
    const uniq = list.filter((r) => {
      const k = billKey(r.orderNumber) + '|' + String(r.timestamp).slice(0, 19) + '|' + r.counterId;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const groups = new Map<string, RatingRecord[]>();
    uniq.forEach((r) =>
      ['c:' + r.counterId].concat(r.deviceId ? ['d:' + r.deviceId] : []).forEach((g) => {
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(r);
      })
    );
    const burst = new Map<string, number>();
    groups.forEach((L) => {
      const s = L.map((r) => ({ r, t: Date.parse(r.timestamp) })).sort((a, b) => a.t - b.t);
      let st = 0;
      for (let i = 1; i <= s.length; i++)
        if (i === s.length || s[i].t - s[i - 1].t > BURST_S * 1000) {
          const n = i - st;
          if (n >= 3) for (let j = st; j < i; j++) burst.set(s[j].r.id, Math.max(burst.get(s[j].r.id) || 0, n));
          st = i;
        }
    });

    const perDay: Record<string, { bills: number; rated: number; ratings: number; flag: number; noData: number }> = {};
    days.forEach((d) => (perDay[d] = { bills: 0, rated: 0, ratings: 0, flag: 0, noData: 0 }));
    const flagged: Flagged[] = [];
    const rows: { code: string; label: string; bills: number; ratings: number; rated: number; missing: { k: string; day: string }[]; flag: number; daysWith: number }[] = [];
    const byBranch = new Map<string, RatingRecord[]>();
    let other = 0;
    list.forEach((r) => {
      const c = branchOfRating(r, pos);
      if (!c) return void other++;
      if (!byBranch.has(c)) byBranch.set(c, []);
      byBranch.get(c)!.push(r);
    });

    pos.forEach((b) => {
      const mine = byBranch.get(b.code) || [];
      const rangeBills = new Map<string, Bill>();
      b.bills.forEach((v, k) => inRange(v.day) && rangeBills.set(k, v));
      if (!mine.length && !rangeBills.size) return;
      const hasDay = new Set<string>();
      rangeBills.forEach((v) => hasDay.add(v.day));
      const digital = b.label === 'ดิจิตอล';
      const rated = new Set<string>();
      let flagN = 0;
      mine.forEach((r) => {
        const k = billKey(r.orderNumber);
        const t = Date.parse(r.timestamp);
        const day = dayOf(t);
        const bill = k ? b.bills.get(k) : undefined;
        const fl: Flag[] = [];
        if (perDay[day]) perDay[day].ratings++;
        if (bill && inRange(bill.day)) rated.add(k);
        if (!k) fl.push({ text: 'ไม่มีเลขบิล', high: false });
        else if (!bill && hasDay.has(day))
          fl.push({ text: allBills.has(k) ? `บิลเป็นของสาขา${pos.find((x) => x.code === allBills.get(k))?.label}` : 'ไม่พบบิลนี้ใน POS', high: true });
        if ((cnt.get(k) || 0) > 1)
          fl.push(sameSec.get(k) ? { text: `บันทึกซ้ำ ${cnt.get(k)} ใบในวินาทีเดียวกัน`, high: false } : { text: `เลขบิลซ้ำ ${cnt.get(k)} ใบ`, high: true });
        if (bill && !digital && bill.ms != null) {
          const df = t - bill.ms;
          const w = bill.kind === 'ship' ? 'จัดส่ง' : 'ออกบิล';
          if (df < -SKEW_MS) fl.push({ text: `ประเมินก่อน${w} ${dur(df)}`, high: true });
          else if (df > LATE_MIN * 60000) fl.push({ text: `ประเมินหลัง${w} ${dur(df)}`, high: true });
        }
        if (burst.get(r.id)) fl.push({ text: `กดรัว ${burst.get(r.id)} ใบ ห่างกันไม่เกิน ${BURST_S} วินาที`, high: true });
        const srv = Date.parse(r.serverTime || '');
        if (!isNaN(srv) && Math.abs(srv - t) > CLOCK_MIN * 60000)
          fl.push({ text: srv > t ? `ขึ้นระบบช้ากว่าเวลาที่บันทึก ${dur(srv - t)}` : `เวลาเครื่องเร็วกว่าเซิร์ฟเวอร์ ${dur(srv - t)}`, high: true });
        if (fl.length) {
          flagged.push({ code: b.code, r, t, day, bill, flags: fl });
          flagN++;
          if (perDay[day]) perDay[day].flag++;
        }
      });
      const missing: { k: string; day: string }[] = [];
      rangeBills.forEach((v, k) => {
        const P = perDay[v.day];
        if (P) {
          P.bills++;
          if (rated.has(k)) P.rated++;
        }
        if (!rated.has(k)) missing.push({ k, day: v.day });
      });
      missing.sort((a, c) => a.day.localeCompare(c.day) || a.k.localeCompare(c.k));
      days.forEach((d) => !hasDay.has(d) && perDay[d].noData++);
      rows.push({ code: b.code, label: b.label, bills: rangeBills.size, ratings: mine.length, rated: rated.size, missing, flag: flagN, daysWith: hasDay.size });
    });
    flagged.sort((a, b) => a.t - b.t);
    return { days, perDay, rows, flagged, other, total: list.length, nBr: rows.length };
  }, [pos, ratings, from, to]);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const one = from === to;
  const totals = A ? A.rows.reduce((s, x) => ({ bills: s.bills + x.bills, rated: s.rated + x.rated }), { bills: 0, rated: 0 }) : { bills: 0, rated: 0 };
  const labelOf = (code: string) => pos?.find((b) => b.code === code)?.label || code;
  const chip = (n: number) =>
    n ? <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold">{n}</span> : <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold">0</span>;
  const th = 'py-2.5 px-3 font-bold text-slate-400 text-[11px] whitespace-nowrap';
  const td = 'py-2 px-3';

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-bold flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              กระทบกับบิล POS อัตโนมัติ (จากระบบปิดยอด)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              นับบิลตามวันที่จัดส่ง และเทียบเวลาประเมินกับเวลาจัดส่ง (ถ้าไฟล์ไม่มีเวลาจัดส่งใช้เวลาออกบิล) · ดึงให้เองอัตโนมัติ ไม่ต้องอัปโหลดไฟล์
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-slate-300">ตั้งแต่ <input type="date" value={from} onChange={(e) => e.target.value && setRange(e.target.value, to)} className="bg-slate-900 text-white border border-slate-600 rounded-lg px-2 py-1" /></label>
            <label className="text-slate-300">ถึง <input type="date" value={to} onChange={(e) => e.target.value && setRange(from, e.target.value)} className="bg-slate-900 text-white border border-slate-600 rounded-lg px-2 py-1" /></label>
            <button onClick={() => setRange(yesterday, yesterday)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold">เมื่อวาน</button>
            <button onClick={() => setRange(yesterday.slice(0, 8) + '01', yesterday)} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold">ตั้งแต่วันที่ 1</button>
            <button onClick={reload} disabled={loading} className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold flex items-center gap-1 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              ดึงบิลใหม่
            </button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2 text-xs">
            <AlertTriangle className="w-4 h-4" /> {err}
          </div>
        )}
        {!err && pos && pos.length === 0 && (
          <div className="text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-xs">
            ยังไม่มีบิลจากระบบปิดยอด ข้อมูลจะเริ่มมาเมื่อสาขาบันทึกไฟล์คำสั่งซื้อในระบบปิดยอดครั้งถัดไป
          </div>
        )}

        {A && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['บิล POS (ตามวันจัดส่ง)', totals.bills.toLocaleString()],
              ['บิลที่ลูกค้าประเมิน', totals.rated.toLocaleString()],
              ['อัตราการประเมิน', pct(totals.rated, totals.bills)],
              ['ใบที่น่าสงสัย', A.flagged.length.toLocaleString()],
            ].map(([l, v]) => (
              <div key={l} className="bg-slate-900/60 rounded-xl border border-slate-700 border-l-4 border-l-pink-500 px-4 py-3">
                <div className="text-[11px] text-slate-400">{l}</div>
                <div className="text-xl font-extrabold text-white">{v}</div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-slate-500">
          {one ? `วันที่ ${thai(from)}` : `${thai(from)} – ${thai(to)} (${A?.days.length || 0} วัน)`}
          {A ? ` · ใบประเมิน ${A.total.toLocaleString()} ใบ` : ''}
          {A?.other ? ` (ระบุสาขาไม่ได้ ${A.other} ใบ)` : ''}
          {loadedAt ? ` · ดึงบิลล่าสุด ${loadedAt}` : loading ? ' · กำลังดึงบิล…' : ''}
        </div>
      </div>

      {A && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <h4 className="text-white font-bold text-sm mb-3">สรุปรายสาขา</h4>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900">
                <tr>
                  <th className={th}>สาขา</th><th className={th + ' text-right'}>บิล POS</th><th className={th + ' text-right'}>ใบประเมิน</th>
                  <th className={th + ' text-right'}>บิลที่ได้ประเมิน</th><th className={th + ' text-right'}>ตกหล่น</th><th className={th + ' text-right'}>อัตรา</th><th className={th + ' text-right'}>น่าสงสัย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {A.rows.map((x) => (
                  <tr key={x.code}>
                    <td className={td}>
                      <div className="font-semibold text-white">{x.label}</div>
                      {!one && x.bills > 0 && x.daysWith < A.days.length && <div className="text-[10px] text-slate-500">มีบิล {x.daysWith}/{A.days.length} วัน</div>}
                    </td>
                    {x.bills ? (
                      <>
                        <td className={td + ' text-right tabular-nums'}>{x.bills.toLocaleString()}</td>
                        <td className={td + ' text-right tabular-nums'}>{x.ratings.toLocaleString()}</td>
                        <td className={td + ' text-right tabular-nums'}>{x.rated.toLocaleString()}</td>
                        <td className={td + ' text-right tabular-nums'}>{x.missing.length.toLocaleString()}</td>
                        <td className={td + ' text-right tabular-nums'}>{pct(x.rated, x.bills)}</td>
                      </>
                    ) : (
                      <td colSpan={5} className={td}>
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-semibold">ยังไม่มีบิลจากระบบปิดยอดในช่วงนี้</span>
                        {x.ratings ? <span className="text-slate-400"> · มีใบประเมิน {x.ratings} ใบ</span> : null}
                      </td>
                    )}
                    <td className={td + ' text-right'}>{chip(x.flag)}</td>
                  </tr>
                ))}
                {!A.rows.length && (
                  <tr><td colSpan={7} className={td + ' text-slate-400'}>ไม่มีข้อมูลในช่วงนี้</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {A && !one && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <h4 className="text-white font-bold text-sm mb-3">สรุปรายวัน <span className="text-[11px] font-normal text-slate-400">กดที่วันที่เพื่อดูวันนั้น</span></h4>
          <div className="overflow-auto max-h-96 rounded-xl border border-slate-700">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900 sticky top-0">
                <tr>
                  <th className={th}>วันที่จัดส่ง</th><th className={th + ' text-right'}>บิล POS</th><th className={th + ' text-right'}>ใบประเมิน</th><th className={th + ' text-right'}>บิลที่ได้ประเมิน</th>
                  <th className={th + ' text-right'}>ตกหล่น</th><th className={th + ' text-right'}>อัตรา</th><th className={th + ' text-right'}>น่าสงสัย</th><th className={th}>ไฟล์สาขา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {A.days.slice().reverse().map((d) => {
                  const P = A.perDay[d];
                  return (
                    <tr key={d}>
                      <td className={td}><button onClick={() => setRange(d, d)} className="text-pink-300 hover:text-pink-200 font-semibold underline">{thai(d)}</button></td>
                      <td className={td + ' text-right tabular-nums'}>{P.bills}</td>
                      <td className={td + ' text-right tabular-nums'}>{P.ratings}</td>
                      <td className={td + ' text-right tabular-nums'}>{P.rated}</td>
                      <td className={td + ' text-right tabular-nums'}>{P.bills - P.rated}</td>
                      <td className={td + ' text-right tabular-nums'}>{pct(P.rated, P.bills)}</td>
                      <td className={td + ' text-right'}>{chip(P.flag)}</td>
                      <td className={td}>
                        {P.noData ? (
                          <span className="text-amber-300">ยังไม่มีบิล {P.noData}/{A.nBr} สาขา</span>
                        ) : (
                          <span className="text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />ครบ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {A && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <h4 className="text-white font-bold text-sm mb-1">ใบประเมินที่น่าสงสัย ({A.flagged.length})</h4>
          <p className="text-[11px] text-slate-400 mb-3">ประเมินหลังจัดส่งเกิน {LATE_MIN} นาที / ก่อนจัดส่ง / ไม่พบบิล / บิลซ้ำ / กดรัว / เวลาเครื่องไม่ตรงเซิร์ฟเวอร์ · สาขาดิจิตอลไม่ตรวจเวลา เพราะลูกค้าประเมินผ่านลิงก์หลังได้รับสินค้า</p>
          <div className="overflow-auto max-h-[28rem] rounded-xl border border-slate-700">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900 sticky top-0">
                <tr>
                  <th className={th}>เวลาประเมิน</th><th className={th}>สาขา</th><th className={th}>เลขบิล</th><th className={th}>เวลาจัดส่ง</th>
                  <th className={th}>คะแนน</th><th className={th}>แคชเชียร์</th><th className={th}>สิ่งที่พบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {A.flagged.map((x) => (
                  <tr key={x.r.id}>
                    <td className={td + ' font-mono whitespace-nowrap'}>{one ? '' : thai(x.day) + ' '}{hms(x.t)}</td>
                    <td className={td + ' whitespace-nowrap'}>{labelOf(x.code)}</td>
                    <td className={td + ' font-mono font-bold text-white'}>{x.r.orderNumber || '–'}</td>
                    <td className={td + ' font-mono whitespace-nowrap'}>
                      {x.bill && x.bill.ms != null ? (
                        <>
                          {x.bill.day !== x.day ? thai(x.bill.day) + ' ' : ''}
                          {hms(x.bill.ms)}
                          {x.bill.kind === 'bill' && <span className="text-slate-500"> (ออกบิล)</span>}
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className={td + ' text-center'}>{x.r.score}</td>
                    <td className={td}>{x.r.cashierName && x.r.cashierName !== '-' ? x.r.cashierName : <span className="text-slate-600">–</span>}</td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {x.flags.map((f, i) => (
                          <span key={i} className={`whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold border ${f.high ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'}`}>{f.text}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!A.flagged.length && (
                  <tr><td colSpan={7} className={td + ' text-emerald-300'}>ไม่พบใบประเมินที่น่าสงสัย</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {A && A.rows.some((x) => x.missing.length) && (
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-2">
          <h4 className="text-white font-bold text-sm">บิลที่ไม่มีใบประเมิน</h4>
          {A.rows.filter((x) => x.missing.length).map((x) => {
            const byDay: Record<string, string[]> = {};
            x.missing.forEach((m) => (byDay[m.day] = byDay[m.day] || []).push(m.k));
            return (
              <details key={x.code} className="bg-slate-900/50 rounded-xl border border-slate-700 px-4 py-2">
                <summary className="cursor-pointer text-xs font-bold text-slate-200">{x.label} · {x.missing.length.toLocaleString()} บิล</summary>
                <div className="font-mono text-[11px] text-slate-400 leading-6 pt-2">
                  {Object.keys(byDay).sort().reverse().map((d) => (
                    <div key={d}>{!one && <b className="text-slate-300">{thai(d)} </b>}{byDay[d].join(' · ')}</div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};
