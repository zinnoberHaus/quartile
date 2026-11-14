import { type PointerEvent, useRef, useState } from 'react';
import type { Predicate, Primitive } from '../../data/predicates';
import type { SelectionApi } from '../../selection/Selection';

export interface RangeBrushOptions {
  /** Dragging publishes only while this is true. Defaults to true. */
  enabled?: boolean;
  /** Called with the published range, or null when it is cleared. */
  onSelect?: (predicate: Predicate | null) => void;
}

/**
 * Drag-to-select a range of one field, as LineChart and AreaChart do it. The range is published
 * to the Selection as a `between` predicate owned by `source`, so the chart that brushed is not
 * filtered by its own range while its siblings are.
 *
 * `handlers(x0, x1, valueAt)` returns pointer handlers for the element covering the plot: `x0`
 * and `x1` bound the plot in px and `valueAt` maps a pixel to the value to publish. A drag
 * shorter than 4px is a click and clears the range.
 */
export function useRangeBrush(
  sel: SelectionApi | null,
  field: string,
  source: string,
  { enabled = true, onSelect }: RangeBrushOptions = {},
) {
  const predicate = sel?.get(field);
  /** The range this chart published, as opposed to a filter on the field from elsewhere. */
  const own = predicate?.source === source && predicate.op === 'between' ? predicate : null;
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const start = useRef<number | null>(null);

  const select = (next: Predicate | null) => {
    if (next) sel?.set(field, next.value as never, { op: next.op, source });
    else sel?.clear(field);
    onSelect?.(next);
  };

  const handlers = (x0: number, x1: number, valueAt: (px: number) => unknown) => {
    const at = (e: PointerEvent<Element>) => {
      const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
      return Math.max(x0, Math.min(x1, x));
    };
    return {
      onPointerDown: (e: PointerEvent<Element>) => {
        if (!enabled) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture is best-effort (unsupported in some test environments).
        }
        start.current = at(e);
        setDrag(null);
      },
      onPointerMove: (e: PointerEvent<Element>) => {
        if (start.current != null) setDrag({ a: start.current, b: at(e) });
      },
      onPointerUp: (e: PointerEvent<Element>) => {
        if (!enabled || start.current == null) return;
        const a = start.current;
        const b = at(e);
        start.current = null;
        setDrag(null);
        if (Math.abs(b - a) < 4) {
          select(null);
          return;
        }
        select({
          field,
          op: 'between',
          value: [valueAt(Math.min(a, b)) as Primitive, valueAt(Math.max(a, b)) as Primitive],
          source,
        });
      },
    };
  };

  return {
    /** The published range `[from, to]`, or null. */
    range: own ? own.value : null,
    /** The pixel extent being dragged, or null: draw this while the pointer is down. */
    drag,
    /** Publishes a range (or any predicate on the field), or clears it with null. */
    select,
    handlers,
  };
}
