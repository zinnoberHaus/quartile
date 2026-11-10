/**
 * Reads the data section of a Quartile block: CSV, TSV, semicolon-separated values, a Markdown
 * pipe table, or JSON. Values are typed per column, and the way numbers were written ("$1,200",
 * "12.5%", "1.2M") becomes display metadata instead of being lost.
 */
import type { FieldOverride, Row } from '../data/types';
import { type Diagnostic, error, info, warning } from './diagnostics';
import { keyList, pathNote, resolveDataPath } from './path';

export type TableFormat = 'csv' | 'tsv' | 'semicolon' | 'markdown' | 'json';
export type FieldMeta = Exclude<FieldOverride, string>;

export interface ParsedTable {
  format: TableFormat;
  columns: string[];
  rows: Row[];
  /** Display metadata recovered from how values were written, e.g. "$" → currency USD. */
  fields: Record<string, FieldMeta>;
  diagnostics: Diagnostic[];
  /** Streaming: a trailing record was held back because it may still be incomplete. */
  truncated: boolean;
  /** How many rows the data held, when `maxRows` cut it; `rows` are the first of them. */
  rowsTotal?: number;
}

export interface TableOptions {
  /** Line (1-based, within the block) where `text` starts, so diagnostics point at the source. */
  firstLine?: number;
  /** The text may end mid-record (a streaming answer); hold back the last unfinished record. */
  partial?: boolean;
  /** Keep at most this many rows. Defaults to 5,000. */
  maxRows?: number;
  /**
   * Where the rows are inside a JSON document: keys and array positions separated by dots, e.g.
   * `data.items` or `results.0.series`. Without it, an object with exactly one list of rows is
   * read from that key.
   */
  path?: string;
  /** Line of the `path:` setting, so its diagnostics point at it. Defaults to `firstLine`. */
  pathLine?: number;
}

export const DEFAULT_MAX_ROWS = 5000;

interface RawRecord {
  cells: string[];
  quoted: boolean[];
  line: number;
}

const MISSING = new Set(['', 'na', 'n/a', 'null', 'none', 'nan', 'nil', '-', '—', '–', '..']);

export function isMissingToken(s: string): boolean {
  return MISSING.has(s.trim().toLowerCase());
}

/* ------------------------------------------------------------------------------------------ */
/* Splitting                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/** RFC 4180 records: quoted cells may hold delimiters, doubled quotes and newlines. */
function splitDelimited(
  text: string,
  delimiter: string,
  firstLine: number,
): { records: RawRecord[]; openQuote: boolean } {
  const records: RawRecord[] = [];
  let cells: string[] = [];
  let quoted: boolean[] = [];
  let cell = '';
  let inQuotes = false;
  let wasQuoted = false;
  let line = firstLine;
  let recordLine = firstLine;
  let atCellStart = true;
  const pushCell = () => {
    cells.push(wasQuoted ? cell : cell.trim());
    quoted.push(wasQuoted);
    cell = '';
    wasQuoted = false;
    atCellStart = true;
  };
  const pushRecord = () => {
    pushCell();
    if (!(cells.length === 1 && cells[0] === '' && !quoted[0])) {
      records.push({ cells, quoted, line: recordLine });
    }
    cells = [];
    quoted = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && atCellStart && cell.trim() === '') {
      inQuotes = true;
      wasQuoted = true;
      cell = '';
      atCellStart = false;
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      pushRecord();
      line++;
      recordLine = line;
      continue;
    }
    if (wasQuoted) {
      // Text after a closing quote is kept, e.g. "12" inches → 12 inches.
      cell += ch;
      continue;
    }
    if (ch !== ' ' && ch !== '\t') atCellStart = false;
    cell += ch;
  }
  if (cell !== '' || cells.length > 0 || wasQuoted) pushRecord();
  return { records, openQuote: inQuotes };
}

const MD_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitMarkdown(text: string, firstLine: number): RawRecord[] {
  const out: RawRecord[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (raw.trim() === '' || MD_SEPARATOR.test(raw)) continue;
    let s = raw.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells: string[] = [];
    let cell = '';
    for (let k = 0; k < s.length; k++) {
      if (s[k] === '\\' && s[k + 1] === '|') {
        cell += '|';
        k++;
      } else if (s[k] === '|') {
        cells.push(cell.trim());
        cell = '';
      } else cell += s[k];
    }
    cells.push(cell.trim());
    out.push({
      cells: cells.map(stripInlineMarkdown),
      quoted: cells.map(() => false),
      line: firstLine + i,
    });
  }
  return out;
}

/** "**12**" → "12", "`a`" → "a": emphasis and code spans are presentation, not data. */
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/^(\*\*|__)(.*)\1$/, '$2')
    .replace(/^(\*|_)(.*)\1$/, '$2')
    .replace(/^`(.*)`$/, '$1')
    .trim();
}

function detectDelimiter(header: string): { delimiter: string; format: TableFormat } {
  const count = (d: string) => {
    let n = 0;
    let q = false;
    for (const ch of header) {
      if (ch === '"') q = !q;
      else if (!q && ch === d) n++;
    }
    return n;
  };
  const tabs = count('\t');
  const commas = count(',');
  const semis = count(';');
  if (tabs > 0 && tabs >= commas) return { delimiter: '\t', format: 'tsv' };
  if (semis > commas) return { delimiter: ';', format: 'semicolon' };
  return { delimiter: ',', format: 'csv' };
}

/* ------------------------------------------------------------------------------------------ */
/* Numbers written by people and models                                                        */
/* ------------------------------------------------------------------------------------------ */

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  US$: 'USD',
  CA$: 'CAD',
  C$: 'CAD',
  A$: 'AUD',
  AU$: 'AUD',
  NZ$: 'NZD',
  HK$: 'HKD',
  S$: 'SGD',
  R$: 'BRL',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  'CN¥': 'CNY',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  '₺': 'TRY',
  '₪': 'ILS',
  '₫': 'VND',
  '฿': 'THB',
  '₱': 'PHP',
  '₦': 'NGN',
};
const CURRENCY_CODES = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CNY',
  'RMB',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'HKD',
  'SGD',
  'INR',
  'KRW',
  'BRL',
  'MXN',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'ZAR',
]);
const SYMBOL_PATTERN = Object.keys(CURRENCY_SYMBOLS)
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(/[$]/g, '\\$'))
  .join('|');
const CODE_PATTERN = [...CURRENCY_CODES].join('|');
const SUFFIX: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  M: 1e6,
  MM: 1e6,
  B: 1e9,
  bn: 1e9,
  Bn: 1e9,
  T: 1e12,
};
const NUMBER_LIKE = new RegExp(
  `^(?<open>\\()?\\s*(?<sign>[+\\-−])?\\s*(?:(?<sym>${SYMBOL_PATTERN})|(?<code>${CODE_PATTERN})\\s?)?\\s*(?<sign2>[+\\-−])?\\s*(?<num>(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\.\\d+)(?:[eE](?<exp>[+\\-]?\\d+))?\\s*(?<suffix>%|bn|Bn|MM|[kKMBT](?![a-zA-Z]))?\\s*(?:(?<code2>${CODE_PATTERN})|(?<sym2>€|£))?\\s*(?<close>\\))?$`,
);

export interface NumberToken {
  value: number;
  currency?: string;
  percent?: boolean;
  compact?: boolean;
  decimals: number;
  grouped: boolean;
}

/** Parses "1,234", "-$1.2M", "12.5%", "(300)", "€ 40", "3e6"; null when the text is not a number. */
export function parseNumberToken(text: string): NumberToken | null {
  const s = text.trim();
  if (s === '') return null;
  const m = NUMBER_LIKE.exec(s);
  if (!m?.groups) return null;
  const g = m.groups;
  if (!!g.open !== !!g.close) return null;
  const digits = g.num.replace(/,/g, '');
  let value = Number(digits) * (g.exp ? 10 ** Number(g.exp) : 1);
  if (!Number.isFinite(value)) return null;
  const negative = [g.sign, g.sign2].some((x) => x === '-' || x === '−') || !!g.open;
  const suffix = g.suffix;
  const percent = suffix === '%';
  let compact = false;
  if (suffix && !percent) {
    value *= SUFFIX[suffix] ?? 1;
    compact = true;
  }
  if (negative) value = -value;
  const symbol = g.sym ?? g.sym2;
  let currency = symbol ? CURRENCY_SYMBOLS[symbol] : (g.code ?? g.code2);
  if (currency === 'RMB') currency = 'CNY';
  const decimals = g.num.includes('.') ? g.num.split('.')[1].length : 0;
  return { value, currency, percent, compact, decimals, grouped: g.num.includes(',') };
}

/* ------------------------------------------------------------------------------------------ */
/* Dates                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

function monthIndex(name: string): number {
  const k = name.slice(0, 3).toLowerCase();
  const i = (MONTHS as readonly string[]).indexOf(k);
  if (i < 0) return -1;
  // Accept "Jan", "Jan.", "January", "Sept"; reject other words that start like a month.
  const full = new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const n = name.toLowerCase().replace(/\.$/, '');
  return full.startsWith(n) || n === 'sept' ? i : -1;
}

const pad = (n: number) => String(n).padStart(2, '0');
const YEAR_MONTH = /^(\d{4})[-/](\d{1,2})$/;
const MONTH_YEAR = /^([A-Za-z]{3,9}\.?)[\s,-]+'?(\d{2}|\d{4})$/;
const YEAR_MONTH_NAME = /^(\d{4})[\s-]+([A-Za-z]{3,9}\.?)$/;
const QUARTER = /^(?:(\d{4})[\s-]?Q([1-4])|Q([1-4])[\s-]?'?(\d{2}|\d{4}))$/i;

function fullYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/** "2026-03" → "2026-03-01"; "Mar 2026" → "2026-03-01". Null when not a month. */
export function parseMonth(s: string): string | null {
  const t = s.trim();
  let m = YEAR_MONTH.exec(t);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? `${m[1]}-${pad(month)}-01` : null;
  }
  m = MONTH_YEAR.exec(t);
  if (m) {
    const i = monthIndex(m[1]);
    return i >= 0 ? `${fullYear(m[2])}-${pad(i + 1)}-01` : null;
  }
  m = YEAR_MONTH_NAME.exec(t);
  if (m) {
    const i = monthIndex(m[2]);
    return i >= 0 ? `${m[1]}-${pad(i + 1)}-01` : null;
  }
  return null;
}

/** "2026-Q2" / "Q2 2026" → "2026-04-01". Null when not a quarter. */
export function parseQuarter(s: string): string | null {
  const m = QUARTER.exec(s.trim());
  if (!m) return null;
  const year = m[1] ? Number(m[1]) : fullYear(m[4]);
  const q = Number(m[2] ?? m[3]);
  return `${year}-${pad((q - 1) * 3 + 1)}-01`;
}

function quarterLabel(value: unknown): string {
  const s = typeof value === 'string' ? value : '';
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return String(value ?? '');
  return `Q${Math.floor((Number(m[2]) - 1) / 3) + 1} ${m[1]}`;
}

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/* ------------------------------------------------------------------------------------------ */
/* Column typing                                                                               */
/* ------------------------------------------------------------------------------------------ */

interface ColumnResult {
  values: unknown[];
  meta?: FieldMeta;
  note?: string;
}

function typeColumn(name: string, raw: (string | null)[]): ColumnResult {
  const present = raw.filter((v): v is string => v != null && !isMissingToken(v));
  const missingToNull = raw.map((v) => (v == null || isMissingToken(v) ? null : v));
  if (present.length === 0) return { values: missingToNull };

  const lower = present.map((v) => v.trim().toLowerCase());
  if (lower.every((v) => v === 'true' || v === 'false')) {
    return {
      values: missingToNull.map((v) => (v == null ? null : v.trim().toLowerCase() === 'true')),
    };
  }

  const tokens = present.map(parseNumberToken);
  if (tokens.every((t) => t !== null)) {
    const ts = tokens as NumberToken[];
    const percent = ts.some((t) => t.percent);
    const currencies = new Set(ts.map((t) => t.currency).filter(Boolean) as string[]);
    const compact = ts.some((t) => t.compact);
    const decimals = Math.max(0, ...ts.map((t) => t.decimals));
    const values = missingToNull.map((v) => {
      if (v == null) return null;
      const t = parseNumberToken(v)!;
      return percent ? t.value / 100 : t.value;
    });
    let meta: FieldMeta | undefined;
    let note: string | undefined;
    if (percent) {
      meta = {
        format: { type: 'number', style: 'percent', maximumFractionDigits: Math.min(decimals, 4) },
        unit: 'RATE',
      };
      note = `Read “${name}” as percentages (12% → 0.12).`;
    } else if (currencies.size === 1) {
      const currency = [...currencies][0];
      meta = { format: compact ? 'currency-compact' : 'currency', currency, unit: currency };
      if (!compact) {
        const whole = values.every((v) => v === null || Number.isInteger(v));
        Object.assign(meta, whole ? wholeCurrency(currency) : exactCurrency(currency));
      }
    } else if (currencies.size > 1) {
      note = `“${name}” mixes currencies (${[...currencies].join(', ')}); values are shown without a currency.`;
    } else if (compact) {
      meta = { format: 'compact' };
    } else if (
      /(^|_)(year|yr|fy)$/i.test(name) &&
      ts.every((t) => Number.isInteger(t.value) && t.value >= 1000 && t.value <= 9999)
    ) {
      meta = { format: { type: 'number', useGrouping: false, maximumFractionDigits: 0 } };
    }
    return { values, meta, note };
  }

  if (present.every((v) => ISO_DATE.test(v.trim()))) {
    return { values: missingToNull.map((v) => (v == null ? null : v.trim())) };
  }

  const months = present.map(parseMonth);
  if (months.every((m) => m !== null)) {
    return {
      values: missingToNull.map((v) => (v == null ? null : parseMonth(v))),
      meta: { type: 'temporal', format: 'month' },
    };
  }

  const quarters = present.map(parseQuarter);
  if (quarters.every((q) => q !== null)) {
    return {
      values: missingToNull.map((v) => (v == null ? null : parseQuarter(v))),
      meta: { type: 'temporal', format: quarterLabel },
    };
  }

  return { values: missingToNull.map((v) => (v == null ? null : v.trim())) };
}

/**
 * Whole amounts ("$1,200") display without cents; axes keep compact ticks ("$1.2K"), which an
 * explicit object format would otherwise switch off.
 */
export function wholeCurrency(currency: string): FieldMeta {
  return {
    format: {
      type: 'number',
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
    axisFormat: 'currency-compact',
  };
}

/**
 * Amounts with cents ("$1,200.50") display in full wherever a value is read. The named
 * `currency` format prints the same, but ranked lists and donuts shorten it by default to keep
 * a narrow column; an amount a block asked for or wrote out is shown as it is. Axes stay compact.
 */
export function exactCurrency(currency: string): FieldMeta {
  return {
    format: { type: 'number', style: 'currency', currency },
    axisFormat: 'currency-compact',
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Header names                                                                                */
/* ------------------------------------------------------------------------------------------ */

function columnNames(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((c, i) => {
    let name = c
      .trim()
      .replace(/^["'`]|["'`]$/g, '')
      .trim();
    if (!name) name = `column_${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return n ? `${name}_${n + 1}` : name;
  });
}

/**
 * A row with more cells than columns is often an unquoted thousands separator: "Europe,1,200".
 * Joins a 1–3 digit cell with following exactly-3-digit cells when that restores the width.
 */
function rejoinThousands(cells: string[], width: number): string[] | null {
  let extra = cells.length - width;
  if (extra <= 0) return null;
  const out: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    let cell = cells[i];
    while (
      extra > 0 &&
      /^[+\-−]?[$€£¥]?\d{1,3}$/.test(cell.replace(/,\d{3}/g, '')) &&
      /^\d{3}(\.\d+)?%?$/.test(cells[i + 1] ?? '')
    ) {
      cell = `${cell},${cells[i + 1]}`;
      i++;
      extra--;
    }
    out.push(cell);
  }
  return extra === 0 ? out : null;
}

/* ------------------------------------------------------------------------------------------ */
/* JSON                                                                                        */
/* ------------------------------------------------------------------------------------------ */

/** Complete top-level values of a JSON array that may be cut off mid-stream. */
function partialJsonArray(text: string): unknown[] | null {
  const start = text.indexOf('[');
  if (start < 0) return null;
  const items: unknown[] = [];
  let depth = 0;
  let inString = false;
  let itemStart = -1;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      if (depth === 0 && itemStart < 0) itemStart = i;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) itemStart = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth === 0) break;
      depth--;
      if (depth === 0 && itemStart >= 0) {
        try {
          items.push(JSON.parse(text.slice(itemStart, i + 1)));
        } catch {
          return items;
        }
        itemStart = -1;
      }
    }
  }
  return items;
}

interface JsonRows {
  rows: Row[];
  problem?: string;
  hint?: string;
  /** The key the rows were read from, when the document wraps them. */
  key?: string;
  /** The key beside the rows that their column names were read from. */
  header?: string;
  /** Column names of a list of arrays, which outlive its rows: a header with nothing under it. */
  names?: string[];
  warning?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A list that can be rows: objects, or arrays under a header row. */
function isRowList(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    (value.every(isRecord) || value.every(Array.isArray))
  );
}

/** Keys APIs keep their rows under, in the order they are preferred when several lists exist. */
const ROW_KEYS = ['rows', 'data', 'results', 'items', 'records'];

/** The first conventional key that holds a list of rows, or an empty list. */
function conventionalKey(entries: [string, unknown][]): string | undefined {
  for (const name of ROW_KEYS) {
    const hit = entries.find(
      ([k, v]) => k.toLowerCase() === name && Array.isArray(v) && (v.length === 0 || isRowList(v)),
    );
    if (hit) return hit[0];
  }
  return undefined;
}

/** Keys that hold a table's column names beside its rows, in the order they are tried. */
const HEADER_KEYS = ['columns', 'cols', 'fields', 'schema'];

/** A column's name as an API lists it: the name itself, or the `name` of its description. */
function headerName(entry: unknown): string | undefined {
  // `name` first; the other spellings only for a description that has no `name` at all.
  const name = !isRecord(entry)
    ? entry
    : Object.hasOwn(entry, 'name')
      ? entry.name
      : (entry.display_name ?? entry.field ?? entry.label);
  if (typeof name === 'string') return name;
  return typeof name === 'number' && Number.isFinite(name) ? String(name) : undefined;
}

/**
 * Column names kept beside a list of bare arrays, as query APIs return them
 * (`{ "cols": [...], "rows": [[...]] }`). They count only when there are exactly as many as the
 * first array has values; otherwise the list is read under its own first array, as before.
 */
function headerBeside(
  holder: Record<string, unknown>,
  own: string | undefined,
  width: number,
): { names: string[]; key: string } | undefined {
  const entries = Object.entries(holder);
  for (const wanted of HEADER_KEYS) {
    const hit = entries.find(([k]) => k !== own && k.toLowerCase() === wanted);
    if (!hit) continue;
    let [key, list] = hit;
    // `schema: { fields: [...] }`
    if (wanted === 'schema' && isRecord(list)) {
      key = `${key}.fields`;
      list = list.fields;
    }
    if (!Array.isArray(list) || list.length !== width) continue;
    const names = list.map(headerName);
    if (names.every((n) => n !== undefined)) return { names: names as string[], key };
  }
  return undefined;
}

function rowsFromColumns(entries: [string, unknown[]][]): Row[] {
  const length = Math.max(0, ...entries.map(([, v]) => v.length));
  return Array.from({ length }, (_, i) =>
    Object.fromEntries(entries.map(([k, v]) => [k, v[i] ?? null])),
  );
}

/**
 * Rows of a parsed JSON value. `at` is the path already followed to it, for hints; `holder` is
 * the object a list was found in, under the key `own`, where its column names may be kept.
 */
function rowsFromJson(
  value: unknown,
  at?: string,
  holder?: Record<string, unknown>,
  own?: string,
): JsonRows {
  if (Array.isArray(value)) {
    if (value.every(isRecord)) return { rows: value as Row[] };
    if (value.every((v) => Array.isArray(v)) && value.length > 0) {
      const lists = value as unknown[][];
      const beside = holder ? headerBeside(holder, own, lists[0].length) : undefined;
      // Names kept beside the list leave every array a row; otherwise the first is the header.
      const names = columnNames(beside ? beside.names : lists[0].map(String));
      return {
        rows: (beside ? lists : lists.slice(1)).map((r) =>
          Object.fromEntries(names.map((n, i) => [n, r[i] ?? null])),
        ),
        header: beside?.key,
        names,
      };
    }
    return { rows: [], problem: 'Expected an array of objects or an array of arrays.' };
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    // Columns hold plain values. A key holding a list of objects is an envelope around rows
    // (`{ "data": [...] }`), not a column of objects.
    const columns =
      entries.length > 0 &&
      entries.every(
        ([, v]) => Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'),
      );
    const lengths = new Set(entries.map(([, v]) => (Array.isArray(v) ? v.length : -1)));
    if (columns && lengths.size === 1) {
      return { rows: rowsFromColumns(entries as [string, unknown[]][]) };
    }
    const candidates = entries.filter(([, v]) => isRowList(v)).map(([k]) => k);
    // The key an API conventionally keeps its rows under is the table, whether or not it has
    // rows right now: an empty `results` beside `errors` is no rows, not the errors.
    const named = conventionalKey(entries);
    const namedList = named === undefined ? [] : (value[named] as unknown[]);
    const namedEmpty = named !== undefined && namedList.length === 0;
    if (candidates.length === 1 && !namedEmpty) {
      const key = candidates[0];
      return { ...rowsFromJson(value[key], undefined, value, key), key };
    }
    if (candidates.length >= 1) {
      // Among several lists, objects under a conventional key are taken. Arrays are taken only
      // with their column names beside them: without, the header row they need may be one of
      // the other lists.
      if (named !== undefined) {
        const read = rowsFromJson(namedList, undefined, value, named);
        if (namedList.every(isRecord) || read.header !== undefined) return { ...read, key: named };
      }
      // The example names a list of rows rather than the descriptions of its columns.
      const pick =
        named ?? candidates.find((k) => !HEADER_KEYS.includes(k.toLowerCase())) ?? candidates[0];
      const example = at === undefined ? pick : `${at}.${pick}`;
      return {
        rows: [],
        problem: `Several keys hold rows: ${candidates.map((k) => `\`${k}\``).join(', ')}.`,
        hint:
          `Choose one with \`path:\`, e.g. \`path: ${example}\`.` +
          (named === undefined
            ? ''
            : ' A list of arrays is read with its first array as the header.'),
      };
    }
    if (named !== undefined) return { rows: [], key: named };
    if (columns) {
      return {
        rows: rowsFromColumns(entries as [string, unknown[]][]),
        warning: 'Columns have different lengths; the shorter ones end with missing values.',
      };
    }
    // An API that found nothing still answers with its envelope.
    const empty = entries.filter(([, v]) => Array.isArray(v) && v.length === 0).map(([k]) => k);
    if (empty.length === 1) return { rows: [], key: empty[0] };
    return {
      rows: [],
      problem: 'Expected an array of rows or an object of columns.',
      hint:
        entries.length === 0
          ? undefined
          : at === undefined
            ? `This object has the keys ${keyList(value)}. Name the one that holds the rows with \`path:\`, e.g. \`path: data.items\`.`
            : `\`${at}\` has the keys ${keyList(value)}. Extend the path to the one that holds the rows.`,
    };
  }
  return { rows: [], problem: 'Expected an array of rows or an object of columns.' };
}

/** JSON cells keep their types; strings still get the same coercion as CSV cells. */
function typeJsonRows(rows: Row[]): {
  columns: string[];
  rows: Row[];
  fields: ParsedTable['fields'];
  notes: string[];
} {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(0, 500)) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }
  const fields: ParsedTable['fields'] = {};
  const notes: string[] = [];
  const out = rows.map((r) => ({ ...r }));
  for (const c of columns) {
    const vals = rows.map((r) => r[c]);
    const strings = vals.filter((v) => v != null);
    if (strings.length && strings.every((v) => typeof v === 'string')) {
      const typed = typeColumn(
        c,
        vals.map((v) => (v == null ? null : String(v))),
      );
      typed.values.forEach((v, i) => {
        out[i][c] = v;
      });
      if (typed.meta) fields[c] = typed.meta;
      if (typed.note) notes.push(typed.note);
    }
  }
  return { columns, rows: out, fields, notes };
}

/* ------------------------------------------------------------------------------------------ */
/* Entry point                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export function detectTableFormat(text: string): TableFormat {
  const first = text.split('\n').find((l) => l.trim() !== '') ?? '';
  const t = first.trim();
  if (t.startsWith('[') || t.startsWith('{')) return 'json';
  if (t.startsWith('|')) return 'markdown';
  return detectDelimiter(first).format;
}

/** Reads CSV, TSV, semicolon-separated text, a Markdown table or JSON text. */
export function parseTable(text: string, options?: TableOptions): ParsedTable;
/** Reads JSON that is already parsed, e.g. what `response.json()` returned. */
export function parseTable(json: unknown, options?: TableOptions): ParsedTable;
export function parseTable(input: unknown, options: TableOptions = {}): ParsedTable {
  const firstLine = options.firstLine ?? 1;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const diagnostics: Diagnostic[] = [];
  const text = typeof input === 'string' ? input : '';
  const format = typeof input === 'string' ? detectTableFormat(input) : 'json';
  let truncated = false;

  if (format === 'json') {
    const pathLine = options.pathLine ?? firstLine;
    let value: unknown = input;
    let path = options.path;
    // The object that holds the list of rows, the list's key in it, and the path to that object.
    let holder: Record<string, unknown> | undefined;
    let own: string | undefined;
    let holderPath: string | undefined;
    if (typeof input === 'string') {
      try {
        value = JSON.parse(input);
      } catch (e) {
        if (options.partial) {
          // A path cannot be followed through half a document; its rows wait for the rest.
          value = path === undefined ? (partialJsonArray(input) ?? []) : [];
          path = undefined;
          truncated = true;
        } else {
          diagnostics.push(
            error(
              `The data is not valid JSON: ${(e as Error).message}`,
              firstLine,
              'Use CSV with a header row, a Markdown table, or a JSON array of objects.',
            ),
          );
          return { format, columns: [], rows: [], fields: {}, diagnostics, truncated };
        }
      }
    }
    if (path !== undefined) {
      const resolved = resolveDataPath(value, path);
      const note = pathNote(resolved.path);
      if (note) diagnostics.push(info(note, pathLine));
      if (!resolved.ok) {
        diagnostics.push(error(resolved.problem.message, pathLine, resolved.problem.hint));
        return { format, columns: [], rows: [], fields: {}, diagnostics, truncated };
      }
      value = resolved.value;
      // From here on the path is its dotted form; `$` alone is the document, like no path.
      path = resolved.path.dotted || undefined;
      // A path that ends at the list itself: its column names may be kept beside it.
      if (Array.isArray(value) && isRecord(resolved.parent)) {
        holder = resolved.parent;
        own = resolved.path.segments.at(-1);
        holderPath = resolved.path.segments.slice(0, -1).join('.') || undefined;
      }
    }
    const read = rowsFromJson(value, path, holder, own);
    const { rows } = read;
    if (read.problem) {
      diagnostics.push(
        path === undefined
          ? error(read.problem, firstLine, read.hint)
          : error(`\`${path}\` does not hold rows. ${read.problem}`, pathLine, read.hint),
      );
    }
    if (read.warning) diagnostics.push(warning(read.warning, firstLine));
    if (read.key !== undefined) {
      const at = path === undefined ? read.key : `${path}.${read.key}`;
      diagnostics.push(info(`Read rows from \`${at}\`.`, firstLine));
      holderPath = path;
    }
    if (read.header !== undefined) {
      const at = holderPath === undefined ? read.header : `${holderPath}.${read.header}`;
      diagnostics.push(info(`Read column names from \`${at}\`.`, firstLine));
    }
    const typed = typeJsonRows(rows.slice(0, maxRows));
    if (rows.length > maxRows) {
      diagnostics.push(warning(`Kept the first ${maxRows} of ${rows.length} rows.`, firstLine));
    }
    for (const note of typed.notes) diagnostics.push(info(note, firstLine));
    // A header with no rows under it still says which columns exist.
    const bare = rows.length === 0 ? read.names : undefined;
    return {
      format,
      columns: bare ?? typed.columns,
      rows: typed.rows,
      fields: bare ? Object.fromEntries(bare.map((name) => [name, {}])) : typed.fields,
      diagnostics,
      truncated,
      ...(rows.length > maxRows ? { rowsTotal: rows.length } : {}),
    };
  }

  if (options.path !== undefined) {
    diagnostics.push(
      warning(
        '`path:` applies to JSON; this data is a table already, so it was ignored.',
        options.pathLine ?? firstLine,
      ),
    );
  }

  let body = text;
  if (options.partial) {
    // The last line may be a row still being written, even when a renderer appended a newline.
    const trimmed = body.replace(/\n$/, '');
    const cut = trimmed.lastIndexOf('\n');
    truncated = trimmed.length > 0;
    body = cut >= 0 ? trimmed.slice(0, cut + 1) : '';
  }

  let records: RawRecord[];
  if (format === 'markdown') {
    records = splitMarkdown(body, firstLine);
  } else {
    const delimiter = format === 'tsv' ? '\t' : format === 'semicolon' ? ';' : ',';
    const split = splitDelimited(body, delimiter, firstLine);
    records = split.records;
    if (split.openQuote) {
      if (options.partial) {
        records = records.slice(0, -1);
        truncated = true;
      } else {
        diagnostics.push(error('A quoted value is never closed.', records.at(-1)?.line));
      }
    }
  }

  if (records.length === 0) {
    return { format, columns: [], rows: [], fields: {}, diagnostics, truncated };
  }
  const [head, ...data] = records;
  const columns = columnNames(head.cells);
  const width = columns.length;
  const raw: (string | null)[][] = columns.map(() => []);
  let kept = 0;
  let rowsTotal: number | undefined;
  for (const rec of data) {
    if (kept >= maxRows) {
      rowsTotal = data.length;
      diagnostics.push(
        warning(
          `Kept the first ${maxRows} rows; ${data.length - maxRows} more were ignored.`,
          rec.line,
        ),
      );
      break;
    }
    let cells = rec.cells;
    if (cells.length > width) {
      const rejoined = format === 'csv' ? rejoinThousands(cells, width) : null;
      if (rejoined) {
        diagnostics.push(info('Joined digits split by an unquoted thousands separator.', rec.line));
        cells = rejoined;
      } else if (cells.slice(width).every((c) => c === '')) {
        cells = cells.slice(0, width);
      } else {
        diagnostics.push(
          warning(
            `Row has ${cells.length} values but the header has ${width} columns; extra values were ignored.`,
            rec.line,
            format === 'csv' ? 'Quote values that contain commas, e.g. "1,200".' : undefined,
          ),
        );
        cells = cells.slice(0, width);
      }
    }
    for (let c = 0; c < width; c++) raw[c].push(c < cells.length ? cells[c] : null);
    kept++;
  }

  const rows: Row[] = Array.from({ length: kept }, () => ({}));
  const fields: ParsedTable['fields'] = {};
  columns.forEach((name, c) => {
    const typed = typeColumn(name, raw[c]);
    typed.values.forEach((v, r) => {
      rows[r][name] = v;
    });
    if (typed.meta) fields[name] = typed.meta;
    // A header with no rows under it still says which columns exist.
    else if (kept === 0) fields[name] = {};
    if (typed.note) diagnostics.push(info(typed.note, head.line));
  });
  return {
    format,
    columns,
    rows,
    fields,
    diagnostics,
    truncated,
    ...(rowsTotal === undefined ? {} : { rowsTotal }),
  };
}
