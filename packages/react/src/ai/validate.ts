import { ANALYSIS_LIMITS, freeze, safeJson } from './limits';
import type {
  AnalysisContext,
  AnalysisField,
  AnalysisFilter,
  AnalysisPlan,
  AnalysisPlanError,
  AnalysisPlanValidation,
  AnalysisValue,
  AnalysisViewState,
} from './types';

const TYPES = ['quantitative', 'temporal', 'nominal', 'boolean'];
export const isFieldType = (value: unknown): boolean => TYPES.includes(value as string);
export const safeName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 160 &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Require a timestamp with an explicit timezone; date-only strings differ across row/query paths. */
export function temporalValue(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? value : null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return null;
  const n = Date.parse(value);
  // Date.parse normalizes dates such as February 30; reject those as well.
  const day = value.slice(0, 10);
  const [year, month, date] = day.split('-').map(Number);
  // Date.UTC remaps years 0–99 into 1900–1999, so check the Gregorian calendar directly.
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return Number.isFinite(n) && month >= 1 && month <= 12 && date >= 1 && date <= monthDays
    ? n
    : null;
}

function validValue(value: unknown, field: AnalysisField): value is AnalysisValue {
  if (value === null) return true;
  switch (field.type) {
    case 'quantitative':
      return typeof value === 'number' && Number.isFinite(value);
    case 'temporal':
      return temporalValue(value) !== null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'nominal':
      return (
        (typeof value === 'string' && value.length <= 500) ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      );
  }
}

export function filterErrors(
  value: unknown,
  fields: readonly AnalysisField[],
  path = '',
): AnalysisPlanError[] {
  const errors: AnalysisPlanError[] = [];
  const fail = (message: string) => errors.push({ path, message });
  if (!record(value)) {
    fail('Expected a filter object.');
    return errors;
  }
  const field = fields.find((f) => f.name === value.field);
  if (!field) {
    fail('Filter references a field outside the analysis context.');
    return errors;
  }
  if (value.op === 'eq') {
    if (value.value === null)
      fail('Use in: [null] for missing values; scalar null clears a Selection.');
    else if (!validValue(value.value, field)) fail(`Expected a ${field.type} filter value.`);
  } else if (value.op === 'in') {
    if (
      !Array.isArray(value.value) ||
      value.value.length < 1 ||
      value.value.length > ANALYSIS_LIMITS.filterValues ||
      !value.value.every((v) => validValue(v, field))
    ) {
      fail(`Expected 1–${ANALYSIS_LIMITS.filterValues} ${field.type} values.`);
    }
  } else if (value.op === 'between') {
    if (!['quantitative', 'temporal'].includes(field.type))
      fail('Ranges require a quantitative or temporal field.');
    else if (
      !Array.isArray(value.value) ||
      value.value.length !== 2 ||
      value.value.some((v) => v === null || !validValue(v, field))
    )
      fail('Expected two finite, typed range endpoints.');
    else {
      const values = value.value.map((v) =>
        field.type === 'temporal' ? temporalValue(v)! : (v as number),
      );
      if (values[0] > values[1]) fail('Range endpoints must be in ascending order.');
    }
  } else fail('Unknown filter operator.');
  return errors;
}

/** Strict structural and schema-aware validation. A fresh, frozen plan is returned on success. */
export function validateAnalysisPlan(
  input: unknown,
  context: AnalysisContext,
): AnalysisPlanValidation {
  const errors: AnalysisPlanError[] = [];
  const fail = (path: string, message: string) => errors.push({ path, message });
  let value: unknown;
  try {
    value = safeJson(input);
  } catch (error) {
    return {
      valid: false,
      errors: [
        { path: '', message: error instanceof Error ? error.message : 'Invalid JSON payload.' },
      ],
    };
  }
  function keys(obj: Record<string, unknown>, names: string[], path: string) {
    for (const key of Object.keys(obj))
      if (!names.includes(key)) fail(`${path}/${key}`, 'Unknown property.');
    for (const key of names)
      if (!Object.hasOwn(obj, key)) fail(`${path}/${key}`, 'Missing required property.');
  }
  function field(name: unknown, path: string) {
    const found = context.fields.find((f) => f.name === name);
    if (!found) fail(path, 'Field is not in the analysis context.');
    return found;
  }
  if (!record(value))
    return { valid: false, errors: [{ path: '', message: 'Expected a plan object.' }] };
  keys(value, ['version', 'title', 'summary', 'actions'], '');
  if (value.version !== 1) fail('/version', 'Expected plan version 1.');
  for (const key of ['title', 'summary']) {
    if (
      typeof value[key] !== 'string' ||
      !(value[key] as string).trim() ||
      (value[key] as string).length > (key === 'title' ? 160 : ANALYSIS_LIMITS.text)
    )
      fail(`/${key}`, 'Expected bounded, nonempty text.');
  }
  if (
    !Array.isArray(value.actions) ||
    value.actions.length < 1 ||
    value.actions.length > ANALYSIS_LIMITS.actions
  )
    fail('/actions', `Expected 1–${ANALYSIS_LIMITS.actions} actions.`);
  else {
    const targets = new Set<string>();
    value.actions.forEach((action: unknown, i: number) => {
      const path = `/actions/${i}`;
      if (!record(action)) {
        fail(path, 'Expected an action object.');
        return;
      }
      const target =
        action.type === 'filter' || action.type === 'clear-filter'
          ? `filter:${String(action.field)}`
          : String(action.type);
      if (targets.has(target)) fail(path, 'A plan may change each target only once.');
      targets.add(target);
      switch (action.type) {
        case 'filter':
          keys(action, ['type', 'field', 'op', 'value'], path);
          errors.push(...filterErrors(action, context.fields, path));
          break;
        case 'clear-filter':
          keys(action, ['type', 'field'], path);
          field(action.field, `${path}/field`);
          break;
        case 'sort':
          keys(action, ['type', 'field', 'direction'], path);
          field(action.field, `${path}/field`);
          if (!['asc', 'desc'].includes(action.direction as string))
            fail(`${path}/direction`, 'Expected asc or desc.');
          break;
        case 'chart': {
          keys(
            action,
            action.chart === 'histogram' ? ['type', 'chart', 'x'] : ['type', 'chart', 'x', 'y'],
            path,
          );
          if (!['histogram', 'scatter', 'bar', 'line'].includes(action.chart as string))
            fail(`${path}/chart`, 'Unsupported chart.');
          const x = field(action.x, `${path}/x`);
          if (x && action.chart !== 'bar' && !['quantitative', 'temporal'].includes(x.type))
            fail(`${path}/x`, 'This chart needs a quantitative or temporal x field.');
          if (action.chart !== 'histogram') {
            const y = field(action.y, `${path}/y`);
            if (y && y.type !== 'quantitative')
              fail(`${path}/y`, 'The measure must be quantitative.');
          }
          break;
        }
        case 'table':
          keys(action, ['type', 'fields', 'limit'], path);
          if (
            !Array.isArray(action.fields) ||
            action.fields.length < 1 ||
            action.fields.length > ANALYSIS_LIMITS.tableFields
          )
            fail(`${path}/fields`, `Expected 1–${ANALYSIS_LIMITS.tableFields} fields.`);
          else {
            action.fields.forEach((name, n) => {
              field(name, `${path}/fields/${n}`);
            });
            if (new Set(action.fields).size !== action.fields.length)
              fail(`${path}/fields`, 'Duplicate columns are not allowed.');
          }
          if (
            !Number.isInteger(action.limit) ||
            (action.limit as number) < 1 ||
            (action.limit as number) > ANALYSIS_LIMITS.tableRows
          )
            fail(`${path}/limit`, `Expected a row limit from 1 to ${ANALYSIS_LIMITS.tableRows}.`);
          break;
        default:
          fail(`${path}/type`, 'Unsupported action.');
      }
    });
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, plan: freeze(value as unknown as AnalysisPlan), errors: [] };
}

/** Pure transaction: validates every action first, then returns state without mutating the input. */
export function reduceAnalysisPlan(
  input: unknown,
  state: AnalysisViewState,
  context: AnalysisContext,
): AnalysisViewState {
  const result = validateAnalysisPlan(input, context);
  if (!result.valid)
    throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  const next: AnalysisViewState = { ...state, filters: [...state.filters] };
  for (const action of result.plan.actions) {
    switch (action.type) {
      case 'filter': {
        const { type: _type, ...predicate } = action;
        next.filters = [
          ...next.filters.filter((p) => p.field !== action.field),
          predicate as AnalysisFilter,
        ];
        break;
      }
      case 'clear-filter':
        next.filters = next.filters.filter((p) => p.field !== action.field);
        break;
      case 'sort':
        next.sort = { field: action.field, direction: action.direction };
        break;
      case 'chart': {
        const { type: _type, ...chart } = action;
        next.chart = chart;
        break;
      }
      case 'table':
        next.table = { fields: action.fields, limit: action.limit };
        break;
    }
  }
  return next;
}
