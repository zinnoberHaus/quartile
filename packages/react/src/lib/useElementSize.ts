import { type RefObject, useLayoutEffect, useState } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? () => {} : useLayoutEffect;

/** Tracks an element's content box. Returns 0 × 0 until mounted (and during SSR). */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        Math.round(s.width) === Math.round(r.width) && Math.round(s.height) === Math.round(r.height)
          ? s
          : { width: r.width, height: r.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
