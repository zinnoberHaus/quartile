import { toDate } from './schema';
import type { FieldDef, Formatter } from './types';

/** U+2212, the typographic minus used for every negative value. */
export const MINUS = '−';

export interface FormatOptions {
  locale?: string;
  currency?: string;
  /** Drop trailing zeros and use the shortest form; for axis ticks. */
  short?: boolean;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    nfCache.set(key, f);
  }
  return f;
}

const dfCache = new Map<string, Intl.DateTimeFormat>();
function df(locale: string, opts: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = dfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dfCache.set(key, f);
  }
  return f;
}

function withMinus(s: string) {
  return s.replace(/^-/, MINUS);
}

/** 1_320_000 → "1.32M", 548_000 → "548.0K"; `short` trims to "1.3M" / "548K". */
export function compactNumber(v: number, short = false): string {
  const a = Math.abs(v);
  const sign = v < 0 ? MINUS : '';
  const trim = (s: string) => (short ? s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') : s);
  if (a >= 1e9) return `${sign}${trim((a / 1e9).toFixed(2))}B`;
  if (a >= 1e6) return `${sign}${trim((a / 1e6).toFixed(2))}M`;
  if (a >= 1e3) return `${sign}${trim((a / 1e3).toFixed(1))}K`;
  return `${sign}${trim(short ? String(Math.round(a * 100) / 100) : a.toFixed(a % 1 ? 1 : 0))}`;
}

function currencySymbol(locale: string, currency: string) {
  const parts = nf(locale, { style: 'currency', currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? '$';
}

/** Builds a formatter function for a field format. */
export function makeFormatter(
  fmt: Formatter | undefined,
  opts: FormatOptions = {},
): (v: unknown) => string {
  const locale = opts.locale ?? 'en-US';
  const currency = opts.currency ?? 'USD';
  if (typeof fmt === 'function') return fmt;
  if (fmt && typeof fmt === 'object') {
    const f = nf(locale, fmt);
    return (v) => (v == null ? '—' : withMinus(f.format(Number(v))));
  }
  const num = (fn: (n: number) => string) => (v: unknown) => {
    if (v == null || v === '' || Number.isNaN(Number(v))) return '—';
    return fn(Number(v));
  };
  const date = (o: Intl.DateTimeFormatOptions) => (v: unknown) =>
    v == null ? '—' : df(locale, o).format(toDate(v));
  switch (fmt) {
    case 'integer':
      return num((n) =>
        opts.short
          ? compactNumber(n, true)
          : withMinus(nf(locale, { maximumFractionDigits: 0 }).format(n)),
      );
    case 'number':
      return num((n) =>
        opts.short
          ? compactNumber(n, true)
          : withMinus(nf(locale, { maximumFractionDigits: 2 }).format(n)),
      );
    case 'compact':
      return num((n) => compactNumber(n, opts.short));
    case 'currency':
      return num((n) => {
        if (opts.short || Math.abs(n) >= 1e5) {
          const s = compactNumber(n, opts.short);
          return s.startsWith(MINUS)
            ? `${MINUS}${currencySymbol(locale, currency)}${s.slice(1)}`
            : `${currencySymbol(locale, currency)}${s}`;
        }
        return withMinus(
          nf(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n),
        );
      });
    case 'currency-compact':
      return num((n) => {
        const s = compactNumber(n, opts.short);
        return s.startsWith(MINUS)
          ? `${MINUS}${currencySymbol(locale, currency)}${s.slice(1)}`
          : `${currencySymbol(locale, currency)}${s}`;
      });
    case 'percent':
      return num((n) =>
        withMinus(
          nf(locale, {
            style: 'percent',
            maximumFractionDigits: opts.short ? 0 : 2,
            minimumFractionDigits: opts.short ? 0 : 1,
          }).format(n),
        ),
      );
    case 'pt':
      return num((n) => `${withMinus(n.toFixed(2))} pt`);
    case 'date':
      return date({ month: 'short', day: 'numeric', year: 'numeric' });
    case 'date-short':
      return date({ month: 'short', day: 'numeric' });
    case 'weekday':
      return date({ weekday: 'short', month: 'short', day: 'numeric' });
    case 'month':
      return (v) => {
        if (v == null) return '—';
        const d = toDate(v);
        return `${df(locale, { month: 'short' }).format(d)} ’${String(d.getFullYear()).slice(2)}`;
      };
    case 'datetime':
      return date({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    case 'time':
      return date({ hour: 'numeric', minute: '2-digit' });
    default:
      return (v) =>
        v == null
          ? '—'
          : v instanceof Date
            ? df(locale, { month: 'short', day: 'numeric' }).format(v)
            : String(v);
  }
}

/** Formats a value with a field's own format. */
export function formatField(
  field: FieldDef | undefined,
  value: unknown,
  opts: FormatOptions = {},
): string {
  return makeFormatter(field?.format, { currency: field?.currency, ...opts })(value);
}

export type DeltaKind = 'percent' | 'pt' | 'number';

/**
 * Formats a change with an explicit sign: "+12.4%", "−3.1%", "±0.0%".
 * For `percent`, pass a ratio (0.124). For `pt`, pass percentage points (−0.02).
 */
export function formatDelta(
  value: number,
  kind: DeltaKind = 'percent',
  digits = kind === 'pt' ? 2 : 1,
): string {
  const scaled = kind === 'percent' ? value * 100 : value;
  const rounded = Number(scaled.toFixed(digits));
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '±';
  const body = Math.abs(rounded).toFixed(digits);
  return `${sign}${body}${kind === 'percent' ? '%' : kind === 'pt' ? ' pt' : ''}`;
}

/** The direction a delta reads in, with "good" flipped for metrics where down is better. */
export function deltaTone(value: number, invert = false): 'positive' | 'negative' | 'neutral' {
  if (!value || Math.abs(value) < 1e-12) return 'neutral';
  const up = value > 0;
  return up !== invert ? 'positive' : 'negative';
}
