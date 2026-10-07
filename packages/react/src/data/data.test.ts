import { describe, expect, it } from 'vitest';
import { compactNumber, deltaTone, formatDelta, MINUS, makeFormatter } from './format';
import { applyPredicates, describePredicate, matches, predicateValueLabel } from './predicates';
import { dataset, humanize, inferSchema, resolveData, toComparable, toDate } from './schema';

describe('humanize', () => {
  it('turns field names into labels', () => {
    expect(humanize('net_revenue')).toBe('Net revenue');
    expect(humanize('conversionRate')).toBe('Conversion rate');
    expect(humanize('users-previous')).toBe('Users previous');
  });
});

describe('inferSchema', () => {
  const rows = [
    {
      date: '2026-09-07',
      region: 'Europe',
      revenue: 41200.5,
      orders: 580,
      conversion_rate: 0.031,
      paid: true,
    },
    {
      date: '2026-09-08',
      region: 'Asia Pacific',
      revenue: 39800,
      orders: 552,
      conversion_rate: 0.029,
      paid: false,
    },
  ];
  const s = inferSchema(rows);

  it('detects types from values', () => {
    expect(s.date.type).toBe('temporal');
    expect(s.region.type).toBe('nominal');
    expect(s.orders.type).toBe('quantitative');
    expect(s.paid.type).toBe('boolean');
  });

  it('attaches formats from names and values', () => {
    expect(s.revenue.format).toBe('currency');
    expect(s.revenue.unit).toBe('USD');
    expect(s.orders.format).toBe('integer');
    expect(s.conversion_rate.format).toBe('percent');
    expect(s.date.format).toBe('date-short');
  });

  it('lets explicit overrides win', () => {
    const d = dataset(rows, { revenue: 'compact', orders: { label: 'Order count' } });
    expect(d.schema.revenue.format).toBe('compact');
    expect(d.schema.orders.label).toBe('Order count');
    expect(resolveData(d).rows).toBe(d.rows);
  });
});

describe('dates', () => {
  it('parses plain ISO dates as local days', () => {
    const d = toDate('2026-09-07');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 7]);
  });
  it('compares dates by time', () => {
    expect(toComparable(new Date(2026, 0, 1))).toBe(new Date(2026, 0, 1).getTime());
    expect(toComparable('2026-01-01')).toBe(new Date(2026, 0, 1).getTime());
    expect(toComparable('Europe')).toBe('Europe');
  });
});

describe('formats', () => {
  it('formats compact numbers the way dashboards read them', () => {
    expect(compactNumber(1_320_000)).toBe('1.32M');
    expect(compactNumber(548_000)).toBe('548.0K');
    expect(compactNumber(548_000, true)).toBe('548K');
    expect(compactNumber(-2_500)).toBe(`${MINUS}2.5K`);
  });
  it('formats currency, percent and dates', () => {
    expect(makeFormatter('currency')(72.35)).toBe('$72.35');
    expect(makeFormatter('currency')(1_320_000)).toBe('$1.32M');
    expect(makeFormatter('currency', { short: true })(60_000)).toBe('$60K');
    expect(makeFormatter('percent')(0.0312)).toBe('3.12%');
    expect(makeFormatter('date-short')('2026-09-07')).toBe('Sep 7');
    expect(makeFormatter('month')('2026-03-01')).toBe('Mar ’26');
    expect(makeFormatter('integer')(null)).toBe('—');
  });
  it('signs deltas with a typographic minus', () => {
    expect(formatDelta(0.124)).toBe('+12.4%');
    expect(formatDelta(-0.031)).toBe(`${MINUS}3.1%`);
    expect(formatDelta(0)).toBe('±0.0%');
    expect(formatDelta(-0.02, 'pt')).toBe(`${MINUS}0.02 pt`);
  });
  it('reads tone, inverted for metrics where down is good', () => {
    expect(deltaTone(0.1)).toBe('positive');
    expect(deltaTone(-0.1)).toBe('negative');
    expect(deltaTone(0.1, true)).toBe('negative');
    expect(deltaTone(0)).toBe('neutral');
  });
});

describe('predicates', () => {
  const rows = [
    { date: '2026-09-01', region: 'Europe', amount: 10 },
    { date: '2026-09-05', region: 'Asia Pacific', amount: 20 },
    { date: '2026-09-09', region: 'Europe', amount: 30 },
  ];
  it('matches eq, in and between', () => {
    expect(matches(rows[0], { field: 'region', op: 'eq', value: 'Europe' })).toBe(true);
    expect(matches(rows[1], { field: 'region', op: 'in', value: ['Europe', 'Asia Pacific'] })).toBe(
      true,
    );
    expect(matches(rows[2], { field: 'amount', op: 'between', value: [5, 25] })).toBe(false);
  });
  it('compares dates in ranges', () => {
    const out = applyPredicates(rows, [
      { field: 'date', op: 'between', value: ['2026-09-02', new Date(2026, 8, 9)] },
    ]);
    expect(out.map((r) => r.amount)).toEqual([20, 30]);
  });
  it('combines predicates with AND', () => {
    const out = applyPredicates(rows, [
      { field: 'region', op: 'eq', value: 'Europe' },
      { field: 'amount', op: 'between', value: [15, null] },
    ]);
    expect(out).toEqual([rows[2]]);
  });
  it('describes predicates for chips and logs', () => {
    const schema = inferSchema(rows);
    expect(describePredicate({ field: 'region', op: 'eq', value: 'Europe' })).toBe(
      'region = "Europe"',
    );
    expect(
      predicateValueLabel(
        { field: 'date', op: 'between', value: ['2026-08-30', '2026-09-12'] },
        schema,
      ),
    ).toBe('Aug 30 – Sep 12');
    expect(predicateValueLabel({ field: 'region', op: 'in', value: ['A', 'B'] })).toBe(
      '2 selected',
    );
  });
});
