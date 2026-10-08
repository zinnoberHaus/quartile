import { type KeyboardEvent, type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Tabbable descendants in DOM order, skipping hidden ones. */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && isVisible(el),
  );
}

function isVisible(el: HTMLElement) {
  // jsdom has no layout, so every element reports zero rects; treat everything as visible there.
  return isJsdom() || el.getClientRects().length > 0;
}

function isJsdom() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

let lockCount = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

/** Ref-counted body scroll lock, so nested dialogs restore the page only when the last closes. */
export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
  if (lockCount === 0) {
    const body = document.body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = 'hidden';
    if (scrollbar > 0) {
      const current = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount === 0 && saved) {
      document.body.style.overflow = saved.overflow;
      document.body.style.paddingRight = saved.paddingRight;
      saved = null;
    }
  };
}

export interface ModalOptions {
  /** Element to focus on open; defaults to the first tabbable element, then the panel. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Called on Escape. */
  onEscape?: () => void;
  /** Lock page scroll while open (default true). */
  lockScroll?: boolean;
}

/**
 * Modal behavior for a panel that is mounted while `open`: remembers what had focus when it
 * opened, moves focus in once the panel mounts, keeps Tab inside, closes on Escape, locks page
 * scroll, and returns focus on close. Pass the panel element (from a callback ref / state);
 * returns a keydown handler for it.
 */
export function useModal(
  open: boolean,
  panel: HTMLElement | null,
  { initialFocus, onEscape, lockScroll: lock = true }: ModalOptions = {},
) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const initialRef = useRef(initialFocus);
  initialRef.current = initialFocus;

  // Capture the opener before the (portalled) panel mounts and steals focus.
  useIsoLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous && typeof previous.focus === 'function' && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panel) return;
    const release = lock ? lockScroll() : () => {};
    if (!panel.contains(document.activeElement)) {
      const target = initialRef.current?.current ?? getFocusable(panel)[0] ?? panel;
      target.focus({ preventScroll: true });
    }
    return release;
  }, [open, panel, lock]);

  return (event: KeyboardEvent<HTMLElement>) => {
    if (!panel) return;
    if (event.key === 'Escape') {
      if (!onEscapeRef.current) return;
      event.stopPropagation();
      event.preventDefault();
      onEscapeRef.current();
      return;
    }
    if (event.key !== 'Tab') return;
    // Ignore Tab inside nested portals (menus, popovers) rendered from within the panel.
    if (!panel.contains(event.target as Node)) return;
    const items = getFocusable(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
