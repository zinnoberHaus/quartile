import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useQuartile } from '../provider/QuartileProvider';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Renders children into the provider's portal layer (so overlays inherit the theme and density),
 * falling back to document.body outside a provider.
 */
export function Portal({ children }: { children: ReactNode }) {
  const { portalContainer } = useQuartile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const target = portalContainer ?? document.body;
  return createPortal(
    portalContainer ? children : <div className="q-portal">{children}</div>,
    target,
  );
}

export type Placement =
  | 'bottom-start'
  | 'bottom'
  | 'bottom-end'
  | 'top-start'
  | 'top'
  | 'top-end'
  | 'right-start'
  | 'left-start';

export interface FloatingOptions {
  open: boolean;
  placement?: Placement;
  /** Gap between anchor and floating element, px. */
  offset?: number;
  /** Match the anchor's width (selects, comboboxes). */
  matchWidth?: boolean;
}

/**
 * Positions `floating` next to `anchor` with fixed positioning, flipping to the other side when it
 * would overflow the viewport. Re-positions on scroll and resize.
 */
export function useFloating(
  anchor: RefObject<HTMLElement | null>,
  floating: RefObject<HTMLElement | null>,
  { open, placement = 'bottom-start', offset = 6, matchWidth = false }: FloatingOptions,
) {
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
  });
  const [side, setSide] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');

  const update = useCallback(() => {
    const a = anchor.current;
    const f = floating.current;
    if (!a || !f) return;
    const ar = a.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const [main, align = 'center'] = placement.split('-') as [string, string?];
    let top = 0;
    let left = 0;
    let finalSide = main as 'top' | 'bottom' | 'left' | 'right';
    if (main === 'bottom' || main === 'top') {
      const below = ar.bottom + offset;
      const above = ar.top - offset - fr.height;
      if (main === 'bottom') {
        top = below + fr.height > vh - 8 && above > 8 ? above : below;
        finalSide = top === below ? 'bottom' : 'top';
      } else {
        top = above < 8 && below + fr.height < vh - 8 ? below : above;
        finalSide = top === above ? 'top' : 'bottom';
      }
      const w = matchWidth ? ar.width : fr.width;
      left =
        align === 'start'
          ? ar.left
          : align === 'end'
            ? ar.right - w
            : ar.left + ar.width / 2 - w / 2;
      left = Math.max(8, Math.min(left, vw - w - 8));
    } else {
      const right = ar.right + offset;
      const leftPos = ar.left - offset - fr.width;
      left =
        main === 'right'
          ? right + fr.width > vw - 8 && leftPos > 8
            ? leftPos
            : right
          : leftPos < 8
            ? right
            : leftPos;
      finalSide = left === right ? 'right' : 'left';
      top = Math.max(8, Math.min(ar.top, vh - fr.height - 8));
    }
    setSide(finalSide);
    setStyle({
      position: 'fixed',
      top: Math.round(top),
      left: Math.round(left),
      width: matchWidth ? ar.width : undefined,
      visibility: 'visible',
    });
  }, [anchor, floating, placement, offset, matchWidth]);

  useIsoLayoutEffect(() => {
    if (!open) return;
    // A <Portal> mounts its content a render after the caller, so the floating element may not
    // exist yet. Retry each frame until both elements are present, then track their sizes.
    let raf = 0;
    let tries = 0;
    let ro: ResizeObserver | null = null;
    const attach = () => {
      const a = anchor.current;
      const f = floating.current;
      if (!a || !f) {
        if (tries++ < 60) raf = requestAnimationFrame(attach);
        return;
      }
      update();
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(update);
        ro.observe(f);
        ro.observe(a);
      }
    };
    attach();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, update]);

  return { style, side, update };
}

/** Closes on outside pointerdown and on Escape. Pass every element that counts as "inside". */
export function useDismiss(
  open: boolean,
  onDismiss: () => void,
  refs: RefObject<HTMLElement | null>[],
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable ref objects
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onDismiss]);
}
