import { type Dataset, type Row, toComparable } from '@quartile/react';

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
