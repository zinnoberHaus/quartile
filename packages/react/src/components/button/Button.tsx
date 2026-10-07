import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

export type ButtonVariant = 'primary' | 'signal' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` (ink) is the one primary action per view. `signal` is for actions that change what
   * the data shows: apply, select, share a view.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, and blocks clicks. */
  loading?: boolean;
  /** Icon before the label. */
  icon?: ReactNode;
  /** Icon after the label. */
  iconEnd?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    iconEnd,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('q-btn', className)}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="q-btn-spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="q-btn-icon">{icon}</span>
      ) : null}
      {children != null && <span className="q-btn-label">{children}</span>}
      {iconEnd && !loading ? <span className="q-btn-icon">{iconEnd}</span> : null}
    </button>
  );
});
