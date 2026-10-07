import {
  type ButtonHTMLAttributes,
  createContext,
  forwardRef,
  type ReactNode,
  useContext,
} from 'react';
import { cx } from '../../lib/cx';

export type ButtonVariant = 'primary' | 'signal' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` (ink) is the one primary action per view. `signal` is for actions that change what
   * the data shows: apply, select, share a view.
   */
  variant?: ButtonVariant;
  /** sm 28 · md 36 · lg 44 px at comfortable density. Inside a `ButtonGroup`, defaults to the group's size. */
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, and blocks clicks. */
  loading?: boolean;
  /** Icon before the label. */
  icon?: ReactNode;
  /** Icon after the label. */
  iconEnd?: ReactNode;
}

/** Shared by ButtonGroup and SplitButton so children pick up the group's size and variant. */
export const ButtonGroupContext = createContext<{ size?: ButtonSize; variant?: ButtonVariant }>({});

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
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
  const group = useContext(ButtonGroupContext);
  return (
    <button
      ref={ref}
      type={type}
      className={cx('q-btn', className)}
      data-variant={variant ?? group.variant ?? 'secondary'}
      data-size={size ?? group.size ?? 'md'}
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

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconEnd' | 'aria-label'> {
  icon: ReactNode;
  /** Required: becomes the accessible name (`aria-label`). */
  label: string;
}

/** A square button that shows only an icon. `label` names it for assistive technology. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, className, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      icon={icon}
      aria-label={label}
      className={cx('q-icon-btn', className)}
      {...rest}
    />
  );
});
