export type PageItem = number | 'start-ellipsis' | 'end-ellipsis';

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

/**
 * The page buttons to show. Keeps a constant number of slots (boundaries + siblings around the
 * current page + two ellipses) so the control does not change width as you page:
 * page 2 of 24 → 1 2 3 4 5 … 24; page 12 → 1 … 11 12 13 … 24.
 */
export function paginationRange(
  page: number,
  pageCount: number,
  siblings = 1,
  boundaries = 1,
): PageItem[] {
  const count = Math.max(0, Math.floor(pageCount));
  if (count === 0) return [];
  const p = Math.min(Math.max(1, Math.floor(page)), count);
  const startPages = range(1, Math.min(boundaries, count));
  const endPages = range(Math.max(count - boundaries + 1, boundaries + 1), count);
  const siblingsStart = Math.max(
    Math.min(p - siblings, count - boundaries - siblings * 2 - 1),
    boundaries + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(p + siblings, boundaries + siblings * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : count - 1,
  );
  const items: PageItem[] = [...startPages];
  if (siblingsStart > boundaries + 2) items.push('start-ellipsis');
  else if (boundaries + 1 < count - boundaries) items.push(boundaries + 1);
  items.push(...range(siblingsStart, siblingsEnd));
  if (siblingsEnd < count - boundaries - 1) items.push('end-ellipsis');
  else if (count - boundaries > boundaries) items.push(count - boundaries);
  items.push(...endPages);
  // Small page counts can produce a repeated page at the seams; keep the first occurrence.
  return items.filter((it, i) => items.indexOf(it) === i);
}
