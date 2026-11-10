import { scaleBand } from 'd3-scale';
import { type MouseEvent, useMemo, useRef, useState } from 'react';
import { makeFieldFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { type ChartColor, seriesColors } from './core/colors';
import { useCssNumber } from './core/css-number';
import {
  AxisBottom,
  AxisLeft,
  ChartTooltip,
  GridRows,
  Legend,
  LegendLayout,
  ReferenceRules,
  type TooltipRow,
} from './core/guides';
import {
  boundedNumber,
  type ChartPresentationProps,
  describeReferences,
  gridLines,
  type LegendSetting,
  labelCount,
  legendPlacement,
  marginSides,
  readOut,
  referenceLines,
  sideLegendWidth,
  tickCount,
  valueAxis,
} from './core/options';
import { bandScale, monoTextWidth, spacedIndices, tickFormatter } from './core/scales';
import { useSettled } from './core/settled';
import type { SortOrder } from './core/trends-aggregate';
import { isKeyboardFocus } from './core/trends-focus';
import { seriesFormatters } from './core/trends-format';
import { useToggleSelect } from './core/trends-select';
import { pivotSeries, stackSeries } from './core/trends-series';

export interface BarChartProps<R extends Row = Row>
  extends ChartBaseProps,
    Pick<ChartPresentationProps, 'margin' | 'yTicks' | 'xTicks' | 'xAxis' | 'yAxis' | 'reference'> {
  /** Rows to plot, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Category or date field, one bar (or group of bars) per value. */
  x: keyof R & string;
  /** One or more measures. Rows that share an x (and group) are summed. */
  y: (keyof R & string) | (keyof R & string)[];
  /** Splits each bar into one bar per value of this field (grouped, or stacked with `stack`). */
  group?: keyof R & string;
  /** Alias of `group`, matching the other charts. */
  color?: keyof R & string;
  /** Stacks groups into one bar per x instead of placing them side by side. */
  stack?: boolean;
  /** Vertical columns (default) or horizontal bars with direct value labels. */
  orientation?: 'vertical' | 'horizontal';
  /** Orders categories by total value. Dates and numbers always keep their natural order. */
  sort?: SortOrder;
  /** Clicking a bar (or Enter on the focused bar) toggles its x value in the nearest Selection. */
  select?: boolean;
  /** Formats the value axis, labels and tooltip. Defaults to the field's schema format. */
  format?: Formatter;
  /** Formats the category labels. Defaults to the field's schema format. */
  xFormat?: Formatter;
  /**
   * Series colors, by index or by group value: palette names, 1–8 or any CSS color. Defaults to
   * the categorical palette in order.
   */
  colors?: ChartColor[] | Record<string, ChartColor>;
  /**
   * Shows a legend under the plot, or on the side named, that doubles as a group filter.
   * Defaults to true for 2+ groups.
   */
  legend?: LegendSetting;
  /**
   * Bounds of the value axis. Bars are measured from zero, so a bound that would cut the baseline
   * or a bar is ignored with a console warning; bounds may only add room.
   */
  yMin?: number;
  yMax?: number;
  /** Horizontal gridlines behind vertical bars. `false` or `"none"` removes them. */
  grid?: ChartPresentationProps['grid'];
  /**
   * Writes each bar's value at its end, or the total on a stack. Horizontal bars with one series
   * or a stack show them unless this is `false`.
   */
  labels?: boolean;
  /** Corner radius of the bar ends in px. Defaults to the `--q-chart-bar-radius` token (2). */
  radius?: number;
  /** Gap between bars as a share of each band, 0 (touching) to 0.9. Defaults to 0.28. */
  padding?: number;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called after a click or keyboard toggle with the new predicate for `x` (or null). */
  onSelect?: (predicate: Predicate | null) => void;
}

const LEGEND_H = 28;

/** Top (vertical) or right (horizontal) corners rounded by r; the baseline end stays square. */
function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
  negative: boolean,
): string {
  if (w <= 0 || h <= 0) return '';
  const rr = Math.max(0, Math.min(r, horizontal ? h / 2 : w / 2, horizontal ? w : h));
  if (!horizontal) {
    if (negative)
      return `M${x},${y}h${w}v${h - rr}q0,${rr} ${-rr},${rr}h${-(w - 2 * rr)}q${-rr},0 ${-rr},${-rr}z`;
    return `M${x},${y + h}v${-(h - rr)}q0,${-rr} ${rr},${-rr}h${w - 2 * rr}q${rr},0 ${rr},${rr}v${h - rr}z`;
  }
  if (negative)
    return `M${x + w},${y}h${-(w - rr)}q${-rr},0 ${-rr},${rr}v${h - 2 * rr}q0,${rr} ${rr},${rr}h${w - rr}z`;
  return `M${x},${y}h${w - rr}q${rr},0 ${rr},${rr}v${h - 2 * rr}q0,${rr} ${-rr},${rr}h${-(w - rr)}z`;
}

/** Columns or horizontal bars over categories or dates, grouped or stacked, with click-to-select. */
export function BarChart<R extends Row = Row>(props: BarChartProps<R>) {
  const {
    data,
    x,
    y,
    group,
    color,
    stack = false,
    orientation = 'vertical',
    sort = 'none',
    select = false,
    format,
    xFormat,
    colors,
    legend,
    labels: valueLabels,
    radius,
    padding,
    margin,
    yMin,
    yMax,
    yTicks: yTickCount,
    xTicks: xTickCount,
    grid,
    xAxis = true,
    yAxis = true,
    reference,
    id,
    selection,
    onSelect,
    height = 240,
    ...frame
  } = props;
  const split = group ?? color;
  const horizontal = orientation === 'horizontal';
  const { locale, timeZone, theme } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // The path of a bar carries its corner radius, so the token is read rather than applied by CSS.
  const plotRef = useRef<HTMLDivElement>(null);
  const tokenRadius = useCssNumber(plotRef, '--q-chart-bar-radius', 2, theme);
  const cornerRadius = boundedNumber(radius, 0, 40) ?? tokenRadius;
  const bandPadding = boundedNumber(padding, 0, 0.9);
  const colorList = useSettled(colors);
  const palette = useMemo(() => seriesColors(colorList), [colorList]);
  const referenceList = useSettled(reference);
  const refs = useMemo(() => referenceLines(referenceList), [referenceList]);

  const model = useMemo(() => {
    const xField = fieldOf(schema, x, rows);
    const yFields = (Array.isArray(y) ? y : [y]).map((f) => fieldOf(schema, f, rows));
    const pivot = pivotSeries(rows, {
      x,
      yFields,
      color: split,
      colors: palette,
      formatGroup: split
        ? makeFieldFormatter(fieldOf(schema, split, allRows), { locale, timeZone })
        : undefined,
    });
    let order = pivot.xsRaw.map((_, i) => i);
    const ordinal = xField.type === 'temporal' || xField.type === 'quantitative';
    if (sort !== 'none' && !ordinal) {
      const totals = order.map((i) => pivot.series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0));
      order = order.sort((a, b) =>
        sort === 'desc' ? totals[b] - totals[a] : totals[a] - totals[b],
      );
    }
    const xsRaw = order.map((i) => pivot.xsRaw[i]);
    const series = pivot.series.map((s) => ({ ...s, values: order.map((i) => s.values[i]) }));
    return { xField, yFields, xsRaw, series };
  }, [rows, schema, x, y, split, palette, sort, allRows, locale, timeZone]);

  const { xField, xsRaw, series } = model;
  const valueField = series[0]?.field ?? model.yFields[0];
  const fmtY = useMemo(
    () => makeFieldFormatter(valueField, { locale, timeZone }, format),
    [format, valueField, locale, timeZone],
  );
  const fmtX = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone }, xFormat),
    [xFormat, xField, locale, timeZone],
  );
  const fmtXTip = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone, surface: 'tooltip' }, xFormat),
    [xField, locale, timeZone, xFormat],
  );
  const fmtXTick = useMemo(
    () => tickFormatter(xField, locale, timeZone, xFormat),
    [xField, locale, timeZone, xFormat],
  );
  const formats = useMemo(
    () => seriesFormatters(series, { locale, timeZone }, format),
    [series, locale, timeZone, format],
  );
  const shown = series.filter((s) => !hidden.has(s.key));
  // A linked filter may remove every visible group. Keep surviving groups discoverable.
  const visible = shown.length ? shown : series;
  const side = legendPlacement(legend, series.length > 1, 'bottom');
  const plotHeight = side === 'top' || side === 'bottom' ? height - LEGEND_H : height;

  const picker = useToggleSelect(sel, x, source, onSelect);
  const { selecting } = picker;
  const isSelected = (i: number) => !selecting || picker.has(xsRaw[i]);
  const toggle = (i: number) => {
    if (select) picker.toggle(xsRaw[i]);
  };

  const { active, setActive, keyboardProps } = useChartKeyboard(xsRaw.length, toggle);
  const [hover, setHover] = useState<number | null>(null);
  const focusIndex = hover ?? active;

  const totals = useMemo(
    () => xsRaw.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0)),
    [xsRaw, series],
  );
  const summary = useMemo(() => {
    if (xsRaw.length === 0) return '';
    const bars = series
      .map((s) => {
        const observed = s.values.flatMap((value, i) => (value == null ? [] : [{ value, i }]));
        if (!observed.length) return `${s.label}: no data.`;
        const hi = observed.reduce((a, b) => (a.value > b.value ? a : b));
        const lo = observed.reduce((a, b) => (a.value < b.value ? a : b));
        const fmt = formats.get(s.key)!.value;
        return `${series.length > 1 ? `${s.label}: ` : ''}${xsRaw.length} bars. Highest ${fmtX(xsRaw[hi.i])} at ${fmt(hi.value)}; lowest ${fmtX(xsRaw[lo.i])} at ${fmt(lo.value)}.`;
      })
      .join(' ');
    const fmtAxis = readOut(fmtY, formats.get(series[0]?.key)?.axis ?? fmtY);
    return [bars, describeReferences(refs, fmtAxis)].filter(Boolean).join(' ');
  }, [xsRaw, series, fmtX, fmtY, formats, refs]);

  const table = useMemo<ChartTable>(() => {
    const withTotal = stack && series.length > 1;
    return {
      columns: [xField.label, ...series.map((s) => s.label), ...(withTotal ? ['Total'] : [])],
      rows: xsRaw.map((xv, i) => [
        fmtX(xv),
        ...series.map((s) => formats.get(s.key)!.value(s.values[i])),
        ...(withTotal ? [fmtY(totals[i])] : []),
      ]),
    };
  }, [series, stack, xField, xsRaw, totals, fmtX, fmtY, formats]);

  const kind = horizontal ? 'Bar chart' : 'Column chart';

  return (
    <ChartFrame
      kind={kind}
      status={statusOf(frame, xsRaw.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width: frameWidth }) => {
        const beside = side === 'left' || side === 'right';
        const legendWidth = beside
          ? sideLegendWidth(
              series.map((s) => s.label),
              frameWidth,
            )
          : 0;
        const width = beside ? Math.max(1, frameWidth - legendWidth - 12) : frameWidth;
        const pad = marginSides(margin);
        const stacks = stack ? stackSeries(visible) : null;
        const values = stacks
          ? stacks.flatMap((s) => [...s.y0, ...s.y1])
          : visible.flatMap((s) => s.values.filter((v): v is number => v != null));
        const fmtTick = tickFormatter(valueField, locale, timeZone, format);
        const groupKeys = visible.map((s) => s.key);
        const grouped = !stacks && visible.length > 1;

        // Geometry: `cat` is the category axis, `val` the value axis, in px.
        let catRange: [number, number];
        let valRange: [number, number];
        let labelW = 0;
        // Value labels above vertical bars need a line of room over the tallest one.
        const vMargin = {
          top: pad.top ?? (valueLabels && !horizontal ? 18 : 10),
          bottom: pad.bottom ?? (xAxis ? 24 : 8),
        };
        if (horizontal) {
          const labels = xsRaw.map((v) => fmtXTick(v));
          labelW =
            pad.left ??
            (xAxis
              ? Math.min(
                  width * 0.4,
                  Math.ceil(Math.max(...labels.map((l) => l.length * 6.6), 24)) + 12,
                )
              : 0);
          const valueLabelW =
            pad.right ??
            (valueLabels === false
              ? 8
              : Math.ceil(Math.max(...values.map((v) => monoTextWidth(fmtTick(v))), 16)) + 10);
          // A reference rule's text sits in a band above the first bar.
          catRange = [pad.top ?? (refs.length ? 18 : 4), plotHeight - (pad.bottom ?? 4)];
          valRange = [labelW, Math.max(labelW + 10, width - valueLabelW)];
        } else {
          catRange = [0, width];
          valRange = [plotHeight - vMargin.bottom, vMargin.top];
        }
        const axis = valueAxis([...values, ...refs.map((r) => r.value)], valRange, {
          ticks: yTickCount === undefined ? undefined : tickCount(yTickCount, 4),
          min: yMin,
          max: yMax,
          anchored: true,
          chart: 'BarChart',
        });
        const vScale = axis.scale;
        const yTickVals = axis.ticks;
        const left = horizontal
          ? 0
          : (pad.left ??
            (yAxis
              ? Math.ceil(Math.max(...yTickVals.map((v) => monoTextWidth(fmtTick(v))), 16)) + 12
              : 4));
        if (!horizontal) catRange = [left, width - (pad.right ?? 4)];
        const band = bandScale(
          xsRaw.map((_, i) => String(i)),
          catRange,
          bandPadding ?? (grouped ? 0.3 : 0.28),
        );
        const inner = scaleBand<string>()
          .domain(groupKeys)
          .range([0, band.bandwidth()])
          .paddingInner(grouped ? 0.14 : 0);
        const zero = vScale(Math.max(vScale.domain()[0], Math.min(0, vScale.domain()[1])));
        const bw = grouped ? inner.bandwidth() : band.bandwidth();

        type Bar = { key: string; i: number; d: string; color: string };
        const bars: Bar[] = [];
        visible.forEach((s, k) => {
          xsRaw.forEach((_, i) => {
            const raw = s.values[i];
            if (raw == null) return;
            const c0 = (band(String(i)) ?? 0) + (grouped ? (inner(s.key) ?? 0) : 0);
            const v0 = stacks ? stacks[k].y0[i] : 0;
            const v1 = stacks ? stacks[k].y1[i] : raw;
            const a = vScale(v0);
            const b = vScale(v1);
            const negative = v1 < v0;
            // Each side of a diverging stack has its own outermost segment.
            const outer =
              !stacks ||
              !visible.slice(k + 1).some((next) => {
                const value = next.values[i] ?? 0;
                return value !== 0 && value < 0 === negative;
              });
            const r = outer ? cornerRadius : 0;
            const d = horizontal
              ? barPath(Math.min(a, b), c0, Math.abs(b - a), bw, r, true, negative)
              : barPath(c0, Math.min(a, b), bw, Math.abs(b - a), r, false, negative);
            if (d) bars.push({ key: `${s.key}-${i}`, i, d, color: s.color });
          });
        });

        const catTickIdx = horizontal
          ? xsRaw.map((_, i) => i)
          : spacedIndices(
              xsRaw.length,
              labelCount(
                xTickCount,
                Math.max(
                  2,
                  Math.floor(
                    (catRange[1] - catRange[0]) /
                      (Math.max(...xsRaw.map((v) => monoTextWidth(fmtXTick(v)))) + 12),
                  ),
                ),
              ),
            );
        const lines = gridLines(grid, { x: false, y: true });

        // Direct labels: one per bar, or the total on a stack. A label wider than its slot is
        // left out rather than printed over its neighbor.
        type ValueLabel = { key: string; i: number; x: number; y: number; text: string };
        const valueTexts: ValueLabel[] = [];
        const perBar = valueLabels === true && (!horizontal || grouped);
        if (perBar && stacks && !horizontal) {
          xsRaw.forEach((_, i) => {
            const text = fmtTick(visible.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
            if (monoTextWidth(text) > band.step() + 2) return;
            valueTexts.push({
              key: `t-${i}`,
              i,
              x: (band(String(i)) ?? 0) + band.bandwidth() / 2,
              y: vScale(Math.max(0, ...stacks.map((st) => st.y1[i]))) - 5,
              text,
            });
          });
        } else if (perBar) {
          const slot = grouped ? inner.step() : band.step();
          visible.forEach((s) => {
            xsRaw.forEach((_, i) => {
              const raw = s.values[i];
              if (raw == null) return;
              const text = formats.get(s.key)!.axis(raw);
              const c0 = (band(String(i)) ?? 0) + (grouped ? (inner(s.key) ?? 0) : 0);
              if (horizontal) {
                valueTexts.push({
                  key: `${s.key}-${i}`,
                  i,
                  x: vScale(Math.max(0, raw)) + 6,
                  y: c0 + bw / 2,
                  text,
                });
                return;
              }
              if (monoTextWidth(text) > slot + 2) return;
              valueTexts.push({
                key: `${s.key}-${i}`,
                i,
                x: c0 + bw / 2,
                y: raw < 0 ? vScale(raw) + 13 : vScale(raw) - 5,
                text,
              });
            });
          });
        }

        const indexAt = (e: MouseEvent<HTMLDivElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = horizontal ? e.clientY - rect.top : e.clientX - rect.left;
          const step = band.step();
          const start = (band(String(0)) ?? 0) - (step - band.bandwidth()) / 2;
          const i = Math.floor((pos - start) / step);
          return i >= 0 && i < xsRaw.length ? i : null;
        };

        const tip = focusIndex;
        const tipRows: TooltipRow[] =
          tip == null
            ? []
            : (stacks ? [...visible].reverse() : visible)
                .filter((s) => s.values[tip] != null)
                .map((s) => ({
                  label: s.label,
                  value: formats.get(s.key)!.tooltip(s.values[tip]),
                  description: s.field.description,
                  color: series.length > 1 ? s.color : undefined,
                }));
        const tipFooter: TooltipRow | undefined =
          tip != null && stacks && visible.length > 1
            ? {
                label: 'Total',
                value: fmtY(visible.reduce((s, ser) => s + (ser.values[tip] ?? 0), 0)),
              }
            : undefined;
        const tipX =
          tip == null
            ? 0
            : horizontal
              ? vScale(
                  stacks
                    ? Math.max(0, ...stacks.map((s) => s.y1[tip]))
                    : Math.max(0, ...visible.map((s) => s.values[tip] ?? 0)),
                )
              : (band(String(tip)) ?? 0) + band.bandwidth() / 2;
        const tipTop =
          tip == null || !horizontal
            ? 6
            : Math.max(0, Math.min(plotHeight - 80, (band(String(tip)) ?? 0) - 8));
        const hl = tip != null ? band(String(tip)) : undefined;

        return (
          <LegendLayout
            side={side}
            legend={
              <Legend
                className="q-trends-legend"
                position={typeof legend === 'string' && side ? side : undefined}
                style={beside ? { width: legendWidth } : undefined}
                items={series.map((s) => ({
                  key: s.key,
                  label: s.label,
                  color: s.color,
                  inactive: shown.length > 0 && hidden.has(s.key),
                }))}
                onToggle={
                  series.length > 1
                    ? (key) =>
                        setHidden((h) => {
                          const n = new Set(
                            shown.length
                              ? series.filter((s) => h.has(s.key)).map((s) => s.key)
                              : [],
                          );
                          if (n.has(key)) n.delete(key);
                          else if (n.size < series.length - 1) n.add(key);
                          return n;
                        })
                    : undefined
                }
              />
            }
          >
            <div
              ref={plotRef}
              style={
                beside
                  ? { position: 'relative', height: plotHeight, width, flex: 'none' }
                  : { position: 'relative', height: plotHeight }
              }
            >
              <svg
                width={width}
                height={plotHeight}
                viewBox={`0 0 ${width} ${plotHeight}`}
                aria-hidden="true"
              >
                {horizontal ? (
                  <g className="q-chart-grid">
                    <line
                      x1={Math.round(zero) + 0.5}
                      x2={Math.round(zero) + 0.5}
                      y1={catRange[0]}
                      y2={catRange[1]}
                    />
                  </g>
                ) : (
                  <>
                    {lines.y && (
                      <GridRows ys={yTickVals.map((v) => vScale(v))} x0={left} x1={catRange[1]} />
                    )}
                    {yAxis && (
                      <AxisLeft
                        ticks={yTickVals.map((v) => ({ y: vScale(v), label: fmtTick(v) }))}
                        x={left - 10}
                      />
                    )}
                  </>
                )}
                {hl != null && (
                  <rect
                    className="q-bar-hover"
                    x={horizontal ? 0 : hl - (band.step() - band.bandwidth()) / 4}
                    y={horizontal ? hl - (band.step() - band.bandwidth()) / 4 : vMargin.top}
                    width={
                      horizontal ? width : band.bandwidth() + (band.step() - band.bandwidth()) / 2
                    }
                    height={
                      horizontal
                        ? band.bandwidth() + (band.step() - band.bandwidth()) / 2
                        : plotHeight - vMargin.top - vMargin.bottom
                    }
                    rx={4}
                  />
                )}
                <g className="q-bar-marks">
                  {bars.map((b) => (
                    <path
                      key={b.key}
                      d={b.d}
                      data-dim={!isSelected(b.i) || undefined}
                      style={{ fill: b.color }}
                    />
                  ))}
                </g>
                {refs.length > 0 && (
                  <ReferenceRules
                    marks={refs.map((r) => ({
                      at: vScale(r.value),
                      text: r.label ?? fmtTick(r.value),
                    }))}
                    vertical={horizontal}
                    from={horizontal ? catRange[0] - 14 : left}
                    to={catRange[1]}
                    min={horizontal ? valRange[0] : vMargin.top}
                    max={horizontal ? valRange[1] : plotHeight - vMargin.bottom}
                  />
                )}
                {horizontal ? (
                  <g className="q-bar-labels">
                    {xsRaw.map((v, i) => {
                      const cy = (band(String(i)) ?? 0) + band.bandwidth() / 2;
                      const total = stacks
                        ? visible.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)
                        : Math.max(...visible.map((s) => s.values[i] ?? 0));
                      const labelAt = stacks
                        ? Math.max(0, ...stacks.map((s) => s.y1[i]))
                        : Math.max(0, total);
                      return (
                        <g key={i} data-dim={!isSelected(i) || undefined}>
                          {xAxis && (
                            <text className="q-bar-category" x={0} y={cy} dy="0.32em">
                              {fmtXTick(v)}
                            </text>
                          )}
                          {valueLabels !== false &&
                            visible.length > 0 &&
                            (stacks || visible.length === 1) && (
                              <text
                                className="q-bar-value"
                                x={vScale(labelAt) + 6}
                                y={cy}
                                dy="0.32em"
                              >
                                {fmtTick(total)}
                              </text>
                            )}
                        </g>
                      );
                    })}
                  </g>
                ) : (
                  xAxis && (
                    <AxisBottom
                      ticks={catTickIdx.map((i) => ({
                        x: (band(String(i)) ?? 0) + band.bandwidth() / 2,
                        label: fmtXTick(xsRaw[i]),
                      }))}
                      y={plotHeight - vMargin.bottom + 8}
                      x0={-Infinity}
                      x1={Infinity}
                    />
                  )
                )}
                {valueTexts.length > 0 && (
                  <g className="q-chart-value-labels">
                    {valueTexts.map((t) => (
                      <text
                        key={t.key}
                        x={t.x}
                        y={t.y}
                        dy={horizontal ? '0.32em' : undefined}
                        textAnchor={horizontal ? 'start' : 'middle'}
                        data-dim={!isSelected(t.i) || undefined}
                      >
                        {t.text}
                      </text>
                    ))}
                  </g>
                )}
                {!horizontal && (
                  <line
                    className="q-chart-baseline"
                    x1={left}
                    x2={catRange[1]}
                    y1={Math.round(zero) + 0.5}
                    y2={Math.round(zero) + 0.5}
                  />
                )}
              </svg>
              <div
                className="q-chart-plot"
                style={{ cursor: select ? 'pointer' : 'default' }}
                aria-label={`${frame['aria-label'] ?? kind}. Use arrow keys to move between bars${select ? ', Enter to select' : ''}.`}
                role="application"
                {...keyboardProps}
                onKeyDown={(event) => {
                  setHover(null);
                  keyboardProps.onKeyDown(event);
                }}
                onFocus={(e) => {
                  if (isKeyboardFocus(e.currentTarget)) setActive((a) => a ?? 0);
                }}
                onPointerMove={(e) => {
                  const i = indexAt(e);
                  if (i !== hover) setHover(i);
                }}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => {
                  const i = indexAt(e);
                  if (i != null) toggle(i);
                }}
              />
              {tip != null && tipRows.length > 0 && (
                <ChartTooltip
                  note={frame.tooltipNote}
                  x={tipX}
                  width={width}
                  top={tipTop}
                  title={fmtXTip(xsRaw[tip])}
                  rows={tipRows}
                  footer={tipFooter}
                />
              )}
              <div className="q-visually-hidden" aria-live="polite">
                {active != null && tipRows.length > 0
                  ? `${fmtXTip(xsRaw[active])}: ${tipRows.map((r) => `${r.label} ${r.value}${r.description ? `. ${r.description}` : ''}`).join(', ')}${select && picker.has(xsRaw[active]) ? ', selected' : ''}`
                  : ''}
              </div>
            </div>
          </LegendLayout>
        );
      }}
    </ChartFrame>
  );
}
