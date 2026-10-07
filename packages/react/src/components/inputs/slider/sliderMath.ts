/** Position of `value` in [min, max] as a 0–100 percentage. */
export function toPercent(value: number, min: number, max: number) {
  if (max === min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function decimals(n: number) {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const e = s.indexOf('e-');
  if (e >= 0) return Number(s.slice(e + 2));
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Rounds to the nearest step from `min`, clamps to [min, max], and drops float noise. */
export function snap(value: number, min: number, max: number, step: number) {
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  const steps = Math.round((clamped - min) / step);
  const out = Math.min(max, min + steps * step);
  return Number(out.toFixed(Math.max(decimals(step), decimals(min))));
}

/** Value under a pointer at `clientX` on a track spanning [left, left + width]. */
export function valueFromPointer(
  clientX: number,
  left: number,
  width: number,
  min: number,
  max: number,
  step: number,
) {
  const ratio = width > 0 ? (clientX - left) / width : 0;
  return snap(min + ratio * (max - min), min, max, step);
}

/**
 * The value a slider key moves to: arrows ±step, PageUp/PageDown ±10 steps (at least 10% of the
 * range when that is coarser), Home/End to the bounds. Returns null for other keys.
 */
export function valueFromKey(
  key: string,
  value: number,
  min: number,
  max: number,
  step: number,
  shift = false,
): number | null {
  const big = Math.max(step * 10, snap(min + (max - min) / 10, min, max, step) - min);
  const s = shift ? big : step;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return snap(value + s, min, max, step);
    case 'ArrowLeft':
    case 'ArrowDown':
      return snap(value - s, min, max, step);
    case 'PageUp':
      return snap(value + big, min, max, step);
    case 'PageDown':
      return snap(value - big, min, max, step);
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return null;
  }
}

/**
 * Which bins of a histogram over [min, max] fall inside [lo, hi]. A bin counts as in range when its
 * centre does.
 */
export function binsInRange(count: number, min: number, max: number, lo: number, hi: number) {
  const w = (max - min) / count;
  return Array.from({ length: count }, (_, i) => {
    const centre = min + (i + 0.5) * w;
    return centre >= lo && centre <= hi;
  });
}

/** Moves one end of a range, keeping lo ≤ hi with at least `minDistance` between them. */
export function moveRangeThumb(
  range: [number, number],
  thumb: 0 | 1,
  next: number,
  minDistance = 0,
): [number, number] {
  const [lo, hi] = range;
  return thumb === 0
    ? [Math.min(next, hi - minDistance), hi]
    : [lo, Math.max(next, lo + minDistance)];
}

/** The thumb a press at `v` should move: the nearer one; when both sit together, the one that can move. */
export function nearestThumb(range: [number, number], v: number, max: number): 0 | 1 {
  const [a, b] = range;
  if (a === b) return v < a ? 0 : v > b ? 1 : a === max ? 0 : 1;
  if (v <= a) return 0;
  if (v >= b) return 1;
  return v - a <= b - v ? 0 : 1;
}
