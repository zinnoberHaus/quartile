import { makeFormatter } from '../data/format';
import type { Formatter } from '../data/types';
import { quartileSchema, SPEC_COMPONENTS } from './schema';

export interface SpecError {
  /** JSON Pointer to the offending value, e.g. "/layout/0/y". Empty for the root. */
  path: string;
  message: string;
}

export interface SpecValidation {
  valid: boolean;
  errors: SpecError[];
}

type Schema = Record<string, unknown>;
type Defs = Record<string, Schema>;

const DEFS = quartileSchema.$defs as Defs;

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  if (t === 'integer') return actual === 'integer';
  return actual === t;
}

function article(t: string) {
  return /^[aeiou]/.test(t) ? `an ${t}` : `a ${t}`;
}

function show(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'bigint') return `${v}n`;
  return JSON.stringify(v) ?? String(v);
}

function resolve(schema: Schema): Schema {
  let s = schema;
  let guard = 0;
  while (typeof s.$ref === 'string' && guard++ < 20) {
    const name = (s.$ref as string).replace('#/$defs/', '');
    const target = DEFS[name];
    if (!target) return {};
    const { $ref: _ref, ...rest } = s;
    s = { ...target, ...rest };
  }
  return s;
}

/** The types a schema accepts, for "expected …" messages. */
function expectedTypes(schema: Schema): string[] {
  const s = resolve(schema);
  if (s.type) return Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
  if ('const' in s) return [typeOf(s.const)];
  if (Array.isArray(s.enum)) return [...new Set((s.enum as unknown[]).map(typeOf))];
  if (Array.isArray(s.oneOf)) return [...new Set((s.oneOf as Schema[]).flatMap(expectedTypes))];
  return [];
}

function componentConst(schema: Schema): string | undefined {
  const s = resolve(schema);
  const props = s.properties as Record<string, Schema> | undefined;
  const c = props?.component?.const;
  return typeof c === 'string' ? c : undefined;
}

function validate(value: unknown, schema: Schema, path: string, errors: SpecError[]): void {
  const s = resolve(schema);
  const errorsBefore = errors.length;

  if (Array.isArray(s.oneOf)) {
    validateOneOf(value, s.oneOf as Schema[], path, errors);
    return;
  }

  if ('const' in s && value !== s.const) {
    errors.push({ path, message: `Expected ${show(s.const)}, got ${show(value)}.` });
    return;
  }

  if (Array.isArray(s.enum)) {
    if (!(s.enum as unknown[]).some((e) => e === value)) {
      errors.push({
        path,
        message: `Expected one of ${(s.enum as unknown[]).map(show).join(', ')}; got ${show(value)}.`,
      });
    }
    return;
  }

  if (s.type) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push({
        path,
        message: `Expected ${types.map(article).join(' or ')}, got ${article(typeOf(value))}.`,
      });
      return;
    }
  }

  if (typeof value === 'string') {
    if (typeof s.minLength === 'number' && value.length < s.minLength) {
      errors.push({ path, message: 'Expected a non-empty string.' });
    }
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(value)) {
      errors.push({ path, message: `${show(value)} does not match ${s.pattern}.` });
    }
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push({ path, message: 'Expected a finite number.' });
      return;
    }
    if (typeof s.minimum === 'number' && value < s.minimum) {
      errors.push({ path, message: `Expected a value ≥ ${s.minimum}, got ${value}.` });
    }
    if (typeof s.maximum === 'number' && value > s.maximum) {
      errors.push({ path, message: `Expected a value ≤ ${s.maximum}, got ${value}.` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) {
      errors.push({
        path,
        message: `Expected at least ${s.minItems} item${s.minItems === 1 ? '' : 's'}.`,
      });
    }
    if (s.items) {
      value.forEach((item, i) => {
        validate(item, s.items as Schema, `${path}/${i}`, errors);
      });
    }
  }

  if (typeOf(value) === 'object' && (s.properties || s.required || 'additionalProperties' in s)) {
    const obj = value as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, Schema>;
    const owner = typeof s.title === 'string' ? ` for ${s.title}` : '';
    for (const key of (s.required ?? []) as string[]) {
      if (!Object.hasOwn(obj, key) || obj[key] === undefined) {
        errors.push({ path, message: `Missing required property "${key}"${owner}.` });
      }
    }
    for (const [key, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const p = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (Object.hasOwn(props, key)) validate(v, props[key], p, errors);
      else if (s.additionalProperties === false) {
        errors.push({ path: p, message: `Unknown property "${key}"${owner}.` });
      } else if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        validate(v, s.additionalProperties as Schema, p, errors);
      }
    }
  }

  // Structural JSON validation cannot express every Intl constraint (currency/unit names,
  // locale syntax, time zones, styles mixed with date components, rounding combinations).
  // Use the same constructor path as rendering, only after the option shape is valid.
  if (errors.length === errorsBefore && (s['x-quartile-format'] || s['x-quartile-time-zone'])) {
    try {
      if (s['x-quartile-time-zone']) {
        new Intl.DateTimeFormat('en-US', { timeZone: value as string });
      } else {
        makeFormatter(value as Formatter);
      }
    } catch (error) {
      errors.push({
        path,
        message: `Invalid ${s['x-quartile-time-zone'] ? 'time zone' : 'format options'}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

/**
 * `oneOf` for this schema's shapes. Component unions dispatch on `component` so errors name the
 * right component; other unions report the branch whose type matches the value.
 */
function validateOneOf(value: unknown, branches: Schema[], path: string, errors: SpecError[]) {
  // Typed format descriptors share the object type. Dispatch on their discriminator so a
  // bad date option is reported at that option, rather than against an unrelated branch.
  if (typeOf(value) === 'object') {
    const kind = (value as Record<string, unknown>).type;
    const branch = branches.find((candidate) => {
      const props = resolve(candidate).properties as Record<string, Schema> | undefined;
      return kind !== undefined && props?.type?.const === kind;
    });
    if (branch) {
      validate(value, branch, path, errors);
      return;
    }
  }
  const names = branches.map(componentConst);
  if (names.every((n) => n !== undefined)) {
    if (typeOf(value) !== 'object') {
      errors.push({ path, message: `Expected an object, got ${article(typeOf(value))}.` });
      return;
    }
    const c = (value as Record<string, unknown>).component;
    if (c === undefined) {
      errors.push({ path, message: 'Missing required property "component".' });
      return;
    }
    const i = names.indexOf(c as string);
    if (i < 0) {
      errors.push({
        path: `${path}/component`,
        message: `Unknown component ${show(c)}. Expected one of ${names.join(', ')}.`,
      });
      return;
    }
    validate(value, branches[i], path, errors);
    return;
  }

  let best: SpecError[] | null = null;
  for (const b of branches) {
    const types = expectedTypes(b);
    const typeMatches = types.length === 0 || types.some((t) => matchesType(value, t));
    if (!typeMatches) continue;
    const errs: SpecError[] = [];
    validate(value, b, path, errs);
    if (errs.length === 0) return;
    if (!best || errs.length < best.length) best = errs;
  }
  if (best) {
    errors.push(...best);
    return;
  }
  const all = [...new Set(branches.flatMap(expectedTypes))];
  errors.push({
    path,
    message: `Expected ${all.map(article).join(' or ')}, got ${article(typeOf(value))}.`,
  });
}

function isDashboardLike(v: unknown): boolean {
  return (
    typeOf(v) === 'object' &&
    'layout' in (v as Record<string, unknown>) &&
    !('component' in (v as Record<string, unknown>))
  );
}

/**
 * Validates a component spec or a Dashboard against `quartileSchema`: unknown components,
 * unknown properties, wrong types, out-of-range values and missing required fields. Errors carry
 * a JSON Pointer path.
 */
export function validateSpec(spec: unknown): SpecValidation {
  const errors: SpecError[] = [];
  if (typeOf(spec) !== 'object') {
    errors.push({
      path: '',
      message: `Expected a component spec or a dashboard object, got ${article(typeOf(spec))}.`,
    });
  } else {
    validate(spec, isDashboardLike(spec) ? DEFS.Dashboard : DEFS.Spec, '', errors);
  }
  return { valid: errors.length === 0, errors };
}

/** Validates one serializable formatter, including runtime Intl option constraints. */
export function validateFormat(format: unknown): SpecValidation {
  const errors: SpecError[] = [];
  validate(format, DEFS.Format, '', errors);
  return { valid: errors.length === 0, errors };
}

/** True for `{ layout: [...] }` specs. */
export function isDashboardSpec(spec: unknown): boolean {
  return isDashboardLike(spec);
}

export { SPEC_COMPONENTS };
