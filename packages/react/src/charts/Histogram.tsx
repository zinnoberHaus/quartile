import { median as d3median, sum } from 'd3-array';
import { type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react';
import { makeFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData, toComparable } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import {
  type Bin,
  binsInRange,
  clamp,
  fillBins,
  linearBins,
  type TimeInterval,
  timeBins,
  topRoundedBar,
} from './core/dist-stats';
import { ChartTooltip, type TooltipRow } from './core/guides';
import { monoTextWidth, tickFormatter } from './core/scales';

export interface HistogramProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows to bin, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Quantitative field to bin, or a date field for counts per day, week or month. */
  x: keyof R & string;
  /** Number of equal-width bins over the niced range of a quantitative `x`. */
  bins?: number;
  /** Calendar bucket for a date `x`. */
  interval?: TimeInterval;
  /** Sums this field per bin instead of counting rows. */
  value?: keyof R & string;
  /** Formats `x`: bin edges, the axis and the median. Defaults to the field's schema format. */
  format?: Formatter;
  /** Formats counts (or sums of `value`). */
  valueFormat?: Formatter;
  /** Label for counts in the tooltip when `value` is not set. */
  countLabel?: string;
  /** Drag across bins to publish a `between` range on `x`; click to clear. */
  brush?: boolean;
  /** Marks the median of `x` with a labelled rule. Quantitative `x` only. */
  median?: boolean;
  /** Bar fill. Defaults to the soft signal tint. */
  color?: string;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called when the brush changes. */
  onSelect?: (predicate: Predicate | null) => void;
}

const AXIS_H = 22;

export function Histogram<R extends Row = Row>(props: HistogramProps<R>) {
  const {
    data,
    x,
    bins: binCount = 24,
    interval = 'day',
    value,
    format,
    valueFormat,
    countLabel = 'Count',
    brush = false,
    median: showMedian = false,
    color,
    id,
    selection,
    onSelect,
    height = 180,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });

  const xField = fieldOf(schema, x, allRows);
  const temporal = xField.type === 'temporal';
  const valueField = value ? fieldOf(schema, value, allRows) : null;

  const model = useMemo(() => {
    const at = (r: Row) => Number(toComparable(r[x]));
    const weight = value ? (r: Row) => Number(r[value]) : undefined;
    const present = allRows.filter((r) => r[x] != null && Number.isFinite(at(r)));
    const bins: Bin[] = temporal
      ? timeBins(
          present.map((r) => new Date(at(r))),
          interval,
        )
      : linearBins(present.map(at), binCount);
    const totals = fillBins(bins, allRows, at, weight);
    const linked = rows === allRows ? totals : fillBins(bins, rows, at, weight);
    const med = temporal
      ? null
      : (d3median(rows.map(at).filter((v) => Number.isFinite(v))) ?? null);
    return { bins, totals, linked, med };
  }, [allRows, rows, x, value, temporal, interval, binCount]);
  const { bins, totals, linked, med } = model;
  const filtered = rows !== allRows;

  const fmtX = useMemo(
    () => makeFormatter(format ?? xField.format, { currency: xField.currency, locale }),
    [format, xField, locale],
  );
  const fmtV = useMemo(
    () =>
      makeFormatter(valueFormat ?? valueField?.format ?? 'integer', {
        currency: valueField?.currency,
        locale,
      }),
    [valueFormat, valueField, locale],
  );
  const fmtTick = useMemo(
    () => tickFormatter({ ...xField, format: format ?? xField.format }, locale),
    [xField, format, locale],
  );
  const fmtDay = useMemo(() => makeFormatter('weekday', { locale }), [locale]);
  const fmtShort = useMemo(() => makeFormatter('date-short', { locale }), [locale]);
  const fmtMonth = useMemo(() => makeFormatter('month', { locale }), [locale]);
  const monthName = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short' }), [locale]);

  const fmtPct = useMemo(
    () =>
      makeFormatter(
        { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 },
        { locale },
      ),
    [locale],
  );
  const binTitle = useMemo(
    () => (i: number) => {
      const b = bins[i];
      if (!temporal) return `${fmtX(b.x0)} – ${fmtX(b.x1)}`;
      if (interval === 'month') return fmtMonth(new Date(b.x0));
      if (interval === 'week') return `Week of ${fmtShort(new Date(b.x0))}`;
      return fmtDay(new Date(b.x0));
    },
    [bins, temporal, interval, fmtX, fmtMonth, fmtShort, fmtDay],
  );

  // Brush: the selection's own between-predicate, or local state without a Selection.
  const [localRange, setLocalRange] = useState<[number, number] | null>(null);
  const own = sel?.get(x);
  const ownRange: [number, number] | null = sel
    ? own && own.source === source && own.op === 'between'
      ? binsInRange(
          bins,
          own.value[0] == null ? Number.NEGATIVE_INFINITY : (toComparable(own.value[0]) as number),
          own.value[1] == null ? Number.POSITIVE_INFINITY : (toComparable(own.value[1]) as number),
        )
      : null
    : localRange;

  const commit = (range: [number, number] | null) => {
    if (!range) {
      setLocalRange(null);
      sel?.clear(x);
      onSelect?.(null);
      return;
    }
    const [a, b] = range;
    const lo = temporal ? new Date(bins[a].x0) : bins[a].x0;
    const hi = temporal ? new Date(bins[b].x1 - 1) : bins[b].x1;
    const p: Predicate = { field: x, op: 'between', value: [lo, hi], source };
    setLocalRange(range);
    sel?.set(x, [lo, hi], { op: 'between', source });
    onSelect?.(p);
  };

  const shift = useRef(false);
  const anchor = useRef<number | null>(null);
  const { active, setActive, keyboardProps } = useChartKeyboard(bins.length, (i) => {
    if (!brush) return;
    if (shift.current && anchor.current != null) {
      commit([Math.min(anchor.current, i), Math.max(anchor.current, i)]);
      return;
    }
    anchor.current = i;
    if (ownRange && ownRange[0] === i && ownRange[1] === i) commit(null);
    else commit([i, i]);
  });
  const onKeyDown = (e: KeyboardEvent) => {
    shift.current = e.shiftKey;
    keyboardProps.onKeyDown(e);
  };

  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const dragStart = useRef<{ i: number; px: number; moved: boolean } | null>(null);
  const focus = hover ?? active;
  const range = drag ?? ownRange;
  const inRange = (i: number) => !range || (i >= range[0] && i <= range[1]);

  const summary = useMemo(() => {
    if (bins.length === 0) return '';
    const counts = linked;
    let top = 0;
    counts.forEach((c, i) => {
      if (c > counts[top]) top = i;
    });
    const total = sum(counts);
    const what = valueField ? valueField.label : countLabel;
    const span = temporal
      ? `${fmtShort(new Date(bins[0].x0))} to ${fmtShort(new Date(bins[bins.length - 1].x0))}`
      : `${fmtX(bins[0].x0)} to ${fmtX(bins[bins.length - 1].x1)}`;
    const head = temporal
      ? `${what} per ${interval} of ${xField.label}, ${span}: total ${fmtV(total)}.`
      : `Distribution of ${xField.label}, ${fmtV(total)} in ${bins.length} bins from ${span}.`;
    const peak = ` Highest: ${binTitle(top)} (${fmtV(counts[top])}).`;
    const medText = showMedian && med != null ? ` Median ${fmtX(med)}.` : '';
    return head + peak + medText;
  }, [
    bins,
    linked,
    valueField,
    countLabel,
    temporal,
    fmtShort,
    fmtX,
    fmtV,
    interval,
    xField,
    showMedian,
    med,
    binTitle,
  ]);

  const table = useMemo<ChartTable>(() => {
    const what = valueField ? valueField.label : countLabel;
    return {
      columns: [
        xField.label,
        filtered ? `${what} in selection` : what,
        ...(filtered ? ['All'] : []),
      ],
      rows: bins.map((_, i) => [
        binTitle(i),
        fmtV(linked[i]),
        ...(filtered ? [fmtV(totals[i])] : []),
      ]),
    };
  }, [bins, binTitle, linked, totals, filtered, valueField, countLabel, xField, fmtV]);

  return (
    <ChartFrame
      kind="Histogram"
      status={statusOf(frame, bins.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => {
        const n = bins.length;
        const top = showMedian && med != null ? 20 : 6;
        const baseline = height - AXIS_H;
        const gap = width / n >= 7 ? 2 : width / n >= 3 ? 1 : 0;
        const bw = (width + gap) / n;
        const barW = Math.max(0.5, bw - gap);
        const maxV = Math.max(...totals, 1);
        const yOf = (v: number) => baseline - (v / maxV) * (baseline - top);
        const radius = barW >= 6 ? 2 : 1;
        const fill = color ?? 'var(--q-dist-fill)';
        const xOfValue = (v: number) => ((v - bins[0].x0) / (bins[n - 1].x1 - bins[0].x0)) * width;

        // Axis labels
        const axis: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];
        if (temporal) {
          let lastRight = Number.NEGATIVE_INFINITY;
          bins.forEach((b, i) => {
            const d = new Date(b.x0);
            const isFirst = i === 0;
            const monthStart = interval === 'month' || d.getDate() === 1;
            if (!isFirst && !(monthStart && (interval !== 'week' || d.getDate() <= 7))) return;
            const label = isFirst
              ? interval === 'month'
                ? fmtMonth(d)
                : fmtShort(d)
              : d.getMonth() === 0
                ? fmtMonth(d)
                : monthName.format(d);
            const lx = i * bw;
            const w = monoTextWidth(label);
            if (lx < lastRight + 14) return;
            if (lx + w > width) {
              if (width - w < lastRight + 14) return;
              axis.push({ x: width, label, anchor: 'end' });
            } else axis.push({ x: lx, label, anchor: 'start' });
            lastRight = lx + w;
          });
        } else {
          const lo = fmtTick(bins[0].x0);
          const hi = fmtTick(bins[n - 1].x1);
          axis.push({ x: 0, label: lo, anchor: 'start' });
          const title = xField.label.toLowerCase();
          if (width - monoTextWidth(lo) - monoTextWidth(hi) > monoTextWidth(title) + 32) {
            axis.push({ x: width / 2, label: title, anchor: 'middle' });
          }
          axis.push({ x: width, label: hi, anchor: 'end' });
        }

        const indexAt = (clientX: number, rect: DOMRect) =>
          clamp(Math.floor((clientX - rect.left) / bw), 0, n - 1);
        const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = indexAt(e.clientX, rect);
          if (i !== hover) setHover(i);
          const ds = dragStart.current;
          if (ds) {
            if (!ds.moved && Math.abs(e.clientX - rect.left - ds.px) < 4) return;
            ds.moved = true;
            setDrag([Math.min(ds.i, i), Math.max(ds.i, i)]);
          }
        };
        const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
          if (!brush || e.button !== 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Pointer capture is best-effort (unsupported in some test environments).
          }
          dragStart.current = {
            i: indexAt(e.clientX, rect),
            px: e.clientX - rect.left,
            moved: false,
          };
        };
        const onPointerUp = () => {
          const ds = dragStart.current;
          dragStart.current = null;
          if (!brush || !ds) return;
          if (!ds.moved) {
            setDrag(null);
            if (ownRange) commit(null);
            return;
          }
          const r = drag;
          setDrag(null);
          if (r) commit(r);
        };

        const tipRows: TooltipRow[] = [];
        if (focus != null) {
          const what = valueField ? valueField.label : countLabel;
          if (filtered) {
            const shown = inRange(focus) ? linked[focus] : 0;
            tipRows.push({ label: 'In selection', value: fmtV(shown) });
            tipRows.push({ label: 'All', value: fmtV(totals[focus]), tone: 'muted' });
          } else {
            const total = sum(totals);
            tipRows.push({ label: what, value: fmtV(totals[focus]) });
            if (total > 0)
              tipRows.push({
                label: 'Share',
                value: fmtPct(totals[focus] / total),
                tone: 'muted',
              });
          }
        }
        const medX = med != null ? xOfValue(med) : null;
        const medFlip = medX != null && medX > width * 0.68;

        return (
          <div style={{ position: 'relative', height }}>
            <svg width={width} height={height} aria-hidden="true">
              {focus != null && (
                <rect
                  className="q-histogram-hover"
                  x={focus * bw - gap / 2}
                  width={bw}
                  y={top}
                  height={baseline - top}
                />
              )}
              {bins.map((_, i) => {
                const fg = inRange(i) ? linked[i] : 0;
                const bx = i * bw;
                const showTrack = totals[i] > fg;
                return (
                  <g key={i}>
                    {showTrack && (
                      <path
                        d={topRoundedBar(
                          bx,
                          yOf(totals[i]),
                          barW,
                          baseline - yOf(totals[i]),
                          radius,
                        )}
                        style={{ fill: 'var(--q-dist-muted)' }}
                      />
                    )}
                    {fg > 0 && (
                      <path
                        d={topRoundedBar(bx, yOf(fg), barW, baseline - yOf(fg), radius)}
                        style={{ fill }}
                      />
                    )}
                  </g>
                );
              })}
              <line
                className="q-chart-baseline"
                x1={0}
                x2={width}
                y1={baseline + 0.5}
                y2={baseline + 0.5}
              />
              {range && (
                <g className="q-histogram-brush">
                  <rect
                    x={range[0] * bw - gap / 2}
                    width={(range[1] - range[0] + 1) * bw}
                    y={top - 6}
                    height={baseline - top + 6}
                  />
                  <line
                    x1={range[0] * bw - gap / 2}
                    x2={range[0] * bw - gap / 2}
                    y1={top - 6}
                    y2={baseline}
                  />
                  <line
                    x1={(range[1] + 1) * bw - gap / 2}
                    x2={(range[1] + 1) * bw - gap / 2}
                    y1={top - 6}
                    y2={baseline}
                  />
                </g>
              )}
              {showMedian && medX != null && med != null && (
                <g className="q-histogram-median">
                  <line x1={medX} x2={medX} y1={2} y2={baseline} />
                  <text
                    x={medFlip ? medX - 6 : medX + 6}
                    y={11}
                    textAnchor={medFlip ? 'end' : 'start'}
                  >
                    median {fmtX(med)}
                  </text>
                </g>
              )}
              <g className="q-chart-axis">
                {axis.map((t) => (
                  <text
                    key={`${t.x}-${t.label}`}
                    x={t.x}
                    y={baseline + 8}
                    dy="0.9em"
                    textAnchor={t.anchor}
                  >
                    {t.label}
                  </text>
                ))}
              </g>
            </svg>
            <div
              className="q-chart-plot"
              style={{
                cursor: brush ? 'crosshair' : 'default',
                touchAction: brush ? 'none' : undefined,
              }}
              aria-label={`${frame['aria-label'] ?? 'Histogram'}. Use arrow keys to move between bins${brush ? ', Enter to select a bin, Shift+Enter to extend' : ''}.`}
              role="application"
              {...keyboardProps}
              onKeyDown={onKeyDown}
              onFocus={() => setActive((a) => a ?? 0)}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                dragStart.current = null;
                setDrag(null);
              }}
            />
            {focus != null && tipRows.length > 0 && (
              <ChartTooltip
                x={focus * bw + barW / 2}
                width={width}
                top={Math.max(0, Math.min(yOf(totals[focus]) - 8, baseline - 90))}
                title={binTitle(focus)}
                rows={tipRows}
              />
            )}
            <div className="q-visually-hidden" aria-live="polite">
              {active != null && tipRows.length > 0
                ? `${binTitle(active)}: ${tipRows.map((r) => `${r.label} ${r.value}`).join(', ')}`
                : ''}
            </div>
          </div>
        );
      }}
    </ChartFrame>
  );
}
