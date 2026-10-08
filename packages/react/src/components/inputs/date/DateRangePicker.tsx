import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';
import { IconCalendar } from '../../../icons';
import { cx } from '../../../lib/cx';
import { type Placement, useDismiss } from '../../../lib/floating';
import { useControllable } from '../../../lib/useControllable';
import { useQuartile } from '../../../provider/QuartileProvider';
import { describedBy, FormField, hasMessage } from '../field/FormField';
import { FloatingPanel } from '../shared/FloatingPanel';
import type { InputSize } from '../text-field/TextField';
import { Calendar } from './Calendar';
import {
  type DatePreset,
  type DateRange,
  DEFAULT_DATE_PRESETS,
  formatRange,
  rangeLength,
  resolvePreset,
  sameRange,
  startOfMonth,
} from './dateUtils';

export interface DateRangePickerProps {
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onChange?: (range: DateRange) => void;
  /**
   * Quick ranges listed beside the calendar, followed by "Custom". Defaults to Last 7 days, Last 30
   * days, Last quarter and Year to date relative to `today`. Pass `[]` to hide the list.
   */
  presets?: DatePreset[];
  min?: Date;
  max?: Date;
  /** Reference day for relative presets and the calendar's today mark. Defaults to now. */
  today?: Date;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  placeholder?: string;
  /** Show the day count ("30 days") at the right of the trigger. Default true. */
  showDuration?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: InputSize;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  className?: string;
  style?: CSSProperties;
  /** Accessible name when there is no visible `label`. */
  'aria-label'?: string;
}

/**
 * A trigger showing the range ("Sep 7 – Oct 6, 2026 · 30 days") that opens presets and a month
 * grid. Picking a preset or completing a range applies it and closes.
 */
export function DateRangePicker({
  value: valueProp,
  defaultValue = null,
  onChange,
  presets = DEFAULT_DATE_PRESETS,
  min,
  max,
  today: todayProp,
  weekStartsOn = 1,
  placeholder = 'Select dates',
  showDuration = true,
  label,
  hint,
  error,
  size = 'md',
  disabled,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom-start',
  className,
  style,
  'aria-label': ariaLabel,
}: DateRangePickerProps) {
  const { locale } = useQuartile();
  const autoId = useId();
  const triggerId = `${autoId}-trigger`;
  const dialogId = `${autoId}-dialog`;
  const messageId = `${autoId}-msg`;
  const [value, setValue] = useControllable<DateRange | null>(valueProp, defaultValue, (r) => {
    if (r) onChange?.(r);
  });
  const [open, setOpenState] = useControllable(openProp, defaultOpen, onOpenChange);
  const [customKey, setCustomKey] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const today = todayProp ?? new Date();

  const setOpen = useCallback(
    (next: boolean, focusTrigger = false) => {
      setOpenState(next);
      if (focusTrigger) triggerRef.current?.focus();
    },
    [setOpenState],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, [triggerRef, popRef]);

  const apply = (r: DateRange) => {
    setValue(r);
    setOpen(false, true);
  };

  const resolved = presets.map((p) => ({ label: p.label, range: resolvePreset(p, today) }));
  const activePreset = resolved.findIndex((p) => sameRange(p.range, value));

  const focusCalendar = () =>
    popRef.current?.querySelector<HTMLElement>('.q-calendar-day[tabindex="0"]')?.focus();

  const onPopoverKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false, true);
    }
  };

  const onPopoverBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !popRef.current?.contains(next) && next !== triggerRef.current) close();
  };

  const invalid = hasMessage(error) || error === true;
  const days = value ? rangeLength(value) : 0;

  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      disabled={disabled}
      htmlFor={triggerId}
      messageId={messageId}
      className={cx('q-date-range', className)}
      style={style}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="q-input q-date-trigger"
        data-size={size}
        data-open={open || undefined}
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={label == null ? ariaLabel : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(messageId, hint, error)}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <IconCalendar className="q-date-trigger-icon" size={14} />
        <span className={cx('q-date-trigger-text', !value && 'q-select-placeholder')}>
          {value ? formatRange(value, locale) : placeholder}
        </span>
        {showDuration && value && (
          <span className="q-date-trigger-days">
            {days} {days === 1 ? 'day' : 'days'}
          </span>
        )}
      </button>
      {open && (
        <FloatingPanel
          ref={popRef}
          anchorRef={triggerRef}
          placement={placement}
          onPositioned={focusCalendar}
          id={dialogId}
          role="dialog"
          aria-label={typeof label === 'string' ? label : (ariaLabel ?? 'Choose a date range')}
          className="q-date-popover"
          onKeyDown={onPopoverKey}
          onBlur={onPopoverBlur}
        >
          {presets.length > 0 && (
            <div className="q-date-presets" role="group" aria-label="Presets">
              {resolved.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  className="q-date-preset"
                  aria-pressed={i === activePreset}
                  onClick={() => apply(p.range)}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className="q-date-preset"
                aria-pressed={activePreset < 0 && !!value}
                onClick={() => setCustomKey((k) => k + 1)}
              >
                Custom
              </button>
            </div>
          )}
          <Calendar
            key={customKey}
            value={value}
            onChange={apply}
            defaultMonth={startOfMonth(value?.start ?? today)}
            min={min}
            max={max}
            today={today}
            weekStartsOn={weekStartsOn}
            autoFocus={customKey > 0}
          />
        </FloatingPanel>
      )}
    </FormField>
  );
}
