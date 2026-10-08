import { forwardRef, type KeyboardEvent, useMemo, useState } from 'react';
import { MINUS } from '../../../data/format';
import { useControllable } from '../../../lib/useControllable';
import { useQuartile } from '../../../provider/QuartileProvider';
import { TextField, type TextFieldProps } from './TextField';

export interface NumberFieldProps
  extends Omit<
    TextFieldProps,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'inputMode'
  > {
  value?: number | null;
  defaultValue?: number | null;
  /** Called while typing with every parseable value, and on blur after clamping. */
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  /** ↑ / ↓ step. Shift multiplies it by 10. */
  step?: number;
  /** Fixed number of decimals in the formatted value. */
  fractionDigits?: number;
  /** Display format when the field is not focused. Defaults to grouped digits in the locale. */
  format?: (value: number) => string;
}

/** Reads "1,500.00", "−1500" or "-1 500" as a number. Returns null for empty or invalid text. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(MINUS, '-').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function clampNumber(v: number, min?: number, max?: number) {
  let out = v;
  if (min != null && out < min) out = min;
  if (max != null && out > max) out = max;
  return out;
}

/**
 * A TextField for numbers (`role="spinbutton"`). Shows grouped digits, accepts typed grouping and
 * "−", steps with ↑ ↓ (Shift ×10) and clamps to `min`/`max` on blur. With a custom `format`, the
 * raw number is shown while editing.
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  {
    value: valueProp,
    defaultValue = null,
    onChange,
    min,
    max,
    step = 1,
    fractionDigits,
    format,
    onFocus,
    onBlur,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const { locale } = useQuartile();
  const [value, setValue] = useControllable<number | null>(valueProp, defaultValue, onChange);
  const [draft, setDraft] = useState<string | null>(null);
  const { fmt, editable } = useMemo(() => {
    if (format) return { fmt: format, editable: false };
    const nf = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits ?? 6,
    });
    // The default format stays on screen while editing when it parses back (a "." decimal).
    const dot = nf.formatToParts(1.5).find((p) => p.type === 'decimal')?.value !== ',';
    return { fmt: (v: number) => nf.format(v).replace(/^-/, MINUS), editable: dot };
  }, [format, locale, fractionDigits]);
  const raw = (v: number | null) =>
    v == null
      ? ''
      : editable
        ? fmt(v)
        : fractionDigits != null
          ? v.toFixed(fractionDigits)
          : String(v);

  const commit = (next: number | null) => {
    const clamped = next == null ? null : clampNumber(next, min, max);
    if (clamped !== value) setValue(clamped);
    return clamped;
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const base = parseNumber(draft ?? raw(value)) ?? 0;
    const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
    const precision = Math.max(fractionDigits ?? 0, decimals(step));
    const next = Number((base + delta).toFixed(precision));
    const committed = commit(next);
    setDraft(raw(committed));
  };

  return (
    <TextField
      ref={ref}
      {...rest}
      type="text"
      inputMode={fractionDigits === 0 ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={draft ?? (value == null ? '' : fmt(value))}
      role="spinbutton"
      aria-valuenow={value ?? undefined}
      aria-valuetext={value == null ? undefined : fmt(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      onFocus={(e) => {
        setDraft(raw(value));
        // Switching from the display format to raw text moves the caret; select it all instead.
        if (!editable) {
          const input = e.currentTarget;
          requestAnimationFrame(() => {
            if (document.activeElement === input) input.select();
          });
        }
        onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseNumber(e.target.value);
        if (e.target.value.trim() === '') setValue(null);
        else if (n != null && n !== value) setValue(n);
      }}
      onBlur={(e) => {
        commit(draft == null ? value : parseNumber(draft));
        setDraft(null);
        onBlur?.(e);
      }}
      onKeyDown={onKey}
    />
  );
});

function decimals(n: number) {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}
