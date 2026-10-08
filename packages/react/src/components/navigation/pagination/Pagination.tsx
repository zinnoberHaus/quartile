import { forwardRef, type HTMLAttributes } from 'react';
import { IconChevronLeft, IconChevronRight } from '../../../icons';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';
import { paginationRange } from './range';

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  /** Current page, 1-based. */
  page?: number;
  defaultPage?: number;
  pageCount: number;
  onChange?: (page: number) => void;
  /** Pages shown on each side of the current one (default 1). */
  siblings?: number;
  /** Pages always shown at each end (default 1). */
  boundaries?: number;
  /** `pages` shows numbered buttons; `compact` shows Previous / Page n of N / Next. */
  variant?: 'pages' | 'compact';
}

/** ‹ 1 2 3 … 24 ›. The current page is ink-filled and marked `aria-current="page"`. */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  {
    page,
    defaultPage = 1,
    pageCount,
    onChange,
    siblings = 1,
    boundaries = 1,
    variant = 'pages',
    className,
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const [current, setCurrent] = useControllable(page, defaultPage, onChange);
  const count = Math.max(0, Math.floor(pageCount));
  const go = (p: number) => {
    const next = Math.min(Math.max(1, p), count);
    if (next !== current) setCurrent(next);
  };
  const atStart = current <= 1;
  const atEnd = current >= count;

  return (
    <nav
      ref={ref}
      aria-label={ariaLabel ?? 'Pagination'}
      className={cx('q-pagination', className)}
      data-variant={variant}
      {...rest}
    >
      {variant === 'compact' ? (
        <>
          <button
            type="button"
            className="q-page-step"
            disabled={atStart}
            onClick={() => go(current - 1)}
          >
            <IconChevronLeft size={14} />
            Previous
          </button>
          <span className="q-page-status">
            Page {count === 0 ? 0 : current} of {count}
          </span>
          <button
            type="button"
            className="q-page-step"
            disabled={atEnd}
            onClick={() => go(current + 1)}
          >
            Next
            <IconChevronRight size={14} />
          </button>
        </>
      ) : (
        <ul className="q-pagination-list">
          <li>
            <button
              type="button"
              className="q-page-arrow"
              aria-label="Previous page"
              disabled={atStart}
              onClick={() => go(current - 1)}
            >
              <IconChevronLeft size={14} />
            </button>
          </li>
          {paginationRange(current, count, siblings, boundaries).map((item) =>
            typeof item === 'number' ? (
              <li key={item}>
                <button
                  type="button"
                  className="q-page"
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? 'page' : undefined}
                  onClick={() => go(item)}
                >
                  {item}
                </button>
              </li>
            ) : (
              <li key={item} className="q-page-ellipsis" aria-hidden="true">
                …
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              className="q-page-arrow"
              aria-label="Next page"
              disabled={atEnd}
              onClick={() => go(current + 1)}
            >
              <IconChevronRight size={14} />
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
});
