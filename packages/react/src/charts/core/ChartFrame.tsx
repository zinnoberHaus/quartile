import { type CSSProperties, type ReactNode, useRef } from 'react';
import { cx } from '../../lib/cx';
import { useElementSize } from '../../lib/useElementSize';

export type ChartStatus = 'ready' | 'loading' | 'empty' | 'error';

/** Props every chart accepts for its built-in states. */
export interface ChartStateProps {
  /** Shows the loading state at the chart's size, so the layout never jumps. */
  loading?: boolean | string;
  /** Shows the error state. A string or Error becomes the message. */
  error?: boolean | string | Error | null;
  /** Shown in the error state; copyable for support. */
  errorCode?: string;
  onRetry?: () => void;
  /** Title and description for the empty state. Shown when there are no rows. */
  empty?: { title?: string; description?: string; action?: ReactNode };
}

export interface ChartBaseProps extends ChartStateProps {
  /** Plot height in px. Width always fills the container. */
  height?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name. A summary of the data is generated and rendered as hidden text inside the figure. */
  'aria-label'?: string;
  /**
   * `table` renders the same data as a table, with the same formats, at the chart's size.
   * Screen readers always get the table; this makes it visible.
   */
  view?: 'chart' | 'table';
}

/** The data behind a chart, already formatted. Every chart provides one as its table fallback. */
export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
  /** Index of columns that hold numbers, right-aligned in mono. Defaults to every column but the first. */
  numeric?: number[];
}

export function statusOf(p: ChartStateProps, rowCount: number): ChartStatus {
  if (p.error) return 'error';
  if (p.loading) return 'loading';
  if (rowCount === 0) return 'empty';
  return 'ready';
}

interface ChartFrameProps extends ChartBaseProps {
  status: ChartStatus;
  /** Rendered once the frame has a measured width. */
  children: (size: { width: number; height: number }) => ReactNode;
  /** Long-form description for assistive tech (auto summary). */
  summary?: string;
  /** Chart kind, used in the default accessible name. */
  kind: string;
  /** The data as a table: hidden for screen readers, visible when `view="table"`. */
  table?: ChartTable;
}

/** Sizing, states and accessible naming shared by every chart. */
export function ChartFrame({
  status,
  children,
  height = 240,
  className,
  style,
  summary,
  kind,
  table,
  view = 'chart',
  'aria-label': ariaLabel,
  ...state
}: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(ref);
  return (
    <div
      ref={ref}
      className={cx('q-chart', className)}
      data-status={status}
      style={{ height, ...style }}
      role="figure"
      aria-label={ariaLabel ?? kind}
      aria-busy={status === 'loading' || undefined}
    >
      {status === 'ready' && view === 'chart' && width > 0 ? children({ width, height }) : null}
      {status !== 'ready' && <ChartState status={status} {...state} />}
      {summary && status === 'ready' ? <p className="q-visually-hidden">{summary}</p> : null}
      {table && status === 'ready' ? (
        <ChartDataTable table={table} caption={ariaLabel ?? kind} visible={view === 'table'} />
      ) : null}
    </div>
  );
}

/** The table fallback. Visually hidden unless `visible`. */
export function ChartDataTable({
  table,
  caption,
  visible,
}: {
  table: ChartTable;
  caption?: string;
  visible?: boolean;
}) {
  const numeric = new Set(table.numeric ?? table.columns.map((_, i) => i).slice(1));
  return (
    <div className={visible ? 'q-chart-table' : 'q-visually-hidden'}>
      <table>
        {caption && <caption className="q-visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={c} scope="col" data-numeric={numeric.has(i) || undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, ci) =>
                ci === 0 ? (
                  <th key={ci} scope="row">
                    {v}
                  </th>
                ) : (
                  <td key={ci} data-numeric={numeric.has(ci) || undefined}>
                    {v}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The loading, empty and error states. Exported for custom charts. */
export function ChartState({
  status,
  loading,
  error,
  errorCode,
  onRetry,
  empty,
}: ChartStateProps & { status: ChartStatus }) {
  if (status === 'loading') {
    return (
      <div className="q-chart-state" data-kind="loading">
        <div className="q-chart-skeleton" aria-hidden="true">
          {[0.42, 0.62, 0.48, 0.75, 0.66, 0.9, 0.72].map((h, i) => (
            <span key={i} style={{ height: `${h * 100}%` }} />
          ))}
        </div>
        <span className="q-chart-state-caption">
          {typeof loading === 'string' ? loading : 'Loading…'}
        </span>
      </div>
    );
  }
  if (status === 'error') {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : null;
    return (
      <div className="q-chart-state" data-kind="error" role="alert">
        <div className="q-chart-state-panel">
          <span className="q-chart-state-title">Couldn’t load this chart</span>
          {(message || errorCode) && (
            <span className="q-chart-state-code">
              {message}
              {message && errorCode ? ' · ' : ''}
              {errorCode}
            </span>
          )}
          {onRetry && (
            <button type="button" className="q-chart-state-retry" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="q-chart-state" data-kind="empty">
      <div className="q-chart-state-panel">
        <span className="q-chart-state-title">{empty?.title ?? 'No data to show'}</span>
        {empty?.description && <span className="q-chart-state-desc">{empty.description}</span>}
        {empty?.action}
      </div>
    </div>
  );
}
