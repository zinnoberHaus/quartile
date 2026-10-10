import { bisectCenter } from 'd3-array';
import { area as d3area, line as d3line } from 'd3-shape';
import { type PointerEvent, useId, useMemo, useRef, useState } from 'react';
import { makeFieldFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { summarizeSeries, useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import {
  AxisBottom,
  AxisLeft,
  ChartTooltip,
  GridRows,
  Legend,
  type TooltipRow,
} from './core/guides';
import {
  type Curve,
  continuousX,
  curveFactory,
  monoTextWidth,
  spacedIndices,
  tickFormatter,
  valueScale,
} from './core/scales';
import { isKeyboardFocus } from './core/trends-focus';
import { seriesFormatters } from './core/trends-format';
import { pivotSeries, seriesTotals, stackSeries } from './core/trends-series';

export interface AreaChartProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows to plot, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Field for the horizontal axis. Dates and numbers are placed on a continuous scale. */
  x: keyof R & string;
  /** One or more measures. Pass an array for multiple series. */
  y: (keyof R & string) | (keyof R & string)[];
  /** Splits rows into series by a categorical field. Rows sharing an x and series are summed. */
  color?: keyof R & string;
  /** Stacks series on top of each other, so the top edge is the total. */
  stack?: boolean;
  /** Interpolation between points. Monotone never overshoots the data. */
  curve?: Curve;
  /** Formats the y axis and tooltip values. Defaults to the field's schema format. */
  format?: Formatter;
  /** Formats the x axis. Defaults to the field's schema format. */
  xFormat?: Formatter;
  /** Shows a legend under the plot that doubles as a series filter. Defaults to true for 2+ series. */
  legend?: boolean;
  /** Series colors, by index or by series key. Defaults to the categorical palette in order. */
  colors?: string[] | Record<string, string>;
  /** Lets readers drag to select a range of x and publishes it to the nearest Selection. */
  brush?: boolean;
  /** Vertical markers with a short label. */
  annotations?: { x: unknown; label: string }[];
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called when a brush or keyboard selection changes. */
  onSelect?: (predicate: Predicate | null) => void;
}

const LEGEND_H = 28;
const MARGIN = { top: 10, right: 10, bottom: 24 };

/** Areas over a continuous x, overlapping with soft gradients or stacked into a total. */
export function AreaChart<R extends Row = Row>(props: AreaChartProps<R>) {
  const {
    data,
    x,
    y,
    color,
    stack = false,
    curve = 'monotone',
    format,
    xFormat,
    legend,
    colors,
    brush = false,
    annotations,
    id,
    selection,
    onSelect,
    height = 240,
    ...frame
  } = props;
  const { locale, timeZone } = useQuartile();
  const source = useSourceId(id);
  const gradientId = useId().replace(/:/g, '');
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const model = useMemo(() => {
    const xField = fieldOf(schema, x, rows);
    const yFields = (Array.isArray(y) ? y : [y]).map((f) => fieldOf(schema, f, rows));
    const { xsRaw, series } = pivotSeries(rows, {
      x,
      yFields,
      color: color,
      colors,
      formatGroup: color
        ? makeFieldFormatter(fieldOf(schema, color, allRows), { locale, timeZone })
        : undefined,
    });
    return { xField, yFields, xsRaw, series };
  }, [rows, schema, x, y, color, colors, allRows, locale, timeZone]);

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
  const fmtXLong = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone, surface: 'tooltip' }, xFormat),
    [xField, xFormat, locale, timeZone],
  );
  const continuous = xField.type === 'temporal' || xField.type === 'quantitative';
  const canBrush = brush && continuous;
  const formats = useMemo(
    () => seriesFormatters(series, { locale, timeZone }, format),
    [series, locale, timeZone, format],
  );
  const shown = series.filter((s) => !hidden.has(s.key));
  // A linked filter may remove every visible group. Keep surviving groups discoverable.
  const visible = shown.length ? shown : series;
  const stacks = stack ? stackSeries(visible) : null;
  const showLegend = legend ?? series.length > 1;
  const plotHeight = showLegend ? height - LEGEND_H : height;

  const brushPredicate = sel?.get(x);
  const ownBrush =
    brushPredicate?.source === source && brushPredicate.op === 'between' ? brushPredicate : null;

  const select = (p: Predicate | null) => {
    if (p) sel?.set(x, p.value as never, { op: p.op, source });
    else sel?.clear(x);
    onSelect?.(p);
  };

  const { active, setActive, keyboardProps } = useChartKeyboard(xsRaw.length, (i) =>
    canBrush
      ? select({ field: x, op: 'between', value: [xsRaw[i] as never, xsRaw[i] as never], source })
      : undefined,
  );
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragStart = useRef<number | null>(null);
  const focusIndex = hover ?? active;

  const summary = useMemo(() => {
    const parts = series.map((s) =>
      summarizeSeries(
        s.label,
        s.values.flatMap((v, i) => (v == null ? [] : [{ x: xsRaw[i], y: v }])),
        fmtX,
        formats.get(s.key)!.value,
        locale,
      ),
    );
    if (stack && series.length > 1) {
      const totals = seriesTotals(series);
      parts.push(
        summarizeSeries(
          'Total',
          totals.map((v, i) => ({ x: xsRaw[i], y: v })),
          fmtX,
          fmtY,
          locale,
        ),
      );
    }
    return parts.join(' ');
  }, [series, xsRaw, fmtX, fmtY, formats, stack, locale]);

  const table = useMemo<ChartTable>(() => {
    const totals = stack && series.length > 1 ? seriesTotals(series) : null;
    return {
      columns: [xField.label, ...series.map((s) => s.label), ...(totals ? ['Total'] : [])],
      rows: xsRaw.map((xv, i) => [
        fmtX(xv),
        ...series.map((s) => formats.get(s.key)!.value(s.values[i])),
        ...(totals ? [fmtY(totals[i])] : []),
      ]),
    };
  }, [series, stack, xField, xsRaw, fmtX, fmtY, formats]);

  return (
    <ChartFrame
      kind={stack ? 'Stacked area chart' : 'Area chart'}
      status={statusOf(frame, xsRaw.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => {
        const tops = stacks
          ? stacks.flatMap((s) => [...s.y0, ...s.y1])
          : visible.flatMap((s) => s.values.filter((v): v is number => v != null));
        const yScale = valueScale(tops.length ? tops : [0], [
          plotHeight - MARGIN.bottom,
          MARGIN.top,
        ]);
        const fmtTick = tickFormatter(valueField, locale, timeZone, format);
        const yTicks = yScale.ticks(4).map((v) => ({ y: yScale(v), label: fmtTick(v) }));
        const left = Math.ceil(Math.max(...yTicks.map((t) => monoTextWidth(t.label)), 16)) + 12;
        const x0 = left;
        const x1 = width - MARGIN.right;
        const xs = continuous ? continuousX(xField, xsRaw, [x0, x1]) : null;
        const px = xsRaw.map((v, i) =>
          xs ? xs.value(v) : x0 + (xsRaw.length > 1 ? (i * (x1 - x0)) / (xsRaw.length - 1) : 0),
        );
        const fmtXTick = tickFormatter(xField, locale, timeZone, xFormat);
        const xTicks = spacedIndices(
          xsRaw.length,
          Math.max(2, Math.min(6, Math.floor((x1 - x0) / 90))),
        ).map((i) => ({ x: px[i], label: fmtXTick(xsRaw[i]) }));
        const baseline = yScale(Math.max(0, yScale.domain()[0]));
        const cf = curveFactory(curve);

        const overlapArea = d3area<[number, number | null]>()
          .defined((d) => d[1] != null)
          .x((d) => d[0])
          .y0(baseline)
          .y1((d) => yScale(d[1] as number))
          .curve(cf);
        const lineGen = d3line<[number, number | null]>()
          .defined((d) => d[1] != null)
          .x((d) => d[0])
          .y((d) => yScale(d[1] as number))
          .curve(cf);
        const bandArea = d3area<[number, number, number]>()
          .x((d) => d[0])
          .y0((d) => yScale(d[1]))
          .y1((d) => yScale(d[2]))
          .curve(cf);

        const indexAt = (clientX: number, rect: DOMRect) =>
          Math.max(0, Math.min(px.length - 1, bisectCenter(px, clientX - rect.left)));
        const clampX = (v: number) => Math.max(x0, Math.min(x1, v));
        const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = indexAt(e.clientX, rect);
          if (i !== hover) setHover(i);
          if (dragStart.current != null)
            setDrag({ a: dragStart.current, b: clampX(e.clientX - rect.left) });
        };
        const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
          if (!canBrush) return;
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStart.current = clampX(e.clientX - rect.left);
          setDrag(null);
        };
        const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
          if (!canBrush || dragStart.current == null) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const a = dragStart.current;
          const b = clampX(e.clientX - rect.left);
          dragStart.current = null;
          setDrag(null);
          if (Math.abs(b - a) < 4) {
            select(null);
            return;
          }
          const i0 = bisectCenter(px, Math.min(a, b));
          const i1 = bisectCenter(px, Math.max(a, b));
          select({
            field: x,
            op: 'between',
            value: [xsRaw[i0] as never, xsRaw[i1] as never],
            source,
          });
        };

        let brushRect: { a: number; b: number } | null = drag;
        if (!brushRect && ownBrush && xs) {
          const [lo, hi] = ownBrush.value;
          brushRect = { a: xs.value(lo), b: xs.value(hi) };
        }

        const tip = focusIndex;
        // Top layer first in the tooltip, matching the visual order of a stack.
        const ordered = stacks ? [...visible].reverse() : visible;
        const tipRows: TooltipRow[] =
          tip == null
            ? []
            : ordered
                .filter((s) => s.values[tip] != null)
                .map((s) => ({
                  label: s.label,
                  value: formats.get(s.key)!.tooltip(s.values[tip]),
                  description: s.field.description,
                  color: series.length > 1 ? s.color : undefined,
                }));
        const tipFooter: TooltipRow | undefined =
          tip != null && stacks && visible.length > 1
            ? { label: 'Total', value: fmtY(seriesTotals(visible)[tip]) }
            : undefined;

        return (
          <>
            <div style={{ position: 'relative', height: plotHeight }}>
              <svg width={width} height={plotHeight} aria-hidden="true">
                {!stacks && (
                  <defs>
                    {visible.map((s, i) => (
                      <linearGradient
                        key={s.key}
                        id={`${gradientId}-${i}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0"
                          style={{
                            stopColor: s.color,
                            stopOpacity: visible.length > 1 ? 0.18 : 0.24,
                          }}
                        />
                        <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0.02 }} />
                      </linearGradient>
                    ))}
                  </defs>
                )}
                <GridRows ys={yTicks.map((t) => t.y)} x0={x0} x1={x1} />
                <AxisLeft ticks={yTicks} x={x0 - 10} />
                <AxisBottom ticks={xTicks} y={plotHeight - MARGIN.bottom + 8} x0={x0} x1={x1} />
                {stacks
                  ? visible.map((s, k) => {
                      const st = stacks[k];
                      const pts = px.map(
                        (p, i) => [p, st.y0[i], st.y1[i]] as [number, number, number],
                      );
                      return (
                        <g key={`s-${s.key}`}>
                          <path
                            className="q-area-band"
                            d={bandArea(pts) ?? ''}
                            style={{ fill: s.color }}
                          />
                          <path
                            className="q-area-edge"
                            d={lineGen(px.map((p, i) => [p, st.y1[i]])) ?? ''}
                          />
                        </g>
                      );
                    })
                  : visible.map((s, i) => {
                      const pts = s.values.map((v, j) => [px[j], v] as [number, number | null]);
                      return (
                        <g key={`o-${s.key}`}>
                          <path
                            d={overlapArea(pts) ?? ''}
                            style={{ fill: `url(#${gradientId}-${i})` }}
                          />
                          <path
                            d={lineGen(pts) ?? ''}
                            fill="none"
                            style={{ stroke: s.color }}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}
                {brushRect && (
                  <rect
                    className="q-chart-brush"
                    x={Math.min(brushRect.a, brushRect.b)}
                    width={Math.max(1, Math.abs(brushRect.b - brushRect.a))}
                    y={MARGIN.top}
                    height={plotHeight - MARGIN.top - MARGIN.bottom}
                  />
                )}
                {annotations?.map((a) => {
                  const ax = xs ? xs.value(a.x) : Number.NaN;
                  if (!(ax >= x0 && ax <= x1)) return null;
                  return (
                    <g key={a.label} className="q-chart-annotation">
                      <line x1={ax} x2={ax} y1={MARGIN.top} y2={plotHeight - MARGIN.bottom} />
                      <text x={ax + 6} y={MARGIN.top + 10}>
                        {a.label}
                      </text>
                    </g>
                  );
                })}
                {tip != null && (
                  <>
                    <line
                      className="q-chart-crosshair"
                      x1={px[tip]}
                      x2={px[tip]}
                      y1={MARGIN.top}
                      y2={plotHeight - MARGIN.bottom}
                    />
                    {visible.map((s, k) => {
                      const v = stacks ? stacks[k].y1[tip] : s.values[tip];
                      if (v == null || (stacks && s.values[tip] == null)) return null;
                      return (
                        <circle
                          key={`h-${s.key}`}
                          className="q-chart-dot-active"
                          cx={px[tip]}
                          cy={yScale(v)}
                          r={4.5}
                          style={{ fill: s.color }}
                        />
                      );
                    })}
                  </>
                )}
              </svg>
              <div
                className="q-chart-plot"
                style={{ cursor: canBrush ? 'crosshair' : 'default' }}
                aria-label={`${frame['aria-label'] ?? (stack ? 'Stacked area chart' : 'Area chart')}. Use arrow keys to move between points${canBrush ? ', Enter to select' : ''}.`}
                role="application"
                {...keyboardProps}
                onKeyDown={(event) => {
                  setHover(null);
                  keyboardProps.onKeyDown(event);
                }}
                onFocus={(e) => {
                  if (isKeyboardFocus(e.currentTarget)) setActive((a) => a ?? xsRaw.length - 1);
                }}
                onPointerMove={onPointerMove}
                onPointerLeave={() => setHover(null)}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
              />
              {tip != null && tipRows.length > 0 && (
                <ChartTooltip
                  note={frame.tooltipNote}
                  x={px[tip]}
                  width={width}
                  title={fmtXLong(xsRaw[tip])}
                  rows={tipRows}
                  footer={tipFooter}
                />
              )}
              <div className="q-visually-hidden" aria-live="polite">
                {active != null && tipRows.length > 0
                  ? `${fmtXLong(xsRaw[active])}: ${tipRows.map((r) => `${r.label} ${r.value}${r.description ? `. ${r.description}` : ''}`).join(', ')}${tipFooter ? `, total ${tipFooter.value}` : ''}`
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
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}
