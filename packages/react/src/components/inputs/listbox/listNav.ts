import { type RefObject, useCallback, useEffect, useRef } from 'react';

/**
 * Next enabled index from `from` in direction `dir` (+1 / -1). Stops at the ends (no wrap).
 * Returns `from` when nothing further is enabled, or -1 when nothing at all is enabled.
 */
export function stepEnabled(
  count: number,
  from: number,
  dir: 1 | -1,
  isDisabled: (i: number) => boolean,
): number {
  for (let i = from + dir; i >= 0 && i < count; i += dir) if (!isDisabled(i)) return i;
  if (from >= 0 && from < count && !isDisabled(from)) return from;
  return firstEnabled(count, dir === 1 ? 1 : -1, isDisabled);
}

/** First enabled index from the start (dir 1) or the end (dir -1); -1 if none. */
export function firstEnabled(count: number, dir: 1 | -1, isDisabled: (i: number) => boolean) {
  if (dir === 1) {
    for (let i = 0; i < count; i++) if (!isDisabled(i)) return i;
  } else {
    for (let i = count - 1; i >= 0; i--) if (!isDisabled(i)) return i;
  }
  return -1;
}

/**
 * Type-ahead: the next enabled item whose label starts with `query` (case-insensitive), searching
 * after `from` and wrapping. A query of one repeated letter ("ccc") cycles through items starting
 * with that letter. Returns -1 when nothing matches.
 */
export function typeaheadIndex(
  labels: string[],
  query: string,
  from: number,
  isDisabled: (i: number) => boolean,
): number {
  const q = query.toLowerCase();
  if (!q) return -1;
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  const needle = repeated ? q[0] : q;
  // A longer query keeps the current match if it still fits; a single letter moves on.
  const start = needle.length > 1 ? Math.max(from, 0) : from + 1;
  const n = labels.length;
  for (let k = 0; k < n; k++) {
    const i = (((start + k) % n) + n) % n;
    if (!isDisabled(i) && labels[i].toLowerCase().startsWith(needle)) return i;
  }
  return -1;
}

/** Accumulates keystrokes into a type-ahead query that resets after `delay` ms of quiet. */
export function useTypeahead(delay = 500) {
  const buffer = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const push = useCallback(
    (key: string) => {
      buffer.current += key;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        buffer.current = '';
      }, delay);
      return buffer.current;
    },
    [delay],
  );
  const active = useCallback(() => buffer.current.length > 0, []);
  return { push, active };
}

/** True for a single printable character without Ctrl/Meta/Alt. */
export function isPrintableKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}) {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * Scrolls `container` so the child at `[data-index="index"]` is visible, without scrolling the page
 * (Element.scrollIntoView would also scroll every scrollable ancestor).
 */
export function useScrollActiveIntoView(
  container: RefObject<HTMLElement | null>,
  index: number,
  enabled: boolean,
) {
  useEffect(() => {
    const box = container.current;
    if (!enabled || !box || index < 0) return;
    const el = box.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight + 4;
  }, [container, index, enabled]);
}
