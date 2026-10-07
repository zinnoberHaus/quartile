import {
  cloneElement,
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
import { chain, getElementRef, mergeRefs } from '../../overlays/internal/trigger';
import { nextIndex } from '../roving';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface MenuAction {
  label: ReactNode;
  icon?: ReactNode;
  /** Display-only hint: ⌘D, ⇧⌘P, T. Wire the actual shortcut with `useHotkey`. */
  shortcut?: ReactNode;
  /** Destructive: shown in the danger color. */
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Text used for type-ahead when `label` is not a string. */
  textValue?: string;
}

export type MenuItem = MenuAction | 'separator';

export interface MenuProps {
  /** The element that opens the menu, usually a Button. Receives a ref and ARIA attributes. */
  trigger: ReactElement;
  items: MenuItem[];
  placement?: Placement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the menu for assistive technology. */
  label?: string;
  className?: string;
}

/**
 * An action menu. Opens on click, Enter, Space or the arrow keys; arrows move, Home and End jump,
 * typing a letter jumps to the next matching item, Enter selects, Escape closes and returns focus.
 */
export function Menu({
  trigger,
  items,
  placement = 'bottom-start',
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  label,
  className,
}: MenuProps) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuEl, setMenuEl] = useState<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFocus = useRef<'first' | 'last'>('first');
  const menuId = useId();
  const { style, update } = useFloating(triggerRef, menuRef, { open, placement, offset: 6 });
  const setMenuRefs = useCallback((el: HTMLDivElement | null) => {
    menuRef.current = el;
    setMenuEl(el);
  }, []);

  const disabled = items.map((it) => it === 'separator' || !!it.disabled);

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );
  const dismiss = useCallback(() => close(false), [close]);
  useDismiss(open, dismiss, [triggerRef, menuRef]);

  // The portal mounts a frame after `open` flips; position and focus once the element exists.
  useIsoLayoutEffect(() => {
    if (open && menuEl) update();
  }, [open, menuEl, update]);

  // Focus can only land once the menu is positioned (it is `visibility: hidden` until then).
  const visible = open && !!menuEl && style.visibility === 'visible';
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once, when the menu becomes visible
  useEffect(() => {
    if (!visible || !menuEl || menuEl.contains(document.activeElement)) return;
    const target =
      pendingFocus.current === 'last'
        ? nextIndex('End', -1, disabled, 'vertical')
        : nextIndex('Home', -1, disabled, 'vertical');
    (target != null ? itemRefs.current[target] : menuEl)?.focus({ preventScroll: true });
  }, [visible, menuEl]);

  const openWith = (focus: 'first' | 'last') => {
    pendingFocus.current = focus;
    setOpen(true);
  };

  const select = (item: MenuAction) => {
    if (item.disabled) return;
    close(true);
    item.onSelect?.();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.indexOf(document.activeElement as HTMLDivElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = items[current];
      if (item && item !== 'separator') select(item);
      return;
    }
    const next = nextIndex(event.key, current, disabled, 'vertical');
    if (next != null) {
      event.preventDefault();
      itemRefs.current[next]?.focus();
      return;
    }
    if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey) {
      const ch = event.key.toLowerCase();
      for (let step = 1; step <= items.length; step++) {
        const j = (Math.max(current, -1) + step + items.length) % items.length;
        const it = items[j];
        if (it === 'separator' || it.disabled) continue;
        const text = it.textValue ?? (typeof it.label === 'string' ? it.label : '');
        if (text.toLowerCase().startsWith(ch)) {
          itemRefs.current[j]?.focus();
          break;
        }
      }
    }
  };

  const triggerProps = trigger.props as Record<string, never>;
  const triggerEl = cloneElement(trigger, {
    ref: mergeRefs(triggerRef, getElementRef(trigger)),
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: chain(triggerProps.onClick, () => (open ? close(false) : openWith('first'))),
    onKeyDown: chain(triggerProps.onKeyDown, (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openWith(event.key === 'ArrowUp' ? 'last' : 'first');
      }
    }),
  } as Record<string, unknown>);

  return (
    <>
      {triggerEl}
      {open && (
        <Portal>
          <div
            ref={setMenuRefs}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className={cx('q-menu', className)}
            style={style}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item, i) =>
              item === 'separator' ? (
                <div
                  key={`sep-${i}`}
                  role="separator"
                  className="q-menu-separator"
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                />
              ) : (
                <div
                  key={i}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled || undefined}
                  data-danger={item.danger || undefined}
                  className="q-menu-item"
                  onClick={() => select(item)}
                  onPointerMove={(e) => {
                    if (!item.disabled && document.activeElement !== e.currentTarget) {
                      e.currentTarget.focus({ preventScroll: true });
                    }
                  }}
                >
                  {item.icon != null && (
                    <span className="q-menu-item-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  <span className="q-menu-item-label">{item.label}</span>
                  {item.shortcut != null && (
                    <span className="q-menu-item-shortcut" aria-hidden="true">
                      {item.shortcut}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
        </Portal>
      )}
    </>
  );
}
