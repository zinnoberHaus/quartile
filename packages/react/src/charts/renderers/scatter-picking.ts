import type { ScatterMark } from './scatter-types';

/** A bounded-neighborhood lookup; preserves the SVG's nearest-circle and first-point tie rules. */
export function createScatterIndex(points: readonly Pick<ScatterMark, 'x' | 'y' | 'r'>[]) {
  const cellSize = 32;
  const cells = new Map<string, number[]>();
  let maxRadius = 0;
  points.forEach((point, index) => {
    const key = `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(index);
    else cells.set(key, [index]);
    maxRadius = Math.max(maxRadius, point.r);
  });
  return (x: number, y: number, tolerance = 10) => {
    let best = -1;
    let distance = Number.POSITIVE_INFINITY;
    const reach = maxRadius + tolerance;
    const minX = Math.floor((x - reach) / cellSize);
    const maxX = Math.floor((x + reach) / cellSize);
    const minY = Math.floor((y - reach) / cellSize);
    const maxY = Math.floor((y + reach) / cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        for (const index of cells.get(`${cx},${cy}`) ?? []) {
          const point = points[index];
          const d = Math.hypot(point.x - x, point.y - y) - point.r;
          if (d < distance || (d === distance && (best < 0 || index < best))) {
            best = index;
            distance = d;
          }
        }
      }
    }
    return distance <= tolerance ? best : -1;
  };
}
