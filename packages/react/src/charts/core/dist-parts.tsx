import { type KeyboardEvent, useCallback, useState } from 'react';
import { RAMP } from './dist-stats';

/**
 * The chart keyboard model for grids: ← → move by `right` cells, ↑ ↓ by `down` cells, Home and
 * End jump to the ends, Enter or Space selects, Escape leaves. Same return shape as
 * useChartKeyboard, so the overlay wiring is identical.
 */
export function useGridKeyboard(
  count: number,
  steps: { right: number; down: number },
  onSelect?: (index: number, e: KeyboardEvent) => void,
) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (count === 0) return;
      const cur = active ?? 0;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
          next = cur + steps.right;
          break;
        case 'ArrowLeft':
          next = cur - steps.right;
          break;
        case 'ArrowDown':
          next = cur + steps.down;
          break;
        case 'ArrowUp':
          next = cur - steps.down;
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
            onSelect?.(active, e);
          }
          return;
        case 'Escape':
          setActive(null);
          return;
        default:
          return;
      }
      e.preventDefault();
      if (active == null) {
        setActive(e.key === 'End' ? count - 1 : 0);
        return;
      }
      if (next < 0 || next > count - 1) return;
      setActive(next);
    },
    [active, count, onSelect, steps.right, steps.down],
  );
  const onBlur = useCallback(() => setActive(null), []);
  return { active, setActive, keyboardProps: { tabIndex: 0, onKeyDown, onBlur } };
}

/** "Fewer ▢▢▢▢▢ More": the ramp legend under calendar and matrix heatmaps. */
export function RampLegend({
  low = 'Fewer',
  high = 'More',
  steps = [0, 2, 4, 6, 7],
}: {
  low?: string;
  high?: string;
  steps?: number[];
}) {
  return (
    <span className="q-ramp-legend" aria-hidden="true">
      {low}
      <span className="q-ramp-legend-swatches">
        {steps.map((s) => (
          <span key={s} style={{ background: RAMP[s] }} />
        ))}
      </span>
      {high}
    </span>
  );
}
