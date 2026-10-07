import { forwardRef, type HTMLAttributes, isValidElement, type ReactNode } from 'react';
import { IconX } from '../../../icons';
import { cx } from '../../../lib/cx';

export type BannerTone = 'info' | 'warning' | 'error' | 'success';

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: BannerTone;
  /** Optional bold lead-in before the message. */
  title?: ReactNode;
  children?: ReactNode;
  /** An inline action at the end: `{ label, onClick }` renders an underlined text button. */
  action?: ReactNode | { label: ReactNode; onClick: () => void };
  /** Shows a dismiss button. */
  onDismiss?: () => void;
  /** Replaces the tone glyph. */
  icon?: ReactNode;
}

const GLYPH: Record<BannerTone, string> = { info: 'i', warning: '!', error: '×', success: '✓' };

/**
 * A persistent, in-flow message about the data on screen: refresh cadence, cached results, a failed
 * query. Errors are announced (`role="alert"`); the rest are polite (`role="status"`).
 */
export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { tone = 'info', title, children, action, onDismiss, icon, className, role, ...rest },
  ref,
) {
  const actionNode =
    action != null && typeof action === 'object' && !isValidElement(action) && 'label' in action ? (
      <button type="button" className="q-banner-action" onClick={action.onClick}>
        {action.label}
      </button>
    ) : (
      (action as ReactNode)
    );
  return (
    <div
      ref={ref}
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cx('q-banner', className)}
      data-tone={tone}
      {...rest}
    >
      <span className="q-banner-icon" aria-hidden="true">
        {icon ?? GLYPH[tone]}
      </span>
      <span className="q-banner-message">
        {title != null && <strong className="q-banner-title">{title} </strong>}
        {children}
      </span>
      {actionNode != null && <span className="q-banner-actions">{actionNode}</span>}
      {onDismiss && (
        <button type="button" className="q-banner-dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <IconX size={12} />
        </button>
      )}
    </div>
  );
});
