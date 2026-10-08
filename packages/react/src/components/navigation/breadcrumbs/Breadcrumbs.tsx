import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  /** Path from the root to the current page; the last item is the current page. */
  items: BreadcrumbItem[];
  /** After the trail: a drill-down tag, a Live badge. */
  trailing?: ReactNode;
  separator?: ReactNode;
}

/** Where you are: "Workspace / Revenue / Europe". Earlier items link back up. */
export const Breadcrumbs = forwardRef<HTMLElement, BreadcrumbsProps>(function Breadcrumbs(
  { items, trailing, separator = '/', className, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  return (
    <nav
      ref={ref}
      aria-label={ariaLabel ?? 'Breadcrumb'}
      className={cx('q-breadcrumbs', className)}
      {...rest}
    >
      <ol className="q-breadcrumbs-list">
        {items.map((item, i) => {
          const current = i === items.length - 1;
          return (
            <li key={i} className="q-breadcrumb">
              {i > 0 && (
                <span className="q-breadcrumb-sep" aria-hidden="true">
                  {separator}
                </span>
              )}
              {current ? (
                <span className="q-breadcrumb-current" aria-current="page">
                  {item.label}
                </span>
              ) : item.href ? (
                <a className="q-breadcrumb-link" href={item.href} onClick={item.onClick}>
                  {item.label}
                </a>
              ) : item.onClick ? (
                <button type="button" className="q-breadcrumb-link" onClick={item.onClick}>
                  {item.label}
                </button>
              ) : (
                <span className="q-breadcrumb-text">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
      {trailing != null && <span className="q-breadcrumbs-trailing">{trailing}</span>}
    </nav>
  );
});
