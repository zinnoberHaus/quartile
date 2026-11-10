/**
 * Presentation settings shared by the charts: margins, axis bounds and ticks, gridlines, legend
 * placement and reference lines. Every setting is a number, a boolean or one of a few words, so
 * the same values can be written as React props, in a JSON spec or in a Markdown block. With no
 * setting, each helper returns exactly what the chart drew before the setting existed.
 */
import { max, min } from 'd3-array';
import { type ScaleContinuousNumeric, scaleLog } from 'd3-scale';
import { warnOnce } from './colors';
import { valueScale } from './scales';

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Space around the plot in px: every side, `[top, right, bottom, left]`, or named sides. */
export type ChartMargin = number | readonly number[] | Partial<Sides>;

/** `true` and `false` switch the chart's own gridlines; the words choose a direction. */
export type GridSetting = boolean | 'x' | 'y' | 'both' | 'none';

export type LegendSide = 'top' | 'bottom' | 'left' | 'right';

/** `true` keeps the chart's usual place, `false` and `none` hide the legend. */
export type LegendSetting = boolean | LegendSide | 'none';

export interface ReferenceLine {
  /** Where the rule sits on the value axis. */
  value: number;
  /** Text drawn beside the rule and read out with the chart's summary. */
  label?: string;
}

/** One value, one labelled rule, or several. */
export type ReferenceSetting = number | ReferenceLine | readonly ReferenceLine[];

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const MAX_MARGIN = 400;

function px(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_MARGIN, value))
    : undefined;
}

/**
 * The sides a `margin` setting names. Sides it leaves out stay undefined, so each chart keeps the
 * margin it computes from its own axis labels: `margin={{ left: 64 }}` moves one edge only.
 */
export function marginSides(margin: ChartMargin | undefined): Partial<Sides> {
  if (margin == null) return {};
  if (typeof margin === 'number') {
    const all = px(margin);
    return all === undefined ? {} : { top: all, right: all, bottom: all, left: all };
  }
  const out: Partial<Sides> = {};
  if (Array.isArray(margin)) {
    SIDES.forEach((side, i) => {
      const v = px(margin[i]);
      if (v !== undefined) out[side] = v;
    });
    return out;
  }
  if (typeof margin === 'object') {
    for (const side of SIDES) {
      const v = px((margin as Partial<Sides>)[side]);
      if (v !== undefined) out[side] = v;
    }
  }
  return out;
}

/**
 * Which gridlines to draw. `y` lines are horizontal (one per y tick), `x` lines vertical. With no
 * setting a chart keeps its own default; `true` asks for the lines of its value axis.
 */
export function gridLines(
  grid: GridSetting | undefined,
  fallback: { x: boolean; y: boolean },
  valueAxis: 'x' | 'y' = 'y',
): { x: boolean; y: boolean } {
  if (grid === undefined) return fallback;
  if (grid === false || grid === 'none') return { x: false, y: false };
  if (grid === 'both') return { x: true, y: true };
  if (grid === 'x') return { x: true, y: false };
  if (grid === 'y') return { x: false, y: true };
  return { x: valueAxis === 'x', y: valueAxis === 'y' };
}

/** Where the legend goes, or null for none. `auto` is the chart's rule for showing one unasked. */
export function legendPlacement(
  legend: LegendSetting | undefined,
  auto: boolean,
  usual: LegendSide,
): LegendSide | null {
  if (legend === undefined) return auto ? usual : null;
  if (legend === false || legend === 'none') return null;
  if (legend === true) return usual;
  return legend === 'top' || legend === 'bottom' || legend === 'left' || legend === 'right'
    ? legend
    : usual;
}

/**
 * Width in px for a legend drawn beside the plot, from its longest entry (the label plus any
 * trailing value). Capped at 40% of the chart; longer names are cut with an ellipsis.
 */
export function sideLegendWidth(entries: readonly string[], width: number): number {
  const longest = entries.reduce((n, entry) => Math.max(n, entry.length), 0);
  return Math.round(Math.max(56, Math.min(width * 0.4, longest * 7 + 28)));
}

/** A reference setting as a list. Entries without a finite value are dropped. */
export function referenceLines(reference: ReferenceSetting | undefined): ReferenceLine[] {
  if (reference == null) return [];
  const list: unknown[] = Array.isArray(reference) ? reference : [reference];
  const out: ReferenceLine[] = [];
  for (const item of list) {
    if (typeof item === 'number') {
      if (Number.isFinite(item)) out.push({ value: item });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const { value, label } = item as { value?: unknown; label?: unknown };
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out.push(typeof label === 'string' && label.trim() ? { value, label } : { value });
  }
  return out;
}

/** "Reference line Target at $1,000,000." for the chart's accessible summary. */
export function describeReferences(
  lines: readonly ReferenceLine[],
  format: (value: unknown) => string,
): string {
  return lines
    .map((line) =>
      line.label
        ? `Reference line ${line.label} at ${format(line.value)}.`
        : `Reference line at ${format(line.value)}.`,
    )
    .join(' ');
}

/** An approximate tick count: a whole number from 0 to 20, or `fallback` with no setting. */
export function tickCount(setting: number | undefined, fallback: number): number {
  if (typeof setting !== 'number' || !Number.isFinite(setting)) return fallback;
  return Math.max(0, Math.min(20, Math.round(setting)));
}

export interface ValueAxisOptions {
  /** Start at zero (the default) or at the smallest value. */
  zero?: boolean;
  /** Approximate tick count. Default 4. */
  ticks?: number;
  /** Explicit lower and upper bounds. */
  min?: number;
  max?: number;
  /** Ask for a logarithmic scale; granted only when every value is above zero. */
  log?: boolean;
  /**
   * The marks measure length from zero (bars, stacked areas). Bounds that would cut the baseline
   * or a mark are refused: a shortened bar no longer shows its value.
   */
  anchored?: boolean;
  /** Chart name for the console message when a bound is refused. */
  chart?: string;
}

export interface ValueAxis {
  scale: ScaleContinuousNumeric<number, number>;
  ticks: number[];
  /** True when the scale is logarithmic. */
  log: boolean;
  /** Why a requested scale was not used; shown under the chart and read out with the summary. */
  note?: string;
  /** Some values fall outside the bounds, so marks must be clipped to the plot. */
  clipped: boolean;
  /** The bounds in effect when the author set one, for the accessible summary. */
  bounds?: [number, number];
}

const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** `log` spaces equal ratios evenly; it needs every value above zero. */
export type ValueScaleType = 'linear' | 'log';

export const LOG_NEEDS_POSITIVE =
  'A log scale needs values above zero, so this chart uses a linear scale.';

/** Why a log scale cannot show these values, or undefined when it can. */
export function logScaleProblem(values: readonly number[]): string | undefined {
  const data = values.filter(Number.isFinite);
  return data.length > 0 && data.every((v) => v > 0) ? undefined : LOG_NEEDS_POSITIVE;
}

/** A number setting kept inside its bounds; undefined for anything that is not a number. */
export function boundedNumber(value: unknown, lower: number, upper: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(lower, Math.min(upper, value))
    : undefined;
}

/** At most `count` or so log ticks: powers of ten, then 2s and 5s when a decade or less is shown. */
export function logTicks(scale: ScaleContinuousNumeric<number, number>, count: number): number[] {
  const all = scale.ticks(count);
  if (all.length <= Math.max(count + 2, 6)) return all;
  const mantissa = (v: number) => Math.round((v / 10 ** Math.floor(Math.log10(v))) * 1e6) / 1e6;
  const decades = all.filter((v) => mantissa(v) === 1);
  if (decades.length >= 2) return decades;
  return all.filter((v) => [1, 2, 5].includes(mantissa(v)));
}

/**
 * The value scale for a chart: zero-based and niced by default, with optional bounds, tick count
 * and log scale. Without options it is `valueScale(values, range)` with four ticks.
 */
export function valueAxis(
  values: number[],
  range: [number, number],
  options: ValueAxisOptions = {},
): ValueAxis {
  const count = options.ticks ?? 4;
  const data = values.filter(Number.isFinite);
  const lo = min(data) ?? 0;
  const hi = max(data) ?? 1;
  let note: string | undefined;

  let lower = finite(options.min) ? options.min : undefined;
  let upper = finite(options.max) ? options.max : undefined;
  if (options.anchored) {
    const name = options.chart ?? 'This chart';
    if (lower !== undefined && lower > Math.min(0, lo)) {
      warnOnce(
        `${name} ignored yMin ${lower}: its marks are measured from zero, and a cut axis would misstate them. Use a line chart to zoom in on a range.`,
      );
      lower = undefined;
    }
    if (upper !== undefined && upper < Math.max(0, hi)) {
      warnOnce(`${name} ignored yMax ${upper}: it would cut marks that reach ${hi}.`);
      upper = undefined;
    }
  }

  if (options.log) {
    const floor = lower !== undefined && lower > 0 ? lower : lo;
    if (data.length > 0 && lo > 0 && floor > 0) {
      const ceiling = upper !== undefined && upper > floor ? upper : hi;
      const scale = scaleLog()
        .domain([floor, ceiling === floor ? floor * 10 : ceiling])
        .range(range);
      if (lower === undefined || upper === undefined) {
        const [d0, d1] = scale.nice().domain();
        scale.domain([lower ?? d0, upper !== undefined && upper > floor ? upper : d1]);
      }
      const [d0, d1] = scale.domain();
      return {
        scale,
        ticks: logTicks(scale, count),
        log: true,
        clipped: lo < d0 || hi > d1,
        bounds: lower !== undefined || upper !== undefined ? [d0, d1] : undefined,
      };
    }
    note = LOG_NEEDS_POSITIVE;
  }

  const scale = valueScale(
    data.length ? data : [0],
    range,
    options.ticks === undefined && options.zero === undefined
      ? undefined
      : { zero: options.zero ?? true, ticks: count || 1 },
  );
  if (lower !== undefined || upper !== undefined) {
    const [d0, d1] = scale.domain();
    const next: [number, number] = [lower ?? d0, upper ?? d1];
    // Bounds that leave no extent are ignored rather than drawing a collapsed axis.
    if (next[0] < next[1]) scale.domain(next);
    else lower = upper = undefined;
  }
  const [d0, d1] = scale.domain();
  return {
    scale,
    ticks: count === 0 ? [] : scale.ticks(count),
    log: false,
    note,
    clipped: lo < d0 || hi > d1,
    bounds: lower !== undefined || upper !== undefined ? [d0, d1] : undefined,
  };
}

/**
 * How a summary reads out a bound or a rule: in the field's full format, like the other values
 * of the summary, except that a fraction keeps the digits the axis shows. A rule at 4.5 on a
 * count is then read as 4.5, not rounded to the field's whole numbers.
 */
export function readOut(
  full: (value: unknown) => string,
  axis: (value: unknown) => string,
): (value: unknown) => string {
  return (value) => (typeof value === 'number' && !Number.isInteger(value) ? axis : full)(value);
}

/** "The y axis starts at 50." for the accessible summary, when the author set a bound. */
export function describeLimits(
  lower: number | undefined,
  upper: number | undefined,
  format: (value: unknown) => string,
  axis = 'The y axis',
): string {
  if (finite(lower) && finite(upper)) {
    return `${axis} runs from ${format(lower)} to ${format(upper)}.`;
  }
  if (finite(lower)) return `${axis} starts at ${format(lower)}.`;
  if (finite(upper)) return `${axis} ends at ${format(upper)}.`;
  return '';
}

/**
 * Applies `xMin` / `xMax` to a numeric x scale. Returns true when a value now falls outside the
 * axis, so the caller clips its marks to the plot. Time scales keep the extent of their data.
 */
export function boundX(
  scale: { domain(): number[]; domain(domain: number[]): unknown },
  values: readonly number[],
  lower: number | undefined,
  upper: number | undefined,
): boolean {
  if (!finite(lower) && !finite(upper)) return false;
  const [d0, d1] = scale.domain();
  const next = [finite(lower) ? lower : d0, finite(upper) ? upper : d1];
  if (!(next[0] < next[1])) return false;
  scale.domain(next);
  return values.some((v) => v < next[0] || v > next[1]);
}

/** A label count from a tick setting: 0 for none, otherwise at least two (first and last). */
export function labelCount(setting: number | undefined, fallback: number): number {
  if (setting === undefined) return fallback;
  const n = tickCount(setting, fallback);
  return n === 0 ? 0 : Math.max(2, n);
}

/**
 * Spreads label positions that sit closer than `gap`, top to bottom, then pulls the run back
 * inside [`lo`, `hi`]. Enough to keep a handful of line-end labels from printing over each other.
 */
export function spreadLabels(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  const out = [...ys];
  let previous = Number.NEGATIVE_INFINITY;
  for (const i of order) {
    out[i] = Math.max(Math.max(out[i], lo), previous + gap);
    previous = out[i];
  }
  let next = Number.POSITIVE_INFINITY;
  for (const i of [...order].reverse()) {
    out[i] = Math.min(Math.min(out[i], hi), next - gap);
    next = out[i];
  }
  return out;
}

/**
 * The presentation settings charts share. Each chart picks the ones it draws; all of them are
 * plain values, so a JSON spec or a Markdown block can carry them.
 */
export interface ChartPresentationProps {
  /**
   * Space around the plot in px: one number for every side, `[top, right, bottom, left]`, or
   * `{ left: 64 }` for named sides. Sides left out keep the room the chart computes for its
   * axis labels.
   */
  margin?: ChartMargin;
  /** Lower bound of the y axis. Line and scatter marks outside the bounds are clipped. */
  yMin?: number;
  /** Upper bound of the y axis. */
  yMax?: number;
  /** Lower bound of a numeric x axis. */
  xMin?: number;
  /** Upper bound of a numeric x axis. */
  xMax?: number;
  /** Approximate number of y ticks; the scale rounds to tidy values. 0 draws none. */
  yTicks?: number;
  /** Approximate number of x ticks or labels. 0 draws none. */
  xTicks?: number;
  /**
   * Gridlines: `false` or `"none"` for none, `"x"` for vertical lines at the x ticks, `"y"` for
   * horizontal lines at the y ticks, `"both"`. `true` draws the lines of the value axis.
   */
  grid?: GridSetting;
  /** `false` hides the x axis labels and gives their room to the plot. */
  xAxis?: boolean;
  /** `false` hides the y axis labels and gives their room to the plot. */
  yAxis?: boolean;
  /** Writes values on the marks, in the field's format. */
  labels?: boolean;
  /**
   * A rule at a value on the value axis: a number, `{ value, label }`, or several. The text is
   * drawn beside the rule and included in the chart's accessible summary.
   */
  reference?: ReferenceSetting;
}
