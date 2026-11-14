import { useEffect, useRef } from 'react';
import { useSelectionStore } from './Selection';
import type { SelectionChange, SelectionEvent } from './store';

/**
 * Reports every change of the nearest selection store; renders nothing. `group` names the store
 * in the report and defaults to the store's id. The event is the store's own object, so a caller
 * watching one store from several places can tell repeated reports of one change apart.
 */
export function SelectionWatch({
  group,
  onChange,
}: {
  group?: string;
  onChange: (change: SelectionChange, event: SelectionEvent) => void;
}) {
  const store = useSelectionStore();
  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    if (!store) return;
    return store.onEvent((event) =>
      report.current({ group: group ?? store.id, predicates: [...store.getSnapshot()] }, event),
    );
  }, [store, group]);
  return null;
}
