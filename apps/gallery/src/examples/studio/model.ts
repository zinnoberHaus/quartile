import type { Schema } from '@quartile/react';
import { type SourceConfig, type SourceId, sourcePresets, validateSourceConfig } from './sources';

export const blockTypes = ['metric', 'line', 'bar', 'scatter', 'histogram', 'table'] as const;
export type BlockType = (typeof blockTypes)[number];
export interface StudioBlock {
  id: string;
  type: BlockType;
  title: string;
  span: 6 | 12;
  x?: string;
  y?: string;
  color?: string;
  aggregate?: 'count' | 'mean' | 'sum';
  columns?: string[];
}
export interface StudioProject {
  version: 1;
  name: string;
  source: SourceConfig;
  blocks: StudioBlock[];
}
export const projectLimit = 64 * 1024;
export const draftKey = 'quartile-studio-project-v1';
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`${label} must be a JSON object.`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(`Unknown ${label.toLowerCase()} property.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 120): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new Error(`${label} must contain 1–${max} characters.`);
  return value;
}
function field(value: unknown): string {
  const name = text(value, 'Field', 128);
  if (forbidden.has(name)) throw new Error('Unsafe field name.');
  return name;
}

/** Portable configuration only: no records, credentials, JSX, or executable expressions. */
export function parseProject(input: unknown): StudioProject {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > projectLimit)
      throw new Error('Project exceeds 64 KiB.');
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error('Project is not valid JSON.');
    }
  }
  const p = object(input, ['version', 'name', 'source', 'blocks'], 'Project');
  if (p.version !== 1) throw new Error('Unsupported project version. Expected version 1.');
  if (!Array.isArray(p.blocks) || p.blocks.length > 16)
    throw new Error('A project supports up to 16 components.');
  const ids = new Set<string>();
  const blocks = p.blocks.map((value) => {
    const b = object(
      value,
      ['id', 'type', 'title', 'span', 'x', 'y', 'color', 'aggregate', 'columns'],
      'Component',
    );
    const id = text(b.id, 'Component ID', 64);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      throw new Error('Component IDs must be unique letters, numbers, hyphens, or underscores.');
    ids.add(id);
    if (!blockTypes.includes(b.type as BlockType)) throw new Error('Unknown component type.');
    if (b.span !== 6 && b.span !== 12) throw new Error('Component width must be 6 or 12.');
    const block: StudioBlock = {
      id,
      type: b.type as BlockType,
      title: text(b.title, 'Component title'),
      span: b.span,
    };
    for (const key of ['x', 'y', 'color'] as const)
      if (b[key] !== undefined) block[key] = field(b[key]);
    if (b.aggregate !== undefined) {
      if (!['count', 'mean', 'sum'].includes(b.aggregate as string))
        throw new Error('Unknown metric aggregation.');
      block.aggregate = b.aggregate as StudioBlock['aggregate'];
    }
    if (b.columns !== undefined) {
      if (!Array.isArray(b.columns) || b.columns.length < 1 || b.columns.length > 64)
        throw new Error('Tables need 1–64 fields.');
      block.columns = b.columns.map(field);
      if (new Set(block.columns).size !== block.columns.length)
        throw new Error('Duplicate table fields.');
    }
    const allowed =
      block.type === 'metric'
        ? ['y', 'aggregate']
        : block.type === 'table'
          ? ['columns']
          : block.type === 'histogram'
            ? ['x']
            : ['x', 'y', 'color'];
    if (
      ['x', 'y', 'color', 'aggregate', 'columns'].some(
        (key) => b[key] !== undefined && !allowed.includes(key),
      )
    )
      throw new Error(`Unsupported field setting for ${block.type}.`);
    return block;
  });
  const result: StudioProject = {
    version: 1,
    name: text(p.name, 'Project name'),
    source: validateSourceConfig(p.source),
    blocks,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > projectLimit)
    throw new Error('Project exceeds 64 KiB.');
  return result;
}

export function blockError(block: StudioBlock, schema: Schema): string | null {
  const required = (key: string | undefined, types?: string[]) => {
    if (!key || !Object.hasOwn(schema, key)) return 'Choose a field from the loaded source.';
    if (types && !types.includes(schema[key].type))
      return `${schema[key].label} needs a ${types.join(' or ')} field here.`;
    return null;
  };
  if (block.type === 'table')
    return !block.columns?.length
      ? 'Choose at least one table field.'
      : (block.columns.map((c) => required(c)).find(Boolean) ?? null);
  if (block.type === 'metric')
    return block.aggregate === 'count' ? null : required(block.y, ['quantitative']);
  const xTypes =
    block.type === 'bar'
      ? undefined
      : block.type === 'histogram' || block.type === 'scatter'
        ? ['quantitative']
        : ['temporal', 'quantitative'];
  return (
    required(block.x, xTypes) ||
    (block.type !== 'histogram' && required(block.y, ['quantitative'])) ||
    (block.color && required(block.color, ['nominal', 'boolean'])) ||
    null
  );
}

export function createBlock(type: BlockType, schema: Schema, id: string): StudioBlock {
  const fields = Object.values(schema);
  const numbers = fields.filter((f) => f.type === 'quantitative');
  const category = fields.find((f) => f.type === 'nominal' || f.type === 'boolean');
  const base = {
    id,
    type,
    title: {
      metric: 'Record count',
      line: 'Trend over time',
      bar: 'Totals by category',
      scatter: 'Explore a relationship',
      histogram: 'Value distribution',
      table: 'Inspect the records',
    }[type],
    span: type === 'table' ? (12 as const) : (6 as const),
  };
  if (type === 'metric') return { ...base, aggregate: 'count' };
  if (type === 'table') return { ...base, columns: fields.slice(0, 8).map((f) => f.name) };
  if (type === 'histogram') return { ...base, x: numbers[0]?.name };
  return {
    ...base,
    x: (type === 'bar'
      ? category
      : type === 'line'
        ? (fields.find((f) => f.type === 'temporal') ?? numbers[0])
        : numbers[0]
    )?.name,
    y: numbers[type === 'scatter' ? 1 : 0]?.name ?? numbers[0]?.name,
    ...(type === 'line' && category ? { color: category.name } : {}),
  };
}

export function presetProject(id: Exclude<SourceId, 'custom'>): StudioProject {
  const preset = sourcePresets.find((p) => p.id === id)!;
  const { x, y, category } = preset.defaults;
  return {
    version: 1,
    name: preset.label,
    source: { kind: id },
    blocks: [
      {
        id: 'records',
        type: 'metric',
        title:
          id === 'weather'
            ? 'Forecast hours'
            : id === 'earthquakes'
              ? 'Reported events'
              : 'Country-year records',
        span: 6,
        aggregate: 'count',
      },
      {
        id: 'average',
        type: 'metric',
        title:
          id === 'weather'
            ? 'Mean temperature · °C'
            : id === 'earthquakes'
              ? 'Mean depth · km'
              : 'Unweighted mean · years',
        span: 6,
        aggregate: 'mean',
        y: id === 'earthquakes' ? 'depthKm' : y,
      },
      {
        id: 'trend',
        type: id === 'earthquakes' ? 'scatter' : 'line',
        title:
          id === 'weather'
            ? 'Temperature · °C'
            : id === 'earthquakes'
              ? 'Depth · km × magnitude'
              : 'Life expectancy · years',
        span: 12,
        x,
        y,
        color: category,
      },
      {
        id: 'distribution',
        type: 'histogram',
        title:
          id === 'weather'
            ? 'Wind speed distribution · km/h'
            : id === 'earthquakes'
              ? 'Magnitude distribution'
              : 'Life expectancy distribution · years',
        span: 12,
        x: id === 'weather' ? 'windSpeedKmh' : y,
      },
      {
        ...createBlock('table', preset.fields, 'records-table'),
        columns: Object.keys(preset.fields),
      },
    ],
  };
}
