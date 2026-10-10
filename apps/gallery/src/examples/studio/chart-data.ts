import { type Dataset, type Row, type Schema, toComparable } from '@quartile/react';

/** Studio lines represent observations, so duplicate X/series groups require explicit preparation. */
export function lineDataError(data: Dataset<Row>, x: string, color?: string): string | null {
  const seen = new Map<unknown, Set<unknown>>();
  for (const row of data.rows) {
    const value = toComparable(row[x]);
    if (value == null) continue;
    const group = color ? String(row[color]) : null;
    const values = seen.get(group) ?? new Set<unknown>();
    if (values.has(value))
      return 'Multiple records share an X / series value. Choose a series that separates the observations, or aggregate your source explicitly before plotting.';
    values.add(value);
    seen.set(group, values);
  }
  return null;
}

interface ViewBinding {
  type: string;
  x?: string;
  y?: string;
  color?: string;
  aggregate?: string;
  columns?: string[];
}

export function blockError<B extends ViewBinding>(block: B, schema: Schema): string | null {
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

/** Validate the live response before rendering a view, including after API schema changes. */
export function blockDataError<B extends ViewBinding>(data: Dataset<Row>, block: B): string | null {
  return (
    blockError(block, data.schema) ||
    (block.type === 'line' ? lineDataError(data, block.x!, block.color) : null)
  );
}
