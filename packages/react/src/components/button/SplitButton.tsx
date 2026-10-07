import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';
import { IconChevronDown } from '../../icons';
import { cx } from '../../lib/cx';
import { type Placement, useDismiss } from '../../lib/floating';
import { FloatingPanel } from '../inputs/shared/FloatingPanel';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

export interface SplitButtonItem {
  label: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  /** Right-aligned mono hint, e.g. a file type or shortcut. */
  meta?: ReactNode;
  disabled?: boolean;
}

export interface SplitButtonProps {
  /** Label of the primary action. */
  label: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Menu items (rendered as a `role="menu"` list) or any custom content for the popover. */
  menu: SplitButtonItem[] | ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Accessible name of the chevron trigger. */
  menuLabel?: string;
  placement?: Placement;
  className?: string;
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

/** A primary action with a chevron that opens related actions. */
export function SplitButton({
  label,
  onClick,
  menu,
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  disabled,
  menuLabel = 'More options',
  placement = 'bottom-end',
  className,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const focusOnOpen = useRef<'first' | 'last' | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);
  useDismiss(open, close, [triggerRef, menuRef]);

  const items = Array.isArray(menu) ? (menu as SplitButtonItem[]) : null;

  const isMenu = items !== null;
  const focusItem = useCallback(
    (which: 'first' | 'last') => {
      const root = menuRef.current;
      if (!root) return;
      const nodes = root.querySelectorAll<HTMLElement>(
        isMenu ? ITEM_SELECTOR : 'button, [href], input, select, textarea, [tabindex="0"]',
      );
      const target = which === 'last' ? nodes[nodes.length - 1] : nodes[0];
      (target ?? root).focus();
    },
    [isMenu],
  );

  const onPositioned = () => {
    const which = focusOnOpen.current;
    focusOnOpen.current = null;
    if (which) focusItem(which);
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const which =
      e.key === 'ArrowUp'
        ? 'last'
        : e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' '
          ? 'first'
          : null;
    if (!which) return;
    e.preventDefault();
    if (open) focusItem(which);
    else {
      focusOnOpen.current = which;
      setOpen(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (!items) return;
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    if (!nodes.length) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % nodes.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + nodes.length) % nodes.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = nodes.length - 1;
    if (next >= 0) {
      e.preventDefault();
      nodes[next].focus();
    }
  };

  const solid = variant === 'primary' || variant === 'signal' || variant === 'destructive';

  return (
    <>
      <div
        className={cx('q-split', className)}
        data-variant={variant}
        data-size={size}
        data-solid={solid || undefined}
      >
        <Button
          variant={variant}
          size={size}
          icon={icon}
          loading={loading}
          disabled={disabled}
          onClick={onClick}
          className="q-split-main"
        >
          {label}
        </Button>
        <button
          ref={triggerRef}
          type="button"
          className="q-btn q-split-trigger"
          data-variant={variant}
          data-size={size}
          aria-label={menuLabel}
          aria-haspopup={isMenu ? 'menu' : 'dialog'}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={disabled}
          onClick={() => {
            focusOnOpen.current = open ? null : 'first';
            setOpen(!open);
          }}
          onKeyDown={onTriggerKey}
        >
          <IconChevronDown size={12} strokeWidth={1.8} />
        </button>
      </div>
      {open && (
        <FloatingPanel
          ref={menuRef}
          anchorRef={triggerRef}
          placement={placement}
          onPositioned={onPositioned}
          id={menuId}
          role={isMenu ? 'menu' : 'dialog'}
          aria-label={typeof label === 'string' ? `${label} options` : menuLabel}
          tabIndex={-1}
          className="q-split-menu"
          onKeyDown={onMenuKey}
        >
          {items
            ? items.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="q-split-menu-item"
                  aria-disabled={item.disabled || undefined}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onSelect?.();
                    close(true);
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) e.currentTarget.focus();
                  }}
                >
                  {item.icon && <span className="q-split-menu-icon">{item.icon}</span>}
                  <span className="q-split-menu-label">{item.label}</span>
                  {item.meta != null && <span className="q-split-menu-meta">{item.meta}</span>}
                </button>
              ))
            : (menu as ReactNode)}
        </FloatingPanel>
      )}
    </>
  );
}
