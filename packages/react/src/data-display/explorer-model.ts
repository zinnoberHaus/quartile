import { typedValueKey } from '../data/typed-key';
import type { Row, Schema } from '../data/types';
import { columnKey, groupRows, type ModelColumn, type SortState, sortRows } from './table-model';

export type TableScalar = string | number | boolean | null;
export type TableFilter =
  | {
      field: string;
      type: 'text';
      op: 'contains' | 'notContains' | 'eq' | 'startsWith';
      value: string;
    }
  | { field: string; type: 'number'; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { field: string; type: 'number'; op: 'between'; value: [number | null, number | null] }
  | { field: string; type: 'date'; op: 'on' | 'before' | 'after'; value: string }
  | { field: string; type: 'date'; op: 'between'; value: [string | null, string | null] }
  | { field: string; type: 'category'; op: 'in' | 'notIn'; value: TableScalar[] }
  | { field: string; type: 'boolean'; op: 'is'; value: boolean }
  | { field: string; type: 'empty'; op: 'isEmpty' | 'isNotEmpty' };

export type TableSort = SortState;

/** JSON-safe view configuration; records and shared Selection predicates are intentionally separate. */
export interface TableViewState {
  version: 1;
  search: string;
  filters: TableFilter[];
  sorts: TableSort[];
  hiddenColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: { left: string[]; right: string[] };
  groupBy: string | null;
  /** Zero-based page. */
  page: number;
  pageSize: number;
}

const DAY = 86_400_000;
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const key = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 500;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const scalar = (v: unknown): v is TableScalar =>
  v === null || typeof v === 'string' || typeof v === 'boolean' || finite(v);
const dateInput = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;

function validFilter(v: unknown): v is TableFilter {
  if (!isObject(v) || !key(v.field)) return false;
  switch (v.type) {
    case 'text':
      return (
        ['contains', 'notContains', 'eq', 'startsWith'].includes(String(v.op)) &&
        typeof v.value === 'string'
      );
    case 'number':
      if (v.op === 'between')
        return (
          Array.isArray(v.value) &&
          v.value.length === 2 &&
          v.value.every((x) => x === null || finite(x)) &&
          (v.value[0] === null || v.value[1] === null || v.value[0] <= v.value[1])
        );
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(String(v.op)) && finite(v.value);
    case 'date':
      if (v.op === 'between')
        return (
          Array.isArray(v.value) &&
          v.value.length === 2 &&
          v.value.every((x) => x === null || dateInput(x)) &&
          (v.value[0] === null || v.value[1] === null || v.value[0] <= v.value[1])
        );
      return ['on', 'before', 'after'].includes(String(v.op)) && dateInput(v.value);
    case 'category':
      return (
        (v.op === 'in' || v.op === 'notIn') &&
        Array.isArray(v.value) &&
        v.value.length <= 1000 &&
        v.value.every(scalar)
      );
    case 'boolean':
      return v.op === 'is' && typeof v.value === 'boolean';
    case 'empty':
      return v.op === 'isEmpty' || v.op === 'isNotEmpty';
    default:
      return false;
  }
}

/** Parse an untrusted saved view. Throws a readable error rather than silently changing its meaning. */
export function parseTableViewState(input: string | unknown): TableViewState {
  const v: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isObject(v) || v.version !== 1) throw new Error('Expected table view version 1.');
  if (typeof v.search !== 'string' || v.search.length > 10_000)
    throw new Error('Invalid table search.');
  if (!Array.isArray(v.filters) || v.filters.length > 100 || !v.filters.every(validFilter))
    throw new Error('Invalid typed table filters.');
  if (
    !Array.isArray(v.sorts) ||
    v.sorts.length > 100 ||
    !v.sorts.every((s) => isObject(s) && key(s.key) && typeof s.desc === 'boolean')
  )
    throw new Error('Invalid table sort order.');
  const keys = (value: unknown, label: string) => {
    if (!Array.isArray(value) || value.length > 1000 || !value.every(key))
      throw new Error(`Invalid ${label}.`);
    return [...new Set(value)] as string[];
  };
  if (!isObject(v.pinnedColumns)) throw new Error('Invalid pinned columns.');
  if (v.groupBy !== null && !key(v.groupBy)) throw new Error('Invalid grouping field.');
  if (
    !Number.isInteger(v.page) ||
    (v.page as number) < 0 ||
    (v.page as number) > Number.MAX_SAFE_INTEGER
  )
    throw new Error('Invalid table page.');
  if (!Number.isInteger(v.pageSize) || (v.pageSize as number) < 1 || (v.pageSize as number) > 1000)
    throw new Error('Table page size must be between 1 and 1000.');
  const left = keys(v.pinnedColumns.left, 'left pinned columns');
  const widths = v.columnWidths ?? {};
  if (
    !isObject(widths) ||
    Object.keys(widths).length > 1000 ||
    !Object.entries(widths).every(
      ([k, width]) => key(k) && finite(width) && width >= 60 && width <= 1000,
    )
  )
    throw new Error('Column widths must be between 60 and 1000 pixels.');
  const filters = v.filters.map((f) => {
    if (f.type === 'empty') return { field: f.field, type: f.type, op: f.op };
    return {
      field: f.field,
      type: f.type,
      op: f.op,
      value: Array.isArray(f.value) ? [...f.value] : f.value,
    };
  }) as TableFilter[];
  const seenSorts = new Set<string>();
  return {
    version: 1,
    search: v.search,
    filters,
    sorts: (v.sorts as TableSort[])
      .filter((s) => !seenSorts.has(s.key) && !!seenSorts.add(s.key))
      .map((s) => ({ key: s.key, desc: s.desc })),
    hiddenColumns: keys(v.hiddenColumns, 'hidden columns'),
    columnOrder: keys(v.columnOrder, 'column order'),
    columnWidths: Object.fromEntries(Object.entries(widths)) as Record<string, number>,
    pinnedColumns: {
      left,
      right: keys(v.pinnedColumns.right, 'right pinned columns').filter((k) => !left.includes(k)),
    },
    groupBy: v.groupBy as string | null,
    page: v.page as number,
    pageSize: v.pageSize as number,
  };
}

export function createTableViewState(overrides: Partial<TableViewState> = {}): TableViewState {
  return parseTableViewState({
    version: 1,
    search: '',
    filters: [],
    sorts: [],
    hiddenColumns: [],
    columnOrder: [],
    columnWidths: {},
    pinnedColumns: { left: [], right: [] },
    groupBy: null,
    page: 0,
    pageSize: 25,
    ...overrides,
  });
}

export function serializeTableViewState(view: TableViewState): string {
  return JSON.stringify(parseTableViewState(view), null, 2);
}

function time(value: unknown): number {
  return value instanceof Date
    ? value.getTime()
    : typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Date.parse(value)
        : Number.NaN;
}

/** View filters are local to the explorer and use physical numeric/boolean identities. Date days use UTC. */
export function matchesTableFilter(row: Row, filter: TableFilter, schema: Schema = {}): boolean {
  const value = row[filter.field];
  if (filter.type === 'empty') {
    const empty =
      value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value));
    return filter.op === 'isEmpty' ? empty : !empty;
  }
  if (filter.type === 'category') {
    const k = typedValueKey(value, schema[filter.field]?.type);
    const included = filter.value.some((v) => typedValueKey(v, schema[filter.field]?.type) === k);
    return filter.op === 'in' ? included : !included;
  }
  if (filter.type === 'boolean') return value === filter.value;
  if (filter.type === 'text') {
    if (typeof value !== 'string') return false;
    const a = value.toLocaleLowerCase();
    const b = filter.value.toLocaleLowerCase();
    if (filter.op === 'eq') return a === b;
    if (filter.op === 'startsWith') return a.startsWith(b);
    return filter.op === 'notContains' ? !a.includes(b) : a.includes(b);
  }
  if (filter.type === 'number') {
    if (!finite(value)) return false;
    if (filter.op === 'between')
      return (
        (filter.value[0] === null || value >= filter.value[0]) &&
        (filter.value[1] === null || value <= filter.value[1])
      );
    if (filter.op === 'eq') return value === filter.value;
    if (filter.op === 'neq') return value !== filter.value;
    if (filter.op === 'gt') return value > filter.value;
    if (filter.op === 'gte') return value >= filter.value;
    if (filter.op === 'lt') return value < filter.value;
    return value <= filter.value;
  }
  const t = time(value);
  if (!Number.isFinite(t)) return false;
  if (filter.op === 'between')
    return (
      (filter.value[0] === null || t >= Date.parse(filter.value[0])) &&
      (filter.value[1] === null || t < Date.parse(filter.value[1]) + DAY)
    );
  const start = Date.parse(filter.value);
  if (filter.op === 'before') return t < start;
  if (filter.op === 'after') return t >= start + DAY;
  return t >= start && t < start + DAY;
}

export function filterTableRows<R extends Row>(
  rows: readonly R[],
  view: Pick<TableViewState, 'filters' | 'search'>,
  schema: Schema = {},
  fields?: readonly string[],
): R[] {
  const search = view.search.trim().toLocaleLowerCase();
  if (!view.filters.length && !search) return rows as R[];
  const searchFields = fields ?? [
    ...new Set([...Object.keys(schema), ...rows.flatMap((r) => Object.keys(r))]),
  ];
  return rows.filter(
    (row) =>
      view.filters.every((f) => matchesTableFilter(row, f, schema)) &&
      (!search ||
        searchFields.some((field) => {
          const v = row[field];
          const text =
            v instanceof Date
              ? Number.isFinite(v.getTime())
                ? v.toISOString()
                : ''
              : v == null || typeof v === 'object'
                ? ''
                : String(v);
          return text.toLocaleLowerCase().includes(search);
        })),
  );
}

/** Linked rows → local filters/search → aggregation/aliases → stable multi-sort. No paging here. */
export function deriveTableRows(
  rows: readonly Row[],
  columns: readonly ModelColumn[],
  view: TableViewState,
  schema: Schema = {},
): Row[] {
  const filtered = filterTableRows(
    rows,
    view,
    schema,
    columns.map((c) => c.field),
  );
  let derived: Row[];
  if (view.groupBy) derived = groupRows(filtered, view.groupBy, columns, { typed: true, schema });
  else {
    const aliases = columns.filter((c) => columnKey(c) !== c.field);
    derived = aliases.length
      ? filtered.map((row) => {
          let out = row;
          for (const c of aliases) out = { ...out, [columnKey(c)]: row[c.field] };
          return out;
        })
      : filtered;
  }
  return sortRows(derived, view.sorts);
}

/** RFC 4180 CSV of the supplied result rows/columns. Strings beginning like formulas are prefixed with '. */
export function tableToCSV(
  rows: readonly Row[],
  columns: readonly { field: string; key?: string; label?: unknown }[],
): string {
  const encode = (value: unknown) => {
    let text =
      value instanceof Date
        ? value.toISOString()
        : value == null
          ? ''
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
    let start = 0;
    while (start < text.length && (text.charCodeAt(start) <= 32 || /\s/.test(text[start]))) start++;
    if (typeof value === 'string' && /^[=+\-@]/.test(text.slice(start))) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [
    columns.map((c) => encode(typeof c.label === 'string' ? c.label : columnKey(c))).join(','),
    ...rows.map((row) => columns.map((c) => encode(row[columnKey(c)])).join(',')),
  ].join('\r\n');
}
