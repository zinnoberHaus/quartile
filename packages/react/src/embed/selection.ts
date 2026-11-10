/**
 * Selections on an embedded page: a handle page scripts use to read and set a group by name,
 * and the bookkeeping that tells which element a reader acted in.
 */
import type { Predicate } from '../data/predicates';
import { type SelectionHandle, selectionHandle } from '../selection/handle';
import { type SelectionChange, SelectionStore } from '../selection/store';
import { pageScope } from './scope';

export type { SelectionHandle };

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
  return selectionHandle(group, pageScope().store);
}

/** Names of the page's selection groups, in the order they were first used. */
export function embedGroups(): string[] {
  return pageScope().groups();
}
