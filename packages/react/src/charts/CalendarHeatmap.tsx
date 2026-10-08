import { sum } from 'd3-array';
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { makeFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData, toComparable, toDate } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useElementSize } from '../lib/useElementSize';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { RampLegend, useGridKeyboard } from './core/dist-parts';
import {
  type AggregateOp,
  aggregateValues,
  calendarCells,
  clamp,
  localDayKey,
  RAMP,
  rampDomain,
  rampLevel,
  weeksBetween,
} from './core/dist-stats';
import { ChartTooltip, type TooltipRow } from './core/guides';
import { monoTextWidth } from './core/scales';

export interface CalendarHeatmapProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows to plot, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Date field. Rows are grouped by local calendar day. */
  date: keyof R & string;
  /** Measure per day. Counts rows when omitted. */
  value?: keyof R & string;
  /** How rows on the same day combine. Defaults to sum (or count without `value`). */
  aggregate?: AggregateOp;
  /** Formats the daily value. Defaults to the field's schema format. */
  format?: Formatter;
  /** Label for counts in the tooltip when `value` is not set. */
  countLabel?: string;
  /** Week columns to show, ending with the latest date. Defaults to as many as fit. */
  weeks?: number;
  /** First row of each column: 0 = Sunday, 1 = Monday. */
  weekStart?: 0 | 1;
  /** Value range the ramp spans. Defaults to zero → maximum. */
  domain?: [number, number];
  /** Shows Mon / Wed / Fri labels beside the rows. */
  dayLabels?: boolean;
  /** Shows the "Fewer … More" ramp legend. */
  legend?: boolean;
  /** Click selects a day (Shift-click extends a range) as a `between` predicate on `date`. */
  select?: boolean;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  onSelect?: (predicate: Predicate | null) => void;
}

const GAP = 3;
const MIN_CELL = 8;
const MAX_CELL = 18;
const MONTH_H = 20;
const LEGEND_H = 20;
const DAY_LABEL_W = 30;

export function CalendarHeatmap<R extends Row = Row>(props: CalendarHeatmapProps<R>) {
  const {
    data,
    date,
    value,
    aggregate,
    format,
    weeks,
    countLabel = 'Count',
    weekStart = 0,
    domain,
    dayLabels = false,
    legend = true,
    select = false,
    id,
    selection,
    onSelect,
    height: heightProp,
    className,
    style,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const wrap = useRef<HTMLDivElement>(null);
  const { width: measured } = useElementSize(wrap);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const valueField = value ? fieldOf(schema, value, allRows) : null;
  const how: AggregateOp = aggregate ?? (value ? 'sum' : 'count');
  const fmt = useMemo(
    () =>
      makeFormatter(format ?? (how === 'count' ? 'integer' : valueField?.format), {
        currency: valueField?.currency,
        locale,
      }),
    [format, how, valueField, locale],
  );
  const fmtDay = useMemo(() => makeFormatter('weekday', { locale }), [locale]);
  const fmtDate = useMemo(() => makeFormatter('date', { locale }), [locale]);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short' }), [locale]);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short' }), [locale]);

  // Data extent from every row, so filtering never shifts the calendar.
  const span = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const r of allRows) {
      if (r[date] == null) continue;
      const t = toDate(r[date]).getTime();
      if (Number.isNaN(t)) continue;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return Number.isFinite(lo) ? { start: new Date(lo), end: new Date(hi) } : null;
  }, [allRows, date]);

  const byDay = useMemo(() => {
    const groups = new Map<string, { values: number[]; n: number }>();
    for (const r of rows) {
      if (r[date] == null) continue;
      const k = localDayKey(r[date]);
      let g = groups.get(k);
      if (!g) {
        g = { values: [], n: 0 };
        groups.set(k, g);
      }
      g.n++;
      if (value) g.values.push(Number(r[value]));
    }
    const out = new Map<string, number>();
    for (const [k, g] of groups) out.set(k, aggregateValues(g.values, how, g.n));
    return out;
  }, [rows, date, value, how]);

  const labelW = dayLabels ? DAY_LABEL_W : 0;
  const dataWeeks = span ? weeksBetween(span.start, span.end, weekStart) : 0;
  const avail = Math.max(0, measured - labelW);
  const shownWeeks = Math.max(
    1,
    weeks ??
      (measured > 0
        ? Math.min(dataWeeks, Math.floor((avail + GAP) / (MIN_CELL + GAP)))
        : Math.min(dataWeeks, 26)),
  );
  let cell = measured > 0 ? (avail - GAP * (shownWeeks - 1)) / shownWeeks : 12;
  cell = Math.min(MAX_CELL, cell);
  if (heightProp)
    cell = Math.min(cell, (heightProp - MONTH_H - (legend ? LEGEND_H : 0) - 6 * GAP) / 7);
  cell = Math.max(2, cell);
  const gridH = 7 * cell + 6 * GAP;
  const height = heightProp ?? Math.round(gridH + MONTH_H + (legend ? LEGEND_H : 0));

  const cells = useMemo(
    () => (span ? calendarCells(span.end, shownWeeks, weekStart) : []),
    [span, shownWeeks, weekStart],
  );
  const values = useMemo(
    () => cells.map((c) => byDay.get(localDayKey(c.date)) ?? null),
    [cells, byDay],
  );
  const [lo, hi] = useMemo(() => rampDomain(values, domain), [values, domain]);

  // Own selection: a between-range of days.
  const [localRange, setLocalRange] = useState<[number, number] | null>(null);
  const own = sel?.get(date);
  const ownRange: [number, number] | null = sel
    ? own && own.source === source && own.op === 'between'
      ? [toComparable(own.value[0]) as number, toComparable(own.value[1]) as number]
      : null
    : localRange;
  const anchor = useRef<number | null>(null);
  const pick = (i: number, extend: boolean) => {
    if (!select) return;
    const day = cells[i].date;
    const a = extend && anchor.current != null ? cells[anchor.current]?.date : day;
    if (!extend) anchor.current = i;
    const from = a && a < day ? a : day;
    const to = a && a > day ? a : day;
    const lo0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const hi0 = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1, 0, 0, 0, -1);
    if (!extend && ownRange && ownRange[0] === lo0.getTime() && ownRange[1] === hi0.getTime()) {
      setLocalRange(null);
      sel?.clear(date);
      onSelect?.(null);
      return;
    }
    setLocalRange([lo0.getTime(), hi0.getTime()]);
    sel?.set(date, [lo0, hi0], { op: 'between', source });
    onSelect?.({ field: date, op: 'between', value: [lo0, hi0], source });
  };
  const inRange = (i: number) => {
    if (!ownRange) return true;
    const t = cells[i].date.getTime();
    return t >= ownRange[0] && t <= ownRange[1];
  };

  const { active, setActive, keyboardProps } = useGridKeyboard(
    cells.length,
    { right: 7, down: 1 },
    (i, e: KeyboardEvent) => pick(i, e.shiftKey),
  );
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;
  const what = valueField ? valueField.label : countLabel;

  const tipFor = (i: number): { title: string; rows: TooltipRow[] } => {
    const v = values[i];
    return {
      title: fmtDay(cells[i].date),
      rows: [{ label: what, value: v == null ? 'No data' : fmt(v) }],
    };
  };

  const summary = useMemo(() => {
    if (!span || cells.length === 0) return '';
    let peak = -1;
    let low = -1;
    values.forEach((v, i) => {
      if (v == null) return;
      if (peak < 0 || v > (values[peak] as number)) peak = i;
      if (low < 0 || v < (values[low] as number)) low = i;
    });
    const total = sum(values.filter((v): v is number => v != null));
    const head = `${what} per day from ${fmtDate(cells[0].date)} to ${fmtDate(cells[cells.length - 1].date)}: total ${fmt(total)}.`;
    if (peak < 0) return head;
    return `${head} Highest ${fmtDay(cells[peak].date)} (${fmt(values[peak])}); lowest ${fmtDay(cells[low].date)} (${fmt(values[low])}).`;
  }, [span, cells, values, what, fmt, fmtDate, fmtDay]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: ['Date', what],
      rows: cells.flatMap((c, i) => (values[i] == null ? [] : [[fmtDay(c.date), fmt(values[i])]])),
    }),
    [cells, values, what, fmt, fmtDay],
  );

  return (
    <div ref={wrap} className={className} style={style}>
      <ChartFrame
        kind="Calendar heatmap"
        status={statusOf(frame, span ? allRows.length : 0)}
        height={height}
        summary={summary}
        table={table}
        {...frame}
      >
        {({ width }) => {
          const step = cell + GAP;
          const gridW = shownWeeks * step - GAP;
          const xOf = (col: number) => labelW + col * step;
          const yOf = (row: number) => row * step;

          // Month labels at the column holding the 1st, spaced so they never collide.
          const months: { x: number; label: string; anchor: 'start' | 'end' }[] = [];
          let lastRight = Number.NEGATIVE_INFINITY;
          for (const c of cells) {
            if (c.date.getDate() !== 1) continue;
            const label =
              c.date.getMonth() === 0
                ? `${monthFmt.format(c.date)} ’${String(c.date.getFullYear()).slice(2)}`
                : monthFmt.format(c.date);
            const w = monoTextWidth(label);
            let x = xOf(c.col);
            let anchor: 'start' | 'end' = 'start';
            if (x + w > labelW + gridW) {
              x = labelW + gridW;
              anchor = 'end';
              if (x - w < lastRight + 10) continue;
            } else if (x < lastRight + 10) continue;
            months.push({ x, label, anchor });
            lastRight = anchor === 'end' ? x : x + w;
          }

          const indexAt = (e: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mx = e.clientX - rect.left - labelW;
            const my = e.clientY - rect.top;
            if (mx < 0 || my < 0 || my > gridH) return null;
            const col = Math.floor(mx / step);
            const row = Math.floor(my / step);
            if (row > 6 || col >= shownWeeks) return null;
            const i = col * 7 + row;
            return i < cells.length ? i : null;
          };
          const tip = focus != null && cells[focus] ? tipFor(focus) : null;
          const fc = focus != null ? cells[focus] : null;

          return (
            <div style={{ position: 'relative', height }}>
              <svg width={width} height={gridH + MONTH_H} aria-hidden="true">
                {dayLabels && (
                  <g className="q-chart-axis">
                    {[1, 3, 5].map((row) => {
                      const d = new Date(2026, 0, 4 + ((row + weekStart) % 7));
                      return (
                        <text key={row} x={0} y={yOf(row) + cell / 2} dy="0.34em">
                          {dayFmt.format(d)}
                        </text>
                      );
                    })}
                  </g>
                )}
                {cells.map((c, i) => (
                  <rect
                    key={i}
                    className="q-dist-cell"
                    x={xOf(c.col)}
                    y={yOf(c.row)}
                    width={cell}
                    height={cell}
                    rx={Math.max(0, Math.min(2, cell / 4))}
                    style={{ fill: RAMP[rampLevel(values[i], lo, hi)] }}
                    opacity={inRange(i) ? 1 : 0.3}
                  />
                ))}
                {fc && (
                  <rect
                    className="q-dist-cell-active"
                    x={xOf(fc.col) - 1.5}
                    y={yOf(fc.row) - 1.5}
                    width={cell + 3}
                    height={cell + 3}
                    rx={Math.max(0, Math.min(4, cell / 3))}
                  />
                )}
                <g className="q-chart-axis">
                  {months.map((m) => (
                    <text
                      key={`${m.x}-${m.label}`}
                      x={m.x}
                      y={gridH + 6}
                      dy="0.9em"
                      textAnchor={m.anchor}
                    >
                      {m.label}
                    </text>
                  ))}
                </g>
              </svg>
              {legend && (
                <div className="q-dist-foot" style={{ height: LEGEND_H, width: labelW + gridW }}>
                  <RampLegend />
                </div>
              )}
              <div
                className="q-chart-plot"
                style={{
                  height: gridH,
                  width: labelW + gridW,
                  cursor: select ? 'pointer' : 'default',
                }}
                aria-label={`${frame['aria-label'] ?? 'Calendar heatmap'}. Arrow keys move by day and week${select ? ', Enter selects a day, Shift+Enter extends' : ''}.`}
                role="application"
                {...keyboardProps}
                onFocus={() => setActive((a) => a ?? cells.length - 1)}
                onPointerMove={(e) => setHover(indexAt(e))}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => {
                  const i = indexAt(e);
                  if (i != null) pick(i, e.shiftKey);
                }}
              />
              {tip && fc && (
                <ChartTooltip
                  x={xOf(fc.col) + cell}
                  width={width}
                  top={clamp(yOf(fc.row) - 12, 0, Math.max(0, gridH - 40))}
                  title={tip.title}
                  rows={tip.rows}
                />
              )}
              <div className="q-visually-hidden" aria-live="polite">
                {active != null && cells[active]
                  ? `${tipFor(active).title}: ${tipFor(active)
                      .rows.map((r) => `${r.label} ${r.value}`)
                      .join(', ')}`
                  : ''}
              </div>
            </div>
          );
        }}
      </ChartFrame>
    </div>
  );
}
