import { forwardRef, type HTMLAttributes, type ReactNode, useId } from 'react';
import { cx } from '../../../lib/cx';

export type ProgressTone = 'signal' | 'positive' | 'warning' | 'negative' | 'ink';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** Omit for an indeterminate bar. */
  value?: number;
  max?: number;
  label?: ReactNode;
  /** Show the percentage (or `formatValue`) at the end of the label row. */
  showValue?: boolean;
  formatValue?: (value: number, max: number) => string;
  tone?: ProgressTone;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Task progress: "Exporting 4 charts · 68%". Omit `value` while the total is unknown. */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { value, max = 100, label, showValue = false, formatValue, tone = 'signal', className, ...rest },
  ref,
) {
  const id = useId();
  const indeterminate = value == null;
  const ratio = indeterminate ? 0 : clamp01(value / max);
  const text = indeterminate
    ? undefined
    : formatValue
      ? formatValue(value, max)
      : `${Math.round(ratio * 100)}%`;
  return (
    <div ref={ref} className={cx('q-progress', className)} data-tone={tone} {...rest}>
      {(label != null || (showValue && text)) && (
        <div className="q-progress-head">
          {label != null && (
            <span id={`${id}-label`} className="q-progress-label">
              {label}
            </span>
          )}
          {showValue && text && <span className="q-progress-value">{text}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-labelledby={label != null ? `${id}-label` : undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuetext={text}
        className="q-progress-track"
        data-indeterminate={indeterminate || undefined}
      >
        <span
          className="q-progress-fill"
          style={indeterminate ? undefined : { width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
});

export interface MeterThresholds {
  /** Fraction of the range (0–1) at which the meter turns warning. Default 0.8. */
  warning?: number;
  /** Fraction at which it turns negative. Default 0.95. */
  danger?: number;
}

export interface MeterProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max: number;
  min?: number;
  label?: ReactNode;
  /** Value text, e.g. `(v, max) => \`${v} / ${max} GB\``. Defaults to "value / max". */
  format?: (value: number, max: number) => string;
  /** Pass `false` to keep the meter neutral at any level. */
  thresholds?: MeterThresholds | false;
}

/** Which tone a meter shows at `ratio` (0–1) of its range. */
export function meterTone(
  ratio: number,
  thresholds: MeterThresholds | false = {},
): 'signal' | 'warning' | 'negative' {
  if (thresholds === false) return 'signal';
  const { warning = 0.8, danger = 0.95 } = thresholds;
  if (ratio >= danger) return 'negative';
  if (ratio >= warning) return 'warning';
  return 'signal';
}

/** A level within a known range: "Query quota 8.6 / 10 GB", turning warning near the limit. */
export const Meter = forwardRef<HTMLDivElement, MeterProps>(function Meter(
  { value, max, min = 0, label, format, thresholds, className, ...rest },
  ref,
) {
  const id = useId();
  const ratio = clamp01((value - min) / (max - min));
  const tone = meterTone(ratio, thresholds);
  const text = format ? format(value, max) : `${value} / ${max}`;
  return (
    <div ref={ref} className={cx('q-meter', className)} data-tone={tone} {...rest}>
      <div className="q-progress-head">
        {label != null && (
          <span id={`${id}-label`} className="q-progress-label">
            {label}
          </span>
        )}
        <span className="q-meter-value">{text}</span>
      </div>
      <div
        role="meter"
        aria-labelledby={label != null ? `${id}-label` : undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        className="q-meter-track"
      >
        {ratio > 0 && <span className="q-meter-fill" style={{ flexGrow: ratio }} />}
        {ratio < 1 && <span className="q-meter-rest" style={{ flexGrow: 1 - ratio }} />}
      </div>
    </div>
  );
});
