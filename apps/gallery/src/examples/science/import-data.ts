import type { FieldOverride, Row } from '@quartile/react';

export const IMPORT_LIMITS = { bytes: 5_000_000, rows: 10_000, fields: 64 } as const;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype', '_quartile_row']);
const TYPES = new Set(['quantitative', 'nominal', 'temporal', 'boolean']);
const FORMATS = new Set([
  'text',
  'number',
  'integer',
  'compact',
  'currency',
  'currency-compact',
  'percent',
  'pt',
  'date',
  'date-short',
  'month',
  'weekday',
  'datetime',
  'time',
]);

export interface ImportedData {
  label: string;
  rows: Row[];
  fields: Record<string, FieldOverride>;
}

/** RFC-style quoted CSV, including embedded commas, line breaks and doubled quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += character;
    } else if (character === ',' || character === '\n' || character === '\r') {
      row.push(cell);
      cell = '';
      closed = false;
      if (character !== ',') {
        if (character === '\r' && input[index + 1] === '\n') index++;
        if (row.some((value) => value !== '')) rows.push(row);
        row = [];
      }
    } else if (character === '"' && cell === '' && !closed) quoted = true;
    else {
      if (closed || character === '"')
        throw new Error('Invalid CSV quoting. Quote the entire field and double embedded quotes.');
      cell += character;
    }
    if (rows.length > IMPORT_LIMITS.rows + 1)
      throw new Error(`Import at most ${IMPORT_LIMITS.rows.toLocaleString()} rows.`);
    if (row.length >= IMPORT_LIMITS.fields)
      throw new Error(`Import at most ${IMPORT_LIMITS.fields} fields.`);
  }
  if (quoted) throw new Error('The CSV ends inside a quoted field.');
  if (cell !== '' || row.length || closed) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function checkName(name: string) {
  if (!name.trim() || name.length > 120 || RESERVED.has(name))
    throw new Error(`Unsupported field name: ${JSON.stringify(name)}.`);
}

function csvRows(text: string): Row[] {
  const [header, ...body] = parseCSV(text);
  if (!header?.length) throw new Error('The CSV needs a header and at least one data row.');
  const names = header.map((name) => name.trim());
  names.forEach(checkName);
  if (new Set(names).size !== names.length) throw new Error('CSV column names must be unique.');
  if (body.some((row) => row.length !== names.length))
    throw new Error('Every CSV row must have the same number of fields as the header.');
  // Infer a whole column, preserving identifiers with leading zeroes and mixed-type columns.
  const types = names.map((_, index) => {
    const present = body.map((row) => row[index]).filter((value) => value !== '');
    if (present.length && present.every((value) => /^(true|false)$/i.test(value))) return 'boolean';
    if (
      present.length &&
      present.every(
        (value) =>
          /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) &&
          Number.isFinite(Number(value)) &&
          (!Number.isInteger(Number(value)) || Number.isSafeInteger(Number(value))),
      )
    )
      return 'number';
    return 'text';
  });
  return body.map((values) =>
    Object.fromEntries(
      names.map((name, index) => {
        const value = values[index];
        return [
          name,
          value === ''
            ? null
            : types[index] === 'number'
              ? Number(value)
              : types[index] === 'boolean'
                ? value.toLowerCase() === 'true'
                : value,
        ];
      }),
    ),
  );
}

export function parseDatasetText(text: string, filename: string): ImportedData {
  if (new TextEncoder().encode(text).byteLength > IMPORT_LIMITS.bytes)
    throw new Error('Import a file smaller than 5 MB.');
  let raw: unknown;
  let metadata: unknown;
  let label = filename;
  if (filename.toLowerCase().endsWith('.csv')) raw = csvRows(text);
  else {
    const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (Array.isArray(parsed)) raw = parsed;
    else if (parsed && typeof parsed === 'object') {
      const document = parsed as Record<string, unknown>;
      raw = document.rows;
      metadata = document.fields ?? document.schema;
      if (typeof document.label === 'string') label = document.label.slice(0, 120);
    }
  }
  if (!Array.isArray(raw) || !raw.length)
    throw new Error('Provide a non-empty row array, or a JSON object with a rows array.');
  if (raw.length > IMPORT_LIMITS.rows)
    throw new Error(`Import at most ${IMPORT_LIMITS.rows.toLocaleString()} rows.`);
  const names = new Set<string>();
  const rows: Row[] = raw.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Row ${index + 1} must be an object.`);
    const entries = Object.entries(value);
    for (const [name, cell] of entries) {
      checkName(name);
      names.add(name);
      if (cell !== null && !['string', 'boolean', 'number'].includes(typeof cell))
        throw new Error(
          `Row ${index + 1}, ${name}: use scalar values or null, not nested objects.`,
        );
      if (typeof cell === 'number' && !Number.isFinite(cell))
        throw new Error(`Row ${index + 1}, ${name}: use null for non-finite numbers.`);
      if (typeof cell === 'number' && Number.isInteger(cell) && !Number.isSafeInteger(cell))
        throw new Error(
          `Row ${index + 1}, ${name}: integers outside JavaScript's safe range must be strings.`,
        );
    }
    return Object.fromEntries([...entries, ['_quartile_row', `row-${index + 1}`]]);
  });
  if (!names.size || names.size > IMPORT_LIMITS.fields)
    throw new Error(`Provide between 1 and ${IMPORT_LIMITS.fields} fields.`);
  const fields: Record<string, FieldOverride> = {};
  if (metadata !== undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
      throw new Error('Field metadata must be an object keyed by field name.');
    for (const [name, value] of Object.entries(metadata)) {
      checkName(name);
      if (!names.has(name)) throw new Error(`Metadata refers to unknown field ${name}.`);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error(`Invalid metadata for ${name}.`);
      const definition = value as Record<string, unknown>;
      const field: Exclude<FieldOverride, string> = {};
      if (definition.type !== undefined) {
        if (typeof definition.type !== 'string' || !TYPES.has(definition.type))
          throw new Error(`Unsupported type for ${name}.`);
        field.type = definition.type as typeof field.type;
      }
      if (definition.label !== undefined) {
        if (typeof definition.label !== 'string' || definition.label.length > 120)
          throw new Error(`Invalid label for ${name}.`);
        field.label = definition.label;
      }
      if (definition.format !== undefined) {
        if (typeof definition.format !== 'string' || !FORMATS.has(definition.format))
          throw new Error(`Unsupported format for ${name}.`);
        field.format = definition.format as typeof field.format;
      }
      for (const key of ['currency', 'unit'] as const)
        if (definition[key] !== undefined) {
          if (typeof definition[key] !== 'string' || definition[key].length > 32)
            throw new Error(`Invalid ${key} for ${name}.`);
          if (key === 'currency' && !/^[A-Za-z]{3}$/.test(definition[key]))
            throw new Error(`Currency for ${name} must be a three-letter code.`);
          field[key] = definition[key];
        }
      fields[name] = field;
    }
  }
  return { label, rows, fields };
}
