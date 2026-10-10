import { max, min } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { makeFormatter } from '../data/format';
import { finiteNumber } from '../data/number';
import type { Predicate, Primitive } from '../data/predicates';
import { fieldOf, resolveData, toComparable } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { type BoxStats, boxStats, clamp, orderedKeys } from './core/dist-stats';
import { AxisLeft, ChartTooltip, GridRows, type TooltipRow } from './core/guides';
import { monoTextWidth, tickFormatter } from './core/scales';

export interface BoxPlotProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows to summarize, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Categorical field: one box per value. */
  category: keyof R & string;
  /** Quantitative field summarized in each box. */
  value: keyof R & string;
  /** Horizontal draws one row per category (the default); vertical draws columns. */
  orientation?: 'horizontal' | 'vertical';
  /** Tukey whiskers reach the furthest value within 1.5 × IQR and plot the rest as outliers. */
  whiskers?: 'tukey' | 'minmax';
  /** Category order: an explicit list, or "median" for highest median first. */
  order?: readonly string[] | 'median';
  /** Starts the value axis at zero. Defaults to true for all-positive data. */
  zero?: boolean;
  /** Formats `value`. Defaults to the field's schema format. */
  format?: Formatter;
  /** Click (or Enter) toggles the category in the selection. Shift adds. */
  select?: boolean;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  onSelect?: (predicate: Predicate | null) => void;
}

interface Group {
  key: string;
  raw: unknown;
  stats: BoxStats;
}

const ROW_H = 26;
const AXIS_H = 22;
const SANS_CHAR = 6.4;

function truncate(s: string, px: number, charW = SANS_CHAR) {
  const n = Math.floor(px / charW);
  return s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`;
}

export function BoxPlot<R extends Row = Row>(props: BoxPlotProps<R>) {
  const {
    data,
    category,
    value,
    orientation = 'horizontal',
    whiskers = 'tukey',
    order,
    zero,
    format,
    select = false,
    id,
    selection,
    onSelect,
    height: heightProp,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const valueField = fieldOf(schema, value, allRows);
  const catField = fieldOf(schema, category, allRows);
  const fmt = useMemo(
    () => makeFormatter(format ?? valueField.format, { currency: valueField.currency, locale }),
    [format, valueField, locale],
  );

  const groups = useMemo(() => {
    const keys = orderedKeys(
      allRows.map((r) => r[category]),
      Array.isArray(order) ? order : undefined,
    );
    const byKey = new Map<unknown, number[]>(keys.map((k) => [toComparable(k), []]));
    for (const r of rows) {
      const list = byKey.get(toComparable(r[category]));
      const v = finiteNumber(r[value]);
      if (list && v != null) list.push(v);
    }
    const out: Group[] = [];
    for (const k of keys) {
      const stats = boxStats(byKey.get(toComparable(k)) ?? [], whiskers);
      if (stats) out.push({ key: String(k), raw: k, stats });
    }
    if (order === 'median') out.sort((a, b) => b.stats.median - a.stats.median);
    return out;
  }, [allRows, rows, category, value, whiskers, order]);

  const domain = useMemo((): [number, number] => {
    const lo = min(groups, (g) => g.stats.min) ?? 0;
    const hi = max(groups, (g) => g.stats.max) ?? 1;
    const useZero = zero ?? lo >= 0;
    const d0 = useZero ? Math.min(0, lo) : lo;
    return [d0, hi === d0 ? d0 + 1 : hi];
  }, [groups, zero]);

  // Selection: toggles the category; boxes outside it are muted.
  const [localSel, setLocalSel] = useState<Primitive[]>([]);
  const own = sel?.get(category);
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
  const muted = (g: Group) =>
    select && selectedKeys.size > 0 && !selectedKeys.has(toComparable(g.raw));
  const toggle = (g: Group, multiple: boolean) => {
    if (!select) return;
    const v = g.raw as Primitive;
    const key = toComparable(v);
    const next = selectedKeys.has(key)
      ? selectedValues.filter((s) => toComparable(s) !== key)
      : multiple
        ? [...selectedValues, v]
        : [v];
    setLocalSel(next);
    sel?.toggle(category, v, { source, multiple });
    onSelect?.(next.length ? { field: category, op: 'in', value: next, source } : null);
  };

  const multi = useRef(false);
  const { active, setActive, keyboardProps } = useChartKeyboard(groups.length, (i) =>
    toggle(groups[i], multi.current),
  );
  const onKeyDown = (e: KeyboardEvent) => {
    multi.current = e.shiftKey;
    keyboardProps.onKeyDown(e);
  };
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;

  const tipRows = (g: Group): TooltipRow[] => [
    { label: 'Max', value: fmt(g.stats.max) },
    { label: 'Q3', value: fmt(g.stats.q3) },
    { label: 'Median', value: fmt(g.stats.median) },
    { label: 'Q1', value: fmt(g.stats.q1) },
    { label: 'Min', value: fmt(g.stats.min) },
    {
      label: 'n',
      value: g.stats.n.toLocaleString(locale),
      tone: 'muted',
    },
    ...(g.stats.outliers.length
      ? [
          {
            label: 'Outliers',
            value: g.stats.outliers.length.toLocaleString(locale),
            tone: 'muted' as const,
          },
        ]
      : []),
  ];

  const summary = useMemo(() => {
    if (groups.length === 0) return '';
    const byMedian = [...groups].sort((a, b) => b.stats.median - a.stats.median);
    const widest = [...groups].sort(
      (a, b) => b.stats.q3 - b.stats.q1 - (a.stats.q3 - a.stats.q1),
    )[0];
    const hi = byMedian[0];
    const lo = byMedian[byMedian.length - 1];
    return `${valueField.label} by ${catField.label}, ${groups.length} groups. Highest median: ${hi.key} (${fmt(hi.stats.median)}). Lowest median: ${lo.key} (${fmt(lo.stats.median)}). Widest middle half: ${widest.key} (${fmt(widest.stats.q1)} to ${fmt(widest.stats.q3)}).`;
  }, [groups, valueField, catField, fmt]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [catField.label, 'Min', 'Q1', 'Median', 'Q3', 'Max', 'n'],
      rows: groups.map((g) => [
        g.key,
        fmt(g.stats.min),
        fmt(g.stats.q1),
        fmt(g.stats.median),
        fmt(g.stats.q3),
        fmt(g.stats.max),
        g.stats.n.toLocaleString(locale),
      ]),
    }),
    [groups, catField, fmt, locale],
  );

  const horizontal = orientation === 'horizontal';
  const height = heightProp ?? (horizontal ? Math.max(groups.length, 3) * ROW_H + AXIS_H : 240);

  return (
    <ChartFrame
      kind="Box plot"
      status={statusOf(frame, groups.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => {
        const fmtTick = tickFormatter(
          { ...valueField, format: format ?? valueField.format },
          locale,
        );
        const scale = scaleLinear().domain(domain).nice(4);
        const ticks = scale.ticks(4);
        const tickLabels = ticks.map((t) => fmtTick(t));

        if (horizontal) {
          const longest = Math.max(...groups.map((g) => g.key.length), 4);
          const labelW = clamp(Math.ceil(longest * SANS_CHAR), 48, Math.max(48, width * 0.36));
          const x0 = labelW + 10;
          const x1 = width - Math.ceil(monoTextWidth(tickLabels[tickLabels.length - 1] ?? '') / 2);
          scale.range([x0, x1]);
          const rowH = (height - AXIS_H) / Math.max(groups.length, 1);
          const cy = (i: number) => i * rowH + rowH / 2;
          const indexAt = (e: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.floor((e.clientY - rect.top) / rowH);
            return i >= 0 && i < groups.length ? i : null;
          };
          const g = focus != null ? groups[focus] : null;
          return (
            <div style={{ position: 'relative', height }}>
              <svg width={width} height={height} aria-hidden="true">
                {focus != null && (
                  <rect
                    className="q-boxplot-hover"
                    x={0}
                    y={focus * rowH}
                    width={width}
                    height={rowH}
                    rx={6}
                  />
                )}
                {groups.map((gr, i) => {
                  const s = gr.stats;
                  const y = cy(i);
                  return (
                    <g key={gr.key} className="q-boxplot-group" data-muted={muted(gr) || undefined}>
                      <text className="q-boxplot-label" x={0} y={y} dy="0.34em">
                        {truncate(gr.key, labelW)}
                      </text>
                      <line
                        className="q-boxplot-whisker"
                        x1={scale(s.lo)}
                        x2={scale(s.hi)}
                        y1={Math.round(y) + 0.5}
                        y2={Math.round(y) + 0.5}
                      />
                      <rect
                        className="q-boxplot-box"
                        x={scale(s.q1)}
                        y={y - 6}
                        width={Math.max(1, scale(s.median) - scale(s.q1))}
                        height={12}
                      />
                      <rect
                        className="q-boxplot-box"
                        x={scale(s.median)}
                        y={y - 6}
                        width={Math.max(1, scale(s.q3) - scale(s.median))}
                        height={12}
                      />
                      <rect
                        className="q-boxplot-median"
                        x={scale(s.median) - 1}
                        y={y - 8}
                        width={2}
                        height={16}
                      />
                      {s.outliers.map((o, k) => (
                        <circle
                          key={k}
                          className="q-boxplot-outlier"
                          cx={scale(o)}
                          cy={y}
                          r={2.75}
                        />
                      ))}
                    </g>
                  );
                })}
                <g className="q-chart-axis">
                  {ticks.map((t, k) => (
                    <text
                      key={t}
                      x={scale(t)}
                      y={height - AXIS_H + 6}
                      dy="0.9em"
                      textAnchor="middle"
                    >
                      {tickLabels[k]}
                    </text>
                  ))}
                </g>
              </svg>
              <div
                className="q-chart-plot"
                style={{ cursor: select && hover != null ? 'pointer' : 'default' }}
                aria-label={`${frame['aria-label'] ?? 'Box plot'}. Use arrow keys to move between groups${select ? ', Enter to select' : ''}.`}
                role="application"
                {...keyboardProps}
                onKeyDown={onKeyDown}
                onFocus={() => setActive((a) => a ?? 0)}
                onPointerMove={(e) => setHover(indexAt(e))}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => {
                  const i = indexAt(e);
                  if (i != null) toggle(groups[i], e.shiftKey || e.metaKey);
                }}
              />
              {g && focus != null && (
                <ChartTooltip
                  x={scale(g.stats.q3)}
                  width={width}
                  top={clamp(cy(focus) - 40, 0, Math.max(0, height - 150))}
                  title={g.key}
                  rows={tipRows(g)}
                />
              )}
              <Live groups={groups} active={active} tipRows={tipRows} />
            </div>
          );
        }

        // Vertical
        const left = Math.ceil(Math.max(16, ...tickLabels.map((l) => monoTextWidth(l)))) + 12;
        const right = width - 4;
        const top = 8;
        const bottom = height - AXIS_H;
        scale.range([bottom, top]);
        const band = (right - left) / Math.max(groups.length, 1);
        const boxW = Math.max(6, Math.min(28, band * 0.5));
        const cx = (i: number) => left + band * i + band / 2;
        const indexAt = (e: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - rect.left - left) / band);
          return i >= 0 && i < groups.length ? i : null;
        };
        const g = focus != null ? groups[focus] : null;
        return (
          <div style={{ position: 'relative', height }}>
            <svg width={width} height={height} aria-hidden="true">
              <GridRows ys={ticks.map((t) => scale(t))} x0={left} x1={right} />
              <AxisLeft
                ticks={ticks.map((t, k) => ({ y: scale(t), label: tickLabels[k] }))}
                x={left - 10}
              />
              {focus != null && (
                <rect
                  className="q-boxplot-hover"
                  x={left + band * focus}
                  y={top}
                  width={band}
                  height={bottom - top}
                  rx={6}
                />
              )}
              {groups.map((gr, i) => {
                const s = gr.stats;
                const x = cx(i);
                return (
                  <g key={gr.key} className="q-boxplot-group" data-muted={muted(gr) || undefined}>
                    <line
                      className="q-boxplot-whisker"
                      x1={Math.round(x) + 0.5}
                      x2={Math.round(x) + 0.5}
                      y1={scale(s.lo)}
                      y2={scale(s.hi)}
                    />
                    <rect
                      className="q-boxplot-box"
                      x={x - boxW / 2}
                      y={scale(s.median)}
                      width={boxW}
                      height={Math.max(1, scale(s.q1) - scale(s.median))}
                    />
                    <rect
                      className="q-boxplot-box"
                      x={x - boxW / 2}
                      y={scale(s.q3)}
                      width={boxW}
                      height={Math.max(1, scale(s.median) - scale(s.q3))}
                    />
                    <rect
                      className="q-boxplot-median"
                      x={x - boxW / 2 - 2}
                      y={scale(s.median) - 1}
                      width={boxW + 4}
                      height={2}
                    />
                    {s.outliers.map((o, k) => (
                      <circle key={k} className="q-boxplot-outlier" cx={x} cy={scale(o)} r={2.75} />
                    ))}
                    <text
                      className="q-boxplot-label"
                      x={x}
                      y={bottom + 8}
                      dy="0.9em"
                      textAnchor="middle"
                    >
                      {truncate(gr.key, band - 6)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div
              className="q-chart-plot"
              style={{ cursor: select && hover != null ? 'pointer' : 'default' }}
              aria-label={`${frame['aria-label'] ?? 'Box plot'}. Use arrow keys to move between groups${select ? ', Enter to select' : ''}.`}
              role="application"
              {...keyboardProps}
              onKeyDown={onKeyDown}
              onFocus={() => setActive((a) => a ?? 0)}
              onPointerMove={(e) => setHover(indexAt(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => {
                const i = indexAt(e);
                if (i != null) toggle(groups[i], e.shiftKey || e.metaKey);
              }}
            />
            {g && focus != null && (
              <ChartTooltip
                x={cx(focus) + boxW / 2}
                width={width}
                top={clamp(scale(g.stats.q3) - 20, 0, Math.max(0, height - 150))}
                title={g.key}
                rows={tipRows(g)}
              />
            )}
            <Live groups={groups} active={active} tipRows={tipRows} />
          </div>
        );
      }}
    </ChartFrame>
  );
}

function Live({
  groups,
  active,
  tipRows,
}: {
  groups: Group[];
  active: number | null;
  tipRows: (g: Group) => TooltipRow[];
}) {
  const g = active != null ? groups[active] : null;
  return (
    <div className="q-visually-hidden" aria-live="polite">
      {g
        ? `${g.key}: ${tipRows(g)
            .map((r) => `${r.label} ${r.value}`)
            .join(', ')}`
        : ''}
    </div>
  );
}
