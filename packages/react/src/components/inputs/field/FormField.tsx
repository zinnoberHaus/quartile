import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface FormFieldProps {
  /** Visible label, associated with the control through `htmlFor`. */
  label?: ReactNode;
  /** Help text under the control. Hidden while `error` has a message. */
  hint?: ReactNode;
  /** Error message (or `true` for invalid styling without a message). */
  error?: ReactNode;
  disabled?: boolean;
  /** id of the labelled control. */
  htmlFor?: string;
  /** id for the label element, for controls named with `aria-labelledby`. */
  labelId?: string;
  /** id for the hint or error, for the control's `aria-describedby`. */
  messageId?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** True when `error` carries a message to render (not just `true`). */
export function hasMessage(error: ReactNode) {
  return error != null && error !== false && error !== true && error !== '';
}

/** Label, control, then hint or error: the column every Quartile input shares. */
export function FormField({
  label,
  hint,
  error,
  disabled,
  htmlFor,
  labelId,
  messageId,
  className,
  style,
  children,
}: FormFieldProps) {
  const message = hasMessage(error) ? error : hint;
  return (
    <div className={cx('q-field', className)} data-disabled={disabled || undefined} style={style}>
      {label != null && (
        <label className="q-field-label" htmlFor={htmlFor} id={labelId}>
          {label}
        </label>
      )}
      {children}
      {message != null && message !== false && (
        <span
          id={messageId}
          className={hasMessage(error) ? 'q-field-error' : 'q-field-hint'}
          aria-live={hasMessage(error) ? 'polite' : undefined}
        >
          {message}
        </span>
      )}
    </div>
  );
}

/** aria-describedby value for a control inside a FormField. */
export function describedBy(
  messageId: string,
  hint: ReactNode,
  error: ReactNode,
  extra?: string,
): string | undefined {
  const own = hasMessage(error) || (hint != null && hint !== false) ? messageId : undefined;
  return [own, extra].filter(Boolean).join(' ') || undefined;
}
