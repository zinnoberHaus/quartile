import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { applyPredicates, type Predicate, type Primitive } from '../data/predicates';
import type { Row } from '../data/types';
import { AppliedPredicatesContext } from './appliedPredicates';
import {
  getRegistryVersion,
  getStore,
  registerStore,
  type SelectionEvent,
  SelectionStore,
  type SetOptions,
  subscribeRegistry,
} from './store';

const SelectionContext = createContext<SelectionStore | null>(null);

export interface SelectionProps {
  /** Name other components can address with useSelection(id). Defaults to a generated id. */
  id?: string;
  /** Called after every change with the full predicate list and the event that caused it. */
  onChange?: (predicates: Predicate[], event: SelectionEvent) => void;
  children?: ReactNode;
}

/**
 * Links every chart, table and control inside it. Brushes, clicks and filters publish predicates;
 * every view re-filters by all predicates except its own.
 */
export function Selection({ id, onChange, children }: SelectionProps) {
  const generated = useId();
  const storeId = id ?? `selection${generated}`;
  const [store] = useState(() => new SelectionStore(storeId));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => registerStore(store), [store]);
  useEffect(() => store.onEvent((e) => onChangeRef.current?.(store.getSnapshot(), e)), [store]);
  return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}

const EMPTY: Predicate[] = [];
const noop = () => () => {};

/** The store for `id`, or the nearest <Selection> when `id` is omitted. */
export function useSelectionStore(id?: string): SelectionStore | null {
  const nearest = useContext(SelectionContext);
  useSyncExternalStore(id ? subscribeRegistry : noop, getRegistryVersion, getRegistryVersion);
  if (id) return nearest?.id === id ? nearest : (getStore(id) ?? null);
  return nearest;
}

export interface SelectionApi {
  /** Store id, or null when there is no enclosing Selection. */
  id: string | null;
  predicates: Predicate[];
  get(field: string): Predicate | undefined;
  set(
    field: string,
    value: Primitive | Primitive[] | [Primitive, Primitive] | undefined,
    opts?: SetOptions,
  ): void;
  toggle(
    field: string,
    value: Primitive,
    opts?: Omit<SetOptions, 'op'> & { multiple?: boolean },
  ): void;
  clear(field?: string): void;
  /** Rows matching every predicate, optionally excluding those published by `exceptSource`. */
  filter<R extends Row>(rows: readonly R[], exceptSource?: string): R[];
}

/** Reads and writes the shared selection. Re-renders when it changes. */
export function useSelection(id?: string): SelectionApi {
  const store = useSelectionStore(id);
  const predicates = useSyncExternalStore(
    store ? store.subscribe : noop,
    store ? store.getSnapshot : () => EMPTY,
    store ? store.getSnapshot : () => EMPTY,
  );
  return useMemo<SelectionApi>(
    () => ({
      id: store?.id ?? null,
      predicates,
      get: (field) => store?.get(field),
      set: (field, value, opts) => store?.set(field, value, opts),
      toggle: (field, value, opts) => store?.toggle(field, value, opts),
      clear: (field) => store?.clear(field),
      filter: (rows, exceptSource) =>
        applyPredicates(
          rows,
          exceptSource ? predicates.filter((p) => p.source !== exceptSource) : predicates,
        ),
    }),
    [store, predicates],
  );
}

/** A stable id identifying one component as a selection publisher. */
export function useSourceId(explicit?: string): string {
  const generated = useId();
  return explicit ?? `q${generated.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export interface LinkedDataOptions {
  /** Selection id to read from; defaults to the nearest <Selection>. Pass false to opt out. */
  selection?: string | false;
  /** This component's publisher id; its own predicates are not applied to it. */
  source: string;
}

/**
 * The standard way a data component reads data: rows filtered by every predicate in the
 * selection except the ones this component published.
 */
export function useLinkedRows<R extends Row>(
  rows: readonly R[],
  { selection, source }: LinkedDataOptions,
) {
  const api = useSelection(selection === false ? '__none__' : selection);
  const applied = useContext(AppliedPredicatesContext);
  const active = selection !== false && api.id !== null;
  const filtered = useMemo(
    () =>
      active
        ? applyPredicates(
            rows,
            api.predicates.filter((p) => p.source !== source && !applied.has(p)),
          )
        : (rows as R[]),
    [active, api, rows, source, applied],
  );
  return { rows: filtered, selection: active ? api : null };
}
