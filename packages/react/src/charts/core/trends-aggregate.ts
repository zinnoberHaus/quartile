import { toComparable } from '../../data/schema';
import type { Row } from '../../data/types';

/** How rows that share a key are combined. */
export type Aggregate = 'sum' | 'count' | 'mean';

export type SortOrder = 'desc' | 'asc' | 'none';

export interface Bucket {
  /** Stable string key used for React keys and lookups. */
  key: string;
  /** The first raw value seen for this key (a Date stays a Date, a number stays a number). */
  raw: unknown;
  value: number;
  /** Number of rows that fell into the bucket. */
  count: number;
  /** Combined change ratio, when a delta field was given and any row in the bucket had one. */
  delta?: number;
}

/** Stable key for a raw value: dates and ISO strings by time, everything else by string. */
export function keyOf(v: unknown): string {
  const c = toComparable(v);
  return c == null ? '' : String(c);
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Groups rows by `key` and combines `value` with `aggregate`. Without a value field every row
 * counts once. Buckets keep first-seen order unless `sort` is given.
 *
 * With `delta` (a field holding each row's change as a ratio, 0.048 for +4.8%), rows that share a
 * key are combined so the result equals the change of the summed values: each row's previous
 * value is `value / (1 + delta)`, and the bucket's change is `Σ value / Σ previous − 1`. For
 * `count` and `mean`, or rows without a usable value, the plain mean of the ratios is used.
 */
export function aggregateBy(
  rows: readonly Row[],
  key: string,
  {
    value,
    aggregate = value ? 'sum' : 'count',
    sort = 'none',
    delta,
  }: { value?: string; aggregate?: Aggregate; sort?: SortOrder; delta?: string } = {},
): Bucket[] {
  const map = new Map<
    string,
    {
      raw: unknown;
      sum: number;
      n: number;
      valued: number;
      cur: number;
      prev: number;
      dSum: number;
      dN: number;
    }
  >();
  for (const r of rows) {
    const raw = r[key];
    const k = keyOf(raw);
    let b = map.get(k);
    if (!b) {
      b = { raw, sum: 0, n: 0, valued: 0, cur: 0, prev: 0, dSum: 0, dN: 0 };
      map.set(k, b);
    }
    b.n++;
    const v = value ? num(r[value]) : 1;
    if (v != null) {
      b.sum += v;
      b.valued++;
    }
    if (delta) {
      const d = num(r[delta]);
      if (d != null) {
        b.dSum += d;
        b.dN++;
        if (v != null && aggregate === 'sum' && d > -1) {
          b.cur += v;
          b.prev += v / (1 + d);
        }
      }
    }
  }
  const out: Bucket[] = [];
  for (const [k, b] of map) {
    const v =
      aggregate === 'count'
        ? b.n
        : aggregate === 'mean'
          ? b.valued
            ? b.sum / b.valued
            : 0
          : b.sum;
    let d: number | undefined;
    if (b.dN > 0) d = aggregate === 'sum' && b.prev > 0 ? b.cur / b.prev - 1 : b.dSum / b.dN;
    out.push({ key: k, raw: b.raw, value: v, count: b.n, delta: d });
  }
  if (sort === 'desc') out.sort((a, b) => b.value - a.value);
  else if (sort === 'asc') out.sort((a, b) => a.value - b.value);
  return out;
}

/** Orders raw x values: dates and numbers ascending, strings in first-seen order. */
export function orderKeys(values: unknown[]): unknown[] {
  const seen = new Map<string, unknown>();
  for (const v of values) {
    const k = keyOf(v);
    if (!seen.has(k)) seen.set(k, v);
  }
  const list = [...seen.values()];
  const comparable = list.map(toComparable);
  if (comparable.every((c) => typeof c === 'number')) {
    return list
      .map((v, i) => [v, comparable[i] as number] as const)
      .sort((a, b) => a[1] - b[1])
      .map((p) => p[0]);
  }
  return list;
}

/** "Channel" → "channels", "Category" → "categories", "Box" → "boxes". For default captions. */
export function pluralLabel(label: string, n: number): string {
  const word = label.toLowerCase();
  if (n === 1) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Whether a selection predicate on `field` currently includes `raw`. */
export function predicateHas(
  predicate: { op: string; value: unknown } | undefined,
  raw: unknown,
): boolean {
  if (!predicate) return false;
  const k = keyOf(raw);
  if (predicate.op === 'in') return (predicate.value as unknown[]).some((v) => keyOf(v) === k);
  if (predicate.op === 'eq') return keyOf(predicate.value) === k;
  return false;
}
