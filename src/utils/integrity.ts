import { RatingRecord } from '../types';

// Checks that help tell a rating the customer pressed at the counter
// from one that was added later by staff.

export type FlagCode =
  | 'BEFORE_BILL'
  | 'LATE'
  | 'NO_POS'
  | 'NO_ORDER'
  | 'DUPLICATE'
  | 'BURST'
  | 'CLOCK';

export interface IntegrityFlag {
  code: FlagCode;
  label: string;
  detail?: string;
  severity: 'high' | 'medium';
}

export interface IntegrityOptions {
  lateMinutes: number; // rating later than bill time + this = suspicious
  burstSeconds: number; // ratings closer than this on one counter/device = suspicious
  clockToleranceMinutes: number; // allowed gap between device clock and server clock
}

export const DEFAULT_INTEGRITY_OPTIONS: IntegrityOptions = {
  lateMinutes: 5,
  burstSeconds: 20,
  clockToleranceMinutes: 2,
};

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
// Small allowance for the POS clock and the tablet clock not being exactly in sync
const CLOCK_SKEW_MS = 60 * 1000;

function bkkToMs(y: number, mo: number, d: number, h: number, mi: number, s: number): number {
  if (y > 2400) y -= 543; // Buddhist year
  return Date.UTC(y, mo - 1, d, h, mi, s) - BKK_OFFSET_MS;
}

/**
 * Reads a POS bill time (Bangkok time) into epoch ms.
 * Accepts "2026/07/28 17:49:07", "2026-07-28 17:49", "28/07/2026 17:49:07",
 * ISO strings, or a time only ("17:49:07") combined with fallbackDate (YYYY-MM-DD).
 */
export function parsePosTime(value: string | undefined, fallbackDate?: string): number | undefined {
  if (!value) return undefined;
  const s = value.trim();
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
  if (m) return bkkToMs(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ T,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
  if (m) return bkkToMs(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
  if (m && fallbackDate) {
    const [y, mo, d] = fallbackDate.split('-').map(Number);
    if (y && mo && d) return bkkToMs(y, mo, d, +m[1], +m[2], +(m[3] || 0));
  }
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    if (!isNaN(t)) return t;
  }
  return undefined;
}

function fmtMinutes(ms: number): string {
  const min = Math.abs(ms) / 60000;
  if (min < 60) return `${Math.round(min)} นาที`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)} ชม.`;
  return `${Math.round(h / 24)} วัน`;
}

/**
 * Finds ratings that were pressed in a rapid burst on the same counter or device.
 * Returns rating id -> size of the burst it belongs to.
 */
export function findBursts(ratings: RatingRecord[], burstSeconds: number): Map<string, number> {
  const result = new Map<string, number>();
  const groups = new Map<string, RatingRecord[]>();
  ratings.forEach((r) => {
    const keys = [`c:${r.counterId}`];
    if (r.deviceId) keys.push(`d:${r.deviceId}`);
    keys.forEach((k) => {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    });
  });
  const windowMs = burstSeconds * 1000;
  groups.forEach((list) => {
    const sorted = list
      .map((r) => ({ r, t: new Date(r.timestamp).getTime() }))
      .filter((x) => !isNaN(x.t))
      .sort((a, b) => a.t - b.t);
    let start = 0;
    for (let i = 1; i <= sorted.length; i++) {
      // close the current run when the gap is too big or the list ends
      if (i === sorted.length || sorted[i].t - sorted[i - 1].t > windowMs) {
        const size = i - start;
        if (size >= 2) {
          for (let j = start; j < i; j++) {
            const id = sorted[j].r.id;
            result.set(id, Math.max(result.get(id) || 0, size));
          }
        }
        start = i;
      }
    }
  });
  return result;
}

export interface RatingCheckContext {
  posLoaded: boolean; // a POS list was imported
  inPos: boolean; // this rating's order number is in that list
  posTimeMs?: number; // bill time of the matching order
  isDuplicate: boolean; // order number used by more than one rating
  burstSize?: number;
}

export function checkRating(
  r: RatingRecord,
  ctx: RatingCheckContext,
  opts: IntegrityOptions = DEFAULT_INTEGRITY_OPTIONS
): IntegrityFlag[] {
  const flags: IntegrityFlag[] = [];
  const ratedAt = new Date(r.timestamp).getTime();

  if (!r.orderNumber || !r.orderNumber.trim()) {
    flags.push({ code: 'NO_ORDER', label: 'ไม่มีเลขบิล', severity: 'medium' });
  } else if (ctx.posLoaded && !ctx.inPos) {
    flags.push({ code: 'NO_POS', label: 'ไม่พบบิลนี้ใน POS', severity: 'high' });
  }

  if (ctx.isDuplicate) {
    flags.push({ code: 'DUPLICATE', label: 'เลขบิลซ้ำ', severity: 'high' });
  }

  if (ctx.posTimeMs !== undefined && !isNaN(ratedAt)) {
    const diff = ratedAt - ctx.posTimeMs;
    if (diff < -CLOCK_SKEW_MS) {
      flags.push({
        code: 'BEFORE_BILL',
        label: 'ประเมินก่อนออกบิล',
        detail: `ก่อนบิล ${fmtMinutes(diff)}`,
        severity: 'high',
      });
    } else if (diff > opts.lateMinutes * 60000) {
      flags.push({
        code: 'LATE',
        label: `ประเมินหลังออกบิลเกิน ${opts.lateMinutes} นาที`,
        detail: `หลังบิล ${fmtMinutes(diff)}`,
        severity: 'high',
      });
    }
  }

  if (ctx.burstSize && ctx.burstSize >= 2) {
    flags.push({
      code: 'BURST',
      label: 'กดรัวติดกัน',
      detail: `${ctx.burstSize} ใบ ห่างกันไม่เกิน ${opts.burstSeconds} วินาที`,
      severity: ctx.burstSize >= 3 ? 'high' : 'medium',
    });
  }

  if (r.serverTime && !isNaN(ratedAt)) {
    const gap = new Date(r.serverTime).getTime() - ratedAt;
    if (Math.abs(gap) > opts.clockToleranceMinutes * 60000) {
      flags.push({
        code: 'CLOCK',
        label: 'เวลาในเครื่องไม่ตรงกับเวลาเซิร์ฟเวอร์',
        detail:
          gap > 0
            ? `ขึ้นระบบช้ากว่าเวลาที่บันทึก ${fmtMinutes(gap)} (เน็ตหลุด หรือย้อนเวลาเครื่อง)`
            : `เวลาเครื่องเร็วกว่าเซิร์ฟเวอร์ ${fmtMinutes(gap)}`,
        severity: 'high',
      });
    }
  }

  return flags;
}
