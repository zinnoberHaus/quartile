import type { DataInput, Dataset, FieldDef, FieldOverride, FieldType, Row, Schema } from './types';

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const CURRENCY_NAME = /(revenue|amount|price|cost|sales|spend|mrr|arr|aov|gmv|ltv|value)$/i;
const RATE_NAME = /(rate|ratio|share|pct|percent|conversion|churn|margin)$/i;

/** "net_revenue" / "netRevenue" → "Net revenue". */
export function humanize(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function isTemporalValue(v: unknown): boolean {
  return (
    (v instanceof Date || (typeof v === 'string' && ISO_DATE.test(v))) &&
    Number.isFinite(toDate(v).getTime())
  );
}

/** Coerces dates, ISO strings and epoch numbers to a Date. */
export function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v !== 'string' || v.trim() === '') return new Date(NaN);
  const iso = ISO_DATE.exec(v);
  if (iso) {
    const [, year, month, day] = iso;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const calendar = new Date(0);
    calendar.setUTCFullYear(y, m - 1, d);
    if (
      calendar.getUTCFullYear() !== y ||
      calendar.getUTCMonth() !== m - 1 ||
      calendar.getUTCDate() !== d
    )
      return new Date(NaN);
    if (v.length === 10) {
      const local = new Date(0);
      local.setFullYear(y, m - 1, d);
      local.setHours(0, 0, 0, 0);
      return local;
    }
  }
  return new Date(v);
}

/** A value suitable for ordering and range checks: dates become epoch ms. */
export function toComparable(v: unknown): number | string | boolean | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && ISO_DATE.test(v)) {
    const time = toDate(v).getTime();
    return Number.isFinite(time) ? time : v;
  }
  return v as number | string | boolean;
}

function inferType(values: unknown[]): FieldType {
  const present = values.filter((v) => v != null && v !== '');
  if (present.length === 0) return 'nominal';
  if (present.every((v) => typeof v === 'boolean')) return 'boolean';
  if (present.every(isTemporalValue)) return 'temporal';
  if (present.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'quantitative';
  return 'nominal';
}

function inferField(name: string, values: unknown[]): FieldDef {
  const type = inferType(values);
  const label = humanize(name);
  if (type === 'temporal') return { name, type, label, format: 'date-short' };
  if (type === 'quantitative') {
    const nums = values.filter((v): v is number => typeof v === 'number');
    if (CURRENCY_NAME.test(name))
      return { name, type, label, format: 'currency', currency: 'USD', unit: 'USD' };
    if (RATE_NAME.test(name) && nums.every((n) => n >= -1 && n <= 1)) {
      return { name, type, label, format: 'percent', unit: 'RATE' };
    }
    const integers = nums.every((n) => Number.isInteger(n));
    return {
      name,
      type,
      label,
      format: integers ? 'integer' : 'number',
      unit: integers ? 'COUNT' : undefined,
    };
  }
  return { name, type, label, format: 'text' };
}

function applyOverride(field: FieldDef, o: FieldOverride | undefined): FieldDef {
  if (!o) return field;
  if (typeof o === 'string') {
    const unit = o.startsWith('currency') ? (field.currency ?? 'USD') : field.unit;
    return {
      ...field,
      format: o,
      unit,
      currency: o.startsWith('currency') ? (field.currency ?? 'USD') : field.currency,
    };
  }
  return { ...field, ...o };
}

/** Infers a schema from up to `sample` rows. Explicit overrides always win. */
export function inferSchema<R extends Row>(
  rows: readonly R[],
  overrides: Partial<Record<string, FieldOverride>> = {},
  sample = 200,
): Schema {
  const names = new Set<string>();
  const head = rows.slice(0, sample);
  for (const r of head) for (const k of Object.keys(r)) names.add(k);
  for (const k of Object.keys(overrides)) names.add(k);
  const schema: Schema = Object.create(null);
  for (const name of names) {
    schema[name] = applyOverride(
      inferField(
        name,
        head.map((r) => r[name]),
      ),
      Object.hasOwn(overrides, name) ? overrides[name] : undefined,
    );
  }
  return schema;
}

/** Attaches a schema to rows. Fields you do not describe are inferred. */
export function dataset<R extends Row>(
  rows: readonly R[],
  fields: Partial<Record<keyof R & string, FieldOverride>> = {},
): Dataset<R> {
  return { kind: 'dataset', rows: rows as R[], schema: inferSchema(rows, fields) };
}

export function isDataset<R extends Row>(d: unknown): d is Dataset<R> {
  return typeof d === 'object' && d !== null && (d as Dataset).kind === 'dataset';
}

/** Normalizes any DataInput into rows plus a schema. */
export function resolveData<R extends Row>(
  input: DataInput<R> | undefined,
): { rows: R[]; schema: Schema } {
  if (!input) return { rows: [], schema: {} };
  if (isDataset<R>(input)) return { rows: input.rows, schema: input.schema };
  return { rows: input as R[], schema: inferSchema(input) };
}

/** Field definition for `name`, inferred from rows if the schema lacks it. */
export function fieldOf(schema: Schema, name: string, rows: readonly Row[] = []): FieldDef {
  return (
    (Object.hasOwn(schema, name) ? schema[name] : undefined) ??
    inferField(
      name,
      rows.slice(0, 200).map((r) => r[name]),
    )
  );
}
