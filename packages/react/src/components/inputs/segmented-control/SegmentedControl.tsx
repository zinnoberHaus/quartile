import { type CSSProperties, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Accessible name when `label` is not text (icon-only segments). */
  'aria-label'?: string;
}

export interface SegmentedControlProps {
  /** Strings are used as both value and label. */
  options: (string | SegmentedOption)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** sm 24 · md 28 px segments. */
  size?: 'sm' | 'md';
  /** Mono labels, for periods such as 7D · 30D · 90D. */
  mono?: boolean;
  /** Stretch to the container width with equal segments. */
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Required unless `aria-labelledby` is given: names the radio group. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function normalizeOptions(options: (string | SegmentedOption)[]): SegmentedOption[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

/**
 * One choice from a short list, on a sunken track with the selected segment raised. A radio group:
 * arrow keys move and select, Home and End jump to the ends.
 */
export function SegmentedControl({
  options,
  value: valueProp,
  defaultValue,
  onChange,
  size = 'md',
  mono = false,
  fullWidth = false,
  disabled = false,
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SegmentedControlProps) {
  const opts = normalizeOptions(options);
  const [value, setValue] = useControllable(valueProp, defaultValue ?? opts[0]?.value, onChange);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = opts.findIndex((o) => o.value === value);
  const focusable = current >= 0 ? current : opts.findIndex((o) => !o.disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = opts.length;
    const from = refs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0) return;
    let dir = 0;
    let start = from;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') dir = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') dir = -1;
    else if (e.key === 'Home') {
      dir = 1;
      start = -1;
    } else if (e.key === 'End') {
      dir = -1;
      start = n;
    } else return;
    e.preventDefault();
    const wrap = e.key !== 'Home' && e.key !== 'End';
    for (let k = 1; k <= n; k++) {
      let i = start + dir * k;
      if (wrap) i = (i + n) % n;
      if (i < 0 || i >= n) break;
      if (!opts[i].disabled) {
        refs.current[i]?.focus();
        if (opts[i].value !== value) setValue(opts[i].value);
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled || undefined}
      className={cx('q-segmented', className)}
      data-size={size}
      data-mono={mono || undefined}
      data-full={fullWidth || undefined}
      style={style}
      onKeyDown={onKeyDown}
    >
      {opts.map((o, i) => {
        const checked = i === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o['aria-label']}
            tabIndex={i === focusable ? 0 : -1}
            disabled={disabled || o.disabled}
            className="q-segment"
            onClick={() => {
              if (o.value !== value) setValue(o.value);
            }}
          >
            {o.icon && <span className="q-segment-icon">{o.icon}</span>}
            {o.label != null && o.label !== '' && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
