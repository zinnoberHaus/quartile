import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type BadgeTone =
  | 'live'
  | 'stale'
  | 'failed'
  | 'draft'
  | 'beta'
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'signal';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Status tones (`live`, `stale`, `failed`) show a dot by default; `live` pulses. */
  tone?: BadgeTone;
  /** Leading status dot. A badge with a dot is a pill; without one, a rounded tag. */
  dot?: boolean;
  /** Animate the dot (defaults to true for `live`). Respects reduced motion. */
  pulse?: boolean;
  /** `md` is 24px sans; `sm` is an 18px mono tag for headers and inline labels. */
  size?: 'sm' | 'md';
  children?: ReactNode;
}

const DOT_TONES = new Set<BadgeTone>(['live', 'stale', 'failed']);

/** A short status or label: Live, Stale · 2h, Query failed, Draft, Beta. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', dot, pulse, size = 'md', className, children, ...rest },
  ref,
) {
  const showDot = dot ?? DOT_TONES.has(tone);
  const pulsing = showDot && (pulse ?? tone === 'live');
  return (
    <span
      ref={ref}
      className={cx('q-badge', className)}
      data-tone={tone}
      data-size={size}
      data-dot={showDot || undefined}
      data-pulse={pulsing || undefined}
      {...rest}
    >
      {showDot && <span className="q-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
});
