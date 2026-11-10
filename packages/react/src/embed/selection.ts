/**
 * Selections on an embedded page: a handle page scripts use to read and set a group by name,
 * and the bookkeeping that tells which element a reader acted in.
 */
import type { Predicate, Primitive } from '../data/predicates';
import { type SelectionChange, SelectionStore, type SetOptions } from '../selection/store';
import { pageScope } from './scope';

/** Reads and writes one selection group of the page by name. */
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

/** `detail` of the `quartile-select` event a `<quartile-chart>` dispatches. */
export interface QuartileSelectDetail extends SelectionChange {
  /**
   * True on the one element where the reader made the change. False on the other elements of
   * the group, and on every element when the change came from script.
   */
  origin: boolean;
}

let actor: object | null = null;

/** The element whose reader is changing a selection right now; null for changes from script. */
export function actingElement(): object | null {
  return actor;
}

/**
 * One element's view of a page store: the same selection, with every write attributed to the
 * element while it runs. Reads and subscriptions go straight to the shared store.
 */
class ElementStore extends SelectionStore {
  constructor(
    id: string,
    private readonly shared: SelectionStore,
    private readonly element: object,
  ) {
    super(id);
  }

  override getSnapshot = (): Predicate[] => this.shared.getSnapshot();

  override subscribe = (fn: () => void): (() => void) => this.shared.subscribe(fn);

  override onEvent(fn: Parameters<SelectionStore['onEvent']>[0]): () => void {
    return this.shared.onEvent(fn);
  }

  override get(field: string): Predicate | undefined {
    return this.shared.get(field);
  }

  override set(...args: Parameters<SelectionStore['set']>) {
    this.act(() => this.shared.set(...args));
  }

  override toggle(...args: Parameters<SelectionStore['toggle']>) {
    this.act(() => this.shared.toggle(...args));
  }

  override clear(field?: string) {
    this.act(() => this.shared.clear(field));
  }

  private act(write: () => void) {
    const previous = actor;
    actor = this.element;
    try {
      write();
    } finally {
      actor = previous;
    }
  }
}

/** The page store of `group` as `element` uses it. `id` replaces the id components may print. */
export function elementStore(group: string, element: object, id?: string): SelectionStore {
  const shared = pageScope().store(group);
  return new ElementStore(id ?? shared.id, shared, element);
}

/**
 * The page's selection group `group`, for scripts: read it, set it, clear it, or subscribe.
 * A group exists from its first use, so a page may select before its charts have loaded.
 */
export function embedSelection(group: string): SelectionHandle {
  if (typeof group !== 'string' || group === '') {
    throw new TypeError('A selection group is named by a non-empty string.');
  }
  const store = pageScope().store(group);
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

/** Names of the page's selection groups, in the order they were first used. */
export function embedGroups(): string[] {
  return pageScope().groups();
}
