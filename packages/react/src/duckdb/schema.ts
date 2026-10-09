import { DataType, Precision, type Table, TimeUnit } from 'apache-arrow';
import { humanize } from '../data/schema';
import type { FieldDef, FieldOverride, FieldType, Row, Schema } from '../data/types';

export interface ArrowColumnInfo {
  name: string;
  physicalType: string;
  nullable: boolean;
  type: FieldType;
  timezone?: string | null;
  timeUnit?: number;
}

/** Reserved only in the adapter's private relation, for stable detail pagination. */
export const ORDINAL = '__q_row_ordinal';

export function inspectArrow(
  table: Table,
  overrides: Record<string, FieldOverride> = {},
): { schema: Schema; columns: readonly ArrowColumnInfo[] } {
  const schema: Schema = Object.create(null);
  const names = new Set<string>();
  const columns = table.schema.fields.map((field) => {
    const name = field.name;
    if (!name || name.includes('\0') || name.toLowerCase() === ORDINAL)
      throw new Error(`Unsupported Arrow field name: ${JSON.stringify(name)}.`);
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate Arrow field: ${name}.`);
    names.add(name.toLowerCase());
    const physical = field.type;
    const type = DataType.isDictionary(physical) ? physical.dictionary : physical;
    let kind: FieldType;
    if (DataType.isInt(type) && type.bitWidth <= 32) kind = 'quantitative';
    else if (DataType.isFloat(type) && type.precision !== Precision.HALF) kind = 'quantitative';
    else if (DataType.isBool(type)) kind = 'boolean';
    else if (DataType.isUtf8(type)) kind = 'nominal';
    else if (
      DataType.isDate(type) ||
      (DataType.isTimestamp(type) && type.unit <= TimeUnit.MILLISECOND)
    )
      kind = 'temporal';
    else throw new Error(`Unsupported Arrow type for ${name}: ${physical.toString()}.`);
    if (DataType.isDictionary(physical) && kind !== 'nominal')
      throw new Error(`Only string dictionaries are supported: ${name}.`);
    const base: FieldDef = {
      name,
      label: humanize(name),
      type: kind,
      format:
        kind === 'temporal'
          ? 'datetime'
          : kind === 'quantitative'
            ? DataType.isInt(type)
              ? 'integer'
              : 'number'
            : 'text',
    };
    const override = Object.hasOwn(overrides, name) ? overrides[name] : undefined;
    if (override && typeof override === 'object' && override.type && override.type !== kind)
      throw new Error(`Field ${name} cannot override its Arrow type ${kind}.`);
    schema[name] = Object.freeze(
      typeof override === 'string'
        ? { ...base, format: override }
        : { ...base, ...override, name, type: kind },
    );
    return Object.freeze({
      name,
      physicalType: physical.toString(),
      nullable: field.nullable,
      type: kind,
      ...(DataType.isTimestamp(type) ? { timezone: type.timezone, timeUnit: type.unit } : {}),
    });
  });
  if (columns.length === 0) throw new Error('An Arrow source must contain at least one field.');
  for (const name of Object.keys(overrides)) {
    if (!Object.hasOwn(schema, name)) throw new Error(`Unknown field override: ${name}.`);
  }
  return { schema: Object.freeze(schema), columns: Object.freeze(columns) };
}

/** Decode only bounded query results. Exact integers outside JS's safe range are rejected. */
export function resultRows(
  table: Table,
  schema: Schema,
  finiteFields: readonly string[] = [],
): Row[] {
  const finite = new Set(finiteFields);
  const columns = Object.keys(schema).map((name) => {
    const vector = table.getChild(name);
    if (!vector) throw new Error(`Query result is missing field ${name}.`);
    return { name, vector, field: schema[name] };
  });
  return Array.from({ length: table.numRows }, (_, index) => {
    const row: Row = {};
    for (const { name, vector, field } of columns) {
      let value: unknown = vector.get(index);
      if (typeof value === 'bigint') {
        const numeric = Number(value);
        if (!Number.isSafeInteger(numeric)) throw new Error(`Unsafe integer result in ${name}.`);
        value = numeric;
      }
      if (finite.has(name) && typeof value === 'number' && !Number.isFinite(value))
        throw new Error(`Nonfinite aggregate result in ${name}.`);
      if (field.type === 'temporal' && value != null) {
        const date = value instanceof Date ? value : new Date(Number(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date result in ${name}.`);
        value = date;
      }
      Object.defineProperty(row, name, { value, enumerable: true, configurable: true });
    }
    return row;
  });
}
