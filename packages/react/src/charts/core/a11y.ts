import { type KeyboardEvent, useCallback, useState } from 'react';
import { formatDelta } from '../../data/format';

/**
 * The chart keyboard model: Tab into the chart, ← → between points, Home and End to jump,
 * Enter or Space to select, Escape to leave. Returns the focused index (or null).
 */
export function useChartKeyboard(count: number, onSelect?: (index: number) => void) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (count === 0) return;
      const cur = active ?? -1;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = Math.min(count - 1, cur + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = Math.max(0, cur < 0 ? 0 : cur - 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = count - 1;
          break;
        case 'Enter':
        case ' ':
          if (active != null) {
            e.preventDefault();
            onSelect?.(active);
          }
          return;
        case 'Escape':
          setActive(null);
          return;
        default:
          return;
      }
      e.preventDefault();
      setActive(next);
    },
    [active, count, onSelect],
  );
  const onBlur = useCallback(() => setActive(null), []);
  return { active, setActive, keyboardProps: { tabIndex: 0, onKeyDown, onBlur } };
}

/**
 * An auto-written summary of a series: range, trend, min and max.
 * `fmtX` / `fmtY` format the domain and values.
 */
export function summarizeSeries(
  name: string,
  points: { x: unknown; y: number }[],
  fmtX: (v: unknown) => string,
  fmtY: (v: unknown) => string,
): string {
  if (points.length === 0) return `${name}: no data.`;
  const first = points[0];
  const last = points[points.length - 1];
  let lo = first;
  let hi = first;
  for (const p of points) {
    if (p.y < lo.y) lo = p;
    if (p.y > hi.y) hi = p;
  }
  const change = first.y !== 0 ? last.y / first.y - 1 : 0;
  const trend =
    Math.abs(change) < 0.01
      ? 'roughly flat'
      : change > 0
        ? `up ${formatDelta(change).slice(1)}`
        : `down ${formatDelta(change).slice(1)}`;
  return `${name} from ${fmtX(first.x)} to ${fmtX(last.x)}: ${trend}, from ${fmtY(first.y)} to ${fmtY(last.y)}. Low ${fmtY(lo.y)} on ${fmtX(lo.x)}; high ${fmtY(hi.y)} on ${fmtX(hi.x)}.`;
}
