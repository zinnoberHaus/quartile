import {
  type CSSProperties,
  createContext,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useContext,
  useId,
} from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';

interface RadioGroupContextValue {
  name: string;
  value: string | null;
  disabled?: boolean;
  onSelect: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'onChange' | 'value'> {
  value: string;
  label?: ReactNode;
  description?: ReactNode;
  /** Outside a RadioGroup: called with `value` when this radio is chosen. */
  onChange?: (value: string) => void;
}

/** A native radio with Quartile's ring mark. Inside a RadioGroup it takes the group's name and value. */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { value, label, description, onChange, checked, disabled, name, className, style, ...rest },
  ref,
) {
  const group = useContext(RadioGroupContext);
  const isChecked = group ? group.value === value : checked;
  const isDisabled = disabled || group?.disabled;
  return (
    <label
      className={cx('q-radio', className)}
      data-disabled={isDisabled || undefined}
      data-has-description={description != null || undefined}
      style={style}
    >
      <input
        ref={ref}
        type="radio"
        className="q-radio-input"
        name={group?.name ?? name}
        value={value}
        checked={isChecked}
        disabled={isDisabled}
        onChange={(e) => {
          if (!e.target.checked) return;
          if (group) group.onSelect(value);
          onChange?.(value);
        }}
        {...rest}
      />
      <span className="q-radio-dot" aria-hidden="true" />
      {(label != null || description != null) && (
        <span className="q-check-text">
          {label != null && <span className="q-check-label">{label}</span>}
          {description != null && <span className="q-check-description">{description}</span>}
        </span>
      )}
    </label>
  );
});

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Strings are used as both value and label. Omit to compose `<Radio>` children instead. */
  options?: (string | RadioOption)[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  /** Form name shared by the radios. Generated when omitted. */
  name?: string;
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** One choice from a few. Native radios, so arrow keys move the selection within the group. */
export function RadioGroup({
  options,
  value: valueProp,
  defaultValue = null,
  onChange,
  name,
  orientation = 'horizontal',
  disabled,
  className,
  style,
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: RadioGroupProps) {
  const autoName = useId();
  const [value, setValue] = useControllable<string | null>(valueProp, defaultValue);
  const ctx: RadioGroupContextValue = {
    name: name ?? autoName,
    value,
    disabled,
    onSelect: (v) => {
      setValue(v);
      onChange?.(v);
    },
  };
  return (
    <RadioGroupContext.Provider value={ctx}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-orientation={orientation}
        className={cx('q-radio-group', className)}
        data-orientation={orientation}
        style={style}
      >
        {options?.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return (
            <Radio
              key={opt.value}
              value={opt.value}
              label={opt.label}
              description={opt.description}
              disabled={opt.disabled}
            />
          );
        })}
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}
