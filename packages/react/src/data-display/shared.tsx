import { curveMonotoneX, area as d3area, line as d3line } from 'd3-shape';
import { useMemo } from 'react';
import { type DeltaKind, deltaTone, formatDelta } from '../data/format';
import { finiteNumber } from '../data/number';
import { toComparable } from '../data/schema';
import type { Row } from '../data/types';
import { cx } from '../lib/cx';

/** How rows are combined into one number. */
export type AggregateName = 'sum' | 'count' | 'mean' | 'min' | 'max';

export const AGGREGATES: readonly AggregateName[] = ['sum', 'count', 'mean', 'min', 'max'];

/**
 * Combines `field` across rows. `count` counts rows (or rows where `field` is present);
 * `mean`, `min` and `max` of no values return NaN, which formatters render as "—".
 * `sum` of no rows is zero; rows containing only missing measures remain missing.
 */
export function aggregateRows(
  rows: readonly Row[],
  field: string | undefined,
  how: AggregateName = 'sum',
): number {
  if (how === 'count') {
    return field ? rows.filter((r) => r[field] != null && r[field] !== '').length : rows.length;
  }
  if (!field) return Number.NaN;
  let sum = 0;
  let n = 0;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const v = finiteNumber(r[field]);
    if (v == null) continue;
    sum += v;
    n++;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  switch (how) {
    case 'sum':
      return n || rows.length === 0 ? sum : Number.NaN;
    case 'mean':
      return n ? sum / n : Number.NaN;
    case 'min':
      return n ? lo : Number.NaN;
    case 'max':
      return n ? hi : Number.NaN;
  }
}

/** Stable map key for a raw value: dates and ISO strings by time, the rest by string. */
export function valueKey(v: unknown): string {
  const c = toComparable(v);
  return c == null ? '' : `${typeof c}:${String(c)}`;
}

/**
 * Aggregates `field` per distinct value of `by`, ordered by `by` ascending: the series a KPI or
 * table cell draws as a sparkline.
 */
export function seriesBy(
  rows: readonly Row[],
  by: string,
  field: string | undefined,
  how: AggregateName = 'sum',
  domain?: unknown[],
): number[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = valueKey(r[by]);
    let g = groups.get(k);
    if (!g) {
      g = [];
      groups.set(k, g);
    }
    g.push(r);
  }
  const keys = domain ? domain.map(valueKey) : sortedKeys(rows.map((r) => r[by]));
  return keys.map((k) => {
    const g = groups.get(k);
    if (!g) return how === 'sum' || how === 'count' ? 0 : Number.NaN;
    return aggregateRows(g, field, how);
  });
}

/** Distinct values in ascending order (numbers and dates by value, strings alphabetically). */
export function distinctSorted(values: readonly unknown[]): unknown[] {
  const seen = new Map<string, unknown>();
  for (const v of values) {
    if (v == null || v === '') continue;
    const k = valueKey(v);
    if (!seen.has(k)) seen.set(k, v);
  }
  return [...seen.values()].sort(compareValues);
}

function sortedKeys(values: readonly unknown[]): string[] {
  return distinctSorted(values).map(valueKey);
}

/** Ascending comparison with nulls last; numbers, dates and strings compare naturally. */
export function compareValues(a: unknown, b: unknown): number {
  const av = toComparable(a);
  const bv = toComparable(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true });
}

/** Line and area paths for a sparkline in a `width` × `height` box, with 2px vertical padding. */
export function sparkPaths(values: readonly number[], width: number, height: number) {
  const pts = values
    .map((v, i) => [i, v] as [number, number])
    .filter(([, v]) => Number.isFinite(v));
  if (pts.length === 0) return { line: '', area: '' };
  const n = Math.max(1, values.length - 1);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const [, v] of pts) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const pad = 2;
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / n) * width);
  const y = (v: number) =>
    hi === lo ? height / 2 : pad + (1 - (v - lo) / span) * (height - pad * 2);
  const line =
    d3line<[number, number]>()
      .x((d) => x(d[0]))
      .y((d) => y(d[1]))
      .curve(curveMonotoneX)(pts) ?? '';
  const area =
    d3area<[number, number]>()
      .x((d) => x(d[0]))
      .y0(height)
      .y1((d) => y(d[1]))
      .curve(curveMonotoneX)(pts) ?? '';
  return { line, area };
}

/** A tiny inline trend line; inherits `color`. Decorative unless `label` is given. */
export function TrendLine({
  values,
  width = 100,
  height = 28,
  area = false,
  label,
  className,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  area?: boolean;
  label?: string;
  className?: string;
}) {
  const paths = useMemo(() => sparkPaths(values, width, height), [values, width, height]);
  return (
    <svg
      className={cx('q-dd-trend', className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {area && <path className="q-dd-trend-area" d={paths.area} />}
      <path className="q-dd-trend-line" d={paths.line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A signed change in a tinted pill: green when good, red when bad (flipped by `invert`). */
export function DeltaPill({
  value,
  kind = 'percent',
  invert = false,
  digits,
  className,
}: {
  value: number | null | undefined;
  kind?: DeltaKind;
  invert?: boolean;
  digits?: number;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const text = formatDelta(value, kind, digits);
  const shown = Number(text.replace(/[^\d.]/g, ''));
  return (
    <span
      className={cx('q-dd-delta', className)}
      data-tone={shown ? deltaTone(value, invert) : 'neutral'}
    >
      {text}
    </span>
  );
}

/** Semantic tones shared by badge and status cells. */
export type Tone = 'neutral' | 'signal' | 'positive' | 'warning' | 'negative';
