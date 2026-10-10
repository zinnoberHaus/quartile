import { inferSchema, isDataset, isTemporalValue, toComparable } from '../data/schema';
import type { DataInput, Row, Schema } from '../data/types';
import { ANALYSIS_LIMITS, freeze } from './limits';
import type { DatasetProfile, FieldProfile } from './types';
import { isFieldType, safeName } from './validate';

export interface ProfileDatasetOptions {
  /** Examines a prefix, not a random/statistically representative sample. Default 1,000. */
  maxRows?: number;
  fields?: readonly string[];
  schema?: Schema;
}

/** Bounded local profiling. No raw rows, nominal examples, or top values are retained. */
export function profileDataset<R extends Row>(
  data: DataInput<R>,
  options: ProfileDatasetOptions = {},
): DatasetProfile {
  const maxRows = options.maxRows ?? 1_000;
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > ANALYSIS_LIMITS.profileRows)
    throw new Error(`maxRows must be from 1 to ${ANALYSIS_LIMITS.profileRows}.`);
  const rows = isDataset<R>(data) ? data.rows : data;
  const count = Math.min(rows.length, maxRows);
  const schema =
    options.schema ?? (isDataset<R>(data) ? data.schema : inferSchema(rows.slice(0, count)));
  const names = options.fields ?? Object.keys(schema);
  if (names.length > ANALYSIS_LIMITS.fields || new Set(names).size !== names.length)
    throw new Error('Profile requires at most 64 unique fields.');
  const fields = names.map((field): FieldProfile => {
    if (!safeName(field) || !Object.hasOwn(schema, field) || !isFieldType(schema[field].type))
      throw new Error('Unknown or unsupported profile field.');
    const type = schema[field].type;
    const result: FieldProfile = { field, type, missing: 0, invalid: 0, valid: 0, distinct: 0 };
    const values = new Set<unknown>();
    let min = Infinity;
    let max = -Infinity;
    let mean = 0;
    for (let i = 0; i < count; i++) {
      const raw = rows[i][field];
      if (raw == null || raw === '') {
        result.missing++;
        continue;
      }
      let value: unknown = raw;
      if (type === 'temporal')
        value =
          raw instanceof Date || isTemporalValue(raw)
            ? toComparable(raw)
            : typeof raw === 'number'
              ? raw
              : NaN;
      const valid =
        type === 'nominal'
          ? typeof value === 'string'
          : type === 'boolean'
            ? typeof value === 'boolean'
            : typeof value === 'number' &&
              Number.isFinite(value) &&
              (type !== 'temporal' || Math.abs(value) <= 8.64e15);
      if (!valid) {
        result.invalid++;
        continue;
      }
      values.add(value);
      result.valid++;
      if (typeof value === 'number') {
        min = Math.min(min, value);
        max = Math.max(max, value);
        // The ordinary update preserves constant values exactly; weighted terms avoid
        // overflowing the difference for large, opposite-signed finite values.
        const difference = value - mean;
        mean = Number.isFinite(difference)
          ? mean + difference / result.valid
          : mean * ((result.valid - 1) / result.valid) + value / result.valid;
        if (Number.isFinite(mean)) mean = Math.max(min, Math.min(max, mean));
      }
    }
    result.distinct = values.size;
    if (result.valid && (type === 'quantitative' || type === 'temporal')) {
      result.min = type === 'temporal' ? new Date(min).toISOString() : min;
      result.max = type === 'temporal' ? new Date(max).toISOString() : max;
      if (type === 'quantitative' && Number.isFinite(mean)) result.mean = mean;
    }
    return result;
  });
  return freeze({
    totalRows: rows.length,
    scannedRows: count,
    complete: count === rows.length,
    fields,
  });
}
