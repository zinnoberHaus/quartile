import { extent, max, min } from 'd3-array';
import {
  type ScaleBand,
  type ScaleLinear,
  type ScaleTime,
  scaleBand,
  scaleLinear,
  scaleTime,
} from 'd3-scale';
import { curveLinear, curveMonotoneX, curveStepAfter } from 'd3-shape';
import { makeFormatter } from '../../data/format';
import { toDate } from '../../data/schema';
import type { FieldDef } from '../../data/types';

export type Curve = 'linear' | 'monotone' | 'step';

export function curveFactory(curve: Curve = 'monotone') {
  return curve === 'linear' ? curveLinear : curve === 'step' ? curveStepAfter : curveMonotoneX;
}

/** Categorical series color by index: var(--q-cat-1 … 8), wrapping past eight. */
export function seriesColor(i: number): string {
  return `var(--q-cat-${(i % 8) + 1})`;
}

/** Sequential ramp step 0…7 for a value in [0, 1]. */
export function seqColor(t: number): string {
  const i = Math.max(0, Math.min(7, Math.round(t * 7)));
  return `var(--q-seq-${i})`;
}

/** A value scale that starts at zero (or below, for negatives) with ~8% headroom, niced. */
export function valueScale(
  values: number[],
  range: [number, number],
  { zero = true, ticks = 4 } = {},
) {
  const lo = min(values) ?? 0;
  const hi = max(values) ?? 1;
  const d0 = zero ? Math.min(0, lo) : lo;
  const d1 = hi === d0 ? d0 + 1 : hi + (hi - d0) * 0.08;
  return scaleLinear().domain([d0, d1]).range(range).nice(ticks);
}

export function timeScale(dates: Date[], range: [number, number]): ScaleTime<number, number> {
  const [a, b] = extent(dates, (d) => d.getTime());
  return scaleTime()
    .domain([new Date(a ?? 0), new Date(b ?? 1)])
    .range(range);
}

export function bandScale(
  keys: string[],
  range: [number, number],
  padding = 0.28,
): ScaleBand<string> {
  return scaleBand<string>()
    .domain(keys)
    .range(range)
    .paddingInner(padding)
    .paddingOuter(padding / 2);
}

export type XScale =
  | { kind: 'time'; scale: ScaleTime<number, number>; value: (v: unknown) => number }
  | { kind: 'linear'; scale: ScaleLinear<number, number>; value: (v: unknown) => number };

/** Picks a continuous x scale from the field type. */
export function continuousX(field: FieldDef, values: unknown[], range: [number, number]): XScale {
  if (field.type === 'temporal') {
    const s = timeScale(values.map(toDate), range);
    return { kind: 'time', scale: s, value: (v) => s(toDate(v)) };
  }
  const nums = values.map(Number);
  const s = scaleLinear()
    .domain([min(nums) ?? 0, max(nums) ?? 1])
    .range(range);
  return { kind: 'linear', scale: s, value: (v) => s(Number(v)) };
}

/** Axis tick formatter for a field: short numbers, short dates. */
export function tickFormatter(field: FieldDef, locale?: string) {
  return makeFormatter(field.format, { short: true, currency: field.currency, locale });
}

/** Evenly spaced indices for at most `count` labels, always including first and last. */
export function spacedIndices(n: number, count: number): number[] {
  if (n <= 0) return [];
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < count; k++) out.push(Math.round((k * (n - 1)) / (count - 1)));
  return [...new Set(out)];
}

/** Approximate rendered width of mono 11px text, for margin sizing without measuring. */
export function monoTextWidth(s: string, px = 11): number {
  return s.length * px * 0.6;
}
