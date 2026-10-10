import type { Predicate } from '../data/predicates';
import { ANALYSIS_LIMITS, freeze, safeJson } from './limits';
import type {
  AnalysisContext,
  AnalysisContextOptions,
  AnalysisField,
  AnalysisFilter,
  AnalysisValue,
  DatasetProfile,
  FieldProfile,
} from './types';
import { filterErrors, isFieldType, safeName, temporalValue } from './validate';

function text(value: unknown, name: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${name} must be nonempty text of at most ${max} characters.`);
  return value;
}

function normalizePredicate(predicate: Predicate): AnalysisFilter {
  function value(v: unknown): AnalysisValue {
    if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString();
    if (
      v === null ||
      typeof v === 'string' ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v))
    )
      return v;
    throw new Error('Selection contains a value that is not JSON serializable.');
  }
  const converted = Array.isArray(predicate.value)
    ? predicate.value.map(value)
    : value(predicate.value);
  // Scalar null is not published by Selection.set; preserve its meaning when supplied manually.
  if (predicate.op === 'eq' && converted === null)
    return { field: predicate.field, op: 'in', value: [null] };
  return { field: predicate.field, op: predicate.op, value: converted } as AnalysisFilter;
}

function profileContext(profile: DatasetProfile, fields: readonly AnalysisField[]): DatasetProfile {
  const { totalRows, scannedRows, complete } = profile;
  if (
    !Number.isSafeInteger(totalRows) ||
    totalRows < 0 ||
    !Number.isInteger(scannedRows) ||
    scannedRows < 0 ||
    scannedRows > totalRows ||
    scannedRows > ANALYSIS_LIMITS.profileRows ||
    complete !== (scannedRows === totalRows)
  )
    throw new Error('Profile row counts or completeness are inconsistent.');
  if (
    profile.fields.length > ANALYSIS_LIMITS.fields ||
    new Set(profile.fields.map((f) => f.field)).size !== profile.fields.length
  )
    throw new Error('Profile fields must be unique and bounded.');
  const included = profile.fields.filter((p) => fields.some((f) => f.name === p.field));
  const projected = included.map((p) => {
    const field = fields.find((f) => f.name === p.field)!;
    if (
      p.type !== field.type ||
      [p.valid, p.invalid, p.missing, p.distinct].some((n) => !Number.isInteger(n) || n < 0) ||
      p.valid + p.invalid + p.missing !== scannedRows ||
      p.distinct > p.valid
    )
      throw new Error('Profile field counts or types are inconsistent.');
    const result: FieldProfile = {
      field: p.field,
      type: p.type,
      valid: p.valid,
      invalid: p.invalid,
      missing: p.missing,
      distinct: p.distinct,
    };
    if (p.min !== undefined || p.max !== undefined) {
      const lo = p.type === 'temporal' ? temporalValue(p.min) : p.min;
      const hi = p.type === 'temporal' ? temporalValue(p.max) : p.max;
      if (
        p.valid === 0 ||
        !['temporal', 'quantitative'].includes(p.type) ||
        typeof lo !== 'number' ||
        typeof hi !== 'number' ||
        !Number.isFinite(lo) ||
        !Number.isFinite(hi) ||
        lo > hi
      )
        throw new Error('Invalid profile range.');
      result.min = p.min;
      result.max = p.max;
    }
    if (p.mean !== undefined) {
      if (
        p.type !== 'quantitative' ||
        p.valid === 0 ||
        !Number.isFinite(p.mean) ||
        typeof p.min !== 'number' ||
        typeof p.max !== 'number' ||
        p.mean < p.min ||
        p.mean > p.max
      )
        throw new Error('Invalid profile mean.');
      result.mean = p.mean;
    }
    return result;
  });
  return { totalRows, scannedRows, complete, fields: projected };
}

/**
 * Explicit, immutable transport boundary: no rows, nominal examples, arbitrary metadata, or
 * formatter functions. Field names/labels and numeric/date ranges can still be sensitive;
 * the application decides which fields and profiles may be sent to its backend.
 */
export function createAnalysisContext(options: AnalysisContextOptions): AnalysisContext {
  const names = options.fields ?? Object.keys(options.schema);
  if (
    names.length < 1 ||
    names.length > ANALYSIS_LIMITS.fields ||
    new Set(names).size !== names.length
  )
    throw new Error('Analysis context requires 1–64 unique fields.');
  const fields = names.map((name): AnalysisField => {
    if (!safeName(name) || !Object.hasOwn(options.schema, name))
      throw new Error('Unknown or unsafe context field.');
    const field = options.schema[name];
    if (!isFieldType(field.type)) throw new Error('Unsupported field type.');
    const result: AnalysisField = {
      name,
      label: text(field.label, 'Field label'),
      type: field.type,
    };
    if (typeof field.format === 'string') result.format = text(field.format, 'Field format', 80);
    if (field.currency !== undefined) result.currency = text(field.currency, 'Currency', 16);
    if (field.unit !== undefined) result.unit = text(field.unit, 'Unit', 80);
    return result;
  });
  const selection = (options.selection ?? []).map(normalizePredicate);
  if (
    selection.length > ANALYSIS_LIMITS.fields ||
    new Set(selection.map((p) => p.field)).size !== selection.length
  )
    throw new Error('Selection fields must be unique and bounded.');
  for (const predicate of selection) {
    const errors = filterErrors(predicate, fields);
    if (errors.length) throw new Error(`Cannot include active selection: ${errors[0].message}`);
  }
  const provenance = options.provenance ?? [];
  if (provenance.length > 8) throw new Error('At most eight provenance entries are supported.');
  const context: AnalysisContext = {
    version: 1,
    source: {
      id: text(options.source.id, 'Source id'),
      version: text(options.source.version, 'Source version'),
      ...(options.source.label === undefined
        ? {}
        : { label: text(options.source.label, 'Source label') }),
    },
    fields,
    selection,
    ...(options.profile ? { profile: profileContext(options.profile, fields) } : {}),
    provenance: provenance.map((p) => ({
      label: text(p.label, 'Provenance label'),
      detail: text(p.detail, 'Provenance detail', ANALYSIS_LIMITS.text),
    })),
  };
  return freeze(safeJson(context) as AnalysisContext);
}
