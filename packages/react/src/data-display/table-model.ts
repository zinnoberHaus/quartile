import type { Row } from '../data/types';
import {
  type AggregateName,
  aggregateRows,
  compareValues,
  distinctSorted,
  seriesBy,
  valueKey,
} from './shared';

export type CellKind = 'text' | 'number' | 'bar' | 'sparkline' | 'delta' | 'badge' | 'status';

/** The parts of a column the row model needs. */
export interface ModelColumn {
  field: string;
  key?: string;
  cell?: CellKind | ((...args: never[]) => unknown);
  aggregate?: AggregateName;
  over?: string;
}

export function columnKey(c: { key?: string; field: string }): string {
  return c.key ?? c.field;
}

export interface SortState {
  key: string;
  desc: boolean;
}

/** "-revenue" → { key: "revenue", desc: true }; "name" → ascending. */
export function parseSort(sort: string | null | undefined): SortState | null {
  if (!sort) return null;
  const desc = sort.startsWith('-');
  const key = sort.replace(/^[-+]/, '');
  return key ? { key, desc } : null;
}

export function formatSort(s: SortState | null): string | null {
  return s ? `${s.desc ? '-' : ''}${s.key}` : null;
}

/** Stable sort by one key. Empty values always sort last. */
export function sortRows<R extends Row>(rows: readonly R[], sort: SortState | null): R[] {
  if (!sort) return rows as R[];
  const { key, desc } = sort;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const av = a.r[key];
      const bv = b.r[key];
      const aEmpty = av == null || av === '' || (typeof av === 'number' && Number.isNaN(av));
      const bEmpty = bv == null || bv === '' || (typeof bv === 'number' && Number.isNaN(bv));
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.i - b.i : aEmpty ? 1 : -1;
      const c = compareValues(av, bv);
      return (desc ? -c : c) || a.i - b.i;
    })
    .map((x) => x.r);
}

/**
 * Change from the earlier half of a series to the later half: Σ later / Σ earlier − 1. With an
 * odd length the middle value is left out. NaN when there are fewer than two values or the
 * earlier half sums to zero.
 */
export function halfChange(series: readonly number[]): number {
  const n = series.length;
  if (n < 2) return Number.NaN;
  const h = Math.floor(n / 2);
  let a = 0;
  let b = 0;
  for (let i = 0; i < h; i++) a += Number.isFinite(series[i]) ? series[i] : 0;
  for (let i = n - h; i < n; i++) b += Number.isFinite(series[i]) ? series[i] : 0;
  return a ? b / a - 1 : Number.NaN;
}

/**
 * One row per distinct `groupBy` value, in first-seen order. Each column writes its own key:
 * - with `aggregate`, the field combined across the group;
 * - sparkline columns with `over`, the aggregate per distinct `over` value (zero-filled across
 *   every value present in `rows`, in ascending order);
 * - delta columns with `over`, `halfChange` of that series;
 * - otherwise the group's first value.
 * Fields no column writes keep the group's first value (handy for secondary text such as a SKU).
 */
export function groupRows(
  rows: readonly Row[],
  groupBy: string,
  columns: readonly ModelColumn[],
): Row[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = valueKey(r[groupBy]);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const domains = new Map<string, unknown[]>();
  for (const c of columns) {
    if (c.over && !domains.has(c.over)) {
      domains.set(c.over, distinctSorted(rows.map((r) => r[c.over as string])));
    }
  }
  const out: Row[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const row: Row = { ...first };
    for (const c of columns) {
      const key = columnKey(c);
      const kind = typeof c.cell === 'string' ? c.cell : undefined;
      if (c.over && (kind === 'sparkline' || kind === 'delta')) {
        const series = seriesBy(g, c.over, c.field, c.aggregate ?? 'sum', domains.get(c.over));
        row[key] = kind === 'sparkline' ? series : halfChange(series);
      } else if (c.aggregate) {
        row[key] = aggregateRows(g, c.field, c.aggregate);
      } else {
        row[key] = first[c.field];
      }
    }
    out.push(row);
  }
  return out;
}
