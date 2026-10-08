import {
  type CSSProperties,
  cloneElement,
  type FocusEvent,
  forwardRef,
  type HTMLAttributes,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cx } from '../../../lib/cx';
import { type Placement, Portal, useFloating } from '../../../lib/floating';
import { useControllable } from '../../../lib/useControllable';
import { chain, getElementRef, mergeRefs } from '../internal/trigger';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface TooltipPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Which side of the anchor the panel sits on; the arrow points the other way. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  arrow?: boolean;
  /** Arrow position along the edge, px from the left (top/bottom sides). Defaults to centered. */
  arrowOffset?: number;
  /** Roomier padding for multi-line content (a date and series values). */
  rich?: boolean;
}

/** The dark inverse surface shared by tooltips. Use directly for static previews. */
export const TooltipPanel = forwardRef<HTMLDivElement, TooltipPanelProps>(function TooltipPanel(
  { side = 'top', arrow = true, arrowOffset, rich, className, children, ...rest },
  ref,
) {
  const arrowStyle: CSSProperties | undefined =
    arrowOffset != null && (side === 'top' || side === 'bottom')
      ? { left: `clamp(10px, ${arrowOffset}px, calc(100% - 10px))` }
      : undefined;
  return (
    <div
      ref={ref}
      className={cx('q-tooltip', className)}
      data-side={side}
      data-rich={rich || undefined}
      {...rest}
    >
      {children}
      {arrow && <span className="q-tooltip-arrow" style={arrowStyle} aria-hidden="true" />}
    </div>
  );
});

export interface TooltipProps {
  content: ReactNode;
  /** One focusable element (a button, a link). Receives a ref, pointer and focus handlers. */
  children: ReactElement;
  placement?: Placement;
  /** Hover delay before showing, ms (default 400). Keyboard focus shows immediately. */
  delay?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  /** Arrow under the panel (default true). */
  arrow?: boolean;
  className?: string;
}

/**
 * A short label on the dark inverse surface. Shows on hover after `delay` and on keyboard focus,
 * hides on leave, blur, press and Escape. Linked to its trigger with `aria-describedby`.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 400,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled,
  arrow = true,
  className,
}: TooltipProps) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const shown = open && !disabled && content != null && content !== '';
  const { style, side, update } = useFloating(anchorRef, panelRef, {
    open: shown,
    placement,
    offset: arrow ? 9 : 6,
  });
  const [arrowOffset, setArrowOffset] = useState<number | undefined>(undefined);

  const setPanelRefs = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
    setPanelEl(el);
  }, []);

  useIsoLayoutEffect(() => {
    if (shown && panelEl) update();
  }, [shown, panelEl, update]);

  useIsoLayoutEffect(() => {
    if (!shown || typeof style.left !== 'number') return;
    const a = anchorRef.current?.getBoundingClientRect();
    if (a) setArrowOffset(Math.round(a.left + a.width / 2 - style.left));
  }, [shown, style.left, style.top]);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shown, setOpen]);

  const show = (wait: number) => {
    clear();
    if (wait <= 0) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), wait);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };

  const childProps = children.props as Record<string, never>;
  const describedBy = [childProps['aria-describedby'], shown ? id : undefined]
    .filter(Boolean)
    .join(' ');
  const trigger = cloneElement(children, {
    ref: mergeRefs(anchorRef, getElementRef(children)),
    'aria-describedby': describedBy || undefined,
    onPointerEnter: chain(childProps.onPointerEnter, (e: PointerEvent) => {
      if (e.pointerType !== 'touch') show(delay);
    }),
    onPointerLeave: chain(childProps.onPointerLeave, hide),
    onPointerDown: chain(childProps.onPointerDown, hide),
    onFocus: chain(childProps.onFocus, (e: FocusEvent<HTMLElement>) => {
      let visible = true;
      try {
        visible = e.currentTarget.matches(':focus-visible');
      } catch {
        // Older engines without :focus-visible: show on any focus.
      }
      if (visible) show(0);
    }),
    onBlur: chain(childProps.onBlur, hide),
  } as Record<string, unknown>);

  return (
    <>
      {trigger}
      {shown && (
        <Portal>
          <TooltipPanel
            ref={setPanelRefs}
            id={id}
            role="tooltip"
            side={side}
            arrow={arrow}
            arrowOffset={arrowOffset}
            rich={typeof content !== 'string' && typeof content !== 'number'}
            className={cx('q-tooltip-floating', className)}
            style={style}
          >
            {content}
          </TooltipPanel>
        </Portal>
      )}
    </>
  );
}
