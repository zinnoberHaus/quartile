import { extent, max } from 'd3-array';
import { scaleSqrt } from 'd3-scale';
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { makeFieldFormatter, makeFormatter } from '../data/format';
import { finiteNumber } from '../data/number';
import type { Predicate, Primitive } from '../data/predicates';
import { fieldOf, resolveData, toComparable } from '../data/schema';
import { typedValueKey } from '../data/typed-key';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { type ChartColor, pickColor, seriesColors } from './core/colors';
import { orderedKeys, pearson } from './core/dist-stats';
import {
  AxisBottom,
  AxisLeft,
  ChartNote,
  ChartTooltip,
  GridColumns,
  GridRows,
  Legend,
  LegendLayout,
  ReferenceRules,
  type TooltipRow,
} from './core/guides';
import {
  type ChartPresentationProps,
  describeLimits,
  describeReferences,
  gridLines,
  type LegendSetting,
  legendPlacement,
  logScaleProblem,
  marginSides,
  readOut,
  referenceLines,
  sideLegendWidth,
  tickCount,
  type ValueScaleType,
} from './core/options';
import { seriesColor, tickFormatter } from './core/scales';
import { useSettled } from './core/settled';
import { ScatterGeometry, type ScatterLayout } from './renderers/ScatterGeometry';
import { ScatterMarks, SvgScatterMarks } from './renderers/ScatterMarks';
import type { ScatterRenderer, ScatterRendererState } from './renderers/scatter-types';

export interface ScatterPlotProps<R extends Row = Row>
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
  /** SVG is the default. WebGL falls back to Canvas, then SVG, when unavailable or lost. */
  renderer?: ScatterRenderer;
  /** Reports the active renderer after drawing, including any fallback reason. */
  onRendererChange?: (state: ScatterRendererState) => void;
  /** Rows to plot, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Quantitative field for the horizontal axis. */
  x: keyof R & string;
  /** Quantitative field for the vertical axis. */
  y: keyof R & string;
  /** Sizes each point by this field (area-proportional), making a bubble chart. */
  size?: keyof R & string;
  /** Colors points by a categorical field. */
  color?: keyof R & string;
  /** Field naming each point, used as the tooltip title. */
  label?: keyof R & string;
  /** Formats `y`. Defaults to the field's schema format. */
  format?: Formatter;
  /** Formats `x`. Defaults to the field's schema format. */
  xFormat?: Formatter;
  /**
   * Click (or Enter) toggles a value in the selection: `true` uses the `color` field (or `label`),
   * a field name uses that field, e.g. a point id. Shift adds to the selection.
   */
  select?: boolean | (keyof R & string);
  /** Preserve physical field identities for prepared query results, including nominal ISO strings. */
  typedSelection?: boolean;
  /** Shows a legend above the plot, or on the side named. Defaults to true when `color` is set. */
  legend?: LegendSetting;
  /**
   * Point colors per group of `color`, in order: palette names, 1–8 or any CSS color. Without
   * `color`, the first one colors every point.
   */
  colors?: ChartColor[] | Record<string, ChartColor>;
  /**
   * `log` spaces equal ratios of `y` evenly. It needs every y value above zero; otherwise the
   * plot stays linear and says so in a note and in its summary.
   */
  yScale?: ValueScaleType;
  /** Axis titles under the plot. Default "<x> →" and "↑ <y>"; false hides them. */
  xTitle?: string | false;
  yTitle?: string | false;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called after a click selection changes. */
  onSelect?: (predicate: Predicate | null) => void;
}

interface Point {
  row: Row;
  x: number;
  y: number;
  r: number;
  group: string | null;
  color: string;
}

const LEGEND_H = 28;

function strength(r: number) {
  const a = Math.abs(r);
  const dir = r > 0 ? 'positive' : 'negative';
  if (a < 0.1) return 'no clear correlation';
  if (a < 0.3) return `weak ${dir} correlation`;
  if (a < 0.6) return `moderate ${dir} correlation`;
  return `strong ${dir} correlation`;
}

export function ScatterPlot<R extends Row = Row>(props: ScatterPlotProps<R>) {
  const {
    data,
    renderer = 'svg',
    onRendererChange,
    x,
    y,
    size,
    color,
    label,
    format,
    xFormat,
    select,
    typedSelection = false,
    legend,
    colors,
    yScale: scaleType = 'linear',
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
    xTitle,
    yTitle,
    id,
    selection,
    onSelect,
    height = 240,
    ...frame
  } = props;
  const { locale, timeZone } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const colorList = useSettled(colors);
  const palette = useMemo(() => seriesColors(colorList), [colorList]);
  const referenceList = useSettled(reference);
  const refs = useMemo(() => referenceLines(referenceList), [referenceList]);

  const xField = useMemo(() => fieldOf(schema, x, allRows), [schema, x, allRows]);
  const yField = useMemo(() => fieldOf(schema, y, allRows), [schema, y, allRows]);
  const sizeField = useMemo(
    () => (size ? fieldOf(schema, size, allRows) : null),
    [size, schema, allRows],
  );
  const fmtX = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone }, xFormat),
    [xFormat, xField, locale, timeZone],
  );
  const fmtY = useMemo(
    () => makeFieldFormatter(yField, { locale, timeZone }, format),
    [format, yField, locale, timeZone],
  );

  const fmtXTip = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone, surface: 'tooltip' }, xFormat),
    [xField, locale, timeZone, xFormat],
  );
  const fmtYTip = useMemo(
    () => makeFieldFormatter(yField, { locale, timeZone, surface: 'tooltip' }, format),
    [yField, locale, timeZone, format],
  );
  const colorField = useMemo(
    () => (color ? fieldOf(schema, color, allRows) : undefined),
    [schema, color, allRows],
  );
  const fmtColor = useMemo(
    () => makeFieldFormatter(colorField, { locale, timeZone }),
    [colorField, locale, timeZone],
  );
  const groupLabels = useMemo(
    () => new Map(color ? allRows.map((r) => [String(r[color]), fmtColor(r[color])]) : []),
    [color, allRows, fmtColor],
  );

  const groups = useMemo(
    () => (color ? orderedKeys(allRows.map((r) => r[color])).map(String) : []),
    [allRows, color],
  );
  const groupColor = useMemo(
    () => new Map(groups.map((g, i) => [g, pickColor(palette, g, i, seriesColor)] as const)),
    [groups, palette],
  );
  const plainColor = pickColor(palette, '', 0, seriesColor);

  const { points, outside } = useMemo(() => {
    const sizes = size
      ? allRows.map((r) => finiteNumber(r[size])).filter((v): v is number => v != null)
      : [];
    const rScale = scaleSqrt()
      .domain([0, Math.max(0, max(sizes) ?? 0) || 1])
      .range([3, 9]);
    const out: Point[] = [];
    // Points beyond an axis bound are left out of the drawing in every renderer, and counted.
    let outside = 0;
    const beyond = (v: number, lower?: number, upper?: number) =>
      (lower != null && v < lower) || (upper != null && v > upper);
    for (const r of rows) {
      const px = finiteNumber(r[x]);
      const py = finiteNumber(r[y]);
      if (px == null || py == null) continue;
      const g = color ? String(r[color]) : null;
      if (g != null && hidden.has(g)) continue;
      if (beyond(px, xMin, xMax) || beyond(py, yMin, yMax)) {
        outside++;
        continue;
      }
      const s = size ? finiteNumber(r[size]) : null;
      out.push({
        row: r,
        x: px,
        y: py,
        r: size ? (s != null ? rScale(Math.max(0, s)) : 3) : 4.5,
        group: g,
        color: g != null ? (groupColor.get(g) ?? plainColor) : plainColor,
      });
    }
    // Reading order for the keyboard: left to right.
    out.sort((a, b) => a.x - b.x || a.y - b.y);
    return { points: out, outside };
  }, [rows, allRows, x, y, size, color, hidden, groupColor, plainColor, xMin, xMax, yMin, yMax]);

  // Axes span every row, so filtering from another view never rescales the plot.
  const domains = useMemo(() => {
    const span = (f: string): [number, number] => {
      const [a, b] = extent(allRows, (r) => {
        return finiteNumber(r[f]) ?? undefined;
      });
      return a == null || b == null ? [0, 1] : a === b ? [a - 1, b + 1] : [a, b];
    };
    const ySpan = span(y);
    // A reference rule belongs on the axis even when no point reaches it.
    for (const r of refs) {
      ySpan[0] = Math.min(ySpan[0], r.value);
      ySpan[1] = Math.max(ySpan[1], r.value);
    }
    return { x: span(x), y: ySpan };
  }, [allRows, x, y, refs]);
  // Axes span every row, so the check does too: one value at or below zero rules a log axis out.
  const logProblem = useMemo(
    () =>
      scaleType === 'log'
        ? logScaleProblem([
            ...allRows.flatMap((r) => finiteNumber(r[y]) ?? []),
            ...refs.map((r) => r.value),
          ])
        : undefined,
    [scaleType, allRows, y, refs],
  );
  const yLog = scaleType === 'log' && !logProblem;

  const pad = marginSides(margin);
  const layout = useMemo<ScatterLayout>(
    () => ({
      pad: { top: pad.top, right: pad.right, bottom: pad.bottom, left: pad.left },
      xTicks: xTickCount === undefined ? undefined : tickCount(xTickCount, 5),
      yTicks: yTickCount === undefined ? undefined : tickCount(yTickCount, 4),
      xAxis,
      yAxis,
      xMin,
      xMax,
      yMin,
      yMax,
      yLog,
    }),
    [
      pad.top,
      pad.right,
      pad.bottom,
      pad.left,
      xTickCount,
      yTickCount,
      xAxis,
      yAxis,
      xMin,
      xMax,
      yMin,
      yMax,
      yLog,
    ],
  );

  const selectField: string | undefined =
    typeof select === 'string' ? select : select ? (color ?? label) : undefined;
  const selectionKey = useCallback(
    (value: unknown) =>
      typedSelection
        ? typedValueKey(value, selectField ? schema[selectField]?.type : undefined)
        : toComparable(value),
    [typedSelection, selectField, schema],
  );
  const [localSel, setLocalSel] = useState<Primitive[]>([]);
  const own = selectField ? sel?.get(selectField) : undefined;
  const selectedValues = useMemo<Primitive[]>(
    () =>
      sel
        ? own && own.source === source
          ? own.op === 'in'
            ? own.value
            : own.op === 'eq'
              ? [own.value]
              : []
          : []
        : localSel,
    [sel, own, localSel, source],
  );
  const selectedKeys = useMemo(
    () => new Set(selectedValues.map(selectionKey)),
    [selectedValues, selectionKey],
  );
  const isSelected = useCallback(
    (p: Point) =>
      !selectField || selectedKeys.size === 0 || selectedKeys.has(selectionKey(p.row[selectField])),
    [selectField, selectedKeys, selectionKey],
  );
  const selected = useMemo(() => points.map(isSelected), [points, isSelected]);

  const toggle = useCallback(
    (p: Point, multiple: boolean) => {
      if (!selectField) return;
      const v = p.row[selectField] as Primitive;
      const key = selectionKey(v);
      const has = selectedKeys.has(key);
      const next = has
        ? selectedValues.filter((s) => selectionKey(s) !== key)
        : multiple
          ? [...selectedValues, v]
          : [v];
      setLocalSel(next);
      if (typedSelection) sel?.set(selectField, next, { source, op: 'in' });
      else sel?.toggle(selectField, v, { source, multiple });
      onSelect?.(next.length ? { field: selectField, op: 'in', value: next, source } : null);
    },
    [
      selectField,
      selectedKeys,
      selectedValues,
      selectionKey,
      typedSelection,
      sel,
      source,
      onSelect,
    ],
  );

  const multi = useRef(false);
  const { active, setActive, keyboardProps } = useChartKeyboard(
    points.length,
    (i) => points[i] && toggle(points[i], multi.current),
  );
  const onKeyDown = (e: KeyboardEvent) => {
    setHover(null);
    setHover(null);
    multi.current = e.shiftKey;
    keyboardProps.onKeyDown(e);
  };
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;

  const titleOf = (p: Point) => {
    const titleField = label ?? color;
    if (titleField)
      return makeFieldFormatter(fieldOf(schema, titleField, allRows), {
        locale,
        timeZone,
        surface: 'tooltip',
      })(p.row[titleField]);
    return `${fmtXTip(p.x)}, ${fmtYTip(p.y)}`;
  };
  const tipRowsOf = (p: Point): TooltipRow[] => {
    const keys = Object.keys(p.row);
    const out: TooltipRow[] = [];
    for (const k of keys) {
      if (k === label) continue;
      if (!label && k === color) continue;
      const f = fieldOf(schema, k, allRows);
      const fmt =
        k === x
          ? fmtXTip
          : k === y
            ? fmtYTip
            : makeFieldFormatter(f, { locale, timeZone, surface: 'tooltip' });
      out.push({
        label: f.label,
        description: f.description,
        value: fmt(p.row[k]),
        color: k === color && p.group != null ? p.color : undefined,
      });
    }
    return out;
  };

  const fmtXAxis = useMemo(
    () => tickFormatter(xField, locale, timeZone, xFormat),
    [xField, locale, timeZone, xFormat],
  );
  const fmtYAxis = useMemo(
    () => tickFormatter(yField, locale, timeZone, format),
    [yField, locale, timeZone, format],
  );

  const summary = useMemo(() => {
    if (points.length === 0) return '';
    const [x0, x1] = extent(points, (p) => p.x) as [number, number];
    const [y0, y1] = extent(points, (p) => p.y) as [number, number];
    const r = pearson(
      points.map((p) => p.x),
      points.map((p) => p.y),
    );
    const extras = [
      describeReferences(refs, readOut(fmtY, fmtYAxis)),
      describeLimits(xMin, xMax, readOut(fmtX, fmtXAxis), 'The x axis'),
      describeLimits(yMin, yMax, readOut(fmtY, fmtYAxis)),
      outside > 0
        ? `${outside} ${outside === 1 ? 'point falls' : 'points fall'} outside the axis limits and ${outside === 1 ? 'is' : 'are'} not shown.`
        : '',
      scaleType === 'log' ? (logProblem ?? 'The y axis is logarithmic.') : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `${yField.label} against ${xField.label}, ${points.length} points${
      color ? ` in ${groups.length} groups` : ''
    }${sizeField ? `, sized by ${sizeField.label}` : ''}. ${xField.label} from ${fmtX(x0)} to ${fmtX(x1)}; ${yField.label} from ${fmtY(y0)} to ${fmtY(y1)}.${
      r != null
        ? ` ${strength(r)[0].toUpperCase()}${strength(r).slice(1)} (r = ${makeFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }, { locale })(r)}).`
        : ''
    }${extras ? ` ${extras}` : ''}`;
  }, [
    points,
    xField,
    yField,
    sizeField,
    color,
    groups,
    fmtX,
    fmtY,
    fmtXAxis,
    fmtYAxis,
    locale,
    refs,
    xMin,
    xMax,
    yMin,
    yMax,
    outside,
    scaleType,
    logProblem,
  ]);

  const table = useMemo<ChartTable>(() => {
    const fields = [label, color, x, y, size].filter((f): f is string => !!f);
    const unique = [...new Set(fields)];
    const formatters = unique.map((field) => {
      if (field === x) return fmtX;
      if (field === y) return fmtY;
      const definition = fieldOf(schema, field, allRows);
      return makeFieldFormatter(definition, { locale, timeZone });
    });
    const formatRow = (point: Point) =>
      unique.map((field, index) => formatters[index](point.row[field]));
    return {
      columns: unique.map((f) => fieldOf(schema, f, allRows).label),
      rows: points.length > 200 ? [] : points.map((point) => formatRow(point)),
      ...(points.length > 200
        ? {
            rowCount: points.length,
            pageSize: 50,
            getRow: (index: number) => formatRow(points[index]),
          }
        : {}),
      numeric: unique.flatMap((f, i) =>
        fieldOf(schema, f, allRows).type === 'quantitative' && i > 0 ? [i] : [],
      ),
    };
  }, [label, color, x, y, size, schema, allRows, points, fmtX, fmtY, locale, timeZone]);

  const side = groups.length > 0 ? legendPlacement(legend, !!color, 'top') : null;
  const beside = side === 'left' || side === 'right';
  const titlesOn = xTitle !== false || yTitle !== false;
  const lines = gridLines(grid, { x: false, y: true });

  return (
    <ChartFrame
      kind="Scatter plot"
      status={statusOf(frame, allRows.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width: frameWidth, height: availableHeight }) => {
        const legendWidth = beside
          ? sideLegendWidth(
              groups.map((g) => groupLabels.get(g) ?? g),
              frameWidth,
            )
          : 0;
        const width = beside ? Math.max(1, frameWidth - legendWidth - 12) : frameWidth;
        return (
          <ScatterGeometry
            points={points}
            selected={selected}
            domains={domains}
            width={width}
            height={availableHeight - (side === 'top' || side === 'bottom' ? LEGEND_H : 0)}
            layout={layout}
            xField={xField}
            yField={yField}
            format={format}
            xFormat={xFormat}
            locale={locale}
            timeZone={timeZone}
            titlesOn={titlesOn}
          >
            {({
              plotHeight,
              bottom,
              top,
              left,
              right,
              px,
              py,
              xTicks,
              yTicks,
              marks,
              nearest,
              yAt,
            }) => {
              const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const i = nearest(e.clientX - rect.left, e.clientY - rect.top);
                setHover(i < 0 ? null : i);
              };
              const onClick = (e: MouseEvent<HTMLDivElement>) => {
                if (!selectField) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const i = nearest(e.clientX - rect.left, e.clientY - rect.top);
                if (i >= 0) toggle(points[i], e.shiftKey || e.metaKey);
              };
              const f = focus != null ? points[focus] : null;
              const tipRows = f ? tipRowsOf(f) : [];

              return (
                <LegendLayout
                  side={side}
                  legend={
                    <Legend
                      className="q-chart-legend-top"
                      position={typeof legend === 'string' && side ? side : undefined}
                      style={beside ? { width: legendWidth } : undefined}
                      items={groups.map((g) => ({
                        key: g,
                        label: groupLabels.get(g) ?? g,
                        color: groupColor.get(g) ?? plainColor,
                        inactive: hidden.has(g),
                      }))}
                      onToggle={(key) =>
                        setHidden((h) => {
                          const n = new Set(h);
                          if (n.has(key)) n.delete(key);
                          else if (n.size < groups.length - 1) n.add(key);
                          return n;
                        })
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
                      {lines.y && <GridRows ys={yTicks.map((t) => t.y)} x0={left} x1={right} />}
                      {lines.x && <GridColumns xs={xTicks.map((t) => t.x)} y0={top} y1={bottom} />}
                      {yAxis && <AxisLeft ticks={yTicks} x={left - 10} />}
                      {xAxis && <AxisBottom ticks={xTicks} y={bottom + 6} x0={left} x1={right} />}
                      <path
                        className="q-scatter-frame"
                        d={`M${left + 0.5},${top}V${bottom + 0.5}H${right}`}
                      />
                      {renderer === 'svg' && (
                        <g data-renderer="svg">
                          <SvgScatterMarks marks={marks} onRendererChange={onRendererChange} />
                        </g>
                      )}
                      {refs.length > 0 && (
                        <ReferenceRules
                          marks={refs.map((r) => ({
                            at: yAt(r.value),
                            text: r.label ?? fmtYAxis(r.value),
                          }))}
                          from={left}
                          to={right}
                          min={top}
                          max={bottom}
                        />
                      )}
                      {titlesOn && (
                        <g className="q-dist-axis-title">
                          {xTitle !== false && (
                            <text x={left} y={plotHeight - 4}>
                              {xTitle ?? `${xField.label.toLowerCase()} →`}
                            </text>
                          )}
                          {yTitle !== false && (
                            <text x={right} y={plotHeight - 4} textAnchor="end">
                              {yTitle ?? `↑ ${yField.label.toLowerCase()}`}
                            </text>
                          )}
                        </g>
                      )}
                    </svg>
                    {renderer !== 'svg' && (
                      <ScatterMarks
                        marks={marks}
                        width={width}
                        height={plotHeight}
                        renderer={renderer}
                        onRendererChange={onRendererChange}
                      />
                    )}
                    {f && focus != null && (
                      <svg
                        className="q-scatter-focus"
                        width={width}
                        height={plotHeight}
                        viewBox={`0 0 ${width} ${plotHeight}`}
                        aria-hidden="true"
                      >
                        <circle
                          className="q-dist-cell-active"
                          cx={px[focus]}
                          cy={py[focus]}
                          r={f.r + 3}
                        />
                      </svg>
                    )}
                    <div
                      className="q-chart-plot"
                      style={{ cursor: selectField && hover != null ? 'pointer' : 'default' }}
                      aria-label={`${frame['aria-label'] ?? 'Scatter plot'}. Use arrow keys to move between points${selectField ? ', Enter to select' : ''}.`}
                      role="application"
                      {...keyboardProps}
                      onKeyDown={onKeyDown}
                      onFocus={() => setActive((a) => a ?? 0)}
                      onPointerMove={onPointerMove}
                      onPointerLeave={() => setHover(null)}
                      onClick={onClick}
                    />
                    {f && focus != null && (
                      <ChartTooltip
                        note={frame.tooltipNote}
                        x={px[focus] + f.r - 8}
                        width={width}
                        top={Math.max(
                          0,
                          Math.min(py[focus] - 24, plotHeight - 40 - tipRows.length * 18),
                        )}
                        title={titleOf(f)}
                        rows={tipRows}
                      />
                    )}
                    {logProblem && <ChartNote>{logProblem}</ChartNote>}
                    <div className="q-visually-hidden" aria-live="polite">
                      {active != null && points[active]
                        ? `${titleOf(points[active])}: ${tipRowsOf(points[active])
                            .map(
                              (r) =>
                                `${r.label} ${r.value}${r.description ? `. ${r.description}` : ''}`,
                            )
                            .join(', ')}`
                        : ''}
                    </div>
                  </div>
                </LegendLayout>
              );
            }}
          </ScatterGeometry>
        );
      }}
    </ChartFrame>
  );
}
