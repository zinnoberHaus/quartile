import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';

export interface SwitchProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'size' | 'onChange' | 'checked' | 'defaultChecked' | 'role'
  > {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  /** Second line under the label. */
  description?: ReactNode;
  /** sm: 28 × 16 track · md: 32 × 18. */
  size?: 'sm' | 'md';
  /** Shows "On" / "Off" in mono after the label. */
  showState?: boolean;
}

/** An immediate on/off setting. A native checkbox with `role="switch"`, so forms and labels work. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    checked: checkedProp,
    defaultChecked = false,
    onChange,
    label,
    description,
    size = 'md',
    showState = false,
    disabled,
    className,
    style,
    ...rest
  },
  ref,
) {
  const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onChange);
  return (
    <label
      className={cx('q-switch', className)}
      data-size={size}
      data-disabled={disabled || undefined}
      style={style}
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="q-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => setChecked(e.target.checked)}
        {...rest}
      />
      <span className="q-switch-track" aria-hidden="true">
        <span className="q-switch-thumb" />
      </span>
      {(label != null || description != null) && (
        <span className="q-check-text">
          {label != null && <span className="q-check-label">{label}</span>}
          {description != null && <span className="q-check-description">{description}</span>}
        </span>
      )}
      {showState && (
        <span className="q-switch-state" aria-hidden="true">
          {checked ? 'On' : 'Off'}
        </span>
      )}
    </label>
  );
});
