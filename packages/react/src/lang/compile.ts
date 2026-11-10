/**
 * Compiles a parsed Quartile block into the existing JSON spec (`QuartileSpec`) plus the datasets
 * it references, so the language and the JSON contract always render through the same SpecView.
 */
import { dataset, humanize, resolveData } from '../data/schema';
import type { DataInput, Dataset, FieldDef, Formatter, Row } from '../data/types';
import {
  type ComponentSpec,
  type DashboardSpec,
  type QuartileSpec,
  quartileSchema,
  type SpecComponentName,
} from '../spec/schema';
import { type SpecError, validateSpec } from '../spec/validate';
import { type Diagnostic, error, hasErrors, info, warning } from './diagnostics';
import { readFormat } from './formats';
import { KINDS, type KindDef, PROPERTY_ALIASES, type ViewKind } from './kinds';
import {
  type BlockNode,
  type FieldExpr,
  type ParseOptions,
  type PropEntry,
  parseBlock,
  parseFieldExpr,
  type ViewNode,
} from './parse';
import { type FieldMeta, parseTable, wholeCurrency } from './table';

export interface CompileOptions extends ParseOptions {
  /** Datasets the block may reference by name: host data and `data` blocks elsewhere. */
  datasets?: Record<string, DataInput>;
  /** Names whose rows are still loading; views over them wait instead of failing. */
  pendingDatasets?: readonly string[];
  /** Keep at most this many inline rows. Defaults to 5,000. */
  maxRows?: number;
}

export interface CompiledBlock {
  type: 'view' | 'dashboard' | 'data' | 'empty';
  /** Spec rendered by SpecView. Absent when nothing can be rendered yet. */
  spec?: QuartileSpec;
  /** Datasets `spec` references, including inline and derived ones. */
  data: Record<string, DataInput>;
  /** A `data <name>` block's dataset. */
  defines?: { name: string; dataset: Dataset };
  /** URLs the block asks the host to load (`src:`). Nothing is fetched by the compiler. */
  sources: { name: string; url: string; line: number }[];
  /** Selection group shared with other blocks in a document; null when the block stands alone. */
  link: string | null;
  title?: string;
  diagnostics: Diagnostic[];
  /** False while a streaming block may still grow. */
  complete: boolean;
  /** Waiting for rows: a streaming block without data yet, or a source that is loading. */
  pending: boolean;
}

type JsonSchema = Record<string, unknown>;
const DEFS = quartileSchema.$defs as Record<string, JsonSchema>;
const FIELD_ATTRS = new Set([
  'label',
  'format',
  'description',
  'currency',
  'unit',
  'type',
  'timezone',
  'axisformat',
  'tooltipformat',
]);

/** Default 12-column spans in a dashboard; a row that is not full is stretched to fill. */
const SPANS: Record<ViewKind, number> = {
  kpi: 3,
  sparkline: 3,
  barlist: 4,
  donut: 4,
  funnel: 4,
  filters: 12,
  table: 12,
  calendar: 12,
  sankey: 12,
  line: 6,
  area: 6,
  bar: 6,
  histogram: 6,
  scatter: 6,
  heatmap: 6,
  box: 6,
};

/* ------------------------------------------------------------------------------------------ */
/* Values                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && /^["'`]/.test(t) && t[0] === t[t.length - 1]) return t.slice(1, -1);
  return t;
}

function parseBool(s: string): boolean | undefined {
  const v = s.trim().toLowerCase();
  if (['true', 'yes', 'on', '1', 'y'].includes(v)) return true;
  if (['false', 'no', 'off', '0', 'n', 'none'].includes(v)) return false;
  return undefined;
}

/** Splits "a, b and c" or "[a, b]" into items, keeping quoted names and calls whole. */
function splitList(s: string): string[] {
  const t = s.trim().replace(/^\[(.*)\]$/s, '$1');
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  let quote: string | null = null;
  for (const ch of t) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((item) =>
    /\s+and\s+/i.test(item) && !/^["'`]/.test(item) ? item.split(/\s+and\s+/i) : [item],
  );
}

function resolveRef(schema: JsonSchema): JsonSchema {
  let s = schema;
  for (let guard = 0; typeof s.$ref === 'string' && guard < 10; guard++) {
    const target = DEFS[(s.$ref as string).replace('#/$defs/', '')];
    const { $ref: _r, ...rest } = s;
    s = { ...(target ?? {}), ...rest };
  }
  return s;
}

function refName(schema: JsonSchema): string | undefined {
  return typeof schema.$ref === 'string' ? schema.$ref.replace('#/$defs/', '') : undefined;
}

/* ------------------------------------------------------------------------------------------ */
/* Fields                                                                                      */
/* ------------------------------------------------------------------------------------------ */

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9À-￿]/g, '');

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

interface FieldResolver {
  columns: string[];
  schema: Record<string, FieldDef>;
  resolve(name: string, line: number | undefined, diagnostics: Diagnostic[]): string | null;
  type(name: string): FieldDef['type'];
}

function makeResolver(schema: Record<string, FieldDef>): FieldResolver {
  const columns = Object.keys(schema);
  const resolve = (name: string, line: number | undefined, diagnostics: Diagnostic[]) => {
    if (Object.hasOwn(schema, name)) return name;
    const lower = columns.find((c) => c.toLowerCase() === name.toLowerCase());
    if (lower) return lower;
    const target = squash(name);
    const squashed = columns.filter(
      (c) => squash(c) === target || squash(schema[c].label) === target,
    );
    if (squashed.length === 1) return squashed[0];
    const plural = columns.filter(
      (c) => squash(c) === target.replace(/s$/, '') || `${squash(c)}s` === target,
    );
    if (plural.length === 1) return plural[0];
    const limit = target.length <= 5 ? 1 : 2;
    const scored = columns
      .map((c) => ({ c, d: levenshtein(squash(c), target) }))
      .sort((a, b) => a.d - b.d);
    if (scored[0] && scored[0].d <= limit && scored[1]?.d !== scored[0].d) {
      diagnostics.push(warning(`Used column “${scored[0].c}” for “${name}”.`, line));
      return scored[0].c;
    }
    diagnostics.push(
      error(
        `There is no column “${name}”.`,
        line,
        columns.length
          ? `Columns: ${columns.slice(0, 20).join(', ')}${columns.length > 20 ? ', …' : ''}.`
          : 'The dataset has no columns yet.',
      ),
    );
    return null;
  };
  return {
    columns,
    schema,
    resolve,
    type: (name) => schema[name]?.type ?? 'nominal',
  };
}

function isPercentField(def: FieldDef | undefined): boolean {
  const f = def?.format;
  return (
    f === 'percent' ||
    (!!f && typeof f === 'object' && (f as Intl.NumberFormatOptions).style === 'percent')
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Datasets                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function definitions(schema: Record<string, FieldDef>): Record<string, FieldMeta> {
  const out: Record<string, FieldMeta> = {};
  for (const [name, def] of Object.entries(schema)) {
    const { name: _n, ...rest } = def;
    out[name] = rest;
  }
  return out;
}

/** Field metadata written as `revenue.label: Net revenue`, `amount.format: currency EUR`. */
function fieldMetaFrom(
  props: PropEntry[],
  columns: string[],
  diagnostics: Diagnostic[],
): Record<string, FieldMeta> {
  const out: Record<string, FieldMeta> = {};
  for (const p of props) {
    const dot = p.key.lastIndexOf('.');
    if (dot <= 0) continue;
    const attr = p.key
      .slice(dot + 1)
      .toLowerCase()
      .replace(/[\s_-]/g, '');
    if (!FIELD_ATTRS.has(attr)) continue;
    const fieldName = unquote(p.key.slice(0, dot));
    if (['x', 'y', 'color', 'value', 'size', 'category', 'group', 'target'].includes(fieldName)) {
      continue;
    }
    const column =
      columns.find((c) => c === fieldName) ??
      columns.find((c) => c.toLowerCase() === fieldName.toLowerCase());
    if (!column) {
      if (columns.length) {
        diagnostics.push(
          warning(
            `There is no column “${fieldName}” to describe.`,
            p.line,
            `Columns: ${columns.join(', ')}.`,
          ),
        );
      }
      continue;
    }
    out[column] ??= {};
    applyFieldAttr(out[column], attr, p.value, p.line, diagnostics);
  }
  return out;
}

function applyFieldAttr(
  meta: FieldMeta,
  attr: string,
  value: string,
  line: number,
  diagnostics: Diagnostic[],
) {
  switch (attr) {
    case 'label':
      meta.label = unquote(value);
      break;
    case 'description':
      meta.description = unquote(value);
      break;
    case 'unit':
      meta.unit = unquote(value);
      break;
    case 'currency':
      meta.currency = unquote(value).toUpperCase();
      break;
    case 'timezone':
      meta.timeZone = unquote(value);
      break;
    case 'type': {
      const t = value.trim().toLowerCase();
      const map: Record<string, FieldDef['type']> = {
        temporal: 'temporal',
        date: 'temporal',
        time: 'temporal',
        quantitative: 'quantitative',
        number: 'quantitative',
        numeric: 'quantitative',
        nominal: 'nominal',
        category: 'nominal',
        categorical: 'nominal',
        text: 'nominal',
        string: 'nominal',
      };
      if (map[t]) meta.type = map[t];
      else diagnostics.push(warning(`Unknown field type “${value}”.`, line));
      break;
    }
    default: {
      const reading = readFormat(value);
      if (reading.problem) {
        diagnostics.push(
          warning(reading.problem, line, 'Try currency, percent, compact, integer, date or month.'),
        );
        break;
      }
      const key =
        attr === 'axisformat'
          ? 'axisFormat'
          : attr === 'tooltipformat'
            ? 'tooltipFormat'
            : 'format';
      meta[key] = reading.format as Formatter;
      if (reading.currency) meta.currency = reading.currency;
    }
  }
}

/** The language version this compiler reads. Blocks may state it with `version: 1`. */
export const LANGUAGE_VERSION = 1;

function checkVersion(p: PropEntry, diagnostics: Diagnostic[]) {
  if (Number(p.value.trim()) !== LANGUAGE_VERSION) {
    diagnostics.push(
      warning(
        `This page reads version ${LANGUAGE_VERSION} blocks; “version: ${p.value.trim()}” may render differently.`,
        p.line,
      ),
    );
  }
}

function isWholeCurrency(format: unknown): boolean {
  return (
    !!format &&
    typeof format === 'object' &&
    (format as Intl.NumberFormatOptions).style === 'currency' &&
    (format as Intl.NumberFormatOptions).maximumFractionDigits === 0
  );
}

/** Currency fields holding only whole numbers display without cents. */
function wholeCurrencyFields(input: DataInput, only?: Iterable<string>): Record<string, FieldMeta> {
  const { rows, schema } = resolveData(input);
  const out: Record<string, FieldMeta> = {};
  const names = only ? [...only] : Object.keys(schema);
  for (const name of names) {
    const def = schema[name];
    if (def?.format !== 'currency') continue;
    let seen = false;
    let whole = true;
    for (const r of rows) {
      const v = r[name];
      if (v == null) continue;
      seen = true;
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        whole = false;
        break;
      }
    }
    if (seen && whole) out[name] = wholeCurrency(def.currency ?? 'USD');
  }
  return out;
}

function withFields(input: DataInput, fields: Record<string, FieldMeta>): Dataset {
  const { rows, schema } = resolveData(input);
  const merged = definitions(schema);
  for (const [k, v] of Object.entries(fields)) merged[k] = { ...merged[k], ...v };
  return dataset(rows, merged);
}

/* ------------------------------------------------------------------------------------------ */
/* Views                                                                                       */
/* ------------------------------------------------------------------------------------------ */

interface ViewContext {
  /** Dashboard settings before the first view; their field settings describe every view. */
  blockProps: PropEntry[];
  datasets: Record<string, DataInput>;
  local: Record<string, DataInput>;
  defaultData?: string;
  pending: ReadonlySet<string>;
  inDashboard: boolean;
  complete: boolean;
  diagnostics: Diagnostic[];
}

interface CompiledView {
  spec?: ComponentSpec;
  dataName?: string;
  pending: boolean;
  link: string | null;
}

function lookupDataset(ctx: ViewContext, name: string): DataInput | undefined {
  if (Object.hasOwn(ctx.local, name)) return ctx.local[name];
  if (Object.hasOwn(ctx.datasets, name)) return ctx.datasets[name];
  return undefined;
}

function freeName(base: string, taken: Record<string, unknown>): string {
  let name = base;
  for (let i = 2; Object.hasOwn(taken, name); i++) name = `${base}_${i}`;
  return name;
}

function componentProps(component: SpecComponentName): Record<string, JsonSchema> {
  return (DEFS[component]?.properties ?? {}) as Record<string, JsonSchema>;
}

function canonicalProp(norm: string, component: SpecComponentName): string | null {
  const props = componentProps(component);
  const direct = Object.keys(props).find((k) => k.toLowerCase() === norm);
  if (direct) return direct;
  const alias = PROPERTY_ALIASES[norm];
  if (alias) return alias;
  return null;
}

function coerce(
  raw: string,
  schema: JsonSchema,
  resolver: FieldResolver,
  line: number,
  diagnostics: Diagnostic[],
): { ok: boolean; value?: unknown } {
  const name = refName(schema);
  const s = resolveRef(schema);
  const value = raw.trim();
  if (name === 'Format') {
    const reading = readFormat(value);
    if (reading.problem) {
      diagnostics.push(
        warning(reading.problem, line, 'Try currency, percent, compact, integer, date or month.'),
      );
      return { ok: false };
    }
    return { ok: true, value: reading.format };
  }
  if (name === 'Field') {
    const field = resolver.resolve(unquote(value), line, diagnostics);
    return field ? { ok: true, value: field } : { ok: false };
  }
  if (name === 'FieldRef' || name === 'Measure') {
    const expr = parseFieldExpr(value);
    if (expr.field === null) return { ok: false };
    const field = resolver.resolve(expr.field, line, diagnostics);
    if (!field) return { ok: false };
    if (
      name === 'Measure' &&
      expr.aggregate &&
      expr.aggregate !== 'min' &&
      expr.aggregate !== 'max'
    ) {
      return { ok: true, value: { field, aggregate: expr.aggregate } };
    }
    return { ok: true, value: field };
  }
  if (Array.isArray(s.oneOf)) {
    const options = s.oneOf as JsonSchema[];
    const bool = parseBool(value);
    if (bool !== undefined && options.some((o) => resolveRef(o).type === 'boolean')) {
      return { ok: true, value: bool };
    }
    const measureList = options.find((o) => resolveRef(o).type === 'array');
    if (measureList && (value.includes(',') || value.startsWith('['))) {
      return coerce(value, measureList, resolver, line, diagnostics);
    }
    const fieldOption = options.find((o) =>
      ['Field', 'Measure', 'FieldRef'].includes(refName(o) ?? ''),
    );
    if (fieldOption) return coerce(value, fieldOption, resolver, line, diagnostics);
    return { ok: true, value: unquote(value) };
  }
  if (Array.isArray(s.enum)) {
    const options = s.enum as unknown[];
    const match = options.find((o) => String(o).toLowerCase() === value.toLowerCase());
    if (match !== undefined) return { ok: true, value: match };
    const bool = parseBool(value);
    if (bool !== undefined && options.includes(bool)) return { ok: true, value: bool };
    diagnostics.push(warning(`“${value}” is not one of ${options.map(String).join(', ')}.`, line));
    return { ok: false };
  }
  const type = Array.isArray(s.type) ? (s.type as string[])[0] : (s.type as string | undefined);
  switch (type) {
    case 'boolean': {
      const bool = parseBool(value);
      if (bool === undefined) {
        diagnostics.push(warning(`Expected yes or no, got “${value}”.`, line));
        return { ok: false };
      }
      return { ok: true, value: bool };
    }
    case 'number':
    case 'integer': {
      const n = Number(value.replace(/px$/i, '').replace(/,/g, ''));
      if (!Number.isFinite(n)) {
        diagnostics.push(warning(`Expected a number, got “${value}”.`, line));
        return { ok: false };
      }
      return { ok: true, value: type === 'integer' ? Math.round(n) : n };
    }
    case 'array': {
      if (value.startsWith('[') && value.includes('{')) {
        try {
          return { ok: true, value: JSON.parse(value) };
        } catch {
          /* fall through to list parsing */
        }
      }
      const items = splitList(value);
      const itemSchema = (s.items ?? {}) as JsonSchema;
      const out: unknown[] = [];
      for (const item of items) {
        const itemName = refName(itemSchema);
        if (itemName === 'Column') {
          const field = resolver.resolve(unquote(item), line, diagnostics);
          if (field) out.push({ field });
          continue;
        }
        const r = coerce(item, itemSchema, resolver, line, diagnostics);
        if (r.ok) out.push(r.value);
      }
      return out.length ? { ok: true, value: out } : { ok: false };
    }
    case 'object': {
      if (value.startsWith('{')) {
        try {
          return { ok: true, value: JSON.parse(value) };
        } catch {
          diagnostics.push(warning(`Could not read “${value}” as JSON.`, line));
          return { ok: false };
        }
      }
      const n = Number(value.replace(/,/g, ''));
      if (Number.isFinite(n)) return { ok: true, value: { value: n } };
      return { ok: false };
    }
    default:
      return { ok: true, value: unquote(value) };
  }
}

/** Channel of `x.label`-style keys, mapped to the encoding prop that holds its field. */
function channelProp(channel: string, def: KindDef): string | null {
  const c = channel.toLowerCase();
  if (c === 'x' && (def.dims.includes('x') || def.measure === 'x')) return 'x';
  if (c === 'y') return def.measure === 'y' ? 'y' : def.dims.includes('y') ? 'y' : def.measure;
  if (c === 'value') return def.measure;
  if (c === 'color' || c === 'series' || c === 'group') {
    return def.dims.includes('color') ? 'color' : def.dims.includes('group') ? 'group' : null;
  }
  if (c === 'category') return def.dims.includes('category') ? 'category' : null;
  if (c === 'size') return 'size';
  return null;
}

function fieldsOfProp(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(fieldsOfProp);
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { field?: unknown }).field === 'string'
  ) {
    return [(value as { field: string }).field];
  }
  return [];
}

function compileView(view: ViewNode, ctx: ViewContext): CompiledView {
  const def = KINDS[view.kind];
  const component = def.component;
  const schemaProps = componentProps(component);
  const diagnostics = ctx.diagnostics;
  const lines = new Map<string, number>();
  const spec: ComponentSpec = { component };

  // 1. The dataset this view reads.
  const dataProp = view.props.find(
    (p) => p.norm === 'data' || p.norm === 'dataset' || p.norm === 'source',
  );
  let dataName = dataProp ? unquote(dataProp.value) : ctx.defaultData;
  if (!dataName) {
    const names = [...new Set([...Object.keys(ctx.local), ...Object.keys(ctx.datasets)])];
    if (names.length === 1) dataName = names[0];
  }
  if (!dataName) {
    if (!ctx.complete) return { pending: true, link: null };
    diagnostics.push(
      error(
        'This chart has no data.',
        view.line,
        'Add rows after a “---” line, or name a dataset with “data: name”.',
      ),
    );
    return { pending: false, link: null };
  }
  const input = lookupDataset(ctx, dataName);
  if (!input) {
    if (ctx.pending.has(dataName) || !ctx.complete) return { pending: true, dataName, link: null };
    const available = [...Object.keys(ctx.local), ...Object.keys(ctx.datasets)];
    diagnostics.push(
      error(
        `There is no dataset “${dataName}”.`,
        dataProp?.line ?? view.line,
        available.length
          ? `Datasets: ${available.join(', ')}.`
          : 'Define one with a “data name” block.',
      ),
    );
    return { pending: false, link: null };
  }
  const { rows, schema } = resolveData(input);
  if (rows.length === 0 && !ctx.complete) return { pending: true, dataName, link: null };
  const errorsBefore = diagnostics.filter((d) => d.severity === 'error').length;
  const resolver = makeResolver(schema);
  const used = new Set<string>();
  const resolve = (name: string | null, line?: number) => {
    if (name === null) return null;
    const f = resolver.resolve(name, line ?? view.line, diagnostics);
    if (f) used.add(f);
    return f;
  };

  // 2. Properties.
  const fieldMeta = fieldMetaFrom(
    [...ctx.blockProps, ...view.props],
    resolver.columns,
    diagnostics,
  );
  const channelMeta: Record<string, FieldMeta> = {};
  let link: string | null | undefined;
  let hasCountMeasure = false;
  let viewFormat: { format: Formatter; currency?: string; line: number } | undefined;
  for (const p of view.props) {
    const dot = p.key.lastIndexOf('.');
    if (dot > 0) {
      const head = p.key.slice(0, dot).trim();
      const attr = p.key
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[\s_-]/g, '');
      const channel = channelProp(head, def);
      if (channel && FIELD_ATTRS.has(attr)) {
        if (attr === 'format' && channel === 'x' && 'xFormat' in schemaProps) {
          const r = readFormat(p.value);
          if (r.format) {
            spec.xFormat = r.format;
            lines.set('xFormat', p.line);
          } else diagnostics.push(warning(r.problem ?? 'Unknown format.', p.line));
        } else {
          channelMeta[channel] ??= {};
          applyFieldAttr(channelMeta[channel], attr, p.value, p.line, diagnostics);
        }
        continue;
      }
      if (head.toLowerCase() === 'target' && component === 'KPI') {
        spec.target ??= {};
        const target = spec.target as Record<string, unknown>;
        const n = Number(p.value.replace(/,/g, ''));
        target[attr === 'value' ? 'value' : attr] =
          attr === 'value' || attr === 'expected' ? n : unquote(p.value);
        lines.set('target', p.line);
        continue;
      }
      continue; // field metadata, handled above
    }
    if (p.norm === 'data' || p.norm === 'dataset' || p.norm === 'source' || p.norm === 'src')
      continue;
    if (p.norm === 'version') {
      checkVersion(p, diagnostics);
      continue;
    }
    if (p.norm === 'link') {
      const b = parseBool(p.value);
      link = b === false ? null : b === true ? undefined : unquote(p.value);
      continue;
    }
    if (
      p.norm === 'title' ||
      p.norm === 'description' ||
      PROPERTY_ALIASES[p.norm] === 'description'
    ) {
      const key = p.norm === 'title' ? 'title' : 'description';
      spec[key] = unquote(p.value);
      lines.set(key, p.line);
      continue;
    }
    if (p.norm === 'span' || p.norm === 'width' || p.norm === 'cols' || p.norm === 'colspan') {
      const n = Number.parseInt(p.value, 10);
      if (n >= 1 && n <= 12) spec.span = n;
      else diagnostics.push(warning('Span is a number of columns from 1 to 12.', p.line));
      continue;
    }
    let key = canonicalProp(p.norm, component);
    if (key === 'kind') continue;
    if (key === 'x.label' || key === 'y.label' || key === 'x.format') {
      const [channel, attr] = key.split('.');
      const target = channelProp(channel, def);
      if (target) {
        channelMeta[target] ??= {};
        applyFieldAttr(channelMeta[target], attr, p.value, p.line, diagnostics);
      }
      continue;
    }
    // Kind-specific readings of shared words.
    if (component === 'KPI' && key === 'compare' && parseBool(p.value) === undefined)
      key = 'compareValue';
    if (component === 'BarChart' && key === 'color') key = 'group';
    if (key === 'curve') {
      const b = parseBool(p.value);
      if (b !== undefined) {
        spec.curve = b ? 'monotone' : 'linear';
        continue;
      }
    }
    if (key === 'orientation' && parseBool(p.value) !== undefined) {
      spec.orientation = parseBool(p.value) ? 'horizontal' : 'vertical';
      continue;
    }
    if (key === 'horizontal') key = 'orientation';
    if (!key || !(key in schemaProps)) {
      if (p.norm === 'horizontal' && 'orientation' in schemaProps) {
        spec.orientation = parseBool(p.value) === false ? 'vertical' : 'horizontal';
        continue;
      }
      const known = Object.keys(schemaProps).filter((k) => !['component', 'data'].includes(k));
      const near = known
        .map((k) => ({ k, d: levenshtein(k.toLowerCase(), p.norm) }))
        .sort((a, b) => a.d - b.d)[0];
      diagnostics.push(
        warning(
          `“${p.key}” is not a ${view.kind} setting; it was ignored.`,
          p.line,
          near && near.d <= 3
            ? `Did you mean “${near.k}”?`
            : `Settings: ${known.slice(0, 12).join(', ')}.`,
        ),
      );
      continue;
    }
    if (component === 'DataTable' && key === 'sort') {
      const desc = /^-|\s+desc(ending)?$/i.test(p.value.trim());
      const name = p.value
        .trim()
        .replace(/^-/, '')
        .replace(/\s+(asc|desc)(ending)?$/i, '');
      const f = resolve(unquote(name), p.line);
      if (f) spec.sort = `${desc ? '-' : ''}${f}`;
      lines.set('sort', p.line);
      continue;
    }
    if (key === 'format') {
      // The measure's field format: axes keep their automatic short ticks, while tooltips,
      // tables and KPIs show the full value.
      const reading = readFormat(p.value);
      if (reading.problem) {
        diagnostics.push(
          warning(
            reading.problem,
            p.line,
            'Try currency, percent, compact, integer, date or month.',
          ),
        );
      } else {
        viewFormat = {
          format: reading.format as Formatter,
          ...(reading.currency ? { currency: reading.currency } : {}),
          line: p.line,
        };
      }
      continue;
    }
    const r = coerce(p.value, schemaProps[key], resolver, p.line, diagnostics);
    if (r.ok) {
      spec[key] = r.value;
      lines.set(key, p.line);
      for (const f of fieldsOfProp(r.value)) if (resolver.columns.includes(f)) used.add(f);
    }
  }
  for (const [k, v] of Object.entries(view.implied)) if (spec[k] === undefined) spec[k] = v;

  // 3. The sentence: measures, dimensions and the `vs` field.
  const s = view.sentence;
  const measureLine = view.line;
  const measureExprs: FieldExpr[] = s.measures;
  for (let i = 0; i < s.dims.length; i++) {
    const prop = def.dims[i];
    if (!prop) {
      diagnostics.push(
        warning(
          `A ${view.kind} uses ${def.dims.length || 'no'} “by” field${def.dims.length === 1 ? '' : 's'}; “${s.dims[i].raw}” was ignored.`,
          view.line,
        ),
      );
      continue;
    }
    if (spec[prop] !== undefined) continue;
    const f = resolve(s.dims[i].field, view.line);
    if (f) spec[prop] = f;
  }
  if (s.versus) {
    const prop = def.versus ?? def.dims[0];
    const f = resolve(s.versus.field, view.line);
    if (f && prop && spec[prop] === undefined) spec[prop] = f;
  }

  const measureOf = (
    e: FieldExpr,
  ): { field: string; aggregate?: string; label?: string } | null => {
    if (e.field === null) {
      hasCountMeasure = true;
      return { field: '__count__', aggregate: 'count', label: e.label };
    }
    const f = resolve(e.field, measureLine);
    if (!f) return null;
    if (e.aggregate === 'min' || e.aggregate === 'max') {
      if (def.measureType !== 'columns') {
        diagnostics.push(
          warning(
            `${e.aggregate}() is supported in tables; this ${view.kind} uses sum instead.`,
            measureLine,
          ),
        );
        return { field: f, aggregate: 'sum', label: e.label };
      }
    }
    return { field: f, aggregate: e.aggregate, label: e.label };
  };

  if (spec[def.measure] === undefined && measureExprs.length) {
    switch (def.measureType) {
      case 'measures': {
        const ms = measureExprs.map(measureOf).filter(Boolean) as NonNullable<
          ReturnType<typeof measureOf>
        >[];
        if (ms.length) spec[def.measure] = ms.length === 1 ? ms[0] : ms;
        break;
      }
      case 'measure':
      case 'field': {
        if (measureExprs.length > 1) {
          diagnostics.push(
            warning(
              `A ${view.kind} shows one measure; “${measureExprs
                .slice(1)
                .map((m) => m.raw)
                .join(', ')}” was ignored.`,
              measureLine,
            ),
          );
        }
        const m = measureOf(measureExprs[0]);
        if (m) spec[def.measure] = def.measureType === 'field' && !m.aggregate ? m.field : m;
        break;
      }
      case 'columns': {
        const cols = measureExprs
          .map((e) => {
            if (e.field === null) {
              return {
                field: '__count__',
                key: 'count',
                aggregate: 'count',
                label: e.label ?? 'Count',
              };
            }
            const f = resolve(e.field, measureLine);
            if (!f) return null;
            return {
              field: f,
              ...(e.aggregate ? { aggregate: e.aggregate, key: `${e.aggregate}_${f}` } : {}),
              ...(e.label ? { label: e.label } : {}),
            };
          })
          .filter(Boolean);
        if (cols.length) spec.columns = cols;
        break;
      }
      case 'fields': {
        const fields = measureExprs
          .map((e) => (e.field ? resolve(e.field, measureLine) : null))
          .filter((f): f is string => !!f)
          .map((field) => ({ field }));
        if (fields.length) spec.fields = fields;
        break;
      }
    }
  }

  // A field the author named but that does not exist is an error, not a gap to fill.
  if (diagnostics.filter((d) => d.severity === 'error').length > errorsBefore) {
    return { pending: false, dataName, link: null };
  }

  // 4. Fill encodings the author left out from the columns' types.
  inferEncodings(view.kind, spec, resolver, used, rows, diagnostics, view.line);

  // 5. Derived data: row counts, explicit order for categories on a continuous axis.
  let viewInput: DataInput = input;
  let derivedRows: Row[] | null = null;
  const derivedFields: Record<string, FieldMeta> = {};
  const ensureRows = () => (derivedRows ??= rows.map((r) => ({ ...r })));

  const countName = (() => {
    for (const candidate of ['count', 'row_count', 'rows', '__rows']) {
      if (!resolver.columns.includes(candidate)) return candidate;
    }
    return '__rows';
  })();
  const replaceCount = (value: unknown, sumIt: boolean): unknown => {
    if (Array.isArray(value)) return value.map((v) => replaceCount(v, sumIt));
    if (
      value &&
      typeof value === 'object' &&
      (value as { field?: unknown }).field === '__count__'
    ) {
      const label = (value as { label?: string }).label;
      return sumIt
        ? { field: countName, aggregate: 'sum', ...(label ? { label } : {}) }
        : { field: countName, aggregate: 'count', ...(label ? { label } : {}) };
    }
    return value;
  };
  if (hasCountMeasure || JSON.stringify(spec).includes('"__count__"')) {
    if (def.native && component !== 'KPI' && isCountOnly(spec[def.measure])) {
      // BarList, DonutChart, Heatmap and CalendarHeatmap count rows when `value` is omitted.
      delete spec[def.measure];
      if (component === 'Heatmap' || component === 'CalendarHeatmap') spec.countLabel ??= 'Rows';
    } else if (component === 'DataTable') {
      const group = typeof spec.groupBy === 'string' ? spec.groupBy : undefined;
      spec.columns = (spec.columns as Record<string, unknown>[]).map((c) => {
        if (c.field !== '__count__') return c;
        if (group) return { ...c, field: group, aggregate: 'count' };
        const { aggregate: _a, ...rest } = c;
        return { ...rest, field: countName };
      });
      if (!group) {
        ensureRows().forEach((r) => {
          r[countName] = 1;
        });
        derivedFields[countName] = { label: 'Count', format: 'integer', type: 'quantitative' };
      }
    } else {
      ensureRows().forEach((r) => {
        r[countName] = 1;
      });
      derivedFields[countName] = { label: 'Count', format: 'integer', type: 'quantitative' };
      spec[def.measure] = replaceCount(spec[def.measure], true);
    }
  }

  // Aggregation: sum rows that share a position; average rates instead of adding them.
  if (def.measureType === 'measures' || def.measureType === 'measure') {
    const dims = def.dims.map((d) => spec[d]).filter((v): v is string => typeof v === 'string');
    const needs = def.native || hasDuplicates(rows, dims);
    const fix = (m: unknown): unknown => {
      if (Array.isArray(m)) return m.map(fix);
      const field = typeof m === 'string' ? m : (m as { field?: string })?.field;
      if (!field || field === countName) return m;
      const explicit = typeof m === 'object' ? (m as { aggregate?: string }).aggregate : undefined;
      const fieldDef = { ...resolver.schema[field], ...fieldMeta[field] } as FieldDef;
      if (explicit) {
        if (explicit === 'sum' && isPercentField(fieldDef) && needs) {
          diagnostics.push(
            warning(
              `Adding up the rate “${field}” rarely means anything; consider mean(${field}).`,
              measureLine,
            ),
          );
        }
        return m;
      }
      if (!needs) return m;
      const how = isPercentField(fieldDef) ? 'mean' : 'sum';
      return typeof m === 'string'
        ? { field: m, aggregate: how }
        : { ...(m as object), aggregate: how };
    };
    if (spec[def.measure] !== undefined && component !== 'Funnel') {
      spec[def.measure] = fix(spec[def.measure]);
    }
  }
  if (component === 'Funnel' && typeof spec.value === 'string' && typeof spec.step === 'string') {
    if (hasDuplicates(rows, [spec.step])) spec.value = { field: spec.value, aggregate: 'sum' };
  }
  if (component === 'Sparkline' && typeof spec.y === 'string' && typeof spec.x === 'string') {
    if (hasDuplicates(rows, [spec.x])) spec.y = { field: spec.y, aggregate: 'sum' };
  }

  // Lines and areas need a continuous x. Categories keep the order they appear in.
  if (def.continuousX && typeof spec.x === 'string') {
    const x = spec.x;
    const type = (fieldMeta[x]?.type ?? resolver.type(x)) as FieldDef['type'];
    if (type !== 'quantitative' && type !== 'temporal') {
      const order = new Map<string, number>();
      for (const r of rows) {
        const k = r[x] == null ? '' : String(r[x]);
        if (!order.has(k)) order.set(k, order.size);
      }
      const labels = [...order.keys()];
      const orderName = freeName(`${x}__order`, resolver.schema);
      ensureRows().forEach((r) => {
        r[orderName] = order.get(r[x] == null ? '' : String(r[x])) ?? null;
      });
      const label =
        channelMeta.x?.label ?? fieldMeta[x]?.label ?? resolver.schema[x]?.label ?? humanize(x);
      derivedFields[orderName] = {
        type: 'quantitative',
        label,
        format: (v: unknown) =>
          typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < labels.length
            ? labels[v]
            : '',
      };
      spec.x = orderName;
      delete channelMeta.x;
      if (spec.brush) {
        diagnostics.push(
          info(`Brushing is off because “${x}” is a list of categories, not a scale.`, view.line),
        );
      }
      spec.brush = false;
    }
  }

  // Labels for KPIs (required), defaults for linked interaction in dashboards.
  if (component === 'KPI') {
    if (spec.label === undefined) {
      const m = spec.value as { field?: string; label?: string } | string | undefined;
      const field = typeof m === 'string' ? m : m?.field;
      spec.label =
        spec.title ??
        (typeof m === 'object' && m?.label) ??
        (field === countName
          ? 'Rows'
          : field
            ? (fieldMeta[field]?.label ?? resolver.schema[field]?.label ?? humanize(field))
            : 'Value');
    }
    if (spec.title !== undefined) delete spec.title;
  }
  // Dashboards read better with a heading on every chart; derive one when the author gave none.
  if (
    ctx.inDashboard &&
    spec.title === undefined &&
    !['KPI', 'DataTable', 'FilterBar'].includes(component)
  ) {
    const labelOf = (f: string) =>
      f === countName
        ? 'Count'
        : (derivedFields[f]?.label ??
          fieldMeta[f]?.label ??
          resolver.schema[f]?.label ??
          humanize(f));
    const measures = fieldsOfProp(spec[def.measure]).map(labelOf);
    const dims = def.dims
      .map((d) => spec[d])
      .filter((v): v is string => typeof v === 'string')
      .map((f) => labelOf(f).toLowerCase());
    if (measures.length || dims.length) {
      const what = measures.length ? measures.join(' and ') : 'Rows';
      spec.title = dims.length ? `${what} by ${dims.join(' and ')}` : what;
    }
  }
  if (ctx.inDashboard && def.link && spec[def.link] === undefined && def.link in schemaProps) {
    if (!(def.link === 'brush' && spec.brush === false)) spec[def.link] = true;
  }

  // Measure labels written with `as` become field labels.
  const labelFrom = (m: unknown) => {
    if (Array.isArray(m)) {
      m.forEach(labelFrom);
      return;
    }
    if (m && typeof m === 'object') {
      const { field, label } = m as { field?: string; label?: string };
      if (field && label) derivedFields[field] = { ...derivedFields[field], label };
    }
  };
  labelFrom(spec[def.measure]);
  const stripLabels = (m: unknown): unknown => {
    if (Array.isArray(m)) return m.map(stripLabels);
    if (m && typeof m === 'object' && 'label' in (m as object) && 'field' in (m as object)) {
      const { label: _l, ...rest } = m as Record<string, unknown>;
      return Object.keys(rest).length === 1 ? rest.field : rest;
    }
    return m;
  };
  if (def.measureType !== 'columns') spec[def.measure] = simplify(stripLabels(spec[def.measure]));
  if (spec[def.measure] === undefined) delete spec[def.measure];

  if (viewFormat) {
    const { line: _line, ...meta } = viewFormat;
    const targets = fieldsOfProp(spec[def.measure]).filter(
      (f) => f !== countName || component === 'KPI',
    );
    if (targets.length && def.measureType !== 'columns' && def.measureType !== 'fields') {
      for (const f of targets) derivedFields[f] = { ...derivedFields[f], ...meta };
    } else if ('format' in schemaProps) {
      spec.format = meta.format;
    }
  }

  // Channel display settings (x.label, y.label …) apply to the field each channel shows.
  for (const [channel, meta] of Object.entries(channelMeta)) {
    for (const f of fieldsOfProp(spec[channel]))
      derivedFields[f] = { ...derivedFields[f], ...meta };
  }
  for (const [f, meta] of Object.entries(fieldMeta))
    derivedFields[f] = { ...meta, ...derivedFields[f] };

  if (derivedRows || Object.keys(derivedFields).length) {
    const base = definitions(schema);
    for (const [k, v] of Object.entries(derivedFields)) base[k] = { ...base[k], ...v };
    // A view that restates `format: currency` keeps the whole-amount display its rows had.
    for (const f of Object.keys(derivedFields)) {
      const before = schema[f]?.format;
      if (base[f]?.format === 'currency' && isWholeCurrency(before)) {
        base[f] = {
          ...base[f],
          ...wholeCurrency(base[f]?.currency ?? schema[f]?.currency ?? 'USD'),
        };
      }
    }
    viewInput = dataset(derivedRows ?? rows, base);
    const derivedName = freeName(`${dataName}__${view.kind}`, { ...ctx.local, ...ctx.datasets });
    ctx.local[derivedName] = viewInput;
    spec.data = derivedName;
  } else {
    spec.data = dataName;
  }
  if (component === 'FilterBar') {
    // FilterBar reads options from data when given one; keep the reference.
    spec.data = spec.data ?? dataName;
  }

  // 6. Validate against the JSON schema and point errors at source lines.
  const result = validateSpec(spec);
  for (const e of result.errors) diagnostics.push(specError(e, lines, view.line, view.kind));
  if (!result.valid) return { pending: false, dataName, link: null };

  const named = Object.hasOwn(ctx.datasets, dataName) || ctx.pending.has(dataName);
  return {
    spec,
    dataName,
    pending: false,
    link: link === null ? null : (link ?? (named ? dataName : null)),
  };
}

/** Drops undefined keys and writes `{ field }` as the plain field name. */
function simplify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(simplify);
  if (value && typeof value === 'object') {
    const out = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined),
    );
    return Object.keys(out).length === 1 && typeof out.field === 'string' ? out.field : out;
  }
  return value;
}

function isCountOnly(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { field?: string }).field === '__count__'
  );
}

function hasDuplicates(rows: readonly Row[], dims: string[]): boolean {
  if (dims.length === 0) return rows.length > 1;
  const seen = new Set<string>();
  for (const r of rows) {
    const k = JSON.stringify(
      dims.map((d) => (r[d] instanceof Date ? (r[d] as Date).getTime() : (r[d] ?? null))),
    );
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

function specError(
  e: SpecError,
  lines: Map<string, number>,
  fallback: number,
  kind: string,
): Diagnostic {
  const prop = e.path.split('/')[1] ?? '';
  const line = lines.get(prop) ?? fallback;
  const where = prop ? `“${prop}”` : `this ${kind}`;
  return error(`${where}: ${e.message}`, line);
}

/** Chooses fields the author did not name, from column types. */
function inferEncodings(
  kind: ViewKind,
  spec: ComponentSpec,
  resolver: FieldResolver,
  used: Set<string>,
  rows: readonly Row[],
  diagnostics: Diagnostic[],
  line: number,
) {
  const cols = resolver.columns.filter((c) => !c.endsWith('__order'));
  const of = (type: FieldDef['type']) =>
    cols.filter((c) => resolver.type(c) === type && !used.has(c));
  const quantitative = () => of('quantitative');
  const temporal = () => of('temporal');
  const nominal = () => of('nominal');
  const pick = (prop: string, candidates: string[], why: string) => {
    if (spec[prop] !== undefined || candidates.length === 0) return;
    spec[prop] = candidates[0];
    used.add(candidates[0]);
    diagnostics.push(info(`Chose ${prop} = ${candidates[0]} (${why}).`, line));
  };
  const lowCardinality = (c: string, max = 24) =>
    new Set(rows.slice(0, 2000).map((r) => r[c])).size <= max;

  switch (kind) {
    case 'line':
    case 'area':
    case 'sparkline':
      pick(
        'x',
        [
          ...temporal(),
          ...quantitative().filter((c) =>
            /year|month|week|day|date|time|period|step|index/i.test(c),
          ),
          ...nominal(),
        ],
        'first date or ordered column',
      );
      if (spec.y === undefined) {
        const ys = quantitative().slice(0, kind === 'sparkline' ? 1 : 8);
        if (ys.length) {
          spec.y = ys.length === 1 ? ys[0] : ys;
          for (const y of ys) used.add(y);
          diagnostics.push(info(`Chose y = ${ys.join(', ')} (numeric columns).`, line));
        }
      }
      break;
    case 'bar':
      pick(
        'x',
        [...nominal().filter((c) => lowCardinality(c, 60)), ...temporal(), ...nominal()],
        'first category column',
      );
      if (spec.y === undefined) {
        const ys = quantitative().slice(0, 6);
        if (ys.length) {
          spec.y = ys.length === 1 ? ys[0] : ys;
          for (const y of ys) used.add(y);
          diagnostics.push(info(`Chose y = ${ys.join(', ')} (numeric columns).`, line));
        }
      }
      break;
    case 'barlist':
    case 'donut':
    case 'box':
      pick('category', nominal(), 'first category column');
      if (kind === 'box') pick('value', quantitative(), 'first numeric column');
      else pick('value', quantitative(), 'first numeric column');
      break;
    case 'funnel':
      pick('step', nominal(), 'first category column');
      pick('value', quantitative(), 'first numeric column');
      break;
    case 'histogram':
      pick('x', [...quantitative(), ...temporal()], 'first numeric column');
      break;
    case 'scatter':
      pick('x', quantitative(), 'first numeric column');
      pick('y', quantitative(), 'next numeric column');
      break;
    case 'heatmap':
      pick('x', [...temporal(), ...nominal()], 'first category column');
      pick('y', nominal(), 'next category column');
      pick('value', quantitative(), 'first numeric column');
      break;
    case 'calendar':
      pick('date', temporal(), 'first date column');
      pick('value', quantitative(), 'first numeric column');
      break;
    case 'sankey':
      pick('from', nominal(), 'first category column');
      pick('to', nominal(), 'next category column');
      pick('value', quantitative(), 'first numeric column');
      break;
    case 'kpi':
      pick('value', quantitative(), 'first numeric column');
      break;
    case 'table':
      if (spec.columns === undefined) {
        const columns =
          typeof spec.groupBy === 'string'
            ? [
                { field: spec.groupBy },
                ...cols
                  .filter((c) => c !== spec.groupBy && resolver.type(c) === 'quantitative')
                  .slice(0, 8)
                  .map((field) => ({ field, aggregate: 'sum' })),
              ]
            : cols.slice(0, 12).map((field) => ({ field }));
        if (columns.length) spec.columns = columns;
      } else if (typeof spec.groupBy === 'string') {
        const columns = spec.columns as { field: string; key?: string; aggregate?: string }[];
        if (!columns.some((c) => c.field === spec.groupBy && !c.aggregate)) {
          columns.unshift({ field: spec.groupBy });
        }
        for (const c of columns) {
          if (c.field !== spec.groupBy && !c.aggregate) {
            c.aggregate = resolver.type(c.field) === 'quantitative' ? 'sum' : 'count';
          }
        }
      }
      break;
    case 'filters':
      if (spec.fields === undefined) {
        const fields = nominal()
          .filter((c) => lowCardinality(c, 20))
          .slice(0, 4)
          .map((field) => ({ field }));
        if (fields.length) spec.fields = fields;
      }
      break;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Layout                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Default spans per kind, packed into rows of 12; a short row stretches to fill. */
export function layoutSpans(items: { kind: ViewKind; span?: number }[]): number[] {
  const spans = items.map((it) => it.span ?? SPANS[it.kind]);
  const explicit = items.map((it) => it.span !== undefined);
  const group = (kind: ViewKind) => (kind === 'kpi' || kind === 'sparkline' ? 'stat' : 'chart');
  let row: number[] = [];
  let used = 0;
  const close = () => {
    const free = 12 - used;
    const flexible = row.filter((i) => !explicit[i]);
    if (free > 0 && flexible.length) {
      const sameKind = flexible.every((i) => items[i].kind === items[flexible[0]].kind);
      if (sameKind && flexible.length > 1) {
        const total = flexible.reduce((n, i) => n + spans[i], 0) + free;
        const each = Math.floor(total / flexible.length);
        flexible.forEach((i, k) => {
          spans[i] = k === flexible.length - 1 ? total - each * (flexible.length - 1) : each;
        });
      } else {
        spans[flexible[flexible.length - 1]] += free;
      }
    }
    row = [];
    used = 0;
  };
  spans.forEach((span, i) => {
    // Headline numbers sit in their own row rather than stretching to a chart's height.
    const mixed =
      row.length > 0 && group(items[row[0]].kind) !== group(items[i].kind) && !explicit[i];
    if (used + span > 12 || mixed) close();
    row.push(i);
    used += span;
  });
  if (row.length) close();
  return spans;
}

/* ------------------------------------------------------------------------------------------ */
/* JSON blocks                                                                                 */
/* ------------------------------------------------------------------------------------------ */

function compileJson(block: BlockNode, options: CompileOptions): CompiledBlock {
  const diagnostics = [...block.diagnostics];
  const base: CompiledBlock = {
    type: 'view',
    data: {},
    sources: [],
    link: null,
    diagnostics,
    complete: block.complete,
    pending: false,
  };
  if (block.json === undefined) return { ...base, pending: !block.complete };
  const json = block.json;
  if (Array.isArray(json)) {
    // A bare array of rows: show it as a table.
    const table: BlockNode = {
      type: 'view',
      views: [
        {
          kind: 'table',
          line: 1,
          props: [],
          implied: {},
          sentence: { measures: [], dims: [], flags: [], text: '' },
        },
      ],
      props: [],
      data: { text: JSON.stringify(json), line: 1 },
      diagnostics,
      complete: block.complete,
    };
    return compileBlock(table, options);
  }
  if (!json || typeof json !== 'object') {
    diagnostics.push(error('Expected a JSON object.', 1));
    return base;
  }
  const obj = { ...(json as Record<string, unknown>) };
  const data: Record<string, DataInput> = {};
  const datasets = (obj.datasets ?? obj.data_sets) as Record<string, unknown> | undefined;
  delete obj.datasets;
  delete obj.data_sets;
  const addRows = (name: string, value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const table = parseTable(text);
    diagnostics.push(...table.diagnostics.filter((d) => d.severity !== 'info'));
    data[name] = dataset(table.rows, table.fields);
  };
  if (datasets && typeof datasets === 'object') {
    for (const [name, rows] of Object.entries(datasets)) addRows(name, rows);
  }
  const inline = (item: Record<string, unknown>, fallback: string) => {
    if (Array.isArray(item.data) || (item.data && typeof item.data === 'object')) {
      const name = freeName(fallback, data);
      addRows(name, item.data);
      item.data = name;
    }
  };
  let spec: QuartileSpec;
  if (Array.isArray(obj.layout)) {
    const layout = (obj.layout as Record<string, unknown>[]).map((item) => ({ ...item }));
    const defaultData = obj.data;
    if (defaultData !== undefined && typeof defaultData !== 'string') {
      addRows('data', defaultData);
    }
    delete obj.data;
    layout.forEach((item, i) => {
      inline(item, `data_${i + 1}`);
      if (item.data === undefined) {
        if (typeof defaultData === 'string') item.data = defaultData;
        else if (defaultData !== undefined) item.data = 'data';
      }
    });
    spec = { ...(obj as Omit<DashboardSpec, 'layout'>), layout } as DashboardSpec;
  } else {
    inline(obj, 'data');
    spec = obj as unknown as ComponentSpec;
  }
  const all = { ...options.datasets, ...data };
  const result = validateSpec(spec);
  for (const e of result.errors) diagnostics.push(error(`${e.path || '/'}: ${e.message}`));
  const isDash = Array.isArray((spec as DashboardSpec).layout);
  const firstData = isDash
    ? ((spec as DashboardSpec).layout.find((l) => typeof l.data === 'string')?.data as
        | string
        | undefined)
    : ((spec as ComponentSpec).data as string | undefined);
  return {
    ...base,
    type: isDash ? 'dashboard' : 'view',
    spec: hasErrors(diagnostics) ? undefined : spec,
    data: all,
    title:
      typeof (spec as { title?: unknown }).title === 'string'
        ? (spec as { title: string }).title
        : undefined,
    link:
      firstData && options.datasets && Object.hasOwn(options.datasets, firstData)
        ? firstData
        : null,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Entry point                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** Compiles block text (or a parsed block) into a spec and datasets. Never throws. */
export function compileBlock(
  source: string | BlockNode,
  options: CompileOptions = {},
): CompiledBlock {
  const block = typeof source === 'string' ? parseBlock(source, options) : source;
  if (block.type === 'json') return compileJson(block, options);
  const diagnostics: Diagnostic[] = [...block.diagnostics];
  const complete = block.complete;
  const datasets = { ...(options.datasets ?? {}) };
  const pending = new Set(options.pendingDatasets ?? []);
  const local: Record<string, DataInput> = {};
  const sources: CompiledBlock['sources'] = [];
  const result: CompiledBlock = {
    type: block.type === 'empty' ? 'empty' : block.type === 'data' ? 'data' : block.type,
    data: local,
    sources,
    link: null,
    diagnostics,
    complete,
    pending: false,
  };
  if (block.type === 'empty') {
    result.pending = !complete;
    return result;
  }

  // Inline rows after `---`.
  const blockProps = block.type === 'view' ? (block.views[0]?.props ?? []) : block.props;
  const srcProp = blockProps.find((p) => p.norm === 'src' || p.norm === 'url');
  let inlineName: string | undefined;
  let sourceName: string | undefined;
  if (block.data) {
    const table = parseTable(block.data.text, {
      firstLine: block.data.line,
      partial: !complete,
      maxRows: options.maxRows,
    });
    diagnostics.push(...table.diagnostics);
    inlineName = block.type === 'data' && block.name ? block.name : 'data';
    const meta = fieldMetaFrom(
      block.type === 'dashboard' || block.type === 'data' ? block.props : [],
      table.columns,
      diagnostics,
    );
    const fields: Record<string, FieldMeta> = { ...table.fields };
    for (const [k, v] of Object.entries(meta)) fields[k] = { ...fields[k], ...v };
    const inline = dataset(table.rows, fields);
    const whole = wholeCurrencyFields(inline);
    local[inlineName] = Object.keys(whole).length ? withFields(inline, whole) : inline;
  } else if (srcProp) {
    const url = unquote(srcProp.value);
    // A named dataset is registered under its name; a chart's own source under its URL.
    const name = block.type === 'data' && block.name ? block.name : `url:${url}`;
    sourceName = name;
    sources.push({ name, url, line: srcProp.line });
    if (Object.hasOwn(datasets, name) && block.type === 'data') {
      // The host already loaded this source.
      const meta = fieldMetaFrom(
        block.props,
        Object.keys(resolveData(datasets[name]).schema),
        diagnostics,
      );
      const described = withFields(datasets[name], meta);
      const whole = wholeCurrencyFields(described);
      local[name] = Object.keys(whole).length ? withFields(described, whole) : described;
      inlineName = name;
    } else if (!Object.hasOwn(datasets, name)) {
      pending.add(name);
    } else {
      inlineName = name;
    }
  }

  if (block.type === 'data') {
    result.title = block.name;
    if (!block.name) return result;
    const ds = local[block.name];
    if (ds) {
      result.defines = { name: block.name, dataset: ds as Dataset };
      const { schema } = resolveData(ds);
      const columns = Object.keys(schema);
      result.spec = {
        component: 'DataTable',
        data: block.name,
        title: block.name,
        columns: columns.slice(0, 12).map((field) => ({ field })),
        pageSize: 10,
      } as ComponentSpec;
      result.link = block.name;
    } else {
      result.pending = pending.has(block.name) || !complete;
    }
    return result;
  }

  for (const p of block.props) if (p.norm === 'version') checkVersion(p, diagnostics);

  // Views.
  const dashboardData =
    block.type === 'dashboard'
      ? block.props.find((p) => p.norm === 'data' || p.norm === 'dataset' || p.norm === 'source')
      : undefined;
  const ctx: ViewContext = {
    // Inline rows already carry dashboard-level field settings.
    blockProps: block.type === 'dashboard' && !block.data ? block.props : [],
    datasets,
    local,
    defaultData:
      inlineName ?? sourceName ?? (dashboardData ? unquote(dashboardData.value) : undefined),
    pending,
    inDashboard: block.type === 'dashboard',
    complete,
    diagnostics,
  };

  if (block.type === 'view') {
    const view = block.views[0];
    if (!view) {
      result.pending = !complete;
      return result;
    }
    const compiled = compileView(view, ctx);
    result.spec = compiled.spec;
    result.pending = compiled.pending;
    result.link = compiled.link;
    result.title = compiled.spec?.title as string | undefined;
    result.data = { ...datasets, ...local };
    return result;
  }

  // Dashboard.
  const items: ComponentSpec[] = [];
  const kinds: { kind: ViewKind; span?: number }[] = [];
  let anyPending = false;
  let link: string | null | undefined;
  for (const view of block.views) {
    const compiled = compileView(view, ctx);
    if (compiled.pending) anyPending = true;
    if (compiled.spec) {
      items.push(compiled.spec);
      kinds.push({ kind: view.kind, span: compiled.spec.span as number | undefined });
      if (link === undefined) link = compiled.link;
    }
  }
  const spans = layoutSpans(kinds);
  items.forEach((item, i) => {
    item.span = spans[i];
  });
  const title = block.title ?? unquoteMaybe(block.props.find((p) => p.norm === 'title')?.value);
  const description = unquoteMaybe(
    block.props.find((p) => p.norm === 'description' || PROPERTY_ALIASES[p.norm] === 'description')
      ?.value,
  );
  const linkProp = block.props.find((p) => p.norm === 'link');
  if (linkProp) {
    const b = parseBool(linkProp.value);
    link = b === false ? null : b === true ? link : unquote(linkProp.value);
  }
  result.title = title;
  result.link = link ?? null;
  result.pending = anyPending && items.length === 0;
  result.data = { ...datasets, ...local };
  if (items.length) {
    const dash: DashboardSpec = { layout: items };
    if (title) dash.title = title;
    if (description) dash.description = description;
    result.spec = dash;
  }
  return result;
}

function unquoteMaybe(v: string | undefined): string | undefined {
  return v === undefined ? undefined : unquote(v);
}
