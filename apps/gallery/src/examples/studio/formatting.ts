import {
  type Dataset,
  type FieldDef,
  makeFieldFormatter,
  type Row,
  type SerializableFormatter,
  validateFormat,
} from '@quartile/react';

export interface StudioFieldFormatting {
  format?: SerializableFormatter;
  axisFormat?: SerializableFormatter;
  tooltipFormat?: SerializableFormatter;
  description?: string;
  currency?: string;
  unit?: string;
  timeZone?: string;
}
export interface StudioFormatting {
  locale?: string;
  timeZone?: string;
  fields?: Record<string, StudioFieldFormatting>;
}
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
function object(
  input: unknown,
  allowed: readonly string[] | null,
  label: string,
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error(`${label} must be a JSON object.`);
  if (Object.keys(input).some((key) => unsafe.has(key) || (allowed && !allowed.includes(key))))
    throw new Error(`Unknown or unsafe ${label.toLowerCase()} setting.`);
  return input as Record<string, unknown>;
}
function string(value: unknown, label: string, max: number, multiline = false): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some((char) => {
      const code = char.charCodeAt(0);
      return code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code)));
    })
  )
    throw new Error(`${label} must contain 1–${max} characters.`);
  return value;
}
function zone(value: unknown): string {
  const result = string(value, 'Time zone', 100);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: result });
  } catch {
    throw new Error('Enter a valid IANA time zone, such as Europe/Berlin.');
  }
  return result;
}

/** Validate serializable display settings before changing the current project. Never alters records. */
export function parseFormatting(input: unknown): StudioFormatting {
  const config = object(input, ['locale', 'timeZone', 'fields'], 'Formatting');
  const result: StudioFormatting = {};
  if (config.locale !== undefined) {
    result.locale = string(config.locale, 'Locale', 100);
    try {
      new Intl.NumberFormat(result.locale);
    } catch {
      throw new Error('Enter a valid locale, such as en-US or de-DE.');
    }
  }
  if (config.timeZone !== undefined) result.timeZone = zone(config.timeZone);
  if (config.fields !== undefined) {
    const fields = object(config.fields, null, 'Field formatting');
    if (Object.keys(fields).length > 64) throw new Error('Formatting supports up to 64 fields.');
    result.fields = {};
    for (const [name, input] of Object.entries(fields)) {
      string(name, 'Field name', 128);
      const f = object(
        input,
        ['format', 'axisFormat', 'tooltipFormat', 'description', 'currency', 'unit', 'timeZone'],
        'Field',
      );
      const next: StudioFieldFormatting = {};
      if (f.currency !== undefined) {
        next.currency = string(f.currency, 'Currency', 3);
        if (!/^[A-Z]{3}$/.test(next.currency))
          throw new Error('Currency must be a three-letter uppercase ISO code.');
      }
      if (f.unit !== undefined) next.unit = string(f.unit, 'Unit label', 80);
      if (f.description !== undefined)
        next.description = string(f.description, 'Field description', 1000, true);
      if (f.timeZone !== undefined) next.timeZone = zone(f.timeZone);
      for (const key of ['format', 'axisFormat', 'tooltipFormat'] as const) {
        if (f[key] === undefined) continue;
        // Reuse the public descriptor boundary, including Intl runtime validation.
        const validation = validateFormat(f[key]);
        if (!validation.valid)
          throw new Error(
            `${name} ${key}: ${validation.errors.map((error) => error.message).join(' ')}`,
          );
        next[key] = JSON.parse(JSON.stringify(f[key])) as SerializableFormatter;
      }
      const field: FieldDef = {
        name,
        label: name,
        type: 'quantitative',
        format: 'number',
        ...next,
      };
      for (const surface of ['value', 'axis', 'tooltip'] as const)
        makeFieldFormatter(field, { locale: result.locale, timeZone: result.timeZone, surface });
      result.fields[name] = next;
    }
  }
  return result;
}

/** Keep every raw row and row identity; display settings only override declared schema metadata. */
export function applyFormatting<R extends Row>(
  data: Dataset<R>,
  formatting?: StudioFormatting,
): Dataset<R> {
  if (!formatting?.fields || Object.keys(formatting.fields).length === 0) return data;
  return {
    ...data,
    schema: Object.fromEntries(
      Object.entries(data.schema).map(([name, field]) => [
        name,
        { ...field, ...formatting.fields?.[name] },
      ]),
    ),
  };
}
