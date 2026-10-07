import { type ReactElement, type Ref, type RefCallback, version } from 'react';

const REACT_MAJOR = Number.parseInt(version, 10);

/** Combines refs into one callback ref. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value);
      else if (ref && typeof ref === 'object') (ref as { current: T | null }).current = value;
    }
  };
}

/** Reads the ref a child element was created with (a prop in React 19, a field before). */
export function getElementRef<T>(element: ReactElement): Ref<T> | undefined {
  if (REACT_MAJOR >= 19) return (element.props as { ref?: Ref<T> }).ref;
  return (element as unknown as { ref?: Ref<T> }).ref;
}

type AnyHandler = ((event: never) => void) | undefined;

/** Calls the child's own handler first, then ours, unless the child prevented default. */
export function chain<E extends { defaultPrevented?: boolean }>(
  theirs: AnyHandler,
  ours: (event: E) => void,
) {
  return (event: E) => {
    (theirs as ((event: E) => void) | undefined)?.(event);
    if (!event.defaultPrevented) ours(event);
  };
}
