import { bisectCenter } from 'd3-array';
import { area as d3area, line as d3line } from 'd3-shape';
import { type PointerEvent, useId, useMemo, useRef, useState } from 'react';
import { formatDelta, makeFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData, toComparable } from '../data/schema';
import type { DataInput, FieldDef, Formatter, Row } from '../data/types';
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
  seriesColor,
  spacedIndices,
  tickFormatter,
  valueScale,
} from './core/scales';

export interface LineChartProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows to plot, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Continuous field for the horizontal axis. Dates are detected from the schema. */
  x: keyof R & string;
  /** One or more measures. Pass an array for multiple series. */
  y: (keyof R & string) | (keyof R & string)[];
  /** Splits rows into series by a categorical field. */
  color?: keyof R & string;
  /** Field holding comparison values, drawn as a dashed series with deltas in the tooltip. */
  compare?: keyof R & string;
  /** Label for the comparison series. */
  compareLabel?: string;
  /** Interpolation between points. Monotone never overshoots the data. */
  curve?: Curve;
  /** Fills below the line with a fading gradient. */
  area?: boolean;
  /** Marks every point, or only the hovered one. */
  points?: boolean | 'hover';
  /** Lets readers select a range and publishes it to the nearest Selection. */
  brush?: boolean;
  /** Formats the y axis and tooltip values. Defaults to the field's schema format. */
  format?: Formatter;
  /** Formats the x axis. Defaults to the field's schema format. */
  xFormat?: Formatter;
  /** Vertical markers with a short label, e.g. a pricing change. */
  annotations?: { x: unknown; label: string }[];
  /** Shows a legend above the plot. Defaults to true when there is more than one series. */
  legend?: boolean;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called when a brush or keyboard selection changes. */
  onSelect?: (predicate: Predicate | null) => void;
}

interface Series {
  key: string;
  label: string;
  color: string;
  field: FieldDef;
  /** y value per x index; null where the series has no row. */
  values: (number | null)[];
  dashed?: boolean;
}

const LEGEND_H = 28;
const MARGIN = { top: 10, right: 10, bottom: 24 };

export function LineChart<R extends Row = Row>(props: LineChartProps<R>) {
  const {
    data,
    x,
    y,
    color,
    compare,
    compareLabel = 'Previous',
    curve = 'monotone',
    area = false,
    points = 'hover',
    brush = false,
    format,
    xFormat,
    annotations,
    legend,
    id,
    selection,
    onSelect,
    height = 240,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const gradientId = useId().replace(/:/g, '');
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const model = useMemo(() => {
    const xField = fieldOf(schema, x, rows);
    const yFields = (Array.isArray(y) ? y : [y]).map((f) => fieldOf(schema, f, rows));
    const sorted = [...rows].sort((a, b) => {
      const av = toComparable(a[x]);
      const bv = toComparable(b[x]);
      return av === bv ? 0 : (av as number) < (bv as number) ? -1 : 1;
    });
    const xsKeys: (number | string)[] = [];
    const xsRaw: unknown[] = [];
    const indexOf = new Map<number | string, number>();
    for (const r of sorted) {
      const k = toComparable(r[x]) as number | string;
      if (!indexOf.has(k)) {
        indexOf.set(k, xsKeys.length);
        xsKeys.push(k);
        xsRaw.push(r[x]);
      }
    }
    const blank = () => xsKeys.map(() => null as number | null);
    const series: Series[] = [];
    if (color && yFields.length === 1) {
      const groups = new Map<string, (number | null)[]>();
      for (const r of sorted) {
        const g = String(r[color]);
        if (!groups.has(g)) groups.set(g, blank());
        groups.get(g)![indexOf.get(toComparable(r[x]) as number | string)!] = Number(
          r[y as string],
        );
      }
      let i = 0;
      for (const [g, values] of groups) {
        series.push({ key: g, label: g, color: seriesColor(i++), field: yFields[0], values });
      }
    } else {
      yFields.forEach((f, i) => {
        const values = blank();
        for (const r of sorted)
          values[indexOf.get(toComparable(r[x]) as number | string)!] = Number(r[f.name]);
        series.push({ key: f.name, label: f.label, color: seriesColor(i), field: f, values });
      });
    }
    let compareSeries: Series | null = null;
    if (compare && series.length === 1) {
      const values = blank();
      for (const r of sorted) {
        const v = r[compare];
        if (v != null) values[indexOf.get(toComparable(r[x]) as number | string)!] = Number(v);
      }
      compareSeries = {
        key: compare,
        label: compareLabel,
        color: 'var(--q-series-muted)',
        field: series[0].field,
        values,
        dashed: true,
      };
    }
    return { xField, yFields, xsRaw, series, compareSeries };
  }, [rows, schema, x, y, color, compare, compareLabel]);

  const { xField, xsRaw, series, compareSeries } = model;
  const valueField = series[0]?.field ?? model.yFields[0];
  const fmtY = useMemo(
    () => makeFormatter(format ?? valueField?.format, { currency: valueField?.currency, locale }),
    [format, valueField, locale],
  );
  const fmtX = useMemo(
    () => makeFormatter(xFormat ?? xField.format, { locale }),
    [xFormat, xField, locale],
  );
  const fmtXLong = useMemo(
    () => (xField.type === 'temporal' && !xFormat ? makeFormatter('weekday', { locale }) : fmtX),
    [xField, xFormat, fmtX, locale],
  );
  const visible = series.filter((s) => !hidden.has(s.key));
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
    brush
      ? select({ field: x, op: 'between', value: [xsRaw[i] as never, xsRaw[i] as never], source })
      : undefined,
  );
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragStart = useRef<number | null>(null);
  const focusIndex = hover ?? active;

  const summary = useMemo(
    () =>
      series
        .map((s) =>
          summarizeSeries(
            s.label,
            s.values.flatMap((v, i) => (v == null ? [] : [{ x: xsRaw[i], y: v }])),
            fmtX,
            fmtY,
          ),
        )
        .join(' '),
    [series, xsRaw, fmtX, fmtY],
  );

  const table = useMemo<ChartTable>(() => {
    const cols = [...series, ...(compareSeries ? [compareSeries] : [])];
    return {
      columns: [xField.label, ...cols.map((s) => s.label)],
      rows: xsRaw.map((xv, i) => [fmtXLong(xv), ...cols.map((s) => fmtY(s.values[i]))]),
    };
  }, [series, compareSeries, xField, xsRaw, fmtXLong, fmtY]);

  return (
    <ChartFrame
      kind="Line chart"
      status={statusOf(frame, xsRaw.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => {
        const all = [...visible, ...(compareSeries ? [compareSeries] : [])].flatMap((s) =>
          s.values.filter((v): v is number => v != null),
        );
        const yScale = valueScale(all.length ? all : [0], [plotHeight - MARGIN.bottom, MARGIN.top]);
        const yTickVals = yScale.ticks(4);
        const fmtTick = tickFormatter(
          { ...valueField, format: format ?? valueField.format },
          locale,
        );
        const yTicks = yTickVals.map((v) => ({ y: yScale(v), label: fmtTick(v) }));
        const left = Math.ceil(Math.max(...yTicks.map((t) => monoTextWidth(t.label)), 16)) + 12;
        const x0 = left;
        const x1 = width - MARGIN.right;
        const xs = continuousX(xField, xsRaw, [x0, x1]);
        const px = xsRaw.map((v) => xs.value(v));
        const fmtXTick = tickFormatter({ ...xField, format: xFormat ?? xField.format }, locale);
        const xTicks = spacedIndices(
          xsRaw.length,
          Math.max(2, Math.min(6, Math.floor((x1 - x0) / 90))),
        ).map((i) => ({
          x: px[i],
          label: fmtXTick(xsRaw[i]),
        }));
        const lineGen = d3line<[number, number | null]>()
          .defined((d) => d[1] != null)
          .x((d) => d[0])
          .y((d) => yScale(d[1] as number))
          .curve(curveFactory(curve));
        const areaGen = d3area<[number, number | null]>()
          .defined((d) => d[1] != null)
          .x((d) => d[0])
          .y0(yScale(Math.max(0, yScale.domain()[0])))
          .y1((d) => yScale(d[1] as number))
          .curve(curveFactory(curve));
        const pathOf = (s: Series, gen: typeof lineGen | typeof areaGen) =>
          gen(s.values.map((v, i) => [px[i], v] as [number, number | null])) ?? '';

        const indexAt = (clientX: number, rect: DOMRect) => {
          const xPos = clientX - rect.left;
          return Math.max(0, Math.min(px.length - 1, bisectCenter(px, xPos)));
        };
        const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = indexAt(e.clientX, rect);
          if (i !== hover) setHover(i);
          if (dragStart.current != null)
            setDrag({ a: dragStart.current, b: Math.max(x0, Math.min(x1, e.clientX - rect.left)) });
        };
        const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
          if (!brush) return;
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStart.current = Math.max(x0, Math.min(x1, e.clientX - rect.left));
          setDrag(null);
        };
        const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
          if (!brush || dragStart.current == null) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const a = dragStart.current;
          const b = Math.max(x0, Math.min(x1, e.clientX - rect.left));
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
        if (!brushRect && ownBrush) {
          const [lo, hi] = ownBrush.value;
          brushRect = { a: xs.value(lo), b: xs.value(hi) };
        }

        const tip = focusIndex != null ? focusIndex : null;
        const tipRows: TooltipRow[] =
          tip == null
            ? []
            : visible
                .filter((s) => s.values[tip] != null)
                .map((s) => ({
                  label: s.label,
                  value: fmtY(s.values[tip]),
                  color: series.length > 1 ? s.color : undefined,
                }));
        let tipFooter: TooltipRow | undefined;
        if (
          tip != null &&
          compareSeries &&
          compareSeries.values[tip] != null &&
          visible[0]?.values[tip] != null
        ) {
          const cur = visible[0].values[tip] as number;
          const prev = compareSeries.values[tip] as number;
          tipRows.push({ label: compareSeries.label, value: fmtY(prev), tone: 'muted' });
          const change = prev ? cur / prev - 1 : 0;
          tipFooter = {
            label: 'Change',
            value: formatDelta(change),
            tone: change >= 0 ? 'positive' : 'negative',
          };
        }

        return (
          <>
            {showLegend && (
              <Legend
                className="q-chart-legend-top"
                items={[
                  ...series.map((s) => {
                    const last = [...s.values].reverse().find((v) => v != null);
                    return {
                      key: s.key,
                      label: s.label,
                      color: s.color,
                      value: last != null ? fmtTick(last) : undefined,
                      inactive: hidden.has(s.key),
                    };
                  }),
                  ...(compareSeries
                    ? [
                        {
                          key: compareSeries.key,
                          label: compareSeries.label,
                          color: compareSeries.color,
                          dashed: true,
                        },
                      ]
                    : []),
                ]}
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
            <div style={{ position: 'relative', height: plotHeight }}>
              <svg width={width} height={plotHeight} aria-hidden="true">
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
                        style={{ stopColor: s.color, stopOpacity: visible.length > 1 ? 0.12 : 0.2 }}
                      />
                      <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
                    </linearGradient>
                  ))}
                </defs>
                <GridRows ys={yTicks.map((t) => t.y)} x0={x0} x1={x1} />
                <AxisLeft ticks={yTicks} x={x0 - 10} />
                <AxisBottom ticks={xTicks} y={plotHeight - MARGIN.bottom + 8} x0={x0} x1={x1} />
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
                  const ax = xs.value(a.x);
                  if (!(ax >= x0 && ax <= x1)) return null;
                  return (
                    <g key={a.label} className="q-chart-annotation">
                      <line x1={ax} x2={ax} y1={MARGIN.top} y2={plotHeight - MARGIN.bottom} />
                      <text
                        x={ax > x0 + (x1 - x0) * 0.6 ? ax - 6 : ax + 6}
                        y={MARGIN.top + 10}
                        textAnchor={ax > x0 + (x1 - x0) * 0.6 ? 'end' : 'start'}
                      >
                        {a.label}
                      </text>
                    </g>
                  );
                })}
                {area &&
                  visible.map((s, i) => (
                    <path
                      key={`a-${s.key}`}
                      d={pathOf(s, areaGen)}
                      style={{ fill: `url(#${gradientId}-${i})` }}
                    />
                  ))}
                {compareSeries && (
                  <path
                    d={pathOf(compareSeries, lineGen)}
                    fill="none"
                    style={{ stroke: compareSeries.color }}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                )}
                {visible.map((s) => (
                  <path
                    key={`l-${s.key}`}
                    d={pathOf(s, lineGen)}
                    fill="none"
                    style={{ stroke: s.color }}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {points === true &&
                  visible.map((s) =>
                    s.values.map((v, i) =>
                      v == null ? null : (
                        <circle
                          key={`${s.key}-${i}`}
                          className="q-chart-dot"
                          cx={px[i]}
                          cy={yScale(v)}
                          r={3.5}
                          style={{ stroke: s.color }}
                        />
                      ),
                    ),
                  )}
                {tip != null && (
                  <>
                    <line
                      className="q-chart-crosshair"
                      x1={px[tip]}
                      x2={px[tip]}
                      y1={MARGIN.top}
                      y2={plotHeight - MARGIN.bottom}
                    />
                    {visible.map((s) =>
                      s.values[tip] == null ? null : (
                        <circle
                          key={`h-${s.key}`}
                          className="q-chart-dot-active"
                          cx={px[tip]}
                          cy={yScale(s.values[tip] as number)}
                          r={5}
                          style={{ fill: s.color }}
                        />
                      ),
                    )}
                  </>
                )}
              </svg>
              <div
                className="q-chart-plot"
                style={{ cursor: brush ? 'crosshair' : 'default' }}
                aria-label={`${frame['aria-label'] ?? 'Line chart'}. Use arrow keys to move between points${brush ? ', Enter to select' : ''}.`}
                role="application"
                {...keyboardProps}
                onFocus={() => setActive((a) => a ?? xsRaw.length - 1)}
                onPointerMove={onPointerMove}
                onPointerLeave={() => setHover(null)}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
              />
              {tip != null && tipRows.length > 0 && (
                <ChartTooltip
                  x={px[tip]}
                  width={width}
                  title={fmtXLong(xsRaw[tip])}
                  rows={tipRows}
                  footer={tipFooter}
                />
              )}
              <div className="q-visually-hidden" aria-live="polite">
                {active != null && tipRows.length > 0
                  ? `${fmtXLong(xsRaw[active])}: ${tipRows.map((r) => `${r.label} ${r.value}`).join(', ')}`
                  : ''}
              </div>
            </div>
          </>
        );
      }}
    </ChartFrame>
  );
}
