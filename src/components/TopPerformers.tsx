import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trophy, AlertTriangle, Info } from 'lucide-react';
import { RatingRecord } from '../types';
import { analyzePos, dayOf, loadPosIndex, PosBranch, shift, thai } from './AutoPosCheck';

/*
 * Branches and cashiers who did their job completely:
 * asked every customer to rate (coverage against POS bills), entered the cashier,
 * and produced no suspicious ratings. Customer satisfaction is shown alongside.
 */

const MIN_STAFF = 10; // fewer ratings than this = not enough data to rank a cashier

interface Props {
  ratings: RatingRecord[];
  branch?: string;
}

const named = (r: RatingRecord) => {
  const n = String(r.cashierName || '').trim();
  return !!n && n !== '-';
};
const medal = (i: number) => ['🥇', '🥈', '🥉'][i] || String(i + 1);
const pct = (v: number) => Math.round(v * 100) + '%';

export const TopPerformers: React.FC<Props> = ({ ratings, branch }) => {
  const yesterday = shift(dayOf(Date.now()), -1);
  const [from, setFrom] = useState(yesterday.slice(0, 8) + '01');
  const [to, setTo] = useState(yesterday);
  const [pos, setPos] = useState<PosBranch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

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
    const bad = new Set(A.flagged.filter((f) => f.flags.some((x) => x.high)).map((f) => f.r.id));

    const branches = A.rows
      .map((x) => {
        const mine = A.byBranch.get(x.code) || [];
        const n = mine.length;
        const cov = x.bills ? Math.min(1, x.rated / x.bills) : 0;
        const clean = n ? 1 - mine.filter((r) => bad.has(r.id)).length / n : 0;
        const nm = n ? mine.filter(named).length / n : 0;
        const avg = n ? mine.reduce((s, r) => s + (+r.score || 0), 0) / n : 0;
        const score = x.bills ? Math.round(100 * (0.6 * cov + 0.3 * clean + 0.1 * nm)) : 0;
        return { code: x.code, label: x.label, bills: x.bills, rated: x.rated, n, cov, clean, nm, avg, score, bad: n - Math.round(clean * n) };
      })
      .sort((a, b) => b.score - a.score || b.cov - a.cov);

    const staffMap = new Map<string, { name: string; label: string; n: number; bad: number; sum: number }>();
    A.rows.forEach((x) =>
      (A.byBranch.get(x.code) || []).filter(named).forEach((r) => {
        const name = String(r.cashierName).trim();
        const key = x.code + '|' + name.toUpperCase();
        const s = staffMap.get(key) || { name, label: x.label, n: 0, bad: 0, sum: 0 };
        s.n++;
        s.sum += +r.score || 0;
        if (bad.has(r.id)) s.bad++;
        staffMap.set(key, s);
      })
    );
    const staff = [...staffMap.values()].map((s) => {
      const clean = 1 - s.bad / s.n, avg = s.sum / s.n;
      return { ...s, clean, avg, score: Math.round(100 * (0.6 * clean + 0.4 * (avg / 5))) };
    });
    const ranked = staff.filter((s) => s.n >= MIN_STAFF).sort((a, b) => b.score - a.score || b.n - a.n);
    const few = staff.filter((s) => s.n < MIN_STAFF).sort((a, b) => b.n - a.n);
    const noName = A.rows.reduce((s, x) => s + (A.byBranch.get(x.code) || []).filter((r) => !named(r)).length, 0);
    return { A, branches, ranked, few, noName };
  }, [pos, ratings, from, to, branch]);

  const th = 'py-2.5 px-3 font-bold text-slate-400 text-[11px] whitespace-nowrap';
  const td = 'py-2 px-3';
  const bar = (v: number) => (
    <div className="flex items-center gap-2 justify-end">
      <span className="tabular-nums font-bold text-white">{v}</span>
      <div className="w-14 h-1.5 rounded bg-slate-700 overflow-hidden">
        <div className={`h-full ${v >= 80 ? 'bg-emerald-400' : v >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: v + '%' }} />
      </div>
    </div>
  );
  const tone = (v: number, good: number, ok: number) => (v >= good ? 'text-emerald-300' : v >= ok ? 'text-amber-300' : 'text-rose-300');

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-bold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              สาขา / พนักงานดีเด่น
            </h3>
            <p className="text-xs text-slate-400 mt-1">วัดจากการปฏิบัติหน้าที่ครบถ้วน: ขอให้ลูกค้าประเมินครบทุกบิล ใส่ชื่อพนักงาน และไม่มีใบประเมินที่น่าสงสัย · เทียบกับบิล POS จากระบบปิดยอดอัตโนมัติ</p>
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
            <span className="text-[11px] text-slate-400">คะแนน = ประเมินครบทุกบิล 60% + ไม่มีใบน่าสงสัย 30% + ใส่ชื่อพนักงาน 10%</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900">
                <tr>
                  <th className={th + ' text-center'}>อันดับ</th><th className={th}>สาขา</th><th className={th + ' text-right'}>คะแนน</th>
                  <th className={th + ' text-right'}>ประเมินครบ (บิล)</th><th className={th + ' text-right'}>ไม่มีใบน่าสงสัย</th>
                  <th className={th + ' text-right'}>ใส่ชื่อพนักงาน</th><th className={th + ' text-right'}>ความพึงพอใจ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {R.branches.map((b, i) => (
                  <tr key={b.code} className={i < 3 && b.score > 0 ? 'bg-emerald-500/5' : ''}>
                    <td className={td + ' text-center text-base'}>{b.bills ? medal(i) : '–'}</td>
                    <td className={td + ' font-semibold text-white'}>{b.label}</td>
                    {b.bills ? (
                      <>
                        <td className={td}>{bar(b.score)}</td>
                        <td className={td + ' text-right tabular-nums'}>
                          <span className={'font-bold ' + tone(b.cov, 0.9, 0.7)}>{pct(b.cov)}</span>
                          <div className="text-[10px] text-slate-500">{b.rated.toLocaleString()}/{b.bills.toLocaleString()} บิล</div>
                        </td>
                        <td className={td + ' text-right tabular-nums'}>
                          <span className={'font-bold ' + tone(b.clean, 0.98, 0.9)}>{b.n ? pct(b.clean) : '–'}</span>
                          <div className="text-[10px] text-slate-500">น่าสงสัย {b.bad} ใบ</div>
                        </td>
                        <td className={td + ' text-right tabular-nums'}><span className={'font-bold ' + tone(b.nm, 0.98, 0.9)}>{b.n ? pct(b.nm) : '–'}</span></td>
                        <td className={td + ' text-right tabular-nums'}>{b.n ? b.avg.toFixed(2) : '–'}</td>
                      </>
                    ) : (
                      <td colSpan={5} className={td}>
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-semibold">ยังไม่มีบิลจากระบบปิดยอดในช่วงนี้ จัดอันดับไม่ได้</span>
                      </td>
                    )}
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
            <span className="text-[11px] text-slate-400">คะแนน = ใบประเมินไม่น่าสงสัย 60% + ความพึงพอใจเฉลี่ย 40% · จัดอันดับเมื่อมีอย่างน้อย {MIN_STAFF} ใบ</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-900">
                <tr>
                  <th className={th + ' text-center'}>อันดับ</th><th className={th}>พนักงาน</th><th className={th}>สาขา</th><th className={th + ' text-right'}>คะแนน</th>
                  <th className={th + ' text-right'}>ใบประเมิน</th><th className={th + ' text-right'}>ไม่มีใบน่าสงสัย</th><th className={th + ' text-right'}>ความพึงพอใจ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {R.ranked.map((s, i) => (
                  <tr key={s.label + s.name} className={i < 3 ? 'bg-emerald-500/5' : ''}>
                    <td className={td + ' text-center text-base'}>{medal(i)}</td>
                    <td className={td + ' font-semibold text-white'}>{s.name}</td>
                    <td className={td}>{s.label}</td>
                    <td className={td}>{bar(s.score)}</td>
                    <td className={td + ' text-right tabular-nums'}>{s.n.toLocaleString()}</td>
                    <td className={td + ' text-right tabular-nums'}>
                      <span className={'font-bold ' + tone(s.clean, 0.98, 0.9)}>{pct(s.clean)}</span>
                      {s.bad > 0 && <div className="text-[10px] text-rose-300">น่าสงสัย {s.bad} ใบ</div>}
                    </td>
                    <td className={td + ' text-right tabular-nums'}>{s.avg.toFixed(2)}</td>
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
    </div>
  );
};
