import { finiteNumber } from './number';
import { toDate } from './schema';
import type { BytesFormat, DurationFormat, FieldDef, Formatter, NumberFormat } from './types';

/** U+2212, the typographic minus used for negative values. */
export const MINUS = '−';

export interface FormatOptions {
  locale?: string;
  currency?: string;
  timeZone?: string;
  /** Short automatic labels for axes. Explicit format objects retain their precision. */
  short?: boolean;
  surface?: 'value' | 'axis' | 'tooltip';
}

/** Intl parts, with a literal fallback for callbacks, missing values and custom units. */
export interface FormatPart {
  type: string;
  value: string;
}
interface DisplayFormatter {
  parts: (value: unknown) => FormatPart[];
  range?: (start: unknown, end: unknown) => string;
}
const MAX_CACHE = 128;
const nfCache = new Map<string, Intl.NumberFormat>();
const dfCache = new Map<string, Intl.DateTimeFormat>();
function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  let value = cache.get(key);
  if (!value) {
    value = create();
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
  }
  return value;
}
function nf(locale: string, options: Intl.NumberFormatOptions) {
  return cached(
    nfCache,
    locale + JSON.stringify(options),
    () => new Intl.NumberFormat(locale, options),
  );
}
function df(locale: string, options: Intl.DateTimeFormatOptions) {
  return cached(
    dfCache,
    locale + JSON.stringify(options),
    () => new Intl.DateTimeFormat(locale, options),
  );
}
const literal = (value: string): FormatPart[] => [{ type: 'literal', value }];
const join = (parts: FormatPart[]) => parts.map((part) => part.value).join('');
function minus(parts: FormatPart[]): FormatPart[] {
  return parts.map((part) => (part.type === 'minusSign' ? { ...part, value: MINUS } : part));
}
/** Preserve decimal strings and bigint for Intl display; chart arithmetic still uses numbers. */
function numeric(value: unknown): number | bigint | string | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number')
    return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (!Number.isFinite(Number(trimmed))) return null;
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ? trimmed : Number(trimmed);
}
function checkDigits(digits: number) {
  if (!Number.isInteger(digits) || digits < 0 || digits > 20)
    throw new RangeError('Fraction digits must be an integer from 0 to 20.');
}
function compactOptions(value: number, short: boolean): Intl.NumberFormatOptions {
  const a = Math.abs(value);
  if (a > 0 && a < 1)
    return {
      notation: a < 0.001 ? 'scientific' : 'standard',
      maximumSignificantDigits: short ? 3 : 6,
    };
  const digits = a >= 1e6 ? 2 : a >= 1e3 ? 1 : a % 1 ? 1 : 0;
  return {
    notation: 'compact',
    minimumFractionDigits: short ? 0 : digits,
    maximumFractionDigits: digits,
  };
}

/** Locale-aware compact display, retaining the original dashboard precision defaults. */
export function compactNumber(value: number, short = false, locale = 'en-US'): string {
  if (!Number.isFinite(value)) return '—';
  return join(
    minus(nf(locale, compactOptions(value, short)).formatToParts(Object.is(value, -0) ? 0 : value)),
  );
}

function numberFormatter(
  options: Intl.NumberFormatOptions,
  locale: string,
  missing: string,
  decoration: Pick<NumberFormat, 'prefix' | 'suffix' | 'scale'> = {},
): DisplayFormatter {
  const { prefix = '', suffix = '', scale = 1 } = decoration;
  if (!Number.isFinite(scale)) throw new RangeError('A display scale must be finite.');
  const formatter = nf(locale, options);
  const prepare = (value: unknown) => {
    const n = numeric(value);
    if (n === null || scale === 1) return n;
    // Scaling is numeric computation, intentionally separate from exact string/bigint display.
    const scaled = Number(n) * scale;
    return Number.isFinite(scaled) ? scaled : null;
  };
  const parts = (value: unknown) => {
    const n = prepare(value);
    if (n === null) return literal(missing);
    return [
      ...(prefix ? literal(prefix) : []),
      ...minus(formatter.formatToParts(n as number)),
      ...(suffix ? literal(suffix) : []),
    ];
  };
  return {
    parts,
    range: (start, end) => {
      const a = prepare(start);
      const b = prepare(end);
      if (a === null || b === null) return `${join(parts(start))} – ${join(parts(end))}`;
      // Ranges must never conceal two distinct measurements behind rounded identical labels.
      const left = join(parts(start));
      const right = join(parts(end));
      // Some Intl range implementations coerce exact decimal strings/bigints to Numbers.
      // Preserve both separately formatted endpoints and their supplied order in that case.
      if (typeof a !== 'number' || typeof b !== 'number')
        return a === b ? left : `${left} – ${right}`;
      if (a > b) return `${left} – ${right}`;
      if (left === right) return a === b ? left : `${left} – ${right}`;
      if (typeof formatter.formatRangeToParts === 'function') {
        return prefix + join(minus(formatter.formatRangeToParts(a, b))) + suffix;
      }
      return `${left} – ${right}`;
    },
  };
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
function dateValue(value: unknown): { date: Date; civil: boolean } | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = toDate(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const civil = typeof value === 'string' && CIVIL_DATE.test(value);
  // A date-only value has no instant or zone. Keep its calendar identity in every locale/zone.
  return { date: civil ? new Date(`${value}T00:00:00.000Z`) : parsed, civil };
}
function dateFormatter(
  options: Intl.DateTimeFormatOptions,
  locale: string,
  missing: string,
): DisplayFormatter {
  const formatter = df(locale, options);
  const civilFormatter = () => df(locale, { ...options, timeZone: 'UTC' });
  const parts = (value: unknown) => {
    const parsed = dateValue(value);
    return parsed
      ? (parsed.civil ? civilFormatter() : formatter).formatToParts(parsed.date)
      : literal(missing);
  };
  return {
    parts,
    range: (start, end) => {
      const a = dateValue(start);
      const b = dateValue(end);
      if (!a || !b || a.civil !== b.civil) return `${join(parts(start))} – ${join(parts(end))}`;
      if (a.date > b.date) return `${join(parts(start))} – ${join(parts(end))}`;
      const left = join(parts(start));
      const right = join(parts(end));
      if (left === right && a.date.getTime() !== b.date.getTime()) return `${left} – ${right}`;
      return (a.civil ? civilFormatter() : formatter).formatRange(a.date, b.date);
    },
  };
}

function bytesFormatter(format: BytesFormat, locale: string, missing: string): DisplayFormatter {
  const base = format.base ?? 1000;
  if (base !== 1000 && base !== 1024) throw new RangeError('Byte base must be 1000 or 1024.');
  const digits = format.maximumFractionDigits ?? 2;
  checkDigits(digits);
  const labels =
    base === 1024
      ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
      : ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const formatter = nf(locale, { maximumFractionDigits: digits });
  return {
    parts: (value) => {
      const n = finiteNumber(value);
      if (n === null) return literal(missing);
      let index =
        n === 0
          ? 0
          : Math.min(
              labels.length - 1,
              Math.max(0, Math.floor(Math.log(Math.abs(n)) / Math.log(base))),
            );
      let scaled = n / base ** index;
      if (Number(Math.abs(scaled).toFixed(digits)) >= base && index < labels.length - 1) {
        index++;
        scaled = n / base ** index;
      }
      return [
        ...minus(formatter.formatToParts(scaled)),
        { type: 'literal', value: ' ' },
        { type: 'unit', value: labels[index] },
      ];
    },
  };
}
function durationFormatter(
  format: DurationFormat,
  locale: string,
  missing: string,
): DisplayFormatter {
  const digits = format.maximumFractionDigits ?? 0;
  checkDigits(digits);
  const unit = format.unit ?? 'millisecond';
  if (unit !== 'millisecond' && unit !== 'second')
    throw new RangeError('Duration input unit must be millisecond or second.');
  const whole = nf(locale, { useGrouping: false, maximumFractionDigits: 0 });
  const padded = nf(locale, {
    useGrouping: false,
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
  });
  const seconds = nf(locale, {
    useGrouping: false,
    minimumIntegerDigits: 2,
    maximumFractionDigits: digits,
  });
  return {
    parts: (value) => {
      const n = finiteNumber(value);
      if (n === null) return literal(missing);
      const absolute = Number((Math.abs(n) / (unit === 'millisecond' ? 1000 : 1)).toFixed(digits));
      if (!Number.isFinite(absolute)) return literal(missing);
      const hours = Math.floor(absolute / 3600);
      const minutes = Math.floor((absolute % 3600) / 60);
      const second = Number((absolute % 60).toFixed(digits));
      return [
        ...(n < 0 && absolute !== 0 ? [{ type: 'minusSign', value: MINUS }] : []),
        { type: 'hour', value: whole.format(hours) },
        { type: 'literal', value: ':' },
        { type: 'minute', value: padded.format(minutes) },
        { type: 'literal', value: ':' },
        { type: 'second', value: seconds.format(second) },
      ];
    },
  };
}

function createFormatter(format: Formatter | undefined, opts: FormatOptions): DisplayFormatter {
  if (typeof format === 'function') return { parts: (value) => literal(format(value)) };
  let locale = opts.locale ?? 'en-US';
  const currency = opts.currency ?? 'USD';
  if (format && typeof format === 'object') {
    if ('type' in format) {
      locale = format.locale ?? locale;
      const missing = format.missing ?? '—';
      if (format.type === 'date') {
        const { type: _, locale: _locale, missing: _missing, ...options } = format;
        return dateFormatter({ timeZone: opts.timeZone, ...options }, locale, missing);
      }
      if (format.type === 'bytes') return bytesFormatter(format, locale, missing);
      if (format.type === 'duration') return durationFormatter(format, locale, missing);
      const {
        type: _,
        locale: _locale,
        missing: _missing,
        prefix,
        suffix,
        scale,
        ...options
      } = format;
      return numberFormatter(
        { ...(options.style === 'currency' ? { currency } : {}), ...options },
        locale,
        missing,
        { prefix, suffix, scale },
      );
    }
    return numberFormatter(
      { ...(format.style === 'currency' ? { currency } : {}), ...format },
      locale,
      '—',
    );
  }
  const number = (options: Intl.NumberFormatOptions) => numberFormatter(options, locale, '—');
  const date = (options: Intl.DateTimeFormatOptions) =>
    dateFormatter({ timeZone: opts.timeZone, ...options }, locale, '—');
  const compact = (style?: 'currency'): DisplayFormatter => ({
    parts: (value) => {
      const n = numeric(value);
      if (n === null) return literal('—');
      return numberFormatter(
        { ...compactOptions(Number(n), !!opts.short), ...(style ? { style, currency } : {}) },
        locale,
        '—',
      ).parts(n);
    },
  });
  switch (format) {
    case 'integer':
      return opts.short ? compact() : number({ maximumFractionDigits: 0 });
    case 'number':
      return opts.short
        ? compact()
        : {
            parts: (value) => {
              const n = numeric(value);
              if (n === null) return literal('—');
              // Preserve small scientific observations and exact decimal-string/bigint display inputs.
              return number(
                typeof n === 'number'
                  ? Number.isInteger(n)
                    ? { maximumFractionDigits: 0 }
                    : { maximumSignificantDigits: 15 }
                  : { maximumFractionDigits: 20 },
              ).parts(n);
            },
          };
    case 'compact':
      return compact();
    case 'scientific':
      return number({ notation: 'scientific', maximumSignificantDigits: 6 });
    case 'engineering':
      return number({ notation: 'engineering', maximumSignificantDigits: 6 });
    case 'currency':
      return opts.short ? compact('currency') : number({ style: 'currency', currency });
    case 'currency-compact':
      return compact('currency');
    case 'percent':
      return number({
        style: 'percent',
        maximumFractionDigits: opts.short ? 0 : 2,
        minimumFractionDigits: opts.short ? 0 : 1,
      });
    case 'pt':
      return numberFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }, locale, '—', {
        suffix: ' pt',
      });
    case 'bytes':
      return bytesFormatter({ type: 'bytes' }, locale, '—');
    case 'bytes-binary':
      return bytesFormatter({ type: 'bytes', base: 1024 }, locale, '—');
    case 'duration':
      return durationFormatter({ type: 'duration' }, locale, '—');
    case 'date':
      return date({ month: 'short', day: 'numeric', year: 'numeric' });
    case 'date-short':
      return date({ month: 'short', day: 'numeric' });
    case 'weekday':
      return date({ weekday: 'short', month: 'short', day: 'numeric' });
    case 'month':
      return date({ month: 'short', year: '2-digit' });
    case 'datetime':
      return date({
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      });
    case 'time':
      return date({ hour: 'numeric', minute: '2-digit', second: '2-digit' });
    default:
      return {
        parts: (value) =>
          value == null || (typeof value === 'number' && !Number.isFinite(value))
            ? literal('—')
            : value instanceof Date
              ? date({ month: 'short', day: 'numeric' }).parts(value)
              : literal(String(value)),
      };
  }
}

/** Build once and reuse for rows/ticks. Invalid configuration throws; invalid observations show missing text. */
export function makeFormatter(
  format: Formatter | undefined,
  opts: FormatOptions = {},
): (value: unknown) => string {
  const formatter = createFormatter(format, opts);
  return (value) => join(formatter.parts(value));
}
/** Structured numeric/date parts for custom rich tooltip or KPI presentation. */
export function formatParts(
  format: Formatter | undefined,
  value: unknown,
  opts: FormatOptions = {},
): FormatPart[] {
  return createFormatter(format, opts).parts(value);
}
/** Locale-aware ranges; callbacks and runtimes without NumberFormat ranges use a readable separator. */
export function makeRangeFormatter(
  format: Formatter | undefined,
  opts: FormatOptions = {},
): (start: unknown, end: unknown) => string {
  const formatter = createFormatter(format, opts);
  return (
    formatter.range ??
    ((start, end) => `${join(formatter.parts(start))} – ${join(formatter.parts(end))}`)
  );
}
/** Component override > surface-specific field format > base field format. */
export function makeFieldFormatter(
  field: FieldDef | undefined,
  opts: FormatOptions = {},
  override?: Formatter,
): (value: unknown) => string {
  const roleFormat =
    opts.surface === 'axis'
      ? field?.axisFormat
      : opts.surface === 'tooltip'
        ? field?.tooltipFormat
        : undefined;
  return makeFormatter(override ?? roleFormat ?? field?.format, {
    ...opts,
    currency: opts.currency ?? field?.currency,
    timeZone: field?.timeZone ?? opts.timeZone,
    // A deliberately chosen role format is already a presentation decision.
    short: override !== undefined || roleFormat !== undefined ? false : opts.short,
  });
}
export function formatField(
  field: FieldDef | undefined,
  value: unknown,
  opts: FormatOptions = {},
): string {
  return makeFieldFormatter(field, opts)(value);
}
export function isPercentFormat(format: Formatter | undefined): boolean {
  return (
    format === 'percent' ||
    (!!format &&
      typeof format === 'object' &&
      (!('type' in format) || format.type === 'number') &&
      'style' in format &&
      format.style === 'percent')
  );
}
export type DeltaKind = 'percent' | 'pt' | 'number';
/** Signed change. Percent takes a ratio; pt takes already-computed percentage points. */
export function formatDelta(
  value: number,
  kind: DeltaKind = 'percent',
  digits = kind === 'pt' ? 2 : 1,
  opts: FormatOptions = {},
): string {
  checkDigits(digits);
  const scaled = kind === 'percent' ? value * 100 : value;
  if (!Number.isFinite(scaled)) return '—';
  const rounded = Number(scaled.toFixed(digits));
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'always',
    ...(kind === 'percent' ? { style: 'percent' } : {}),
  };
  const parts = minus(
    nf(opts.locale ?? 'en-US', options).formatToParts(kind === 'percent' ? rounded / 100 : rounded),
  );
  if (rounded === 0) {
    for (const part of parts)
      if (part.type === 'plusSign' || part.type === 'minusSign') part.value = '±';
  }
  return join(parts) + (kind === 'pt' ? ' pt' : '');
}
/** Direction with neutral missing/nonfinite values and optional down-is-good inversion. */
export function deltaTone(value: number, invert = false): 'positive' | 'negative' | 'neutral' {
  if (!Number.isFinite(value) || !value) return 'neutral';
  return value > 0 !== invert ? 'positive' : 'negative';
}
