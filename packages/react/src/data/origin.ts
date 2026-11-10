import { resolveData } from './schema';
import type { DataInput, Row, Schema } from './types';

/**
 * A view may be drawn from a working copy of its dataset: the same rows with helper columns
 * (a count of ones, an order for categories) and the view's own field settings. The copy
 * remembers the dataset it was made from, so "the rows behind this chart" are the author's rows.
 * Held weakly and in memory only: a copy that crosses a serialization boundary is its own origin.
 */
const origins = new WeakMap<object, DataInput>();

/** Records that `copy` was derived from `origin`. Returns `copy`. */
export function derivedFrom<T extends object>(copy: T, origin: DataInput): T {
  origins.set(copy, origin);
  return copy;
}

/**
 * The rows a view is drawn from: the origin's rows and columns, described by the view's field
 * settings where it has any.
 */
export function sourceRows(input: DataInput | undefined): { rows: Row[]; schema: Schema } {
  const view = resolveData(input);
  const origin =
    typeof input === 'object' && input !== null ? origins.get(input as object) : undefined;
  if (!origin) return view;
  const base = resolveData(origin);
  const schema: Schema = {};
  for (const name of Object.keys(base.schema))
    schema[name] = view.schema[name] ?? base.schema[name];
  return { rows: base.rows, schema };
}
