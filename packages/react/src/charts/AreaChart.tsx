import { bisectCenter } from 'd3-array';
import { area as d3area, line as d3line } from 'd3-shape';
import { type PointerEvent, useId, useMemo, useState } from 'react';
import { makeFieldFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { summarizeSeries, useChartKeyboard } from './core/a11y';
import { useRangeBrush } from './core/brush';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { type ChartColor, seriesColors } from './core/colors';
import {
  AxisBottom,
  AxisLeft,
  ChartNote,
  ChartTooltip,
  EndLabels,
  GridColumns,
  GridRows,
  Legend,
  LegendLayout,
  ReferenceRules,
  type TooltipRow,
} from './core/guides';
import {
  boundedNumber,
  boundX,
  type ChartPresentationProps,
  describeLimits,
  describeReferences,
  gridLines,
  type LegendSetting,
  labelCount,
  legendPlacement,
  logScaleProblem,
  marginSides,
  readOut,
  referenceLines,
  sideLegendWidth,
  spreadLabels,
  tickCount,
  type ValueScaleType,
  valueAxis,
} from './core/options';
import {
  type Curve,
  continuousX,
  curveFactory,
  monoTextWidth,
  spacedIndices,
  tickFormatter,
} from './core/scales';
import { useSettled } from './core/settled';
import { isKeyboardFocus } from './core/trends-focus';
import { seriesFormatters } from './core/trends-format';
import { pivotSeries, seriesTotals, stackSeries } from './core/trends-series';

export interface AreaChartProps<R extends Row = Row>
  extends ChartBaseProps,
    Pick<
      ChartPresentationProps,
      | 'margin'
      | 'yMin'
      | 'yMax'
      | 'xMin'
      | 'xMax'
      | 'yTicks'
      | 'xTicks'
      | 'grid'
      | 'xAxis'
      | 'yAxis'
      | 'reference'
    > {
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
  /**
   * Shows a legend under the plot, or on the side named, that doubles as a series filter.
   * Defaults to true for 2+ series.
   */
  legend?: LegendSetting;
  /** Series colors, by index or by series key. Defaults to the categorical palette in order. */
  colors?: ChartColor[] | Record<string, ChartColor>;
  /** Writes each series' name and last value at the end of its line. */
  labels?: boolean;
  /**
   * `log` spaces equal ratios evenly, for overlapping areas whose values are all above zero.
   * Stacked areas are measured from zero and stay linear; either way the chart says so.
   */
  yScale?: ValueScaleType;
  /** Width in px of the line on top of each overlapping area. Defaults to the `--q-chart-stroke-width` token (2). */
  strokeWidth?: number;
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
    labels = false,
    yScale: scaleType = 'linear',
    strokeWidth,
    margin,
    yMin,
    yMax,
    xMin,
    xMax,
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
  const { locale, timeZone } = useQuartile();
  const source = useSourceId(id);
  const gradientId = useId().replace(/:/g, '');
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const colorList = useSettled(colors);
  const palette = useMemo(() => seriesColors(colorList), [colorList]);
  const referenceList = useSettled(reference);
  const refs = useMemo(() => referenceLines(referenceList), [referenceList]);

  const model = useMemo(() => {
    const xField = fieldOf(schema, x, rows);
    const yFields = (Array.isArray(y) ? y : [y]).map((f) => fieldOf(schema, f, rows));
    const { xsRaw, series } = pivotSeries(rows, {
      x,
      yFields,
      color: color,
      colors: palette,
      formatGroup: color
        ? makeFieldFormatter(fieldOf(schema, color, allRows), { locale, timeZone })
        : undefined,
    });
    return { xField, yFields, xsRaw, series };
  }, [rows, schema, x, y, color, palette, allRows, locale, timeZone]);

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
  const lineWidth = boundedNumber(strokeWidth, 0.25, 16);
  // Why a requested log scale is not in use: a stack has a zero baseline, a log axis has none.
  const logProblem =
    scaleType !== 'log'
      ? undefined
      : stack
        ? 'Stacked areas are measured from zero, so this chart uses a linear scale.'
        : logScaleProblem([
            ...visible.flatMap((s) => s.values.filter((v): v is number => v != null)),
            ...refs.map((r) => r.value),
          ]);
  const side = legendPlacement(legend, series.length > 1, 'bottom');
  const plotHeight = side === 'top' || side === 'bottom' ? height - LEGEND_H : height;

  const brushing = useRangeBrush(sel, x, source, { enabled: canBrush, onSelect });
  const select = brushing.select;

  const { active, setActive, keyboardProps } = useChartKeyboard(xsRaw.length, (i) =>
    canBrush
      ? select({ field: x, op: 'between', value: [xsRaw[i] as never, xsRaw[i] as never], source })
      : undefined,
  );
  const [hover, setHover] = useState<number | null>(null);
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
    const fmtAxis = readOut(fmtY, formats.get(series[0]?.key)?.axis ?? fmtY);
    parts.push(describeReferences(refs, fmtAxis));
    // Stacked bands are measured from zero, so their axis bounds are never cut.
    if (!stack) parts.push(describeLimits(yMin, yMax, fmtAxis));
    if (scaleType === 'log') parts.push(logProblem ?? 'The y axis is logarithmic.');
    return parts.filter(Boolean).join(' ');
  }, [series, xsRaw, fmtX, fmtY, formats, stack, locale, refs, yMin, yMax, scaleType, logProblem]);

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
        const top = pad.top ?? MARGIN.top;
        const bottom = plotHeight - (pad.bottom ?? (xAxis ? MARGIN.bottom : 8));
        const tops = stacks
          ? stacks.flatMap((s) => [...s.y0, ...s.y1])
          : visible.flatMap((s) => s.values.filter((v): v is number => v != null));
        const axis = valueAxis([...tops, ...refs.map((r) => r.value)], [bottom, top], {
          ticks: yTickCount === undefined ? undefined : tickCount(yTickCount, 4),
          min: yMin,
          max: yMax,
          anchored: !!stacks,
          chart: 'A stacked AreaChart',
          log: scaleType === 'log' && !stacks,
        });
        const yScale = axis.scale;
        const fmtTick = tickFormatter(valueField, locale, timeZone, format);
        const yTicks = axis.ticks.map((v) => ({ y: yScale(v), label: fmtTick(v) }));
        const left =
          pad.left ??
          (yAxis
            ? Math.ceil(Math.max(...yTicks.map((t) => monoTextWidth(t.label)), 16)) + 12
            : MARGIN.right);
        const ends = labels
          ? visible.flatMap((s, k) => {
              let at = s.values.length - 1;
              while (at >= 0 && s.values[at] == null) at--;
              if (at < 0) return [];
              const value = formats.get(s.key)!.axis(s.values[at]);
              const text = series.length > 1 ? `${s.label} ${value}` : value;
              // A stacked band is labelled at its middle, a line at its end point.
              const level = stacks
                ? (stacks[k].y0[at] + stacks[k].y1[at]) / 2
                : (s.values[at] as number);
              return [{ key: s.key, at, level, text, color: s.color }];
            })
          : [];
        const right =
          pad.right ??
          (ends.length
            ? Math.ceil(Math.max(...ends.map((e) => monoTextWidth(e.text)))) + 14
            : MARGIN.right);
        const x0 = left;
        const x1 = width - right;
        const xs = continuous ? continuousX(xField, xsRaw, [x0, x1]) : null;
        const clipped =
          (xs?.kind === 'linear' && boundX(xs.scale, xsRaw.map(Number), xMin, xMax)) ||
          axis.clipped;
        const px = xsRaw.map((v, i) =>
          xs ? xs.value(v) : x0 + (xsRaw.length > 1 ? (i * (x1 - x0)) / (xsRaw.length - 1) : 0),
        );
        const fmtXTick = tickFormatter(xField, locale, timeZone, xFormat);
        const xTicks = spacedIndices(
          xsRaw.length,
          labelCount(xTickCount, Math.max(2, Math.min(6, Math.floor((x1 - x0) / 90)))),
        ).map((i) => ({ x: px[i], label: fmtXTick(xsRaw[i]) }));
        const lines = gridLines(grid, { x: false, y: true });
        const endYs = spreadLabels(
          ends.map((e) => yScale(e.level)),
          13,
          top + 4,
          bottom - 4,
        );
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
        const dragging = brushing.handlers(x0, x1, (at) => xsRaw[bisectCenter(px, at)]);
        const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = indexAt(e.clientX, rect);
          if (i !== hover) setHover(i);
          dragging.onPointerMove(e);
        };

        let brushRect: { a: number; b: number } | null = brushing.drag;
        if (!brushRect && brushing.range && xs) {
          const [lo, hi] = brushing.range;
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

        const marks = (
          <>
            {stacks
              ? visible.map((s, k) => {
                  const st = stacks[k];
                  const pts = px.map((p, i) => [p, st.y0[i], st.y1[i]] as [number, number, number]);
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
                        className="q-chart-line"
                        d={lineGen(pts) ?? ''}
                        fill="none"
                        style={
                          lineWidth === undefined
                            ? { stroke: s.color }
                            : { stroke: s.color, strokeWidth: lineWidth }
                        }
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}
          </>
        );

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
                {clipped && (
                  <defs>
                    <clipPath id={`${gradientId}-clip`}>
                      <rect x={x0} y={top} width={Math.max(0, x1 - x0)} height={bottom - top} />
                    </clipPath>
                  </defs>
                )}
                {lines.y && <GridRows ys={yTicks.map((t) => t.y)} x0={x0} x1={x1} />}
                {lines.x && <GridColumns xs={xTicks.map((t) => t.x)} y0={top} y1={bottom} />}
                {yAxis && <AxisLeft ticks={yTicks} x={x0 - 10} />}
                {xAxis && <AxisBottom ticks={xTicks} y={bottom + 8} x0={x0} x1={x1} />}
                {clipped ? <g clipPath={`url(#${gradientId}-clip)`}>{marks}</g> : marks}
                {refs.length > 0 && (
                  <ReferenceRules
                    marks={refs.map((r) => ({
                      at: yScale(r.value),
                      text: r.label ?? fmtTick(r.value),
                    }))}
                    from={x0}
                    to={x1}
                    min={top}
                    max={bottom}
                  />
                )}
                {ends.length > 0 && (
                  <EndLabels
                    labels={ends.map((e, i) => ({
                      key: e.key,
                      x: px[e.at] + 8,
                      y: endYs[i],
                      text: e.text,
                      color: e.color,
                    }))}
                  />
                )}
                {brushRect && (
                  <rect
                    className="q-chart-brush"
                    x={Math.min(brushRect.a, brushRect.b)}
                    width={Math.max(1, Math.abs(brushRect.b - brushRect.a))}
                    y={top}
                    height={bottom - top}
                  />
                )}
                {annotations?.map((a) => {
                  const ax = xs ? xs.value(a.x) : Number.NaN;
                  if (!(ax >= x0 && ax <= x1)) return null;
                  return (
                    <g key={a.label} className="q-chart-annotation">
                      <line x1={ax} x2={ax} y1={top} y2={bottom} />
                      <text x={ax + 6} y={top + 10}>
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
                      y1={top}
                      y2={bottom}
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
                onPointerDown={dragging.onPointerDown}
                onPointerUp={dragging.onPointerUp}
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
              {logProblem && <ChartNote>{logProblem}</ChartNote>}
              <div className="q-visually-hidden" aria-live="polite">
                {active != null && tipRows.length > 0
                  ? `${fmtXLong(xsRaw[active])}: ${tipRows.map((r) => `${r.label} ${r.value}${r.description ? `. ${r.description}` : ''}`).join(', ')}${tipFooter ? `, total ${tipFooter.value}` : ''}`
                  : ''}
              </div>
            </div>
          </LegendLayout>
        );
      }}
    </ChartFrame>
  );
}
