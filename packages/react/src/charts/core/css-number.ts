import { type RefObject, useEffect, useState } from 'react';

/**
 * A length token read from the element's computed style, in px, for geometry that is computed in
 * script and so cannot follow a CSS variable by itself (a bar's corner radius is part of its
 * path). Returns `fallback` on the server and until the element mounts, then the token's value;
 * `revision` re-reads it, e.g. when the theme changes.
 */
export function useCssNumber(
  ref: RefObject<Element | null>,
  property: string,
  fallback: number,
  revision?: unknown,
): number {
  const [value, setValue] = useState(fallback);
  // `revision` is a trigger only: the effect reads the live style, not the value itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof getComputedStyle !== 'function') return;
    const n = Number.parseFloat(getComputedStyle(el).getPropertyValue(property));
    setValue(Number.isFinite(n) && n >= 0 ? n : fallback);
  }, [ref, property, fallback, revision]);
  return value;
}
