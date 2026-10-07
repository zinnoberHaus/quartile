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
  /** Accessible name. A summary of the data is generated and appended automatically. */
  'aria-label'?: string;
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
      {status === 'ready' && width > 0 ? children({ width, height }) : null}
      {status !== 'ready' && <ChartState status={status} {...state} />}
      {summary && status === 'ready' ? <p className="q-visually-hidden">{summary}</p> : null}
    </div>
  );
}

const statusIcon = {
  empty: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  ),
  error: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75v3.75M8 11.1v.15" />
    </svg>
  ),
};

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
          {[0.55, 0.8, 0.4, 0.95, 0.7, 0.6, 0.85, 0.5, 0.75, 0.65].map((h, i) => (
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
        <span className="q-chart-state-icon">{statusIcon.error}</span>
        <span className="q-chart-state-title">Couldn’t load this chart</span>
        {(message || errorCode) && (
          <span className="q-chart-state-desc q-num">
            {message}
            {message && errorCode ? ' · ' : ''}
            {errorCode}
          </span>
        )}
        {onRetry && (
          <button type="button" className="q-chart-state-action" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="q-chart-state" data-kind="empty">
      <span className="q-chart-state-icon">{statusIcon.empty}</span>
      <span className="q-chart-state-title">{empty?.title ?? 'No data to show'}</span>
      {empty?.description && <span className="q-chart-state-desc">{empty.description}</span>}
      {empty?.action}
    </div>
  );
}
