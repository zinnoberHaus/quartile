import {
  type ButtonHTMLAttributes,
  forwardRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useId,
} from 'react';
import { IconChevronsUpDown, IconSearch } from '../../../icons';
import { cx } from '../../../lib/cx';
import { Kbd } from '../../display/kbd/Kbd';

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** Top slot: a `SidebarHeader` (workspace switcher), a `SidebarSearch`. */
  header?: ReactNode;
  /** Bottom slot, pinned to the end: data source status, the signed-in user. */
  footer?: ReactNode;
  /** Names the navigation landmark (default "Main"). */
  label?: string;
  children?: ReactNode;
}

/** App navigation between dashboards: header slot, sections of items, footer slot. */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { header, footer, label = 'Main', className, children, ...rest },
  ref,
) {
  return (
    <aside ref={ref} className={cx('q-sidebar', className)} {...rest}>
      {header != null && <div className="q-sidebar-header">{header}</div>}
      <nav aria-label={label} className="q-sidebar-nav">
        {children}
      </nav>
      {footer != null && <div className="q-sidebar-footer">{footer}</div>}
    </aside>
  );
});

export interface SidebarHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A 28px mark; pass a letter for an ink tile, or any node. */
  logo?: ReactNode;
  /** Makes the header a button (workspace switcher) with an up-down chevron. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Replaces the chevron. */
  trailing?: ReactNode;
}

/** Workspace switcher row: mark, name, subtitle. Works as a `Menu` trigger. */
export const SidebarHeader = forwardRef<HTMLElement, SidebarHeaderProps>(function SidebarHeader(
  { title, subtitle, logo, onClick, trailing, className, ...rest },
  ref,
) {
  const mark =
    typeof logo === 'string' ? (
      <span className="q-sidebar-logo" aria-hidden="true">
        {logo}
      </span>
    ) : (
      logo
    );
  const body = (
    <>
      {mark}
      <span className="q-sidebar-heading">
        <span className="q-sidebar-title">{title}</span>
        {subtitle != null && <span className="q-sidebar-subtitle">{subtitle}</span>}
      </span>
      {trailing ??
        (onClick ? (
          <IconChevronsUpDown size={14} className="q-sidebar-switch" aria-hidden="true" />
        ) : null)}
    </>
  );
  if (onClick) {
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        className={cx('q-sidebar-brand', className)}
        onClick={onClick}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {body}
      </button>
    );
  }
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cx('q-sidebar-brand', className)}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {body}
    </div>
  );
});

export interface SidebarSearchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: ReactNode;
  /** Keyboard hint at the end (default ⌘K). Pass null to hide. */
  shortcut?: ReactNode;
}

/** A search field look-alike that opens a command menu. */
export const SidebarSearch = forwardRef<HTMLButtonElement, SidebarSearchProps>(
  function SidebarSearch({ label = 'Search', shortcut = '⌘K', className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cx('q-sidebar-search', className)}
        aria-haspopup="dialog"
        {...rest}
      >
        <IconSearch size={14} aria-hidden="true" />
        <span className="q-sidebar-search-label">{label}</span>
        {shortcut != null && (
          <Kbd variant="flat" aria-hidden="true">
            {shortcut}
          </Kbd>
        )}
      </button>
    );
  },
);

export interface SidebarSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Mono uppercase heading: Analytics, Workspace. */
  title?: ReactNode;
  children?: ReactNode;
}

/** A labelled group of sidebar items. */
export function SidebarSection({ title, className, children, ...rest }: SidebarSectionProps) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={title != null ? id : undefined}
      className={cx('q-sidebar-section', className)}
      {...rest}
    >
      {title != null && (
        <div id={id} className="q-sidebar-section-title">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export interface SidebarItemProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  label: ReactNode;
  /** 16px icon; without one, a small square marker is shown. */
  icon?: ReactNode;
  /** Quiet mono count at the end (Reports 12). */
  count?: ReactNode;
  /** Signal pill at the end for things that need attention (Alerts 3). */
  badge?: ReactNode;
  /** The current page: white, raised, hairline ring; `aria-current="page"`. */
  active?: boolean;
  /** Renders a link; otherwise a button. */
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
}

/** One destination in the sidebar. */
export const SidebarItem = forwardRef<HTMLElement, SidebarItemProps>(function SidebarItem(
  { label, icon, count, badge, active, href, onClick, disabled, className, ...rest },
  ref,
) {
  const content = (
    <>
      <span className="q-sidebar-item-icon" aria-hidden="true">
        {icon ?? <span className="q-sidebar-item-marker" />}
      </span>
      <span className="q-sidebar-item-label">{label}</span>
      {count != null && <span className="q-sidebar-item-count">{count}</span>}
      {badge != null && <span className="q-sidebar-item-badge">{badge}</span>}
    </>
  );
  const shared = {
    className: cx('q-sidebar-item', className),
    'aria-current': active ? ('page' as const) : undefined,
    'data-active': active || undefined,
    onClick,
  };
  if (href != null && !disabled) {
    return (
      <a ref={ref as Ref<HTMLAnchorElement>} href={href} {...shared} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      disabled={disabled}
      {...shared}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {content}
    </button>
  );
});
