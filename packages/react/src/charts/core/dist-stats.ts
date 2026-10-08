import { max, mean, median, min, quantileSorted, sum } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { toComparable, toDate } from '../../data/schema';
import type { Row } from '../../data/types';

/* Pure helpers shared by the distribution and flow charts. No React, no DOM: unit-tested. */

// ---------------------------------------------------------------------------------------------
// Binning

export interface Bin {
  /** Inclusive lower edge (a number, or epoch ms for temporal bins). */
  x0: number;
  /** Exclusive upper edge (inclusive for the last bin). */
  x1: number;
}

/** `n` equal-width bins over a niced domain, so edges land on readable values. */
export function linearBins(values: number[], n: number): Bin[] {
  const lo = min(values);
  const hi = max(values);
  if (lo == null || hi == null) return [];
  const count = Math.max(1, Math.round(n));
  const [d0, d1] =
    lo === hi ? [lo - 0.5, hi + 0.5] : (scaleLinear().domain([lo, hi]).nice().domain() as number[]);
  const step = (d1 - d0) / count;
  return Array.from({ length: count }, (_, i) => ({ x0: d0 + i * step, x1: d0 + (i + 1) * step }));
}

export type TimeInterval = 'day' | 'week' | 'month';

/** The start of the local day, week (Sunday) or month containing `d`. */
export function floorTime(d: Date, interval: TimeInterval): Date {
  if (interval === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (interval === 'week') day.setDate(day.getDate() - day.getDay());
  return day;
}

/** The start of the interval after the one starting at `d`. */
export function offsetTime(d: Date, interval: TimeInterval, step = 1): Date {
  if (interval === 'month') return new Date(d.getFullYear(), d.getMonth() + step, 1);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + (interval === 'week' ? 7 : 1) * step,
  );
}

/** One bin per calendar interval from the first to the last date, gaps included. */
export function timeBins(dates: Date[], interval: TimeInterval = 'day', limit = 5000): Bin[] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const d of dates) {
    const t = d.getTime();
    if (Number.isNaN(t)) continue;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (!Number.isFinite(lo)) return [];
  const out: Bin[] = [];
  let cur = floorTime(new Date(lo), interval);
  while (cur.getTime() <= hi && out.length < limit) {
    const next = offsetTime(cur, interval);
    out.push({ x0: cur.getTime(), x1: next.getTime() });
    cur = next;
  }
  return out;
}

/** Index of the bin holding `v`, or -1. Bins must be sorted and contiguous. */
export function binIndexOf(bins: Bin[], v: number): number {
  if (bins.length === 0 || Number.isNaN(v)) return -1;
  const first = bins[0].x0;
  const last = bins[bins.length - 1].x1;
  if (v < first || v > last) return -1;
  if (v === last) return bins.length - 1;
  let lo = 0;
  let hi = bins.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (v < bins[m].x0) hi = m - 1;
    else if (v >= bins[m].x1) lo = m + 1;
    else return m;
  }
  return -1;
}

/** Counts (or sums of `weight`) per bin. `at` maps a row to its comparable x value. */
export function fillBins<R>(
  bins: Bin[],
  rows: readonly R[],
  at: (r: R) => number,
  weight?: (r: R) => number,
): number[] {
  const out = bins.map(() => 0);
  for (const r of rows) {
    const i = binIndexOf(bins, at(r));
    if (i < 0) continue;
    const w = weight ? weight(r) : 1;
    if (Number.isFinite(w)) out[i] += w;
  }
  return out;
}

/** Bins whose start falls inside an inclusive [lo, hi] range: what a brush covers. */
export function binsInRange(bins: Bin[], lo: number, hi: number): [number, number] | null {
  let a = -1;
  let b = -1;
  bins.forEach((bin, i) => {
    const mid = (bin.x0 + bin.x1) / 2;
    if (mid >= lo && mid <= hi) {
      if (a < 0) a = i;
      b = i;
    }
  });
  return a < 0 ? null : [a, b];
}

// ---------------------------------------------------------------------------------------------
// Summary statistics

export interface BoxStats {
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** Whisker ends: the most extreme values within 1.5 × IQR (tukey) or min / max. */
  lo: number;
  hi: number;
  /** Values beyond the whiskers. Empty for min/max whiskers. */
  outliers: number[];
}

/** Five-number summary with Tukey (1.5 × IQR) or min/max whiskers. Null for no finite values. */
export function boxStats(
  values: number[],
  whiskers: 'tukey' | 'minmax' = 'tukey',
): BoxStats | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const q1 = quantileSorted(xs, 0.25) as number;
  const md = quantileSorted(xs, 0.5) as number;
  const q3 = quantileSorted(xs, 0.75) as number;
  const lowest = xs[0];
  const highest = xs[xs.length - 1];
  if (whiskers === 'minmax') {
    return {
      n: xs.length,
      min: lowest,
      q1,
      median: md,
      q3,
      max: highest,
      lo: lowest,
      hi: highest,
      outliers: [],
    };
  }
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const lo = xs.find((v) => v >= loFence) ?? lowest;
  let hi = highest;
  for (let i = xs.length - 1; i >= 0; i--) {
    if (xs[i] <= hiFence) {
      hi = xs[i];
      break;
    }
  }
  return {
    n: xs.length,
    min: lowest,
    q1,
    median: md,
    q3,
    max: highest,
    lo,
    hi,
    outliers: xs.filter((v) => v < lo || v > hi),
  };
}

/** Pearson correlation coefficient, or null with fewer than three points or no variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = sum(xs.slice(0, n)) / n;
  const my = sum(ys.slice(0, n)) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export type AggregateOp = 'count' | 'sum' | 'mean' | 'median' | 'min' | 'max';

/** Reduces a group of values. `count` counts rows, so it ignores the values. */
export function aggregateValues(
  values: number[],
  how: AggregateOp,
  rowCount = values.length,
): number {
  const finite = values.filter((v) => Number.isFinite(v));
  switch (how) {
    case 'count':
      return rowCount;
    case 'sum':
      return sum(finite);
    case 'mean':
      return mean(finite) ?? 0;
    case 'median':
      return median(finite) ?? 0;
    case 'min':
      return min(finite) ?? 0;
    case 'max':
      return max(finite) ?? 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Categories and matrices

/** Distinct keys in an explicit order, then first appearance (or numeric order for numbers). */
export function orderedKeys(values: unknown[], order?: readonly unknown[]): unknown[] {
  const seen = new Map<number | string | boolean | null, unknown>();
  for (const v of values) {
    if (v == null) continue;
    const k = toComparable(v);
    if (!seen.has(k)) seen.set(k, v);
  }
  if (order) {
    const out: unknown[] = order.filter((v) => v != null);
    const keys = new Set<number | string | boolean | null>(out.map((v) => toComparable(v)));
    for (const [k, v] of seen) if (!keys.has(k)) out.push(v);
    return out;
  }
  const all = [...seen.values()];
  if (all.every((v) => typeof v === 'number' || v instanceof Date)) {
    all.sort((a, b) => (toComparable(a) as number) - (toComparable(b) as number));
  }
  return all;
}

export interface Matrix {
  xs: unknown[];
  ys: unknown[];
  /** cells[row][col]: aggregated value, or null where no rows fall. */
  cells: (number | null)[][];
  /** Rows per cell, for tooltips. */
  counts: number[][];
  peak: { row: number; col: number; value: number } | null;
  low: { row: number; col: number; value: number } | null;
}

/** Groups rows by x and y and reduces each cell. Count when `value` is omitted. */
export function aggregateMatrix(
  rows: readonly Row[],
  opts: {
    x: string;
    y: string;
    value?: string;
    aggregate?: AggregateOp;
    xOrder?: readonly unknown[];
    yOrder?: readonly unknown[];
  },
): Matrix {
  const how: AggregateOp = opts.aggregate ?? (opts.value ? 'sum' : 'count');
  const xs = orderedKeys(
    rows.map((r) => r[opts.x]),
    opts.xOrder,
  );
  const ys = orderedKeys(
    rows.map((r) => r[opts.y]),
    opts.yOrder,
  );
  const xi = new Map(xs.map((v, i) => [toComparable(v), i]));
  const yi = new Map(ys.map((v, i) => [toComparable(v), i]));
  const groups: number[][][] = ys.map(() => xs.map(() => []));
  const counts = ys.map(() => xs.map(() => 0));
  for (const r of rows) {
    const c = xi.get(toComparable(r[opts.x]));
    const w = yi.get(toComparable(r[opts.y]));
    if (c == null || w == null) continue;
    counts[w][c]++;
    if (opts.value) groups[w][c].push(Number(r[opts.value]));
  }
  let peak: Matrix['peak'] = null;
  let low: Matrix['low'] = null;
  const cells = groups.map((row, w) =>
    row.map((vals, c) => {
      if (counts[w][c] === 0) return null;
      const v = aggregateValues(vals, how, counts[w][c]);
      if (!peak || v > peak.value) peak = { row: w, col: c, value: v };
      if (!low || v < low.value) low = { row: w, col: c, value: v };
      return v;
    }),
  );
  return { xs, ys, cells, counts, peak, low };
}

// ---------------------------------------------------------------------------------------------
// Sequential ramp

/** Eight steps: a neutral for zero or missing, then the sequential ramp. */
export const RAMP = [
  'var(--q-subtle)',
  'var(--q-seq-0)',
  'var(--q-seq-1)',
  'var(--q-seq-2)',
  'var(--q-seq-3)',
  'var(--q-seq-4)',
  'var(--q-seq-5)',
  'var(--q-seq-6)',
] as const;

/** Ramp step 0…7 for `v` on [lo, hi]. Missing values are step 0. */
export function rampLevel(v: number | null | undefined, lo: number, hi: number): number {
  if (v == null || !Number.isFinite(v)) return 0;
  if (hi <= lo) return v > lo ? 7 : 0;
  const t = (v - lo) / (hi - lo);
  return Math.max(0, Math.min(7, Math.floor(t * 7.999)));
}

/** The domain a ramp spans: zero (or the minimum, if negative) to the maximum. */
export function rampDomain(values: (number | null)[], domain?: [number, number]): [number, number] {
  if (domain) return domain;
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  return [Math.min(0, min(finite) ?? 0), max(finite) ?? 1];
}

// ---------------------------------------------------------------------------------------------
// Calendar

export interface CalendarCell {
  /** Local midnight. */
  date: Date;
  /** Week column, 0 = first. */
  col: number;
  /** Weekday row: 0 = Sunday … 6 = Saturday (shifted by weekStart). */
  row: number;
}

/** Day cells for `weeks` week columns ending with the week holding `end`. */
export function calendarCells(end: Date, weeks: number, weekStart = 0): CalendarCell[] {
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const lastCol0 = new Date(last);
  lastCol0.setDate(last.getDate() - ((last.getDay() - weekStart + 7) % 7));
  const start = new Date(lastCol0);
  start.setDate(lastCol0.getDate() - (weeks - 1) * 7);
  const out: CalendarCell[] = [];
  for (let i = 0; ; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (d > last) break;
    out.push({ date: d, col: Math.floor(i / 7), row: i % 7 });
  }
  return out;
}

/** Number of week columns from the week of `start` to the week of `end`. */
export function weeksBetween(start: Date, end: Date, weekStart = 0): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  a.setDate(a.getDate() - ((a.getDay() - weekStart + 7) % 7));
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor(Math.round((b.getTime() - a.getTime()) / 864e5) / 7) + 1;
}

/** `YYYY-MM-DD` in local time: the key calendar charts group by. */
export function localDayKey(v: unknown): string {
  const d = toDate(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Geometry

/** A bar path with rounded top corners only. */
export function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Clamps a number into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
