import { describe, expect, it } from 'vitest';
import { createScatterIndex } from './scatter-picking';

describe('scatter screen-space picking', () => {
  it('picks by circle edge, keeps stable ties and rejects empty space', () => {
    const pick = createScatterIndex([
      { x: 10, y: 10, r: 2 },
      { x: 20, y: 10, r: 9 },
    ]);
    expect(pick(14, 10)).toBe(1);
    expect(pick(100, 100)).toBe(-1);
    expect(
      createScatterIndex([
        { x: 10, y: 10, r: 4 },
        { x: 10, y: 10, r: 4 },
      ])(10, 10),
    ).toBe(0);
    expect(createScatterIndex([])(0, 0)).toBe(-1);
  });

  it('matches the exhaustive SVG picking rule across cells and negative coordinates', () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({
      x: ((index * 7919) % 1000) - 100,
      y: ((index * 3571) % 800) - 100,
      r: 3 + (index % 7),
    }));
    const pick = createScatterIndex(points);
    for (let x = -150; x < 1000; x += 47) {
      for (let y = -150; y < 800; y += 53) {
        let best = -1;
        let distance = Number.POSITIVE_INFINITY;
        points.forEach((point, index) => {
          const candidate = Math.hypot(point.x - x, point.y - y) - point.r;
          if (candidate < distance) {
            best = index;
            distance = candidate;
          }
        });
        expect(pick(x, y)).toBe(distance <= 10 ? best : -1);
      }
    }
  });
});
