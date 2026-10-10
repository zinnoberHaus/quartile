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
}: {
  items: LegendItem[];
  onToggle?: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cx('q-legend', className)}>
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
