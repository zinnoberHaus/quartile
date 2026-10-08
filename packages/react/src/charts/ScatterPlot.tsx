import { extent, max } from 'd3-array';
import { scaleLinear, scaleSqrt } from 'd3-scale';
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { makeFormatter } from '../data/format';
import type { Predicate, Primitive } from '../data/predicates';
import { fieldOf, resolveData, toComparable } from '../data/schema';
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
import { monoTextWidth, seriesColor, tickFormatter } from './core/scales';

export interface ScatterPlotProps<R extends Row = Row> extends ChartBaseProps {
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
const TITLE_H = 18;
const TICK_H = 20;

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
    x,
    y,
    size,
    color,
    label,
    format,
    xFormat,
    select,
    legend,
    xTitle,
    yTitle,
    id,
    selection,
    onSelect,
    height = 240,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const xField = fieldOf(schema, x, allRows);
  const yField = fieldOf(schema, y, allRows);
  const sizeField = size ? fieldOf(schema, size, allRows) : null;
  const fmtX = useMemo(
    () => makeFormatter(xFormat ?? xField.format, { currency: xField.currency, locale }),
    [xFormat, xField, locale],
  );
  const fmtY = useMemo(
    () => makeFormatter(format ?? yField.format, { currency: yField.currency, locale }),
    [format, yField, locale],
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
    const sizes = size ? allRows.map((r) => Number(r[size])).filter(Number.isFinite) : [];
    const rScale = scaleSqrt()
      .domain([0, max(sizes) ?? 1])
      .range([3, 9]);
    const out: Point[] = [];
    for (const r of rows) {
      const px = Number(r[x]);
      const py = Number(r[y]);
      if (!Number.isFinite(px) || !Number.isFinite(py) || r[x] == null || r[y] == null) continue;
      const g = color ? String(r[color]) : null;
      if (g != null && hidden.has(g)) continue;
      const s = size ? Number(r[size]) : Number.NaN;
      out.push({
        row: r,
        x: px,
        y: py,
        r: size ? (Number.isFinite(s) ? rScale(Math.max(0, s)) : 3) : 4.5,
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
      const [a, b] = extent(allRows, (r) => (r[f] == null ? undefined : Number(r[f])));
      return a == null || b == null ? [0, 1] : a === b ? [a - 1, b + 1] : [a, b];
    };
    return { x: span(x), y: span(y) };
  }, [allRows, x, y]);

  const selectField: string | undefined =
    typeof select === 'string' ? select : select ? (color ?? label) : undefined;
  const [localSel, setLocalSel] = useState<Primitive[]>([]);
  const own = selectField ? sel?.get(selectField) : undefined;
  const selectedValues: Primitive[] = sel
    ? own && own.source === source
      ? own.op === 'in'
        ? own.value
        : own.op === 'eq'
          ? [own.value]
          : []
      : []
    : localSel;
  const selectedKeys = new Set(selectedValues.map((v) => toComparable(v)));
  const isSelected = (p: Point) =>
    !selectField || selectedKeys.size === 0 || selectedKeys.has(toComparable(p.row[selectField]));

  const toggle = (p: Point, multiple: boolean) => {
    if (!selectField) return;
    const v = p.row[selectField] as Primitive;
    const key = toComparable(v);
    const has = selectedKeys.has(key);
    const next = has
      ? selectedValues.filter((s) => toComparable(s) !== key)
      : multiple
        ? [...selectedValues, v]
        : [v];
    setLocalSel(next);
    sel?.toggle(selectField, v, { source, multiple });
    onSelect?.(next.length ? { field: selectField, op: 'in', value: next, source } : null);
  };

  const multi = useRef(false);
  const { active, setActive, keyboardProps } = useChartKeyboard(points.length, (i) =>
    toggle(points[i], multi.current),
  );
  const onKeyDown = (e: KeyboardEvent) => {
    multi.current = e.shiftKey;
    keyboardProps.onKeyDown(e);
  };
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;

  const titleOf = (p: Point) => {
    if (label) return String(p.row[label] ?? '');
    if (color) return String(p.row[color] ?? '');
    return `${fmtX(p.x)}, ${fmtY(p.y)}`;
  };
  const tipRowsOf = (p: Point): TooltipRow[] => {
    const keys = Object.keys(p.row);
    const out: TooltipRow[] = [];
    for (const k of keys) {
      if (k === label) continue;
      if (!label && k === color) continue;
      const f = fieldOf(schema, k, allRows);
      const fmt =
        k === x ? fmtX : k === y ? fmtY : makeFormatter(f.format, { currency: f.currency, locale });
      out.push({
        label: f.label,
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
        ? ` ${strength(r)[0].toUpperCase()}${strength(r).slice(1)} (r = ${r.toFixed(2)}).`
        : ''
    }`;
  }, [points, xField, yField, sizeField, color, groups, fmtX, fmtY]);

  const table = useMemo<ChartTable>(() => {
    const fields = [label, color, x, y, size].filter((f): f is string => !!f);
    const unique = [...new Set(fields)];
    return {
      columns: unique.map((f) => fieldOf(schema, f, allRows).label),
      rows: points.map((p) =>
        unique.map((f) => {
          if (f === x) return fmtX(p.row[f]);
          if (f === y) return fmtY(p.row[f]);
          const fd = fieldOf(schema, f, allRows);
          return makeFormatter(fd.format, { currency: fd.currency, locale })(p.row[f]);
        }),
      ),
      numeric: unique.flatMap((f, i) =>
        fieldOf(schema, f, allRows).type === 'quantitative' && i > 0 ? [i] : [],
      ),
    };
  }, [label, color, x, y, size, schema, allRows, points, fmtX, fmtY, locale]);

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
      {({ width }) => {
        const plotHeight = height - (showLegend ? LEGEND_H : 0);
        const bottom = plotHeight - TICK_H - (titlesOn ? TITLE_H : 0);
        const top = 8;
        const maxR = Math.max(4.5, ...points.map((p) => p.r));
        const ys = scaleLinear().domain(domains.y).nice(4);
        const fmtYTick = tickFormatter({ ...yField, format: format ?? yField.format }, locale);
        const yTickVals = ys.ticks(4);
        const left =
          Math.ceil(Math.max(16, ...yTickVals.map((v) => monoTextWidth(fmtYTick(v))))) + 12;
        const right = width - 4;
        ys.range([bottom - maxR * 0.6, top + maxR * 0.6]);
        const xs = scaleLinear()
          .domain(domains.x)
          .nice(5)
          .range([left + maxR * 0.6, right - maxR * 0.6]);
        const fmtXTick = tickFormatter({ ...xField, format: xFormat ?? xField.format }, locale);
        const xTickCount = Math.max(2, Math.min(6, Math.floor((right - left) / 80)));
        const xTicks = xs.ticks(xTickCount).map((v) => ({ x: xs(v), label: fmtXTick(v) }));
        const yTicks = yTickVals.map((v) => ({ y: ys(v), label: fmtYTick(v) }));

        const px = points.map((p) => xs(p.x));
        const py = points.map((p) => ys(p.y));
        const nearest = (mx: number, my: number) => {
          let best = -1;
          let bestD = Number.POSITIVE_INFINITY;
          for (let i = 0; i < points.length; i++) {
            const d = Math.hypot(px[i] - mx, py[i] - my) - points[i].r;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          return bestD <= 10 ? best : -1;
        };
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
        const drawOrder = points.map((_, i) => i).sort((a, b) => points[b].r - points[a].r);
        const f = focus != null ? points[focus] : null;
        const tipRows = f ? tipRowsOf(f) : [];

        return (
          <>
            {showLegend && (
              <Legend
                className="q-chart-legend-top"
                items={groups.map((g) => ({
                  key: g,
                  label: g,
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
                {drawOrder.map((i) => {
                  const p = points[i];
                  return (
                    <circle
                      key={i}
                      className="q-scatter-point"
                      cx={px[i]}
                      cy={py[i]}
                      r={p.r}
                      style={{ fill: p.color, stroke: 'var(--q-surface)' }}
                      data-muted={!isSelected(p) || undefined}
                    />
                  );
                })}
                {f && focus != null && (
                  <circle
                    className="q-dist-cell-active"
                    cx={px[focus]}
                    cy={py[focus]}
                    r={f.r + 3}
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
                  x={px[focus] + f.r - 8}
                  width={width}
                  top={Math.max(0, Math.min(py[focus] - 24, plotHeight - 40 - tipRows.length * 18))}
                  title={titleOf(f)}
                  rows={tipRows}
                />
              )}
              <div className="q-visually-hidden" aria-live="polite">
                {active != null && points[active]
                  ? `${titleOf(points[active])}: ${tipRowsOf(points[active])
                      .map((r) => `${r.label} ${r.value}`)
                      .join(', ')}`
                  : ''}
              </div>
            </div>
          </>
        );
      }}
    </ChartFrame>
  );
}
