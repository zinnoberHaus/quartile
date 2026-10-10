import { type MouseEvent, type PointerEvent, useMemo, useState } from 'react';
import { makeFieldFormatter } from '../data/format';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { RampLegend, useGridKeyboard } from './core/dist-parts';
import {
  type AggregateOp,
  aggregateMatrix,
  clamp,
  orderedKeys,
  RAMP,
  rampDomain,
  rampLevel,
} from './core/dist-stats';
import { ChartTooltip, type TooltipRow } from './core/guides';

export interface HeatmapProps<R extends Row = Row> extends ChartBaseProps {
  /** Raw rows (aggregated per cell), or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Field for the columns, e.g. hour of day. */
  x: keyof R & string;
  /** Field for the rows, e.g. weekday. */
  y: keyof R & string;
  /** Measure per cell. Counts rows when omitted. */
  value?: keyof R & string;
  /** How rows in a cell combine. Defaults to sum (or count without `value`). */
  aggregate?: AggregateOp;
  /** Formats cell values. Defaults to the field's schema format. */
  format?: Formatter;
  /** Formats column values in the tooltip and peak label. */
  xFormat?: Formatter;
  /** Formats row values in the tooltip, row labels and peak label. */
  yFormat?: Formatter;
  /** Short column labels under the grid, e.g. `(h) => String(h).padStart(2, '0')`. Thinned to fit. */
  xLabels?: (value: unknown, index: number) => string;
  /** Column order, e.g. 0…23 so empty hours still get a column. Defaults to sorted values. */
  xOrder?: readonly unknown[];
  /** Row order, e.g. Mon…Sun. Defaults to first appearance (numbers and dates sorted). */
  yOrder?: readonly unknown[];
  /** Value range the ramp spans. Defaults to zero → maximum. */
  domain?: [number, number];
  /** Cell height in px. Width always fills the container. */
  cellHeight?: number;
  /** Label for counts in the tooltip when `value` is not set. */
  countLabel?: string;
  /** Shows "peak <row> <column>" under the grid. */
  peak?: boolean;
  /** Shows the "Fewer … More" ramp legend. */
  legend?: boolean;
  /** Publisher id. Defaults to a generated id. */
  id?: string;
  /** Selection to read from. Defaults to the nearest; false opts out. */
  selection?: string | false;
}

const GAP = 2;
const X_LABEL_H = 20;
const FOOT_H = 22;

export function Heatmap<R extends Row = Row>(props: HeatmapProps<R>) {
  const {
    data,
    x,
    y,
    value,
    aggregate,
    format,
    xFormat,
    yFormat,
    xLabels,
    xOrder,
    yOrder,
    domain,
    cellHeight = 15,
    countLabel = 'Count',
    peak: showPeak = true,
    legend = true,
    id,
    selection,
    height: heightProp,
    ...frame
  } = props;
  const { locale, timeZone } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows } = useLinkedRows(allRows, { selection, source });
  const xField = fieldOf(schema, x, allRows);
  const yField = fieldOf(schema, y, allRows);
  const valueField = value ? fieldOf(schema, value, allRows) : null;
  const how: AggregateOp = aggregate ?? (value ? 'sum' : 'count');

  const measureField = how === 'count' ? undefined : (valueField ?? undefined);
  const fmt = useMemo(
    () =>
      makeFieldFormatter(
        measureField,
        { locale, timeZone },
        format ?? (!measureField ? 'integer' : undefined),
      ),
    [measureField, locale, timeZone, format],
  );
  const fmtTip = useMemo(
    () =>
      makeFieldFormatter(
        measureField,
        { locale, timeZone, surface: 'tooltip' },
        format ?? (!measureField ? 'integer' : undefined),
      ),
    [measureField, locale, timeZone, format],
  );
  const fmtX = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone }, xFormat),
    [xField, locale, timeZone, xFormat],
  );
  const fmtY = useMemo(
    () => makeFieldFormatter(yField, { locale, timeZone }, yFormat),
    [yField, locale, timeZone, yFormat],
  );
  const fmtXTip = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone, surface: 'tooltip' }, xFormat),
    [xField, locale, timeZone, xFormat],
  );
  const fmtYTip = useMemo(
    () => makeFieldFormatter(yField, { locale, timeZone, surface: 'tooltip' }, yFormat),
    [yField, locale, timeZone, yFormat],
  );
  const fmtXAxis = useMemo(
    () => makeFieldFormatter(xField, { locale, timeZone, surface: 'axis', short: true }, xFormat),
    [xField, locale, timeZone, xFormat],
  );
  const fmtYAxis = useMemo(
    () => makeFieldFormatter(yField, { locale, timeZone, surface: 'axis', short: true }, yFormat),
    [yField, locale, timeZone, yFormat],
  );

  // Rows and columns come from every row, so filtering never drops a column.
  const matrix = useMemo(() => {
    const xs = orderedKeys(
      allRows.map((r) => r[x]),
      xOrder,
    );
    const ys = orderedKeys(
      allRows.map((r) => r[y]),
      yOrder,
    );
    return aggregateMatrix(rows, { x, y, value, aggregate: how, xOrder: xs, yOrder: ys });
  }, [allRows, rows, x, y, value, how, xOrder, yOrder]);
  const { xs, ys, cells, counts, peak, low } = matrix;
  const [lo, hi] = useMemo(() => rampDomain(cells.flat(), domain), [cells, domain]);
  const what = valueField ? valueField.label : countLabel;

  const nCols = xs.length;
  const count = ys.length * nCols;
  const { active, setActive, keyboardProps } = useGridKeyboard(count, { right: 1, down: nCols });
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;

  const cellTitle = (row: number, col: number) => `${fmtYTip(ys[row])} ${fmtXTip(xs[col])}`;
  const tipFor = (i: number): { title: string; rows: TooltipRow[] } => {
    const row = Math.floor(i / nCols);
    const col = i % nCols;
    const v = cells[row]?.[col] ?? null;
    const out: TooltipRow[] = [
      {
        label: what,
        value: v == null ? 'No data' : fmtTip(v),
        description: measureField?.description,
      },
    ];
    if (how !== 'count' && v != null)
      out.push({ label: 'Rows', value: counts[row][col].toLocaleString(locale), tone: 'muted' });
    return { title: cellTitle(row, col), rows: out };
  };

  const summary = useMemo(() => {
    if (!peak || !low) return '';
    return `${what} by ${yField.label} and ${xField.label}, ${ys.length} × ${xs.length} cells. Highest ${fmtY(ys[peak.row])} ${fmtX(xs[peak.col])} (${fmt(peak.value)}); lowest ${fmtY(ys[low.row])} ${fmtX(xs[low.col])} (${fmt(low.value)}).`;
  }, [peak, low, what, yField, xField, ys, xs, fmtY, fmtX, fmt]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [yField.label, ...xs.map((v) => fmtX(v))],
      rows: ys.map((yv, r) => [fmtY(yv), ...cells[r].map((v) => fmt(v))]),
    }),
    [xs, ys, cells, yField, fmtX, fmtY, fmt],
  );

  const gridH = ys.length * (cellHeight + GAP) - GAP;
  const footOn = legend || showPeak;
  const height = heightProp ?? Math.max(60, gridH + X_LABEL_H + (footOn ? FOOT_H : 0));
  const rowLabels = ys.map((v) => fmtYAxis(v));
  const labelW = Math.max(30, Math.ceil(Math.max(0, ...rowLabels.map((l) => l.length)) * 6) + 10);

  return (
    <ChartFrame
      kind="Heatmap"
      status={statusOf(frame, count > 0 ? allRows.length : 0)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => {
        const colW = (width - labelW - GAP * (nCols - 1)) / Math.max(nCols, 1);
        const step = colW + GAP;
        const xOf = (col: number) => labelW + col * step;
        const yOf = (row: number) => row * (cellHeight + GAP);
        const labelText = xs.map((v, i) => (xLabels ? xLabels(v, i) : fmtXAxis(v)));
        const widest = Math.max(1, ...labelText.map((l) => l.length)) * 6 + 8;
        // Sparse, evenly stepped labels (every 6th of 24 hours at card widths).
        const every =
          [1, 2, 3, 4, 6, 8, 12, 24, 48].find((k) => k * step >= Math.max(widest, 72)) ?? nCols;

        const indexAt = (e: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left - labelW;
          const my = e.clientY - rect.top;
          if (mx < 0 || my < 0 || my > gridH) return null;
          const col = Math.min(nCols - 1, Math.floor(mx / step));
          const row = Math.min(ys.length - 1, Math.floor(my / (cellHeight + GAP)));
          return row * nCols + col;
        };
        const tip = focus != null ? tipFor(focus) : null;
        const fRow = focus != null ? Math.floor(focus / nCols) : 0;
        const fCol = focus != null ? focus % nCols : 0;

        return (
          <div style={{ position: 'relative', height }}>
            <svg width={width} height={gridH + X_LABEL_H} aria-hidden="true">
              <g className="q-heatmap-labels">
                {rowLabels.map((l, row) => (
                  <text key={row} x={0} y={yOf(row) + cellHeight / 2} dy="0.34em">
                    {l}
                  </text>
                ))}
                {labelText.map((l, col) =>
                  col % every === 0 ? (
                    <text key={col} x={xOf(col)} y={gridH + 6} dy="0.9em">
                      {l}
                    </text>
                  ) : null,
                )}
              </g>
              {cells.map((row, r) =>
                row.map((v, c) => (
                  <rect
                    key={`${r}-${c}`}
                    className="q-dist-cell"
                    x={xOf(c)}
                    y={yOf(r)}
                    width={Math.max(1, colW)}
                    height={cellHeight}
                    rx={Math.max(0, Math.min(3, colW / 3))}
                    style={{ fill: RAMP[rampLevel(v, lo, hi)] }}
                  />
                )),
              )}
              {focus != null && (
                <rect
                  className="q-dist-cell-active"
                  x={xOf(fCol) - 1.5}
                  y={yOf(fRow) - 1.5}
                  width={Math.max(1, colW) + 3}
                  height={cellHeight + 3}
                  rx={4}
                />
              )}
            </svg>
            {footOn && (
              <div className="q-dist-foot" style={{ height: FOOT_H }}>
                {showPeak && peak && (
                  <span className="q-heatmap-peak">
                    peak {fmtY(ys[peak.row])} {fmtX(xs[peak.col])}
                  </span>
                )}
                {legend && <RampLegend />}
              </div>
            )}
            <div
              className="q-chart-plot"
              style={{ height: gridH }}
              aria-label={`${frame['aria-label'] ?? 'Heatmap'}. Arrow keys move between cells.`}
              role="application"
              {...keyboardProps}
              onKeyDown={(event) => {
                setHover(null);
                keyboardProps.onKeyDown(event);
              }}
              onFocus={() => setActive((a) => a ?? (peak ? peak.row * nCols + peak.col : 0))}
              onPointerMove={(e) => setHover(indexAt(e))}
              onPointerLeave={() => setHover(null)}
            />
            {tip && focus != null && (
              <ChartTooltip
                note={frame.tooltipNote}
                x={xOf(fCol) + colW}
                width={width}
                top={clamp(yOf(fRow) - 10, 0, Math.max(0, gridH - 30))}
                title={tip.title}
                rows={tip.rows}
              />
            )}
            <div className="q-visually-hidden" aria-live="polite">
              {active != null
                ? `${tipFor(active).title}: ${tipFor(active)
                    .rows.map(
                      (r) => `${r.label} ${r.value}${r.description ? `. ${r.description}` : ''}`,
                    )
                    .join(', ')}`
                : ''}
            </div>
          </div>
        );
      }}
    </ChartFrame>
  );
}
