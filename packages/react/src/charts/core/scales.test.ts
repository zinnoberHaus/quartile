import { valueScale } from './scales';

describe('valueScale', () => {
  it('keeps the zero baseline inside the plot for all-negative values', () => {
    const scale = valueScale([-100, -50], [200, 10]);
    expect(scale.domain()[0]).toBeLessThanOrEqual(-100);
    expect(scale.domain()[1]).toBeGreaterThanOrEqual(0);
    for (const value of [-100, -50, 0]) {
      expect(scale(value)).toBeGreaterThanOrEqual(10);
      expect(scale(value)).toBeLessThanOrEqual(200);
    }
  });

  it('ignores nonfinite values without poisoning the entire chart', () => {
    const scale = valueScale([Number.NaN, Number.POSITIVE_INFINITY, 10], [100, 0]);
    expect(scale.domain().every(Number.isFinite)).toBe(true);
    expect(scale(10)).toBeGreaterThanOrEqual(0);
    expect(scale(10)).toBeLessThanOrEqual(100);
  });

  it('allows a negative-only domain when zero is explicitly disabled', () => {
    const scale = valueScale([-100, -50], [100, 0], { zero: false });
    expect(scale.domain()[1]).toBeLessThan(0);
  });
});
