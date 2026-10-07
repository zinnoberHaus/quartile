import { forwardRef, type HTMLAttributes } from 'react';
import { type DeltaKind, deltaTone, formatDelta } from '../../../data/format';
import { cx } from '../../../lib/cx';

export type DeltaTone = 'positive' | 'negative' | 'neutral' | 'signal';
export type DeltaVariant = 'soft' | 'plain' | 'arrow';

export interface DeltaProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The change. For `percent` pass a ratio (0.124 → +12.4%); for `pt` pass points (0.21). */
  value: number;
  kind?: DeltaKind;
  /** Down is good (costs, churn, latency): flips the color, not the sign. */
  invert?: boolean;
  /** `soft` is a tinted chip, `plain` is colored text, `arrow` swaps the sign for ▲ / ▼. */
  variant?: DeltaVariant;
  /** Decimal places (1 for percent and number, 2 for pt). */
  digits?: number;
  /** Override the computed tone, e.g. `signal` for a change that is neither good nor bad. */
  tone?: DeltaTone;
}

/** Resolves the label, direction and tone a delta renders with. Rounding decides ±0. */
export function describeDelta(
  value: number,
  kind: DeltaKind = 'percent',
  { digits, invert = false }: { digits?: number; invert?: boolean } = {},
) {
  const places = digits ?? (kind === 'pt' ? 2 : 1);
  const text = formatDelta(value, kind, places);
  const scaled = kind === 'percent' ? value * 100 : value;
  const rounded = Number(scaled.toFixed(places));
  const direction: 'up' | 'down' | 'flat' = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  return { text, direction, tone: deltaTone(rounded, invert) as DeltaTone };
}

/** A signed change: +12.4%, −3.1%, ±0.0%, ▲ 8.2%, +0.21 pt. Mono, tabular, colored by meaning. */
export const Delta = forwardRef<HTMLSpanElement, DeltaProps>(function Delta(
  { value, kind = 'percent', invert = false, variant = 'soft', digits, tone, className, ...rest },
  ref,
) {
  const d = describeDelta(value, kind, { digits, invert });
  const resolvedTone = tone ?? d.tone;
  const arrow = variant === 'arrow' && d.direction !== 'flat';
  return (
    <span
      ref={ref}
      className={cx('q-delta', className)}
      data-tone={resolvedTone}
      data-variant={variant}
      {...rest}
    >
      {arrow ? (
        <>
          <span aria-hidden="true">
            {d.direction === 'up' ? '▲' : '▼'} {d.text.slice(1)}
          </span>
          <span className="q-visually-hidden">{d.text}</span>
        </>
      ) : (
        d.text
      )}
    </span>
  );
});
