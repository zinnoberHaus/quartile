import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
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
import { type Placement, Portal, useDismiss, useFloating } from '../../../lib/floating';
import { useControllable } from '../../../lib/useControllable';
import { getFocusable } from '../internal/modal';
import { chain, getElementRef, mergeRefs } from '../internal/trigger';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface PopoverPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  /** Id for the title element, so a dialog role can be labelled by it. */
  titleId?: string;
  /** A row of text actions under the body: Annotate · Dismiss. */
  actions?: ReactNode;
  children?: ReactNode;
}

/** The floating surface (white, hairline, --q-shadow-1). Use directly for static previews. */
export const PopoverPanel = forwardRef<HTMLDivElement, PopoverPanelProps>(function PopoverPanel(
  { title, titleId, actions, className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx('q-popover', className)} {...rest}>
      {title != null && (
        <div id={titleId} className="q-popover-title">
          {title}
        </div>
      )}
      {children != null && <div className="q-popover-body">{children}</div>}
      {actions != null && <div className="q-popover-actions">{actions}</div>}
    </div>
  );
});

export interface PopoverActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `signal` for the main action (Annotate), `quiet` for the rest (Dismiss). */
  variant?: 'signal' | 'quiet';
}

/** A text button for the popover's action row. */
export const PopoverAction = forwardRef<HTMLButtonElement, PopoverActionProps>(
  function PopoverAction({ variant = 'quiet', className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx('q-popover-action', className)}
        data-variant={variant}
        {...rest}
      />
    );
  },
);

export interface PopoverApi {
  close: () => void;
}

export interface PopoverProps {
  /** The element that toggles the popover. Receives a ref and ARIA attributes. */
  trigger: ReactElement;
  title?: ReactNode;
  children?: ReactNode | ((api: PopoverApi) => ReactNode);
  actions?: ReactNode | ((api: PopoverApi) => ReactNode);
  placement?: Placement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accessible name when there is no `title`. */
  label?: string;
  /** Panel width (default: fits content, up to 320px). */
  width?: number | string;
  className?: string;
}

/**
 * Rich, interactive content anchored to a trigger. Click toggles it; focus moves inside; Escape or
 * a click outside closes it, and Escape returns focus to the trigger.
 */
export function Popover({
  trigger,
  title,
  children,
  actions,
  placement = 'bottom-start',
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  label,
  width,
  className,
}: PopoverProps) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const { style, update } = useFloating(triggerRef, panelRef, { open, placement, offset: 8 });

  const setPanelRefs = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
    setPanelEl(el);
  }, []);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );
  const dismiss = useCallback(() => close(false), [close]);
  useDismiss(open, dismiss, [triggerRef, panelRef]);

  useIsoLayoutEffect(() => {
    if (open && panelEl) update();
  }, [open, panelEl, update]);

  // Move focus in once the panel is positioned (it is `visibility: hidden` until then).
  const visible = open && !!panelEl && style.visibility === 'visible';
  useEffect(() => {
    if (!visible || !panelEl || panelEl.contains(document.activeElement)) return;
    (getFocusable(panelEl)[0] ?? panelEl).focus({ preventScroll: true });
  }, [visible, panelEl]);

  const api: PopoverApi = { close: () => close(true) };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab' && panelEl) {
      // The panel is portalled to the end of the page; leaving it returns to the trigger.
      const items = getFocusable(panelEl);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (
        items.length === 0 ||
        (!event.shiftKey && active === last) ||
        (event.shiftKey && (active === first || active === panelEl))
      ) {
        event.preventDefault();
        close(true);
      }
    }
  };

  const triggerProps = trigger.props as Record<string, never>;
  const triggerEl = cloneElement(trigger, {
    ref: mergeRefs(triggerRef, getElementRef(trigger)),
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    onClick: chain(triggerProps.onClick, () => (open ? close(false) : setOpen(true))),
  } as Record<string, unknown>);

  const panelStyle: CSSProperties = { ...style, width };

  return (
    <>
      {triggerEl}
      {open && (
        <Portal>
          <PopoverPanel
            ref={setPanelRefs}
            id={id}
            role="dialog"
            aria-labelledby={title != null ? titleId : undefined}
            aria-label={title == null ? label : undefined}
            tabIndex={-1}
            title={title}
            titleId={titleId}
            actions={typeof actions === 'function' ? actions(api) : actions}
            className={cx('q-popover-floating', className)}
            style={panelStyle}
            onKeyDown={onKeyDown}
          >
            {typeof children === 'function' ? children(api) : children}
          </PopoverPanel>
        </Portal>
      )}
    </>
  );
}
