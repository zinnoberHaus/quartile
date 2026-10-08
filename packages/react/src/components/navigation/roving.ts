/**
 * Index to move to for a roving-focus key press (arrows, Home, End), skipping disabled items and
 * wrapping at the ends. Returns `null` for keys it does not handle.
 */
export function nextIndex(
  key: string,
  current: number,
  disabled: boolean[],
  orientation: 'horizontal' | 'vertical' = 'horizontal',
): number | null {
  const n = disabled.length;
  if (n === 0) return null;
  const forward = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const back = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const step = (from: number, dir: 1 | -1) => {
    for (let i = 1; i <= n; i++) {
      const j = (((from + dir * i) % n) + n) % n;
      if (!disabled[j]) return j;
    }
    return null;
  };
  switch (key) {
    case forward:
      return step(current, 1);
    case back:
      return step(current < 0 ? 0 : current, -1);
    case 'Home':
      return step(-1, 1);
    case 'End':
      return step(n, -1);
    default:
      return null;
  }
}
