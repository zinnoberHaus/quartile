import { describe, expect, it } from 'vitest';
import {
  aggregateMatrix,
  aggregateValues,
  binIndexOf,
  binsInRange,
  boxStats,
  calendarCells,
  fillBins,
  linearBins,
  orderedKeys,
  pearson,
  rampDomain,
  rampLevel,
  timeBins,
  topRoundedBar,
  weeksBetween,
} from './dist-stats';

describe('linearBins', () => {
  it('splits a niced domain into exactly n equal bins', () => {
    const bins = linearBins([0.2, 3.1, 11.7], 32);
    expect(bins).toHaveLength(32);
    expect(bins[0].x0).toBe(0);
    expect(bins[31].x1).toBe(12);
    expect(bins[1].x0 - bins[0].x0).toBeCloseTo(12 / 32);
  });

  it('handles a single distinct value and no values', () => {
    expect(linearBins([5, 5], 4)).toHaveLength(4);
    expect(linearBins([], 4)).toEqual([]);
  });
});

describe('timeBins', () => {
  it('makes one bin per local day, gaps included', () => {
    const bins = timeBins([new Date(2026, 8, 7, 14), new Date(2026, 8, 10, 9)], 'day');
    expect(bins).toHaveLength(4);
    expect(new Date(bins[0].x0).getDate()).toBe(7);
    expect(new Date(bins[3].x0).getDate()).toBe(10);
  });

  it('buckets by month', () => {
    const bins = timeBins([new Date(2026, 0, 15), new Date(2026, 2, 2)], 'month');
    expect(bins.map((b) => new Date(b.x0).getMonth())).toEqual([0, 1, 2]);
  });
});

describe('bin lookup', () => {
  const bins = linearBins([0, 10], 5); // edges 0, 2, 4, 6, 8, 10

  it('finds the bin for a value, with the last edge inclusive', () => {
    expect(binIndexOf(bins, 0)).toBe(0);
    expect(binIndexOf(bins, 2)).toBe(1);
    expect(binIndexOf(bins, 9.99)).toBe(4);
    expect(binIndexOf(bins, 10)).toBe(4);
    expect(binIndexOf(bins, 10.01)).toBe(-1);
    expect(binIndexOf(bins, -1)).toBe(-1);
  });

  it('counts or sums rows per bin', () => {
    const rows = [
      { v: 1, w: 3 },
      { v: 1.5, w: 2 },
      { v: 9, w: 1 },
    ];
    expect(fillBins(bins, rows, (r) => r.v)).toEqual([2, 0, 0, 0, 1]);
    expect(
      fillBins(
        bins,
        rows,
        (r) => r.v,
        (r) => r.w,
      ),
    ).toEqual([5, 0, 0, 0, 1]);
  });

  it('maps a brushed range back to the bins it covers', () => {
    expect(binsInRange(bins, 2, 6)).toEqual([1, 2]);
    expect(binsInRange(bins, 20, 30)).toBeNull();
  });
});

describe('boxStats', () => {
  it('computes quartiles, Tukey whiskers and outliers', () => {
    const s = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 40]);
    expect(s).not.toBeNull();
    expect(s?.median).toBe(5.5);
    expect(s?.q1).toBe(3.25);
    expect(s?.q3).toBe(7.75);
    expect(s?.hi).toBe(9);
    expect(s?.outliers).toEqual([40]);
    expect(s?.max).toBe(40);
    expect(s?.n).toBe(10);
  });

  it('reaches min and max with minmax whiskers', () => {
    const s = boxStats([1, 2, 3, 40], 'minmax');
    expect(s?.lo).toBe(1);
    expect(s?.hi).toBe(40);
    expect(s?.outliers).toEqual([]);
  });

  it('ignores non-finite values and returns null for none', () => {
    expect(boxStats([Number.NaN])).toBeNull();
    expect(boxStats([2, Number.NaN, 4])?.n).toBe(2);
  });
});

describe('pearson', () => {
  it('is 1 for a perfect line and null without variance', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });
});

describe('orderedKeys', () => {
  it('keeps an explicit order and appends unseen values', () => {
    expect(orderedKeys(['b', 'c', 'a'], ['a', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('sorts numbers, keeps strings in first appearance', () => {
    expect(orderedKeys([3, 1, 2, 1])).toEqual([1, 2, 3]);
    expect(orderedKeys(['Tue', 'Mon', 'Tue'])).toEqual(['Tue', 'Mon']);
  });
});

describe('aggregateMatrix', () => {
  it('distinguishes an unobserved measure from a measured zero for every numeric reducer', () => {
    const data = [
      { x: 'missing', y: 'A', value: null },
      { x: 'missing', y: 'A', value: ' ' },
      { x: 'missing', y: 'A', value: true },
      { x: 'zero', y: 'A', value: 0 },
      { x: 'value', y: 'A', value: '10' },
      { x: 'value', y: 'A', value: false },
    ];
    for (const aggregate of ['sum', 'mean', 'median', 'min', 'max'] as const) {
      const result = aggregateMatrix(data, { x: 'x', y: 'y', value: 'value', aggregate });
      expect(result.cells).toEqual([[null, 0, 10]]);
      expect(result.counts).toEqual([[3, 1, 2]]);
      expect(result.low?.value).toBe(0);
      expect(result.peak?.value).toBe(10);
    }
    expect(aggregateMatrix(data, { x: 'x', y: 'y' }).cells).toEqual([[3, 1, 2]]);
    expect(aggregateValues([], 'sum')).toBe(0);
    expect(aggregateValues([NaN], 'sum')).toBeNaN();
    expect(aggregateValues([], 'mean')).toBeNaN();
  });
  const rows = [
    { day: 'Mon', hour: 9, n: 2 },
    { day: 'Mon', hour: 9, n: 3 },
    { day: 'Tue', hour: 10, n: 7 },
  ];

  it('counts rows per cell and finds the peak', () => {
    const m = aggregateMatrix(rows, { x: 'hour', y: 'day' });
    expect(m.xs).toEqual([9, 10]);
    expect(m.ys).toEqual(['Mon', 'Tue']);
    expect(m.cells).toEqual([
      [2, null],
      [null, 1],
    ]);
    expect(m.peak).toEqual({ row: 0, col: 0, value: 2 });
  });

  it('sums a value field, keeping empty ordered columns', () => {
    const m = aggregateMatrix(rows, { x: 'hour', y: 'day', value: 'n', xOrder: [8, 9, 10] });
    expect(m.cells).toEqual([
      [null, 5, null],
      [null, null, 7],
    ]);
    expect(m.peak?.value).toBe(7);
    expect(m.counts[0][1]).toBe(2);
  });
});

describe('ramp', () => {
  it('maps zero and missing to the neutral step and the max to the top', () => {
    expect(rampLevel(null, 0, 10)).toBe(0);
    expect(rampLevel(0, 0, 10)).toBe(0);
    expect(rampLevel(10, 0, 10)).toBe(7);
    expect(rampLevel(5, 0, 10)).toBe(3);
  });

  it('starts the domain at zero unless told otherwise', () => {
    expect(rampDomain([3, null, 9])).toEqual([0, 9]);
    expect(rampDomain([3, 9], [2, 4])).toEqual([2, 4]);
  });
});

describe('calendar', () => {
  it('lays out week columns ending with the last date', () => {
    // Tue Oct 6, 2026; Sunday-first weeks.
    const cells = calendarCells(new Date(2026, 9, 6), 2);
    expect(cells[0].date.getDay()).toBe(0);
    expect(cells[0].col).toBe(0);
    expect(cells[cells.length - 1].date.getDate()).toBe(6);
    expect(cells[cells.length - 1]).toMatchObject({ col: 1, row: 2 });
    expect(cells).toHaveLength(10);
  });

  it('starts rows on Monday with weekStart 1', () => {
    const cells = calendarCells(new Date(2026, 9, 6), 1, 1);
    expect(cells[0].date.getDay()).toBe(1);
    expect(cells).toHaveLength(2);
  });

  it('counts week columns between two dates', () => {
    expect(weeksBetween(new Date(2026, 9, 4), new Date(2026, 9, 10))).toBe(1);
    expect(weeksBetween(new Date(2026, 9, 4), new Date(2026, 9, 11))).toBe(2);
  });
});

describe('topRoundedBar', () => {
  it('draws nothing for an empty bar', () => {
    expect(topRoundedBar(0, 0, 10, 0, 2)).toBe('');
    expect(topRoundedBar(0, 0, 10, 20, 2)).toMatch(/^M0,20V2Q/);
  });
});
