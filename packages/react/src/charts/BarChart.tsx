import { scaleBand } from 'd3-scale';
import { type MouseEvent, useMemo, useState } from 'react';
import { makeFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import {
  AxisBottom,
  AxisLeft,
  ChartTooltip,
  GridRows,
  Legend,
  type TooltipRow,
} from './core/guides';
import { bandScale, monoTextWidth, spacedIndices, tickFormatter, valueScale } from './core/scales';
import type { SortOrder } from './core/trends-aggregate';
import { isKeyboardFocus } from './core/trends-focus';
import { useToggleSelect } from './core/trends-select';
import { pivotSeries, stackSeries } from './core/trends-series';

export interface BarChartProps<R extends Row = Row> extends ChartBaseProps {
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
  /** Series colors, by index or by group value. Defaults to the categorical palette in order. */
  colors?: string[] | Record<string, string>;
  /** Shows a legend under the plot that doubles as a group filter. Defaults to true for 2+ groups. */
  legend?: boolean;
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
    id,
    selection,
    onSelect,
    height = 240,
    ...frame
  } = props;
  const split = group ?? color;
  const horizontal = orientation === 'horizontal';
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const model = useMemo(() => {
    const xField = fieldOf(schema, x, rows);
    const yFields = (Array.isArray(y) ? y : [y]).map((f) => fieldOf(schema, f, rows));
    const pivot = pivotSeries(rows, { x, yFields, color: split, colors });
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
  }, [rows, schema, x, y, split, colors, sort]);

  const { xField, xsRaw, series } = model;
  const valueField = series[0]?.field ?? model.yFields[0];
  const fmtY = useMemo(
    () => makeFormatter(format ?? valueField?.format, { currency: valueField?.currency, locale }),
    [format, valueField, locale],
  );
  const fmtX = useMemo(
    () => makeFormatter(xFormat ?? xField.format, { locale }),
    [xFormat, xField, locale],
  );
  const visible = series.filter((s) => !hidden.has(s.key));
  const showLegend = legend ?? series.length > 1;
  const plotHeight = showLegend ? height - LEGEND_H : height;

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
    let hi = 0;
    let lo = 0;
    totals.forEach((t, i) => {
      if (t > totals[hi]) hi = i;
      if (t < totals[lo]) lo = i;
    });
    const groups =
      series.length > 1
        ? ` across ${series.length} groups (${series.map((s) => s.label).join(', ')})`
        : '';
    return `${xsRaw.length} bars${groups}. Highest ${fmtX(xsRaw[hi])} at ${fmtY(totals[hi])}; lowest ${fmtX(xsRaw[lo])} at ${fmtY(totals[lo])}.`;
  }, [xsRaw, series, totals, fmtX, fmtY]);

  const table = useMemo<ChartTable>(() => {
    const withTotal = stack && series.length > 1;
    return {
      columns: [xField.label, ...series.map((s) => s.label), ...(withTotal ? ['Total'] : [])],
      rows: xsRaw.map((xv, i) => [
        fmtX(xv),
        ...series.map((s) => fmtY(s.values[i])),
        ...(withTotal ? [fmtY(totals[i])] : []),
      ]),
    };
  }, [series, stack, xField, xsRaw, totals, fmtX, fmtY]);

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
      {({ width }) => {
        const stacks = stack ? stackSeries(visible) : null;
        const values = stacks
          ? stacks.flatMap((s) => [...s.y0, ...s.y1])
          : visible.flatMap((s) => s.values.filter((v): v is number => v != null));
        const fmtTick = tickFormatter(
          { ...valueField, format: format ?? valueField.format },
          locale,
        );
        const groupKeys = visible.map((s) => s.key);
        const grouped = !stacks && visible.length > 1;

        // Geometry: `cat` is the category axis, `val` the value axis, in px.
        let catRange: [number, number];
        let valRange: [number, number];
        let labelW = 0;
        const vMargin = { top: 10, bottom: 24 };
        if (horizontal) {
          const labels = xsRaw.map((v) => fmtX(v));
          labelW = Math.min(
            width * 0.4,
            Math.ceil(Math.max(...labels.map((l) => l.length * 6.6), 24)) + 12,
          );
          const valueLabelW =
            Math.ceil(
              Math.max(
                ...(stacks ? stacks.at(-1)!.y1 : values).map((v) => monoTextWidth(fmtTick(v))),
                16,
              ),
            ) + 10;
          catRange = [4, plotHeight - 4];
          valRange = [labelW, Math.max(labelW + 10, width - valueLabelW)];
        } else {
          catRange = [0, width];
          valRange = [plotHeight - vMargin.bottom, vMargin.top];
        }
        const vScale = valueScale(values.length ? values : [0], valRange);
        const yTickVals = vScale.ticks(4);
        const left = horizontal
          ? 0
          : Math.ceil(Math.max(...yTickVals.map((v) => monoTextWidth(fmtTick(v))), 16)) + 12;
        if (!horizontal) catRange = [left, width - 4];
        const band = bandScale(
          xsRaw.map((_, i) => String(i)),
          catRange,
          grouped ? 0.3 : 0.28,
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
            // Only the outermost segment of a stack gets rounded corners.
            const outer = !stacks || k === visible.length - 1;
            const r = outer ? 2 : 0;
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
              Math.max(
                2,
                Math.floor(
                  (catRange[1] - catRange[0]) /
                    (Math.max(...xsRaw.map((v) => monoTextWidth(fmtX(v)))) + 12),
                ),
              ),
            );

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
                  value: fmtY(s.values[tip]),
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
                    ? stacks.at(-1)!.y1[tip]
                    : Math.max(0, ...visible.map((s) => s.values[tip] ?? 0)),
                )
              : (band(String(tip)) ?? 0) + band.bandwidth() / 2;
        const tipTop =
          tip == null || !horizontal
            ? 6
            : Math.max(0, Math.min(plotHeight - 80, (band(String(tip)) ?? 0) - 8));
        const hl = tip != null ? band(String(tip)) : undefined;

        return (
          <>
            <div style={{ position: 'relative', height: plotHeight }}>
              <svg width={width} height={plotHeight} aria-hidden="true">
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
                    <GridRows ys={yTickVals.map((v) => vScale(v))} x0={left} x1={catRange[1]} />
                    <AxisLeft
                      ticks={yTickVals.map((v) => ({ y: vScale(v), label: fmtTick(v) }))}
                      x={left - 10}
                    />
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
                {horizontal ? (
                  <g className="q-bar-labels">
                    {xsRaw.map((v, i) => {
                      const cy = (band(String(i)) ?? 0) + band.bandwidth() / 2;
                      const total = stacks
                        ? stacks.at(-1)!.y1[i]
                        : Math.max(...visible.map((s) => s.values[i] ?? 0));
                      return (
                        <g key={i} data-dim={!isSelected(i) || undefined}>
                          <text className="q-bar-category" x={0} y={cy} dy="0.32em">
                            {fmtX(v)}
                          </text>
                          {(stacks || visible.length === 1) && (
                            <text className="q-bar-value" x={vScale(total) + 6} y={cy} dy="0.32em">
                              {fmtTick(total)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                ) : (
                  <AxisBottom
                    ticks={catTickIdx.map((i) => ({
                      x: (band(String(i)) ?? 0) + band.bandwidth() / 2,
                      label: fmtX(xsRaw[i]),
                    }))}
                    y={plotHeight - vMargin.bottom + 8}
                    x0={-Infinity}
                    x1={Infinity}
                  />
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
                  x={tipX}
                  width={width}
                  top={tipTop}
                  title={fmtX(xsRaw[tip])}
                  rows={tipRows}
                  footer={tipFooter}
                />
              )}
              <div className="q-visually-hidden" aria-live="polite">
                {active != null && tipRows.length > 0
                  ? `${fmtX(xsRaw[active])}: ${tipRows.map((r) => `${r.label} ${r.value}`).join(', ')}${select && picker.has(xsRaw[active]) ? ', selected' : ''}`
                  : ''}
              </div>
            </div>
            {showLegend && (
              <Legend
                className="q-trends-legend"
                items={series.map((s) => ({
                  key: s.key,
                  label: s.label,
                  color: s.color,
                  inactive: hidden.has(s.key),
                }))}
                onToggle={
                  series.length > 1
                    ? (key) =>
                        setHidden((h) => {
                          const n = new Set(h);
                          if (n.has(key)) n.delete(key);
                          else if (n.size < series.length - 1) n.add(key);
                          return n;
                        })
                    : undefined
                }
              />
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}
