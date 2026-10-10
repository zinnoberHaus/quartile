import { aggregateBy, keyOf, orderKeys, pluralLabel, predicateHas } from './trends-aggregate';
import { pivotSeries, seriesTotals, stackSeries } from './trends-series';

const rows = [
  { region: 'Europe', amount: 10, change: 0.25 },
  { region: 'Asia', amount: 5, change: -0.5 },
  { region: 'Europe', amount: 30, change: 0 },
  { region: 'Asia', amount: 15 },
  { region: 'Africa', amount: null },
];

describe('aggregateBy', () => {
  it('keeps invalid ISO-looking nominal categories distinct and selectable', () => {
    const buckets = aggregateBy(
      [
        { id: '2026-02-30', n: 2 },
        { id: '2026-02-31', n: 3 },
      ],
      'id',
      { value: 'n' },
    );
    expect(buckets.map((bucket) => [bucket.key, bucket.value])).toEqual([
      ['2026-02-30', 2],
      ['2026-02-31', 3],
    ]);
    expect(predicateHas({ op: 'eq', value: '2026-02-30' }, '2026-02-31')).toBe(false);
  });
  it('sums by default and keeps first-seen order', () => {
    const b = aggregateBy(rows, 'region', { value: 'amount' });
    expect(b.map((x) => [x.key, x.value, x.count])).toEqual([
      ['Europe', 40, 2],
      ['Asia', 20, 2],
      ['Africa', NaN, 1],
    ]);
  });

  it('counts rows when no value field is given', () => {
    const b = aggregateBy(rows, 'region', { sort: 'desc' });
    expect(b.map((x) => x.value)).toEqual([2, 2, 1]);
  });

  it('averages only rows with a usable value', () => {
    const b = aggregateBy(rows, 'region', { value: 'amount', aggregate: 'mean' });
    expect(b.find((x) => x.key === 'Asia')?.value).toBe(10);
    expect(b.find((x) => x.key === 'Africa')?.value).toBeNaN();
  });

  it('sorts ascending and descending', () => {
    expect(aggregateBy(rows, 'region', { value: 'amount', sort: 'asc' }).map((x) => x.key)).toEqual(
      ['Asia', 'Europe', 'Africa'],
    );
    expect(
      aggregateBy(rows, 'region', { value: 'amount', sort: 'desc' }).map((x) => x.key),
    ).toEqual(['Europe', 'Asia', 'Africa']);
  });

  it('combines deltas so they equal the change of the summed values', () => {
    // Europe: 10 was 8 (+25%), 30 was 30 (0%) → 40 vs 38.
    const europe = aggregateBy(rows, 'region', { value: 'amount', delta: 'change' })[0];
    expect(europe.delta).toBeCloseTo(40 / 38 - 1, 10);
    // Asia: only one row has a delta (5 was 10) → the other row is ignored for the change.
    const asia = aggregateBy(rows, 'region', { value: 'amount', delta: 'change' })[1];
    expect(asia.delta).toBeCloseTo(-0.5, 10);
    // No delta anywhere → undefined.
    expect(aggregateBy(rows, 'region', { value: 'amount', delta: 'change' })[2].delta).toBe(
      undefined,
    );
  });

  it('falls back to the mean ratio for counts', () => {
    const b = aggregateBy(rows, 'region', { aggregate: 'count', delta: 'change' });
    expect(b[0].delta).toBeCloseTo(0.125, 10);
  });

  it('groups dates by time, whatever their representation', () => {
    const b = aggregateBy(
      [
        { d: '2026-09-07', v: 1 },
        { d: new Date(2026, 8, 7), v: 2 },
      ],
      'd',
      { value: 'v' },
    );
    expect(b).toHaveLength(1);
    expect(b[0].value).toBe(3);
  });
});

describe('helpers', () => {
  it('orders numeric and temporal keys, keeps strings in first-seen order', () => {
    expect(orderKeys([3, 1, 2, 1])).toEqual([1, 2, 3]);
    expect(orderKeys(['b', 'a', 'b'])).toEqual(['b', 'a']);
    expect(orderKeys(['2026-02-01', '2026-01-01'])).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('pluralizes field labels for captions', () => {
    expect(pluralLabel('Channel', 4)).toBe('channels');
    expect(pluralLabel('Category', 5)).toBe('categories');
    expect(pluralLabel('Box', 2)).toBe('boxes');
    expect(pluralLabel('Region', 1)).toBe('region');
  });

  it('matches eq and in predicates by key, never ranges', () => {
    expect(predicateHas({ op: 'in', value: ['Europe', 'Asia'] }, 'Asia')).toBe(true);
    expect(predicateHas({ op: 'eq', value: 2025 }, '2025')).toBe(true);
    expect(predicateHas({ op: 'between', value: [0, 10] }, 5)).toBe(false);
    expect(predicateHas(undefined, 'Asia')).toBe(false);
    expect(keyOf(new Date(2026, 0, 1))).toBe(keyOf('2026-01-01'));
  });
});

describe('pivotSeries / stackSeries', () => {
  const data = [
    { month: '2026-02-01', channel: 'Email', revenue: 2 },
    { month: '2026-01-01', channel: 'Email', revenue: 1 },
    { month: '2026-01-01', channel: 'Paid', revenue: 4 },
    { month: '2026-01-01', channel: 'Paid', revenue: 6 },
  ];
  const yField = {
    name: 'revenue',
    type: 'quantitative' as const,
    label: 'Revenue',
    format: 'number' as const,
  };

  it('sorts dates, splits by color and sums rows sharing an x', () => {
    const { xsRaw, series } = pivotSeries(data, {
      x: 'month',
      yFields: [yField],
      color: 'channel',
    });
    expect(xsRaw).toEqual(['2026-01-01', '2026-02-01']);
    expect(series.map((s) => [s.key, s.values])).toEqual([
      ['Email', [1, 2]],
      ['Paid', [10, null]],
    ]);
    expect(series[0].color).toBe('var(--q-cat-1)');
  });

  it('takes explicit colors by key or index', () => {
    const byKey = pivotSeries(data, {
      x: 'month',
      yFields: [yField],
      color: 'channel',
      colors: { Paid: 'red' },
    });
    expect(byKey.series[1].color).toBe('red');
    const byIndex = pivotSeries(data, {
      x: 'month',
      yFields: [yField],
      color: 'channel',
      colors: ['a'],
    });
    expect(byIndex.series.map((s) => s.color)).toEqual(['a', 'var(--q-cat-2)']);
  });

  it('stacks with missing values as zero', () => {
    const stacks = stackSeries([{ values: [1, 2] }, { values: [10, null] }]);
    expect(stacks).toEqual([
      { y0: [0, 0], y1: [1, 2] },
      { y0: [1, 2], y1: [11, 2] },
    ]);
  });

  it('keeps both signs visible and computes net totals independently of stack edges', () => {
    const series = [
      { values: [10, -4] },
      { values: [-3, 5] },
      { values: [2, -6] },
      { values: [-2, null] },
    ];
    expect(stackSeries(series)).toEqual([
      { y0: [0, 0], y1: [10, -4] },
      { y0: [0, 0], y1: [-3, 5] },
      { y0: [10, -4], y1: [12, -10] },
      { y0: [-3, 5], y1: [-5, 5] },
    ]);
    expect(seriesTotals(series)).toEqual([7, -5]);
  });
});
