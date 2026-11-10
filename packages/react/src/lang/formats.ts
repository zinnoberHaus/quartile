/**
 * Reads the `format:` shorthands people and models write ("currency EUR", "$", "%", "1 decimal",
 * ",.0f", ".1%", "%b %Y") into Quartile's serializable format descriptors.
 */
import type { FormatName, SerializableFormatter } from '../data/types';

const NAMED: readonly FormatName[] = [
  'text',
  'number',
  'integer',
  'compact',
  'scientific',
  'engineering',
  'bytes',
  'bytes-binary',
  'duration',
  'currency',
  'currency-compact',
  'percent',
  'pt',
  'date',
  'date-short',
  'month',
  'weekday',
  'datetime',
  'time',
];

const SYMBOL_CURRENCY: Record<string, string> = {
  $: 'USD',
  us$: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  'cn¥': 'CNY',
  rmb: 'CNY',
  '₹': 'INR',
  '₩': 'KRW',
  dollar: 'USD',
  dollars: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  pound: 'GBP',
  pounds: 'GBP',
  yen: 'JPY',
  yuan: 'CNY',
  rupee: 'INR',
  rupees: 'INR',
};

const WORDS: Record<string, FormatName> = {
  int: 'integer',
  integer: 'integer',
  integers: 'integer',
  whole: 'integer',
  count: 'integer',
  num: 'number',
  decimal: 'number',
  float: 'number',
  '%': 'percent',
  pct: 'percent',
  percentage: 'percent',
  percent: 'percent',
  ratio: 'percent',
  rate: 'percent',
  money: 'currency',
  currency: 'currency',
  short: 'compact',
  abbreviated: 'compact',
  abbrev: 'compact',
  si: 'compact',
  human: 'compact',
  thousands: 'compact',
  k: 'compact',
  sci: 'scientific',
  exponential: 'scientific',
  ms: 'duration',
  millis: 'duration',
  milliseconds: 'duration',
  elapsed: 'duration',
  datetime: 'datetime',
  timestamp: 'datetime',
  day: 'date-short',
  days: 'date-short',
  monthly: 'month',
  months: 'month',
  dow: 'weekday',
  pp: 'pt',
  points: 'pt',
  'percentage-points': 'pt',
  bytes: 'bytes',
  b: 'bytes',
  kb: 'bytes',
  mb: 'bytes',
  gb: 'bytes',
  text: 'text',
  string: 'text',
};

/** ISO 4217 codes recognized as bare words; other three-letter words are not currencies. */
const CURRENCY_CODES = new Set(
  'USD EUR GBP JPY CNY CHF CAD AUD NZD HKD SGD INR KRW BRL MXN SEK NOK DKK PLN ZAR TRY RUB ILS THB IDR MYR PHP VND TWD CZK HUF AED SAR NGN EGP ARS CLP COP PEN'.split(
    ' ',
  ),
);

export interface FormatReading {
  format?: SerializableFormatter;
  /** ISO currency code implied by the shorthand ("€" → EUR). */
  currency?: string;
  /** Why the text was not understood; the format is then left unset. */
  problem?: string;
}

/** d3-format subset: [$][,][.precision][~][type]. */
const D3_NUMBER =
  /^(?<sym>[$€£¥])?(?<sign>[+\-( ])?(?<comma>,)?(?:\.(?<precision>\d+))?(?<trim>~)?(?<type>[efgrsdp%])?$/;

function d3Number(text: string): FormatReading | null {
  const m = D3_NUMBER.exec(text);
  if (!m?.groups || text === '' || (!m.groups.type && !m.groups.precision && !m.groups.comma)) {
    return null;
  }
  const { sym, comma, precision, trim, type } = m.groups;
  const p = precision != null ? Number(precision) : undefined;
  const useGrouping = !!comma;
  const fixed = (digits: number | undefined) =>
    digits == null
      ? {}
      : {
          minimumFractionDigits: trim ? 0 : Math.min(digits, 20),
          maximumFractionDigits: Math.min(digits, 20),
        };
  const currency = sym ? SYMBOL_CURRENCY[sym] : undefined;
  switch (type) {
    case '%':
    case 'p':
      return { format: { type: 'number', style: 'percent', ...fixed(p) } };
    case 'e':
      return {
        format: {
          type: 'number',
          notation: 'scientific',
          ...(p != null ? { maximumFractionDigits: Math.min(p, 20) } : {}),
        },
      };
    case 's':
    case 'g':
    case 'r':
      return {
        format: {
          type: 'number',
          ...(type === 's' ? { notation: 'compact' as const } : {}),
          ...(p != null ? { maximumSignificantDigits: Math.max(1, Math.min(p, 21)) } : {}),
          useGrouping,
        },
      };
    case 'd':
      return currency
        ? {
            format: {
              type: 'number',
              style: 'currency',
              currency,
              maximumFractionDigits: 0,
              useGrouping,
            },
            currency,
          }
        : { format: { type: 'number', maximumFractionDigits: 0, useGrouping } };
    default:
      return currency
        ? {
            format: { type: 'number', style: 'currency', currency, ...fixed(p), useGrouping },
            currency,
          }
        : { format: { type: 'number', ...fixed(p ?? 6), useGrouping } };
  }
}

/** Common d3-time-format / strftime patterns. */
const DATE_PATTERNS: Record<string, SerializableFormatter> = {
  '%Y': { type: 'date', year: 'numeric' },
  '%y': { type: 'date', year: '2-digit' },
  '%b %Y': 'month',
  '%b %y': 'month',
  "%b '%y": 'month',
  '%B %Y': { type: 'date', month: 'long', year: 'numeric' },
  '%Y-%m': { type: 'date', year: 'numeric', month: '2-digit' },
  '%b': { type: 'date', month: 'short' },
  '%B': { type: 'date', month: 'long' },
  '%b %d': 'date-short',
  '%b %e': 'date-short',
  '%d %b': 'date-short',
  '%m/%d': 'date-short',
  '%Y-%m-%d': 'date',
  '%x': 'date',
  '%b %d, %Y': 'date',
  '%d %b %Y': 'date',
  '%m/%d/%Y': 'date',
  '%a': { type: 'date', weekday: 'short' },
  '%A': { type: 'date', weekday: 'long' },
  '%H:%M': 'time',
  '%I:%M %p': 'time',
  '%X': 'time',
  '%c': 'datetime',
  '%Y-%m-%d %H:%M': 'datetime',
};

function digitsFrom(words: string[]): number | undefined {
  for (const w of words) {
    const m = /^(\d{1,2})(dp|d\.?p\.?|decimals?|places?|digits?)?$/.exec(w);
    if (m) return Math.min(Number(m[1]), 20);
  }
  return undefined;
}

/** Reads one `format:` value. JSON objects are passed through for schema validation. */
export function readFormat(input: string): FormatReading {
  const text = input.trim();
  if (text === '') return { problem: 'Empty format.' };
  if (text.startsWith('{')) {
    try {
      return { format: JSON.parse(text) as SerializableFormatter };
    } catch {
      return { problem: `Format JSON could not be parsed: ${text}` };
    }
  }
  const unquoted = text.replace(/^["'`]|["'`]$/g, '');
  if (DATE_PATTERNS[unquoted]) return { format: DATE_PATTERNS[unquoted] };
  const lower = unquoted.toLowerCase();
  if ((NAMED as readonly string[]).includes(lower)) return { format: lower as FormatName };
  if (WORDS[lower] && WORDS[lower] !== 'compact') return { format: WORDS[lower] };

  const d3 = d3Number(unquoted);
  if (d3) return d3;

  const words = lower.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
  let currency: string | undefined;
  let base: FormatName | undefined;
  let compact = false;
  for (const w of words) {
    if (SYMBOL_CURRENCY[w]) currency = SYMBOL_CURRENCY[w];
    else if (w.length > 1 && /^[$€£¥₹₩]/.test(w) && SYMBOL_CURRENCY[w[0]]) {
      currency = SYMBOL_CURRENCY[w[0]];
      const rest = w.slice(1);
      if (WORDS[rest] === 'compact' || rest === 'k' || rest === 'm') compact = true;
    } else if (CURRENCY_CODES.has(w.toUpperCase())) {
      currency = w.toUpperCase();
    } else if ((NAMED as readonly string[]).includes(w)) {
      if (w === 'compact') compact = true;
      else base = w as FormatName;
    } else if (WORDS[w]) {
      if (WORDS[w] === 'compact') compact = true;
      else base = WORDS[w];
    } else if (w === 'seconds' || w === 'second' || w === 'sec' || w === 's') {
      return { format: { type: 'duration', unit: 'second' } };
    } else if (w === 'year' || w === 'years' || w === 'yyyy') {
      return { format: { type: 'number', useGrouping: false, maximumFractionDigits: 0 } };
    }
  }
  const digits = digitsFrom(words);
  if (currency && (!base || base === 'currency' || base === 'number' || base === 'integer')) {
    if (compact) return { format: 'currency-compact', currency };
    if (digits != null || base === 'integer') {
      const d = base === 'integer' ? 0 : (digits as number);
      return {
        format: {
          type: 'number',
          style: 'currency',
          currency,
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        },
        currency,
      };
    }
    return { format: 'currency', currency };
  }
  if (compact && (!base || base === 'number')) {
    return digits != null
      ? { format: { type: 'number', notation: 'compact', maximumFractionDigits: digits } }
      : { format: 'compact' };
  }
  if (base === 'currency' && compact) return { format: 'currency-compact' };
  if (base === 'percent' && digits != null) {
    return {
      format: {
        type: 'number',
        style: 'percent',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      },
    };
  }
  if (base === 'number' && digits != null) {
    return {
      format: { type: 'number', minimumFractionDigits: digits, maximumFractionDigits: digits },
    };
  }
  if (!base && digits != null) {
    return {
      format: { type: 'number', minimumFractionDigits: digits, maximumFractionDigits: digits },
    };
  }
  if (base) return { format: base };
  return {
    problem: `Unknown format “${text}”.`,
  };
}

/** The format names the language accepts verbatim, for the reference and prompt. */
export const FORMAT_NAMES = NAMED;
