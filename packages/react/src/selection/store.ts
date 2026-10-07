import type { Predicate, Primitive } from '../data/predicates';

export interface SelectionEvent {
  type: 'set' | 'clear';
  field: string | null;
  predicate?: Predicate;
  source?: string;
  at: number;
}

export interface SetOptions {
  /** Defaults to "eq" for a scalar, "in" for an array of values. */
  op?: Predicate['op'];
  source?: string;
  label?: string;
}

type Listener = () => void;
type EventListener = (e: SelectionEvent) => void;

/**
 * The shared selection: publishers write predicates (one per field), the store combines them,
 * subscribers re-query. Framework-agnostic; React binds to it with useSyncExternalStore.
 */
export class SelectionStore {
  readonly id: string;
  private byField = new Map<string, Predicate>();
  private snapshot: Predicate[] = [];
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();

  constructor(id: string) {
    this.id = id;
  }

  getSnapshot = (): Predicate[] => this.snapshot;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  get(field: string): Predicate | undefined {
    return this.byField.get(field);
  }

  /** Publishes a predicate for `field`. `null`, `undefined` or an empty array clears it. */
  set(
    field: string,
    value: Primitive | Primitive[] | [Primitive, Primitive] | undefined,
    opts: SetOptions = {},
  ) {
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      this.clear(field);
      return;
    }
    const op = opts.op ?? (Array.isArray(value) ? 'in' : 'eq');
    const predicate = { field, op, value, source: opts.source, label: opts.label } as Predicate;
    this.byField.set(field, predicate);
    this.commit({ type: 'set', field, predicate, source: opts.source, at: Date.now() });
  }

  /** Adds or removes one value from an "in" predicate; used by click-to-select. */
  toggle(
    field: string,
    value: Primitive,
    opts: Omit<SetOptions, 'op'> & { multiple?: boolean } = {},
  ) {
    const cur = this.byField.get(field);
    const values: Primitive[] =
      cur?.op === 'in' ? [...cur.value] : cur?.op === 'eq' ? [cur.value] : [];
    const key = value instanceof Date ? value.getTime() : value;
    const has = values.some((v) => (v instanceof Date ? v.getTime() : v) === key);
    const next = has
      ? values.filter((v) => (v instanceof Date ? v.getTime() : v) !== key)
      : opts.multiple
        ? [...values, value]
        : [value];
    this.set(field, next, { ...opts, op: 'in' });
  }

  /** Clears one field, or everything. */
  clear(field?: string) {
    if (field === undefined) {
      if (this.byField.size === 0) return;
      this.byField.clear();
    } else if (!this.byField.delete(field)) return;
    this.commit({ type: 'clear', field: field ?? null, at: Date.now() });
  }

  private commit(e: SelectionEvent) {
    this.snapshot = [...this.byField.values()];
    for (const l of this.listeners) l();
    for (const l of this.eventListeners) l(e);
  }
}

/** Global registry, so useSelection('orders') works anywhere once <Selection id="orders"> mounts. */
const registry = new Map<string, SelectionStore>();
const registryListeners = new Set<Listener>();
let registryVersion = 0;

export function registerStore(store: SelectionStore) {
  registry.set(store.id, store);
  registryVersion++;
  for (const l of registryListeners) l();
  return () => {
    if (registry.get(store.id) === store) {
      registry.delete(store.id);
      registryVersion++;
      for (const l of registryListeners) l();
    }
  };
}

export function getStore(id: string) {
  return registry.get(id);
}

export function subscribeRegistry(fn: Listener) {
  registryListeners.add(fn);
  return () => registryListeners.delete(fn);
}

export function getRegistryVersion() {
  return registryVersion;
}
