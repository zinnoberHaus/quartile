import { type CSSProperties, type ReactNode, useRef, useState } from 'react';
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
   * Large lazy tables expose a data-view control rather than mounting every hidden row.
   */
  view?: 'chart' | 'table';
  /** Plain-text context shown with tooltips and included in the accessible chart description. */
  tooltipNote?: string;
}

/** The data behind a chart, already formatted. Every chart provides one as its table fallback. */
export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
  /** Index of columns that hold numbers, right-aligned in mono. Defaults to every column but the first. */
  numeric?: number[];
  /** For large charts: format an exact row on demand instead of constructing every row up front. */
  getRow?: (index: number) => (string | number)[];
  /** Total rows available through `getRow`; defaults to `rows.length`. */
  rowCount?: number;
  /** Bound the rendered rows and expose an explicit data view with pagination. */
  pageSize?: number;
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
  tooltipNote,
  kind,
  table,
  view = 'chart',
  'aria-label': ariaLabel,
  ...state
}: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(ref);
  const [dataView, setDataView] = useState(false);
  const paginated = !!table?.pageSize;
  const showTable = view === 'table' || (paginated && dataView);
  const toggle = paginated && view === 'chart' && status === 'ready';
  const contentHeight = Math.max(1, height - (toggle ? 28 : 0));
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
      {toggle && (
        <div className="q-chart-data-access">
          <button type="button" onClick={() => setDataView((value) => !value)}>
            {dataView
              ? 'View chart'
              : `View data table (${table?.rowCount ?? table?.rows.length ?? 0} rows)`}
          </button>
        </div>
      )}
      {status === 'ready' && !showTable && width > 0
        ? children({ width, height: contentHeight })
        : null}
      {status !== 'ready' && <ChartState status={status} {...state} />}
      {(summary || tooltipNote) && status === 'ready' ? (
        <p className="q-visually-hidden">{[summary, tooltipNote].filter(Boolean).join(' ')}</p>
      ) : null}
      {table && status === 'ready' && (!paginated || showTable) ? (
        paginated ? (
          <div style={{ height: contentHeight, position: 'relative' }}>
            <ChartDataTable table={table} caption={ariaLabel ?? kind} visible />
          </div>
        ) : (
          <ChartDataTable table={table} caption={ariaLabel ?? kind} visible={showTable} />
        )
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
  const count = table.getRow ? (table.rowCount ?? table.rows.length) : table.rows.length;
  const pageSize = Math.max(1, Math.floor(table.pageSize ?? Math.max(1, count)));
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * pageSize;
  const end = Math.min(count, start + pageSize);
  const rows = Array.from({ length: Math.max(0, end - start) }, (_, offset) =>
    table.getRow ? table.getRow(start + offset) : table.rows[start + offset],
  );
  return (
    <div
      className={visible ? 'q-chart-table' : 'q-visually-hidden'}
      data-paginated={!!table.pageSize || undefined}
    >
      {table.pageSize && (
        <div
          role="group"
          className="q-chart-table-pagination"
          aria-label={`${caption ?? 'Chart'} table pages`}
        >
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous rows
          </button>
          <span aria-live="polite">
            {count ? start + 1 : 0}–{end} of {count}
          </span>
          <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>
            Next rows
          </button>
        </div>
      )}
      <table aria-rowcount={count + 1}>
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
          {rows.map((r, ri) => (
            <tr key={start + ri} aria-rowindex={start + ri + 2}>
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
