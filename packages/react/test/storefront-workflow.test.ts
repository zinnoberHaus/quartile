import { describe, expect, it } from 'vitest';
import { buildFacts, rangeForPeriod } from '../../../apps/gallery/src/data/storefront';
import {
  readUrlState,
  SOURCE,
  totals,
  writeUrlState,
} from '../../../apps/gallery/src/examples/storefront/model';
import { applyPredicates } from '../src/data/predicates';

describe('storefront shared views', () => {
  it('round-trips a brushed date range with a market and preserves the matching totals', () => {
    const range = rangeForPeriod('30D');
    const predicates = [
      { field: 'region', op: 'in' as const, value: ['Europe'], source: SOURCE.region },
      {
        field: 'date',
        op: 'between' as const,
        value: ['2026-09-10', '2026-09-17'] as [string, string],
        source: SOURCE.trend,
      },
    ];
    const url = writeUrlState('30D', range, true, 'Area', predicates);
    const restored = readUrlState(new URL(url, window.location.origin).search);
    expect(restored.dateFilter).toEqual({ op: 'between', value: ['2026-09-10', '2026-09-17'] });
    const rows = buildFacts(range);
    const restoredPredicates = [
      ...restored.filters.map((filter) => ({
        field: filter.field,
        op: 'in' as const,
        value: filter.values,
      })),
      { field: 'date', ...restored.dateFilter! },
    ];
    const expected = rows.filter(
      (row) => row.region === 'Europe' && row.date >= '2026-09-10' && row.date <= '2026-09-17',
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(totals(applyPredicates(rows, restoredPredicates))).toEqual(totals(expected));
  });

  it('round-trips nonconsecutive selected bars and ignores malformed date selections', () => {
    const range = rangeForPeriod('30D');
    const url = writeUrlState('30D', range, false, 'Bars', [
      { field: 'date', op: 'in', value: ['2026-09-10', '2026-09-17'], source: SOURCE.trend },
    ]);
    expect(readUrlState(new URL(url, window.location.origin).search)).toMatchObject({
      chart: 'Bars',
      compare: false,
      dateFilter: { op: 'in', value: ['2026-09-10', '2026-09-17'] },
    });
    expect(readUrlState('?dateFrom=2026-09-17&dateTo=2026-09-10').dateFilter).toBeUndefined();
    expect(readUrlState('?date=2026-02-31&date=not-a-date&from=2026-02-31&to=2026-03-02')).toEqual({
      filters: [],
    });
    expect(readUrlState('?date=2026-09-10&date=2026-09-10').dateFilter).toEqual({
      op: 'in',
      value: ['2026-09-10'],
    });
  });
});
