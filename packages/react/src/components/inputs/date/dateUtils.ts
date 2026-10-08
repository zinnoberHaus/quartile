/** An inclusive range of calendar days. Times of day are ignored. */
export interface DateRange {
  start: Date;
  end: Date;
}

/** Local midnight of `d`. */
export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Same day of month `n` months away, clamped to the month's last day (Jan 31 + 1 → Feb 28). */
export function addMonths(d: Date, n: number) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date | null | undefined, b: Date | null | undefined) {
  return (
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Days from a to b, ignoring time of day and DST shifts. */
export function diffDays(a: Date, b: Date) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** Number of days in an inclusive range (Sep 7 – Oct 6 → 30). */
export function rangeLength(r: DateRange) {
  return Math.abs(diffDays(r.start, r.end)) + 1;
}

/** Orders the ends so start ≤ end, at local midnight. */
export function normalizeRange(a: Date, b: Date): DateRange {
  const s = startOfDay(a);
  const e = startOfDay(b);
  return s.getTime() <= e.getTime() ? { start: s, end: e } : { start: e, end: s };
}

export function inRange(d: Date, r: DateRange | null | undefined) {
  if (!r) return false;
  const t = startOfDay(d).getTime();
  return t >= startOfDay(r.start).getTime() && t <= startOfDay(r.end).getTime();
}

export function sameRange(a: DateRange | null | undefined, b: DateRange | null | undefined) {
  if (!a || !b) return !a && !b;
  return isSameDay(a.start, b.start) && isSameDay(a.end, b.end);
}

export function clampDate(d: Date, min?: Date, max?: Date) {
  if (min && d.getTime() < startOfDay(min).getTime()) return startOfDay(min);
  if (max && d.getTime() > startOfDay(max).getTime()) return startOfDay(max);
  return d;
}

export function isOutside(d: Date, min?: Date, max?: Date) {
  const t = startOfDay(d).getTime();
  return (!!min && t < startOfDay(min).getTime()) || (!!max && t > startOfDay(max).getTime());
}

/**
 * The weeks shown for a month: each week is 7 days starting on `weekStartsOn` (0 = Sunday,
 * 1 = Monday). Leading and trailing days come from the neighbouring months. 4–6 weeks.
 */
export function monthGrid(month: Date, weekStartsOn = 1): Date[][] {
  const first = startOfMonth(month);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
}

/** First day of the week containing `d`. */
export function startOfWeek(d: Date, weekStartsOn = 1) {
  return addDays(d, -((d.getDay() - weekStartsOn + 7) % 7));
}

/** "Sep 7 – Oct 6, 2026"; years shown on both ends when they differ. */
export function formatRange(r: DateRange, locale = 'en-US') {
  const md = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const mdy = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  if (isSameDay(r.start, r.end)) return mdy.format(r.start);
  const sameYear = r.start.getFullYear() === r.end.getFullYear();
  return `${(sameYear ? md : mdy).format(r.start)} – ${mdy.format(r.end)}`;
}

export interface DatePreset {
  label: string;
  /** A fixed range, or a function of "today" so presets stay current. */
  range: DateRange | ((today: Date) => DateRange);
}

export function resolvePreset(p: DatePreset, today: Date): DateRange {
  return typeof p.range === 'function' ? p.range(startOfDay(today)) : p.range;
}

/** Last 7 days, Last 30 days, Last quarter (the previous calendar quarter), Year to date. */
export const DEFAULT_DATE_PRESETS: DatePreset[] = [
  { label: 'Last 7 days', range: (t) => ({ start: addDays(t, -6), end: t }) },
  { label: 'Last 30 days', range: (t) => ({ start: addDays(t, -29), end: t }) },
  {
    label: 'Last quarter',
    range: (t) => {
      const q = Math.floor(t.getMonth() / 3);
      const start = new Date(t.getFullYear(), (q - 1) * 3, 1);
      return { start, end: new Date(start.getFullYear(), start.getMonth() + 3, 0) };
    },
  },
  { label: 'Year to date', range: (t) => ({ start: new Date(t.getFullYear(), 0, 1), end: t }) },
];
