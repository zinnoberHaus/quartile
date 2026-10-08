import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';

export interface CheckboxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'size' | 'onChange' | 'checked' | 'defaultChecked'
  > {
  checked?: boolean;
  defaultChecked?: boolean;
  /** Mixed state, e.g. a "select all" when some rows are selected. Shows a dash. Controlled: clear it in `onChange`. */
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  /** Second line under the label. */
  description?: ReactNode;
}

/** A native checkbox with Quartile's 16px box, check and dash marks. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked: checkedProp,
    defaultChecked = false,
    indeterminate = false,
    onChange,
    label,
    description,
    disabled,
    className,
    style,
    ...rest
  },
  ref,
) {
  const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onChange);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  // Sync on every render: a click clears the DOM flag even when the prop stays true.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  });

  return (
    <label
      className={cx('q-checkbox', className)}
      data-disabled={disabled || undefined}
      data-has-description={description != null || undefined}
      style={style}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="q-checkbox-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => setChecked(e.target.checked)}
        {...rest}
      />
      <span
        className="q-checkbox-box"
        data-state={indeterminate ? 'mixed' : checked ? 'checked' : 'unchecked'}
        aria-hidden="true"
      >
        {indeterminate ? (
          <svg viewBox="0 0 16 16" width="10" height="10">
            <path
              d="M3.5 8h9"
              style={{ stroke: 'currentColor' }}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        ) : checked ? (
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
            <path
              d="M3 8.5l3 3 7-7"
              style={{ stroke: 'currentColor' }}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {(label != null || description != null) && (
        <span className="q-check-text">
          {label != null && <span className="q-check-label">{label}</span>}
          {description != null && <span className="q-check-description">{description}</span>}
        </span>
      )}
    </label>
  );
});
