import type { Predicate, Primitive } from '../data/predicates';
import type { SelectionStore, SetOptions } from './store';

/**
 * Reads and writes one selection group by name: what a host holds to set, clear or watch a
 * selection from outside the views, on an embedded page or through a document's ref.
 */
export interface SelectionHandle {
  /** The predicates now active in the group. */
  get(): Predicate[];
  /**
   * Selects on `field`: one value (`eq`), several values (`in`), or `[min, max]` with
   * `{ op: 'between' }`. `null`, `undefined` or an empty list clears the field.
   */
  set(
    field: string,
    value: Primitive | Primitive[] | [Primitive, Primitive] | undefined,
    options?: SetOptions,
  ): void;
  /** Clears one field, or the whole group. */
  clear(field?: string): void;
  /** Calls `listener` after every change of the group. Returns a function that stops it. */
  subscribe(listener: (predicates: Predicate[]) => void): () => void;
}

/**
 * A handle on the group `group`, whose store `lookup` returns. A group exists from its first
 * use, so a host may select before the views that share it have rendered.
 */
export function selectionHandle(
  group: string,
  lookup: (group: string) => SelectionStore,
): SelectionHandle {
  if (typeof group !== 'string' || group === '') {
    throw new TypeError('A selection group is named by a non-empty string.');
  }
  const store = lookup(group);
  return {
    get: () => [...store.getSnapshot()],
    set: (field, value, options) => {
      if (typeof field !== 'string' || field === '') {
        throw new TypeError('A selection is set on a field name.');
      }
      if (options?.op === 'between' && !(Array.isArray(value) && value.length === 2)) {
        throw new TypeError('A “between” selection needs [min, max].');
      }
      store.set(field, value, options);
    },
    clear: (field) => store.clear(field),
    subscribe: (listener) => store.onEvent(() => listener([...store.getSnapshot()])),
  };
}
