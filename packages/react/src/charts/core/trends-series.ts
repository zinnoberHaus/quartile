import { finiteNumber } from '../../data/number';
import { toComparable } from '../../data/schema';
import type { FieldDef, Row } from '../../data/types';
import { seriesColor } from './scales';
import { keyOf } from './trends-aggregate';

export interface XSeries {
  key: string;
  label: string;
  color: string;
  field: FieldDef;
  /** One value per x index; null where the series has no row. Rows sharing an x are summed. */
  values: (number | null)[];
}

/**
 * Pivots rows into series over a shared, sorted x domain: one series per `y` field, or one per
 * value of `color` when a single measure is split by a category. Rows that share an x (and
 * series) are summed, so raw rows work without pre-aggregation.
 */
export function pivotSeries(
  rows: readonly Row[],
  {
    x,
    yFields,
    color,
    sortX = true,
    colors,
    formatGroup,
  }: {
    x: string;
    yFields: FieldDef[];
    color?: string;
    formatGroup?: (value: unknown) => string;
    /** Sort x ascending (dates, numbers). Strings keep first-seen order either way. */
    sortX?: boolean;
    /** Explicit colors, by series index or by series key. */
    colors?: string[] | Record<string, string>;
  },
): { xsRaw: unknown[]; series: XSeries[] } {
  const xsRaw: unknown[] = [];
  const indexOf = new Map<string, number>();
  for (const r of rows) {
    const k = keyOf(r[x]);
    if (!indexOf.has(k)) {
      indexOf.set(k, xsRaw.length);
      xsRaw.push(r[x]);
    }
  }
  if (sortX) {
    const comps = xsRaw.map(toComparable);
    if (comps.every((c) => typeof c === 'number')) {
      const order = xsRaw
        .map((_, i) => i)
        .sort((a, b) => (comps[a] as number) - (comps[b] as number));
      const sorted = order.map((i) => xsRaw[i]);
      xsRaw.length = 0;
      xsRaw.push(...sorted);
      indexOf.clear();
      sorted.forEach((v, i) => {
        indexOf.set(keyOf(v), i);
      });
    }
  }
  const blank = () => xsRaw.map(() => null as number | null);
  const add = (values: (number | null)[], i: number, v: unknown) => {
    const n = finiteNumber(v);
    if (n == null) return;
    values[i] = (values[i] ?? 0) + n;
  };
  const colorFor = (key: string, i: number) => {
    if (Array.isArray(colors)) return colors[i] ?? seriesColor(i);
    return colors?.[key] ?? seriesColor(i);
  };
  const series: XSeries[] = [];
  if (color && yFields.length === 1) {
    const groups = new Map<string, { label: string; values: (number | null)[] }>();
    for (const r of rows) {
      const g = String(r[color] ?? '');
      let s = groups.get(g);
      if (!s) {
        s = { label: formatGroup ? formatGroup(r[color]) : g, values: blank() };
        groups.set(g, s);
      }
      add(s.values, indexOf.get(keyOf(r[x]))!, r[yFields[0].name]);
    }
    let i = 0;
    for (const [g, s] of groups) {
      series.push({
        key: g,
        label: s.label,
        color: colorFor(g, i++),
        field: yFields[0],
        values: s.values,
      });
    }
  } else {
    yFields.forEach((f, i) => {
      const values = blank();
      for (const r of rows) add(values, indexOf.get(keyOf(r[x]))!, r[f.name]);
      series.push({ key: f.name, label: f.label, color: colorFor(f.name, i), field: f, values });
    });
  }
  return { xsRaw, series };
}

/** Diverging stacks: positive and negative values accumulate on separate sides of zero. */
export function stackSeries(
  series: { values: (number | null)[] }[],
): { y0: number[]; y1: number[] }[] {
  const n = series[0]?.values.length ?? 0;
  const positive = new Array<number>(n).fill(0);
  const negative = new Array<number>(n).fill(0);
  return series.map((s) => {
    const y0: number[] = [];
    const y1: number[] = [];
    for (let i = 0; i < n; i++) {
      const value = s.values[i] ?? 0;
      const base = value < 0 ? negative : positive;
      y0.push(base[i]);
      base[i] += value;
      y1.push(base[i]);
    }
    return { y0, y1 };
  });
}

/** Net totals are separate from the outer edges of diverging stacks. */
export function seriesTotals(series: { values: (number | null)[] }[]): number[] {
  return (series[0]?.values ?? []).map((_, i) =>
    series.reduce((total, s) => total + (s.values[i] ?? 0), 0),
  );
}
