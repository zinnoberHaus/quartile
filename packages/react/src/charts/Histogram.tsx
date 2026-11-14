import { median as d3median, sum } from 'd3-array';
import { type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react';
import { makeFieldFormatter, makeFormatter } from '../data/format';
import { finiteNumber } from '../data/number';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData, toComparable } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { type ChartColor, singleColor } from './core/colors';
import {
  type Bin,
  binsInRange,
  clamp,
  fillBins,
  linearBins,
  localDayKey,
  type TimeInterval,
  timeBins,
  topRoundedBar,
} from './core/dist-stats';
import { ChartTooltip, ReferenceRules, type TooltipRow } from './core/guides';
import {
  type ChartPresentationProps,
  describeReferences,
  marginSides,
  readOut,
  referenceLines,
} from './core/options';
import { monoTextWidth, tickFormatter } from './core/scales';
import { useSettled } from './core/settled';

export interface HistogramProps<R extends Row = Row>
  extends ChartBaseProps,
    Pick<ChartPresentationProps, 'margin' | 'xAxis'> {
  /** Rows to bin, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Quantitative field to bin, or a date field for counts per day, week or month. */
  x: keyof R & string;
  /** Number of equal-width bins over the niced range of a quantitative `x`. */
  bins?: number;
  /** Local-calendar bucket for a date `x`; display timeZone does not rebucket the data. */
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
  /** Bar fill: a palette name, 1–8, or any CSS color. Defaults to the soft signal tint. */
  color?: ChartColor;
  /** Writes each bin's count (or sum) above its bar; a label wider than its bar is left out. */
  labels?: boolean;
  /**
   * A vertical rule at a value of a quantitative `x`: a number, `{ value, label }`, or several.
   * The text is drawn beside the rule and included in the chart's accessible summary.
   */
  reference?: ChartPresentationProps['reference'];
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called when the brush changes. */
  onSelect?: (predicate: Predicate | null) => void;
}

const AXIS_H = 22;

/** More bins than this cannot be told apart on a screen and only cost memory. */
const MAX_BINS = 200;

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
    labels = false,
    reference,
    margin,
    xAxis = true,
    id,
    selection,
    onSelect,
    height = 180,
    ...frame
  } = props;
  const { locale, timeZone } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });

  const xField = fieldOf(schema, x, allRows);
  const temporal = xField.type === 'temporal';
  const referenceList = useSettled(reference);
  // A number marks a position on a quantitative axis; it does not name a date.
  const refs = useMemo(
    () => (temporal ? [] : referenceLines(referenceList)),
    [temporal, referenceList],
  );
  const valueField = value ? fieldOf(schema, value, allRows) : null;

  const model = useMemo(() => {
    const at = (r: Row) => finiteNumber(temporal ? toComparable(r[x]) : r[x]) ?? Number.NaN;
    const weight = value ? (r: Row) => finiteNumber(r[value]) ?? Number.NaN : undefined;
    const present = allRows.filter((r) => r[x] != null && Number.isFinite(at(r)));
    const bins: Bin[] = temporal
      ? timeBins(
          present.map((r) => new Date(at(r))),
          interval,
        )
      : linearBins(present.map(at), Math.min(MAX_BINS, Math.max(1, Math.round(binCount) || 1)));
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
    () => makeFieldFormatter(xField, { locale, timeZone }, format),
    [xField, locale, timeZone, format],
  );
  const fmtXTip = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone, surface: 'tooltip' }, format),
    [xField, locale, timeZone, format],
  );
  const valueOverride = valueFormat ?? (!valueField ? 'integer' : undefined);
  const fmtV = useMemo(
    () => makeFieldFormatter(valueField ?? undefined, { locale, timeZone }, valueOverride),
    [valueField, locale, timeZone, valueOverride],
  );
  const fmtVTip = useMemo(
    () =>
      makeFieldFormatter(
        valueField ?? undefined,
        { locale, timeZone, surface: 'tooltip' },
        valueOverride,
      ),
    [valueField, locale, timeZone, valueOverride],
  );
  const fmtTick = useMemo(
    () => tickFormatter(xField, locale, timeZone, format),
    [xField, locale, timeZone, format],
  );
  const fmtVShort = useMemo(
    () =>
      makeFieldFormatter(
        valueField ?? undefined,
        { locale, timeZone, surface: 'axis', short: true },
        valueOverride,
      ),
    [valueField, locale, timeZone, valueOverride],
  );
  const fmtPct = useMemo(
    () =>
      makeFormatter(
        { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 },
        { locale },
      ),
    [locale],
  );
  // Buckets are local calendar intervals. Civil date labels retain their day in every display zone.
  const binLabel = useMemo(
    () => (i: number, formatter: (v: unknown) => string) => {
      const b = bins[i];
      if (!temporal) return `${formatter(b.x0)} – ${formatter(b.x1)}`;
      const date = formatter(localDayKey(new Date(b.x0)));
      return interval === 'week' ? `Week of ${date}` : date;
    },
    [bins, temporal, interval],
  );
  const binTitle = useMemo(() => (i: number) => binLabel(i, fmtX), [binLabel, fmtX]);
  const binTipTitle = useMemo(() => (i: number) => binLabel(i, fmtXTip), [binLabel, fmtXTip]);

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
    setHover(null);
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
      ? `${fmtX(localDayKey(new Date(bins[0].x0)))} to ${fmtX(localDayKey(new Date(bins[bins.length - 1].x0)))}`
      : `${fmtX(bins[0].x0)} to ${fmtX(bins[bins.length - 1].x1)}`;
    const head = temporal
      ? `${what} per ${interval} of ${xField.label}, ${span}: total ${fmtV(total)}.`
      : `Distribution of ${xField.label}, ${fmtV(total)} in ${bins.length} bins from ${span}.`;
    const peak = ` Highest: ${binTitle(top)} (${fmtV(counts[top])}).`;
    const medText = showMedian && med != null ? ` Median ${fmtX(med)}.` : '';
    const refText = refs.length ? ` ${describeReferences(refs, readOut(fmtX, fmtTick))}` : '';
    return head + peak + medText + refText;
  }, [
    refs,
    fmtTick,
    bins,
    linked,
    valueField,
    countLabel,
    temporal,
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
        const pad = marginSides(margin);
        // The plot spans ox … ox + plotW; with no margin that is the whole width.
        const ox = pad.left ?? 0;
        const plotW = Math.max(1, width - ox - (pad.right ?? 0));
        // Room above the bars for the median or value labels, and for the text of a rule.
        const top =
          pad.top ?? 6 + ((showMedian && med != null) || labels ? 14 : 0) + (refs.length ? 14 : 0);
        const baseline = height - (pad.bottom ?? (xAxis ? AXIS_H : 4));
        const gap = plotW / n >= 7 ? 2 : plotW / n >= 3 ? 1 : 0;
        const bw = (plotW + gap) / n;
        const barW = Math.max(0.5, bw - gap);
        const maxV = Math.max(...totals, 1);
        const yOf = (v: number) => baseline - (v / maxV) * (baseline - top);
        const radius = barW >= 6 ? 2 : 1;
        const fill = singleColor(color, 'var(--q-dist-fill)');
        const xOfValue = (v: number) =>
          ox + ((v - bins[0].x0) / (bins[n - 1].x1 - bins[0].x0)) * plotW;

        // Axis labels
        const axis: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];
        if (temporal) {
          let lastRight = Number.NEGATIVE_INFINITY;
          bins.forEach((b, i) => {
            const d = new Date(b.x0);
            const isFirst = i === 0;
            const monthStart = interval === 'month' || d.getDate() === 1;
            if (!isFirst && !(monthStart && (interval !== 'week' || d.getDate() <= 7))) return;
            const label = fmtTick(localDayKey(d));
            const lx = ox + i * bw;
            const w = monoTextWidth(label);
            if (lx < lastRight + 14) return;
            if (lx + w > ox + plotW) {
              if (ox + plotW - w < lastRight + 14) return;
              axis.push({ x: ox + plotW, label, anchor: 'end' });
            } else axis.push({ x: lx, label, anchor: 'start' });
            lastRight = lx + w;
          });
        } else {
          const lo = fmtTick(bins[0].x0);
          const hi = fmtTick(bins[n - 1].x1);
          axis.push({ x: ox, label: lo, anchor: 'start' });
          const title = xField.label.toLowerCase();
          if (plotW - monoTextWidth(lo) - monoTextWidth(hi) > monoTextWidth(title) + 32) {
            axis.push({ x: ox + plotW / 2, label: title, anchor: 'middle' });
          }
          axis.push({ x: ox + plotW, label: hi, anchor: 'end' });
        }

        const indexAt = (clientX: number, rect: DOMRect) =>
          clamp(Math.floor((clientX - rect.left - ox) / bw), 0, n - 1);
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
            tipRows.push({
              label: 'In selection',
              description: valueField?.description,
              value: fmtVTip(shown),
            });
            tipRows.push({
              label: 'All',
              description: valueField?.description,
              value: fmtVTip(totals[focus]),
              tone: 'muted',
            });
          } else {
            const total = sum(totals);
            tipRows.push({
              label: what,
              description: valueField?.description,
              value: fmtVTip(totals[focus]),
            });
            if (total > 0)
              tipRows.push({
                label: 'Share',
                value: fmtPct(totals[focus] / total),
                tone: 'muted',
              });
          }
        }
        const medX = med != null ? xOfValue(med) : null;
        const medFlip = medX != null && medX - ox > plotW * 0.68;

        return (
          <div style={{ position: 'relative', height }}>
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              aria-hidden="true"
            >
              {focus != null && (
                <rect
                  className="q-histogram-hover"
                  x={ox + focus * bw - gap / 2}
                  width={bw}
                  y={top}
                  height={baseline - top}
                />
              )}
              {bins.map((_, i) => {
                const fg = inRange(i) ? linked[i] : 0;
                const bx = ox + i * bw;
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
                x1={ox}
                x2={ox + plotW}
                y1={baseline + 0.5}
                y2={baseline + 0.5}
              />
              {labels && (
                <g className="q-chart-value-labels">
                  {bins.map((_, i) => {
                    const fg = inRange(i) ? linked[i] : 0;
                    const text = fg > 0 ? fmtVShort(fg) : '';
                    if (!text || monoTextWidth(text) > bw + 2) return null;
                    return (
                      <text key={i} x={ox + i * bw + barW / 2} y={yOf(fg) - 4} textAnchor="middle">
                        {text}
                      </text>
                    );
                  })}
                </g>
              )}
              {range && (
                <g className="q-histogram-brush">
                  <rect
                    x={ox + range[0] * bw - gap / 2}
                    width={(range[1] - range[0] + 1) * bw}
                    y={top - 6}
                    height={baseline - top + 6}
                  />
                  <line
                    x1={ox + range[0] * bw - gap / 2}
                    x2={ox + range[0] * bw - gap / 2}
                    y1={top - 6}
                    y2={baseline}
                  />
                  <line
                    x1={ox + (range[1] + 1) * bw - gap / 2}
                    x2={ox + (range[1] + 1) * bw - gap / 2}
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
              {refs.length > 0 && (
                <ReferenceRules
                  vertical
                  marks={refs.map((r) => ({
                    at: xOfValue(r.value),
                    text: r.label ?? fmtTick(r.value),
                  }))}
                  from={2}
                  to={baseline}
                  min={ox}
                  max={ox + plotW}
                />
              )}
              {xAxis && (
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
              )}
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
                note={frame.tooltipNote}
                x={ox + focus * bw + barW / 2}
                width={width}
                top={Math.max(0, Math.min(yOf(totals[focus]) - 8, baseline - 90))}
                title={binTipTitle(focus)}
                rows={tipRows}
              />
            )}
            <div className="q-visually-hidden" aria-live="polite">
              {active != null && tipRows.length > 0
                ? `${binTipTitle(active)}: ${tipRows.map((r) => `${r.label} ${r.value}${r.description ? `. ${r.description}` : ''}`).join(', ')}`
                : ''}
            </div>
          </div>
        );
      }}
    </ChartFrame>
  );
}
