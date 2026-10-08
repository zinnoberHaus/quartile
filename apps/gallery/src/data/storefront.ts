/**
 * Kestrel Goods storefront history for the example app (/examples/storefront).
 *
 * Two years of daily revenue per region × channel (Oct 7, 2024 – Oct 6, 2026) are generated once,
 * deterministically, then split across the twelve Kestrel products. `buildFacts(range)` returns
 * one row per time bucket × region × channel × product for the requested range, with the same
 * measures for the previous period of equal length alongside, so every view can compute deltas.
 *
 * Values are modeled expectations (continuous), not individual orders: a single row may hold
 * 0.37 orders. Totals over many rows read like ordinary counts. Every value for a given day is a
 * pure function of that day, so 7D, 30D and 90D agree with each other.
 */
import {
  CATEGORIES,
  type Category,
  CHANNELS,
  type Channel,
  PRODUCTS,
  REGIONS,
  type Region,
  rng,
} from './kestrel';

export type { Category, Channel, Region };
export { CATEGORIES, CHANNELS, REGIONS };

export const HISTORY_DAYS = 730;
/** Last day with data. */
export const LAST_DAY = new Date(2026, 9, 6);
/** First day with data. */
export const FIRST_DAY = addDays(LAST_DAY, -(HISTORY_DAYS - 1));
/** Longest range with a full previous period inside the history. */
export const MAX_RANGE_DAYS = 364;
/** Earliest start for a range, so its previous period is inside the history. */
export const MIN_START = addDays(LAST_DAY, -(MAX_RANGE_DAYS - 1));
/** Ranges longer than this are bucketed by week. */
export const WEEKLY_ABOVE_DAYS = 120;

export type Period = '7D' | '30D' | '90D' | '12M';
export const PERIODS: Period[] = ['7D', '30D', '90D', '12M'];
export const PERIOD_DAYS: Record<Period, number> = { '7D': 7, '30D': 30, '90D': 90, '12M': 364 };

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayIndex(d: Date) {
  const a = Date.UTC(FIRST_DAY.getFullYear(), FIRST_DAY.getMonth(), FIRST_DAY.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86_400_000);
}

export interface DateRange {
  start: Date;
  end: Date;
}

export function rangeForPeriod(p: Period): DateRange {
  return { start: addDays(LAST_DAY, -(PERIOD_DAYS[p] - 1)), end: LAST_DAY };
}

/** The preset a range matches, or null for a custom range. */
export function periodOfRange(r: DateRange): Period | null {
  for (const p of PERIODS) {
    const want = rangeForPeriod(p);
    if (dayKey(want.start) === dayKey(r.start) && dayKey(want.end) === dayKey(r.end)) return p;
  }
  return null;
}

/** Clamps a range to the history, keeping room for its previous period. */
export function clampRange(r: DateRange): DateRange {
  let end = r.end > LAST_DAY ? LAST_DAY : r.end;
  let start = r.start < MIN_START ? MIN_START : r.start;
  if (end < start) end = start;
  if (dayIndex(end) - dayIndex(start) + 1 > MAX_RANGE_DAYS)
    start = addDays(end, -(MAX_RANGE_DAYS - 1));
  if (start > end) start = end;
  return { start, end };
}

export interface PeriodWindow {
  start: Date;
  end: Date;
  days: number;
  /** Days per bucket: 1 (daily) or 7 (weekly). */
  bucket: 1 | 7;
  grain: 'daily' | 'weekly';
  prevStart: Date;
  prevEnd: Date;
}

export function windowOf(range: DateRange): PeriodWindow {
  const { start, end } = clampRange(range);
  const days = dayIndex(end) - dayIndex(start) + 1;
  const bucket = days > WEEKLY_ABOVE_DAYS ? 7 : 1;
  return {
    start,
    end,
    days,
    bucket,
    grain: bucket === 7 ? 'weekly' : 'daily',
    prevStart: addDays(start, -days),
    prevEnd: addDays(start, -1),
  };
}

// ── Model parameters ────────────────────────────────────────────────────────────

/** Share of revenue, relative unit price and base conversion per region. */
const REGION_P: Record<Region, { w: number; price: number; cv: number }> = {
  'North America': { w: 0.41, price: 1, cv: 0.036 },
  Europe: { w: 0.28, price: 0.91, cv: 0.033 },
  'Asia Pacific': { w: 0.17, price: 0.74, cv: 0.029 },
  'Latin America': { w: 0.08, price: 0.59, cv: 0.024 },
  'Middle East & Africa': { w: 0.06, price: 0.67, cv: 0.026 },
};

const CHANNEL_P: Record<Channel, { w: number; price: number; cv: number }> = {
  'Organic search': { w: 0.37, price: 1, cv: 1 },
  'Paid social': { w: 0.27, price: 0.92, cv: 0.72 },
  Email: { w: 0.21, price: 1.06, cv: 1.9 },
  Direct: { w: 0.15, price: 1.02, cv: 1.25 },
};

/** Revenue weight and yearly drift per product, in PRODUCTS order. */
const PRODUCT_W = [0.16, 0.13, 0.11, 0.105, 0.09, 0.08, 0.075, 0.06, 0.05, 0.045, 0.03, 0.025];
const PRODUCT_SLOPE = [0.22, 0.35, -0.12, 0.08, 0.18, -0.24, 0.41, 0.27, -0.05, 0.12, -0.31, 0.06];

const WEEKDAY_F = [0.97, 1.03, 1.0, 0.99, 1.02, 0.95, 0.88]; // Sun … Sat

export const PRODUCT_INFO = new Map(PRODUCTS.map((p) => [p.name, p]));

interface History {
  /** Expected revenue per day, per region × channel cell (index ri * 4 + ci). */
  cellRevenue: Float64Array[];
  /** Region and channel affinity per product: [product][region], [product][channel]. */
  regionAffinity: number[][];
  channelAffinity: number[][];
}

let history: History | null = null;

/** Generates the daily history once. Same seed and sequence as the design's mock. */
function getHistory(): History {
  if (history) return history;
  const r = rng(90621);
  const cellRevenue: Float64Array[] = [];
  REGIONS.forEach((region) => {
    CHANNELS.forEach((channel, ci) => {
      const rp = REGION_P[region];
      const cp = CHANNEL_P[channel];
      const tilt = 0.82 + r() * 0.36;
      const rev = new Float64Array(HISTORY_DAYS);
      let burst = 0;
      for (let d = 0; d < HISTORY_DAYS; d++) {
        const dt = addDays(FIRST_DAY, d);
        const dow = dt.getDay();
        const fromHoliday =
          (dt.getTime() - new Date(dt.getFullYear(), 10, 28).getTime()) / 86_400_000;
        const holiday = 1 + 0.5 * Math.exp(-(((fromHoliday - 9) / 12) ** 2));
        let f = WEEKDAY_F[dow] * (1 + (r() - 0.5) * 0.2);
        if (ci === 2 && (dow === 2 || dow === 4)) f *= 1.35; // email sends Tue / Thu
        if (ci === 1) {
          if (burst <= 0 && r() < 0.03) burst = 5 + Math.floor(r() * 9); // paid campaigns
          if (burst > 0) {
            f *= 1.3;
            burst--;
          }
        }
        rev[d] =
          43000 * rp.w * cp.w * tilt * (0.64 + (0.36 * d) / (HISTORY_DAYS - 1)) * holiday * f;
        r(); // the design's mock draws order and session noise here; keep the sequence
        r();
      }
      cellRevenue.push(rev);
    });
  });
  const regionAffinity = PRODUCTS.map(() => REGIONS.map(() => 0.75 + r() * 0.5));
  const channelAffinity = PRODUCTS.map(() => CHANNELS.map(() => 0.75 + r() * 0.5));
  history = { cellRevenue, regionAffinity, channelAffinity };
  return history;
}

// ── Facts ──────────────────────────────────────────────────────────────────────

export type StorefrontFact = {
  /** First day of the bucket (YYYY-MM-DD). */
  date: string;
  region: Region;
  channel: Channel;
  product: string;
  sku: string;
  category: Category;
  revenue: number;
  orders: number;
  sessions: number;
  views: number;
  carts: number;
  checkouts: number;
  /** The same bucket in the previous period. */
  revenue_prev: number;
  orders_prev: number;
  sessions_prev: number;
  /** revenue / revenue_prev − 1. */
  revenue_change: number;
};

const MEASURES = 9; // revenue, orders, sessions, views, carts, checkouts, prev revenue, orders, sessions

/** Accumulates one day of every region × channel × product into `out` at `base + offset`. */
function addDay(d: number, out: Float64Array, bucketBase: number, previous: boolean) {
  const h = getHistory();
  const t = (d - 365) / 365;
  const raw = new Array<number>(PRODUCTS.length);
  for (let ri = 0; ri < REGIONS.length; ri++) {
    const rp = REGION_P[REGIONS[ri]];
    for (let ci = 0; ci < CHANNELS.length; ci++) {
      const cp = CHANNEL_P[CHANNELS[ci]];
      const cell = h.cellRevenue[ri * CHANNELS.length + ci][d];
      let sum = 0;
      for (let j = 0; j < PRODUCTS.length; j++) {
        raw[j] =
          PRODUCT_W[j] *
          h.regionAffinity[j][ri] *
          h.channelAffinity[j][ci] *
          (1 + PRODUCT_SLOPE[j] * t) *
          (1 + 0.05 * Math.sin(j * 12.9898 + d * 0.7823));
        sum += raw[j];
      }
      for (let j = 0; j < PRODUCTS.length; j++) {
        const n = rng(((d * 7 + ri) * 5 + ci) * 13 + j + 1);
        const revenue = ((cell * raw[j]) / sum) * (0.94 + n() * 0.12);
        const orders = revenue / (PRODUCTS[j].price * rp.price * cp.price * (0.97 + n() * 0.06));
        const sessions = orders / (rp.cv * cp.cv * (0.95 + n() * 0.1));
        const i = (bucketBase + (ri * CHANNELS.length + ci) * PRODUCTS.length + j) * MEASURES;
        if (previous) {
          out[i + 6] += revenue;
          out[i + 7] += orders;
          out[i + 8] += sessions;
        } else {
          const checkouts = orders * (1.58 + n() * 0.08);
          out[i] += revenue;
          out[i + 1] += orders;
          out[i + 2] += sessions;
          out[i + 3] += sessions * (0.55 + n() * 0.04);
          out[i + 4] += checkouts * (1.98 + n() * 0.12);
          out[i + 5] += checkouts;
        }
      }
    }
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** One row per bucket × region × channel × product for `range`, with the previous period. */
export function buildFacts(range: DateRange): StorefrontFact[] {
  const w = windowOf(range);
  const a0 = dayIndex(w.start);
  const p0 = a0 - w.days;
  const buckets = Math.ceil(w.days / w.bucket);
  const combos = REGIONS.length * CHANNELS.length * PRODUCTS.length;
  const acc = new Float64Array(buckets * combos * MEASURES);
  for (let k = 0; k < buckets; k++) {
    const from = k * w.bucket;
    const to = Math.min(w.days, from + w.bucket);
    for (let off = from; off < to; off++) {
      addDay(a0 + off, acc, k * combos, false);
      addDay(p0 + off, acc, k * combos, true);
    }
  }
  const out: StorefrontFact[] = [];
  for (let k = 0; k < buckets; k++) {
    const date = dayKey(addDays(w.start, k * w.bucket));
    for (let ri = 0; ri < REGIONS.length; ri++) {
      for (let ci = 0; ci < CHANNELS.length; ci++) {
        for (let j = 0; j < PRODUCTS.length; j++) {
          const i = (k * combos + (ri * CHANNELS.length + ci) * PRODUCTS.length + j) * MEASURES;
          const p = PRODUCTS[j];
          out.push({
            date,
            region: REGIONS[ri],
            channel: CHANNELS[ci],
            product: p.name,
            sku: p.sku,
            category: p.category,
            revenue: round2(acc[i]),
            orders: round2(acc[i + 1]),
            sessions: round2(acc[i + 2]),
            views: round2(acc[i + 3]),
            carts: round2(acc[i + 4]),
            checkouts: round2(acc[i + 5]),
            revenue_prev: round2(acc[i + 6]),
            orders_prev: round2(acc[i + 7]),
            sessions_prev: round2(acc[i + 8]),
            revenue_change: acc[i + 6] > 0 ? acc[i] / acc[i + 6] - 1 : 0,
          });
        }
      }
    }
  }
  return out;
}

// ── Orders by hour ─────────────────────────────────────────────────────────────

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const HOURLY = [
  0.18, 0.11, 0.07, 0.05, 0.05, 0.07, 0.16, 0.33, 0.52, 0.66, 0.74, 0.82, 0.92, 0.9, 0.8, 0.76,
  0.78, 0.86, 0.98, 1, 0.96, 0.82, 0.58, 0.34,
];
const WEEKDAY_HOUR_F = [1, 1.04, 1, 1.02, 0.94, 0.84, 0.96]; // Mon … Sun

/** Share of a channel's orders in each weekday × hour cell (sums to 1 per channel). */
const HOUR_PROFILE: Record<Channel, number[][]> = (() => {
  const out = {} as Record<Channel, number[][]>;
  CHANNELS.forEach((c, ci) => {
    let sum = 0;
    const m = WEEKDAYS.map((_, w) =>
      HOURLY.map((base, h) => {
        let v = base * WEEKDAY_HOUR_F[w];
        if (ci === 2 && h >= 7 && h <= 10) v *= 1.7; // email opens in the morning
        if (ci === 1 && h >= 19 && h <= 22) v *= 1.35; // social in the evening
        if (ci === 3) v **= 0.75; // direct is flatter
        if (w >= 5 && h >= 9 && h <= 13) v *= 1.15; // weekend late mornings
        sum += v;
        return v;
      }),
    );
    out[c] = m.map((row) => row.map((v) => v / sum));
  });
  return out;
})();

/** Spreads orders per channel over a typical week: one row per weekday × hour. */
export function ordersByHour(ordersByChannel: Partial<Record<Channel, number>>) {
  const rows: { weekday: string; hour: number; orders: number }[] = [];
  WEEKDAYS.forEach((weekday, w) => {
    for (let hour = 0; hour < 24; hour++) {
      let orders = 0;
      for (const c of CHANNELS) orders += (ordersByChannel[c] ?? 0) * HOUR_PROFILE[c][w][hour];
      rows.push({ weekday, hour, orders });
    }
  });
  return rows;
}
