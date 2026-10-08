import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconChevronLeft, IconChevronRight } from '../../../icons';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';
import { useQuartile } from '../../../provider/QuartileProvider';
import {
  addDays,
  addMonths,
  clampDate,
  type DateRange,
  inRange,
  isOutside,
  isSameDay,
  isSameMonth,
  monthGrid,
  normalizeRange,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './dateUtils';

export interface CalendarProps {
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  /** Called when a range is complete (second click or Enter). */
  onChange?: (range: DateRange) => void;
  /** Visible month (any day in it). */
  month?: Date;
  defaultMonth?: Date;
  onMonthChange?: (month: Date) => void;
  min?: Date;
  max?: Date;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Marks this day as today (`aria-current="date"`). Defaults to the current date. */
  today?: Date;
  /** Show the ‹ Month Year › header. Default true. */
  showHeader?: boolean;
  /** Focus the selected (or first visible) day on mount. */
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

function key(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * A month grid that selects a date range: click (or Enter) once for the start, again for the end.
 * Arrows move by day and week, Home/End to the week's ends, PageUp/PageDown by month (Shift: year).
 */
export function Calendar({
  value: valueProp,
  defaultValue = null,
  onChange,
  month: monthProp,
  defaultMonth,
  onMonthChange,
  min,
  max,
  weekStartsOn = 1,
  today: todayProp,
  showHeader = true,
  autoFocus = false,
  className,
  style,
  'aria-label': ariaLabel,
}: CalendarProps) {
  const { locale } = useQuartile();
  const titleId = useId();
  const [value, setValue] = useControllable<DateRange | null>(valueProp, defaultValue, (r) => {
    if (r) onChange?.(r);
  });
  const [month, setMonthState] = useControllable(
    monthProp ? startOfMonth(monthProp) : undefined,
    startOfMonth(defaultMonth ?? value?.start ?? todayProp ?? new Date()),
    onMonthChange,
  );
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const [focusDate, setFocusDate] = useState<Date>(() =>
    startOfDay(value?.start && isSameMonth(value.start, month) ? value.start : month),
  );
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(autoFocus);
  const today = startOfDay(todayProp ?? new Date());

  const fmt = useMemo(
    () => ({
      title: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      full: new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      narrow: new Intl.DateTimeFormat(locale, { weekday: 'narrow' }),
      long: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
    }),
    [locale],
  );
  // Jan 4 2026 is a Sunday.
  const weekdays = Array.from(
    { length: 7 },
    (_, i) => new Date(2026, 0, 4 + ((weekStartsOn + i) % 7)),
  );
  const weeks = monthGrid(month, weekStartsOn);

  // Keep the roving focus inside the visible month.
  const focusInMonth = isSameMonth(focusDate, month) ? focusDate : month;

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${key(focusInMonth)}"]`)
      ?.focus();
  });

  const setMonth = (m: Date) => setMonthState(startOfMonth(m));

  const goTo = (d: Date) => {
    const next = clampDate(startOfDay(d), min, max);
    setFocusDate(next);
    if (!isSameMonth(next, month)) setMonth(next);
    if (anchor) setHover(next);
    moveFocus.current = true;
  };

  const select = (d: Date) => {
    if (isOutside(d, min, max)) return;
    if (!anchor) {
      setAnchor(d);
      setHover(d);
      return;
    }
    const r = normalizeRange(anchor, d);
    setAnchor(null);
    setHover(null);
    setValue(r);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = focusInMonth;
    let next: Date | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(d, -1);
        break;
      case 'ArrowRight':
        next = addDays(d, 1);
        break;
      case 'ArrowUp':
        next = addDays(d, -7);
        break;
      case 'ArrowDown':
        next = addDays(d, 7);
        break;
      case 'Home':
        next = startOfWeek(d, weekStartsOn);
        break;
      case 'End':
        next = addDays(startOfWeek(d, weekStartsOn), 6);
        break;
      case 'PageUp':
        next = addMonths(d, e.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(d, e.shiftKey ? 12 : 1);
        break;
      case 'Escape':
        if (anchor) {
          e.preventDefault();
          e.stopPropagation();
          setAnchor(null);
          setHover(null);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    goTo(next);
  };

  const shown = anchor ? normalizeRange(anchor, hover ?? anchor) : value;
  const prevDisabled = !!min && startOfMonth(month).getTime() <= startOfMonth(min).getTime();
  const nextDisabled = !!max && startOfMonth(month).getTime() >= startOfMonth(max).getTime();

  return (
    <div
      className={cx('q-calendar', className)}
      style={style}
      data-selecting={anchor ? '' : undefined}
    >
      {showHeader && (
        <div className="q-calendar-head">
          <button
            type="button"
            className="q-calendar-nav"
            aria-label="Previous month"
            disabled={prevDisabled}
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <IconChevronLeft size={14} />
          </button>
          <span id={titleId} className="q-calendar-title" aria-live="polite">
            {fmt.title.format(month)}
          </span>
          <button
            type="button"
            className="q-calendar-nav"
            aria-label="Next month"
            disabled={nextDisabled}
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <IconChevronRight size={14} />
          </button>
        </div>
      )}
      <table
        ref={gridRef}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the WAI-ARIA date picker pattern is a table with role grid
        role="grid"
        className="q-calendar-grid"
        aria-labelledby={showHeader && !ariaLabel ? titleId : undefined}
        aria-label={ariaLabel ?? (showHeader ? undefined : fmt.title.format(month))}
        aria-multiselectable="true"
        onKeyDown={onKeyDown}
        onPointerLeave={() => anchor && setHover(null)}
      >
        <thead>
          <tr>
            {weekdays.map((d) => (
              <th
                key={d.getDay()}
                scope="col"
                abbr={fmt.long.format(d)}
                className="q-calendar-weekday"
              >
                {fmt.narrow.format(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={key(week[0])}>
              {week.map((d, col) => {
                const isStart = !!shown && isSameDay(d, shown.start);
                const isEnd = !!shown && isSameDay(d, shown.end);
                const within = inRange(d, shown);
                const disabled = isOutside(d, min, max);
                const focusable = isSameDay(d, focusInMonth);
                return (
                  // biome-ignore lint/a11y/useAriaPropsSupportedByRole: cells of a role="grid" table are gridcells, which take aria-selected
                  <td
                    key={key(d)}
                    aria-selected={within}
                    className="q-calendar-cell"
                    data-in-range={within || undefined}
                    data-start={isStart || undefined}
                    data-end={isEnd || undefined}
                    data-row-start={col === 0 || undefined}
                    data-row-end={col === 6 || undefined}
                  >
                    <button
                      type="button"
                      className="q-calendar-day"
                      data-date={key(d)}
                      data-outside={!isSameMonth(d, month) || undefined}
                      aria-label={fmt.full.format(d)}
                      aria-current={isSameDay(d, today) ? 'date' : undefined}
                      aria-disabled={disabled || undefined}
                      tabIndex={focusable ? 0 : -1}
                      onClick={() => {
                        setFocusDate(d);
                        select(d);
                      }}
                      onPointerEnter={() => anchor && setHover(d)}
                      onFocus={() => {
                        if (!isSameDay(d, focusDate)) setFocusDate(d);
                      }}
                    >
                      {d.getDate()}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
