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
import { orderedKeys, pearson } from './core/dist-stats';
import {
  AxisBottom,
  AxisLeft,
  ChartTooltip,
  GridRows,
  Legend,
  type TooltipRow,
} from './core/guides';
import { seriesColor } from './core/scales';
import { ScatterGeometry } from './renderers/ScatterGeometry';
import { ScatterMarks, SvgScatterMarks } from './renderers/ScatterMarks';
import type { ScatterRenderer, ScatterRendererState } from './renderers/scatter-types';

export interface ScatterPlotProps<R extends Row = Row> extends ChartBaseProps {
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
  /** Shows a legend above the plot. Defaults to true when `color` is set. */
  legend?: boolean;
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
    () => new Map(groups.map((g, i) => [g, seriesColor(i)] as const)),
    [groups],
  );

  const points = useMemo(() => {
    const sizes = size
      ? allRows.map((r) => finiteNumber(r[size])).filter((v): v is number => v != null)
      : [];
    const rScale = scaleSqrt()
      .domain([0, Math.max(0, max(sizes) ?? 0) || 1])
      .range([3, 9]);
    const out: Point[] = [];
    for (const r of rows) {
      const px = finiteNumber(r[x]);
      const py = finiteNumber(r[y]);
      if (px == null || py == null) continue;
      const g = color ? String(r[color]) : null;
      if (g != null && hidden.has(g)) continue;
      const s = size ? finiteNumber(r[size]) : null;
      out.push({
        row: r,
        x: px,
        y: py,
        r: size ? (s != null ? rScale(Math.max(0, s)) : 3) : 4.5,
        group: g,
        color: g != null ? (groupColor.get(g) ?? seriesColor(0)) : seriesColor(0),
      });
    }
    // Reading order for the keyboard: left to right.
    out.sort((a, b) => a.x - b.x || a.y - b.y);
    return out;
  }, [rows, allRows, x, y, size, color, hidden, groupColor]);

  // Axes span every row, so filtering from another view never rescales the plot.
  const domains = useMemo(() => {
    const span = (f: string): [number, number] => {
      const [a, b] = extent(allRows, (r) => {
        return finiteNumber(r[f]) ?? undefined;
      });
      return a == null || b == null ? [0, 1] : a === b ? [a - 1, b + 1] : [a, b];
    };
    return { x: span(x), y: span(y) };
  }, [allRows, x, y]);

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

  const summary = useMemo(() => {
    if (points.length === 0) return '';
    const [x0, x1] = extent(points, (p) => p.x) as [number, number];
    const [y0, y1] = extent(points, (p) => p.y) as [number, number];
    const r = pearson(
      points.map((p) => p.x),
      points.map((p) => p.y),
    );
    return `${yField.label} against ${xField.label}, ${points.length} points${
      color ? ` in ${groups.length} groups` : ''
    }${sizeField ? `, sized by ${sizeField.label}` : ''}. ${xField.label} from ${fmtX(x0)} to ${fmtX(x1)}; ${yField.label} from ${fmtY(y0)} to ${fmtY(y1)}.${
      r != null
        ? ` ${strength(r)[0].toUpperCase()}${strength(r).slice(1)} (r = ${makeFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }, { locale })(r)}).`
        : ''
    }`;
  }, [points, xField, yField, sizeField, color, groups, fmtX, fmtY, locale]);

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

  const showLegend = (legend ?? !!color) && groups.length > 0;
  const titlesOn = xTitle !== false || yTitle !== false;

  return (
    <ChartFrame
      kind="Scatter plot"
      status={statusOf(frame, allRows.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width, height: availableHeight }) => (
        <ScatterGeometry
          points={points}
          selected={selected}
          domains={domains}
          width={width}
          height={availableHeight - (showLegend ? LEGEND_H : 0)}
          xField={xField}
          yField={yField}
          format={format}
          xFormat={xFormat}
          locale={locale}
          timeZone={timeZone}
          titlesOn={titlesOn}
        >
          {({ plotHeight, bottom, top, left, right, px, py, xTicks, yTicks, marks, nearest }) => {
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
              <>
                {showLegend && (
                  <Legend
                    className="q-chart-legend-top"
                    items={groups.map((g) => ({
                      key: g,
                      label: groupLabels.get(g) ?? g,
                      color: groupColor.get(g) ?? seriesColor(0),
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
                )}
                <div style={{ position: 'relative', height: plotHeight }}>
                  <svg width={width} height={plotHeight} aria-hidden="true">
                    <GridRows ys={yTicks.map((t) => t.y)} x0={left} x1={right} />
                    <AxisLeft ticks={yTicks} x={left - 10} />
                    <AxisBottom ticks={xTicks} y={bottom + 6} x0={left} x1={right} />
                    <path
                      className="q-scatter-frame"
                      d={`M${left + 0.5},${top}V${bottom + 0.5}H${right}`}
                    />
                    {renderer === 'svg' && (
                      <g data-renderer="svg">
                        <SvgScatterMarks marks={marks} onRendererChange={onRendererChange} />
                      </g>
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
              </>
            );
          }}
        </ScatterGeometry>
      )}
    </ChartFrame>
  );
}
