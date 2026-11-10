import { type CSSProperties, type ReactNode, useRef } from 'react';
import { cx } from '../../lib/cx';
import { useElementSize } from '../../lib/useElementSize';

/** Horizontal hairline gridlines at the given y positions. */
export function GridRows({ ys, x0, x1 }: { ys: number[]; x0: number; x1: number }) {
  return (
    <g className="q-chart-grid" aria-hidden="true">
      {ys.map((y) => (
        <line key={y} x1={x0} x2={x1} y1={Math.round(y) + 0.5} y2={Math.round(y) + 0.5} />
      ))}
    </g>
  );
}

/** Mono tick labels on the left, right-aligned against the plot. */
export function AxisLeft({ ticks, x }: { ticks: { y: number; label: string }[]; x: number }) {
  return (
    <g className="q-chart-axis" aria-hidden="true">
      {ticks.map((t) => (
        <text key={`${t.y}-${t.label}`} x={x} y={t.y} dy="0.32em" textAnchor="end">
          {t.label}
        </text>
      ))}
    </g>
  );
}

/** Mono tick labels under the plot. The first and last labels align to the plot edges. */
export function AxisBottom({
  ticks,
  y,
  x0,
  x1,
}: {
  ticks: { x: number; label: string }[];
  y: number;
  x0: number;
  x1: number;
}) {
  return (
    <g className="q-chart-axis" aria-hidden="true">
      {ticks.map((t) => {
        const anchor = t.x - x0 < 16 ? 'start' : x1 - t.x < 16 ? 'end' : 'middle';
        return (
          <text key={`${t.x}-${t.label}`} x={t.x} y={y} dy="0.9em" textAnchor={anchor}>
            {t.label}
          </text>
        );
      })}
    </g>
  );
}

export interface TooltipRow {
  label: ReactNode;
  value: ReactNode;
  /** Plain-text context for this measure. */
  description?: string;
  color?: string;
  /** Renders the swatch as a dashed line (comparison series). */
  dashed?: boolean;
  tone?: 'positive' | 'negative' | 'muted';
}

/**
 * The dark chart tooltip, same surface as every overlay. Positioned inside the chart frame;
 * prefers the left of points past 60% of the width and clamps to the chart bounds.
 */
export function ChartTooltip({
  x,
  width,
  title,
  rows,
  footer,
  note,
  top = 6,
}: {
  x: number;
  width: number;
  title?: ReactNode;
  rows: TooltipRow[];
  footer?: TooltipRow;
  note?: string;
  top?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const maxWidth = Math.max(1, width - 8);
  const measured = Math.min(size.width || maxWidth, maxWidth);
  const preferred = x > width * 0.6 ? x - measured - 14 : x + 14;
  const left = Math.max(4, Math.min(preferred, width - measured - 4));
  // The CSS bound also applies between ResizeObserver measurements, so a longer
  // value or responsive resize cannot push the tooltip beyond its plot.
  const available = `calc(100% - ${left + 4}px)`;
  const style: CSSProperties = {
    left,
    top,
    maxWidth: available,
    minWidth: `min(170px, ${available})`,
  };
  return (
    <div ref={ref} className="q-chart-tooltip" style={style} role="presentation">
      {title && <div className="q-chart-tooltip-title">{title}</div>}
      {rows.map((r, i) => (
        <div key={i} className="q-chart-tooltip-row" data-tone={r.tone}>
          <span className="q-chart-tooltip-label">
            {r.color && (
              <span
                className="q-chart-tooltip-swatch"
                data-dashed={r.dashed || undefined}
                style={{ [r.dashed ? 'borderColor' : 'background']: r.color } as CSSProperties}
              />
            )}
            <span>
              {r.label}
              {r.description && (
                <span className="q-chart-tooltip-description">{r.description}</span>
              )}
            </span>
          </span>
          <span className="q-chart-tooltip-value">{r.value}</span>
        </div>
      ))}
      {footer && (
        <div className="q-chart-tooltip-row q-chart-tooltip-footer" data-tone={footer.tone}>
          <span className="q-chart-tooltip-label">
            <span>
              {footer.label}
              {footer.description && (
                <span className="q-chart-tooltip-description">{footer.description}</span>
              )}
            </span>
          </span>
          <span className="q-chart-tooltip-value">{footer.value}</span>
        </div>
      )}
      {note && <div className="q-chart-tooltip-note">{note}</div>}
    </div>
  );
}

export interface LegendItem {
  key: string;
  label: ReactNode;
  color: string;
  /** Optional trailing value, e.g. the last data point. */
  value?: ReactNode;
  dashed?: boolean;
  /** Muted when hidden or filtered out. */
  inactive?: boolean;
}

/** Legend that doubles as a filter when `onToggle` is passed. */
export function Legend({
  items,
  onToggle,
  className,
  position,
  style,
}: {
  items: LegendItem[];
  onToggle?: (key: string) => void;
  className?: string;
  /** Where the legend sits, when the author chose a side; styles key off `data-position`. */
  position?: 'top' | 'bottom' | 'left' | 'right';
  style?: CSSProperties;
}) {
  return (
    <div className={cx('q-legend', className)} data-position={position} style={style}>
      {items.map((it) => {
        const content = (
          <>
            <span
              className="q-legend-swatch"
              data-dashed={it.dashed || undefined}
              style={it.dashed ? { borderColor: it.color } : { background: it.color }}
            />
            <span className="q-legend-label">{it.label}</span>
            {it.value != null && <span className="q-legend-value">{it.value}</span>}
          </>
        );
        return onToggle ? (
          <button
            key={it.key}
            type="button"
            className="q-legend-item"
            data-inactive={it.inactive || undefined}
            aria-pressed={!it.inactive}
            onClick={() => onToggle(it.key)}
          >
            {content}
          </button>
        ) : (
          <span key={it.key} className="q-legend-item" data-inactive={it.inactive || undefined}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

/** Vertical hairline gridlines at the given x positions. */
export function GridColumns({ xs, y0, y1 }: { xs: number[]; y0: number; y1: number }) {
  return (
    <g className="q-chart-grid" data-axis="x" aria-hidden="true">
      {xs.map((x) => (
        <line key={x} x1={Math.round(x) + 0.5} x2={Math.round(x) + 0.5} y1={y0} y2={y1} />
      ))}
    </g>
  );
}

export interface ReferenceMark {
  /** Position on the value axis, in px. */
  at: number;
  /** Text beside the rule: the author's label, or the formatted value. */
  text: string;
}

/**
 * Dashed rules at reference values with their text. Horizontal rules span `from`…`to` on x and
 * label the right end; vertical rules span them on y and label the top. Rules outside
 * `min`…`max` (the plot, along the value axis) are not drawn.
 */
export function ReferenceRules({
  marks,
  from,
  to,
  min,
  max,
  vertical = false,
}: {
  marks: ReferenceMark[];
  from: number;
  to: number;
  min: number;
  max: number;
  vertical?: boolean;
}) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return (
    <g className="q-chart-reference" data-orientation={vertical ? 'vertical' : 'horizontal'}>
      {marks.map((m, i) => {
        if (!(m.at >= lo - 0.5 && m.at <= hi + 0.5)) return null;
        const at = Math.round(m.at) + 0.5;
        if (vertical) {
          const flip = m.at > lo + (hi - lo) * 0.6;
          return (
            <g key={`${i}-${m.text}`}>
              <line x1={at} x2={at} y1={from} y2={to} />
              <text x={flip ? at - 5 : at + 5} y={from + 10} textAnchor={flip ? 'end' : 'start'}>
                {m.text}
              </text>
            </g>
          );
        }
        // Above the rule, unless that would leave the plot.
        const below = m.at - lo < 14;
        return (
          <g key={`${i}-${m.text}`}>
            <line x1={from} x2={to} y1={at} y2={at} />
            <text x={to - 4} y={below ? at + 12 : at - 5} textAnchor="end">
              {m.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Direct labels beside the last point of each line, in the series color. */
export function EndLabels({
  labels,
}: {
  labels: { key: string; x: number; y: number; text: string; color: string }[];
}) {
  return (
    <g className="q-chart-end-labels">
      {labels.map((l) => (
        <text key={l.key} x={l.x} y={l.y} dy="0.32em" style={{ fill: l.color }}>
          {l.text}
        </text>
      ))}
    </g>
  );
}

/** A short visible remark about how the chart was drawn, e.g. a scale that could not be used. */
export function ChartNote({ children }: { children: ReactNode }) {
  return <div className="q-chart-note">{children}</div>;
}

/**
 * Lays a legend out around a plot. Above or below, the two stack as before; beside the plot they
 * share a row, and the caller draws the plot `sideLegendWidth` narrower.
 */
export function LegendLayout({
  side,
  legend,
  children,
}: {
  side: 'top' | 'bottom' | 'left' | 'right' | null;
  legend: ReactNode;
  children: ReactNode;
}) {
  if (side === 'left' || side === 'right') {
    return (
      <div className="q-chart-side" data-legend={side}>
        {side === 'left' && legend}
        {children}
        {side === 'right' && legend}
      </div>
    );
  }
  return (
    <>
      {side === 'top' && legend}
      {children}
      {side === 'bottom' && legend}
    </>
  );
}
