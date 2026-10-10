import { describe, expect, it } from 'vitest';
import {
  cohortMembership,
  evaluatePredictions,
  overallRetention,
  predictionRows,
  retentionByCohort,
} from '../../../apps/gallery/src/examples/science/analysis';
import {
  type CohortEvent,
  type CohortUser,
  cohortEvents,
  cohortUsers,
  labSamples,
  modelPredictions,
  SCIENCE_OBSERVED_THROUGH,
} from '../../../apps/gallery/src/examples/science/data';

const users: CohortUser[] = [
  { id: 'a', cohortMonth: '2026-04', channel: 'Organic' },
  { id: 'b', cohortMonth: '2026-04', channel: 'Paid' },
  { id: 'c', cohortMonth: '2026-04', channel: 'Organic' },
  { id: 'd', cohortMonth: '2026-05', channel: 'Paid' },
];
const events: CohortEvent[] = [
  { userId: 'a', occurredAt: '2026-05-02T12:00:00Z' },
  { userId: 'a', occurredAt: '2026-05-05T12:00:00Z' },
  { userId: 'b', occurredAt: '2026-06-05T12:00:00Z' },
  { userId: 'c', occurredAt: '2026-05-10T12:00:00Z' },
  { userId: 'd', occurredAt: '2026-06-01T12:00:00Z' },
];

describe('exact calendar-month retention', () => {
  it('counts unique users, uses signup as baseline, and omits immature cells', () => {
    const cells = retentionByCohort(users, events, '2026-07-01T00:00:00Z');
    expect(cells).toEqual([
      { cohortMonth: '2026-04', month: 0, retained: 3, eligible: 3, retention: 1 },
      { cohortMonth: '2026-04', month: 1, retained: 2, eligible: 3, retention: 2 / 3 },
      { cohortMonth: '2026-04', month: 2, retained: 1, eligible: 3, retention: 1 / 3 },
      { cohortMonth: '2026-05', month: 0, retained: 1, eligible: 1, retention: 1 },
      { cohortMonth: '2026-05', month: 1, retained: 1, eligible: 1, retention: 1 },
    ]);
    expect(overallRetention(cells)).toEqual([
      { month: 0, retained: 4, eligible: 4, retention: 1 },
      { month: 1, retained: 3, eligible: 4, retention: 0.75 },
      { month: 2, retained: 1, eligible: 3, retention: 1 / 3 },
    ]);
  });

  it('deduplicates repeated user records without changing cohort denominators', () => {
    expect(retentionByCohort([...users, { ...users[0] }], events)).toEqual(
      retentionByCohort(users, events),
    );
    expect(() =>
      retentionByCohort([...users, { ...users[0], cohortMonth: '2026-05' }], events),
    ).toThrow('Conflicting cohort');
    expect(() =>
      retentionByCohort([...users, { ...users[0], channel: 'Partner' }], events),
    ).toThrow('Conflicting cohort');
  });

  it('uses completed months even with a cutoff during the next month', () => {
    const cells = retentionByCohort(users, events, '2026-06-15T00:00:00Z');
    expect(cells.map(({ cohortMonth, month }) => [cohortMonth, month])).toEqual([
      ['2026-04', 0],
      ['2026-04', 1],
      ['2026-05', 0],
    ]);
    expect(cells.find((cell) => cell.cohortMonth === '2026-04' && cell.month === 1)?.retained).toBe(
      2,
    );
  });

  it('places activity in UTC calendar months and ignores unknown/pre-cohort events', () => {
    const cells = retentionByCohort(
      [users[0]],
      [
        { userId: 'a', occurredAt: '2026-04-30T23:30:00-02:00' },
        { userId: 'a', occurredAt: '2026-03-15T00:00:00Z' },
        { userId: 'unknown', occurredAt: '2026-06-15T00:00:00Z' },
        { userId: 'a', occurredAt: '2026-07-01T00:00:00Z' },
      ],
      '2026-07-01T00:00:00Z',
    );
    expect(cells.map((cell) => cell.retained)).toEqual([1, 1, 0]);
  });

  it('updates the eligible population when users are sliced', () => {
    const paid = users.filter((user) => user.channel === 'Paid');
    expect(overallRetention(retentionByCohort(paid, events, '2026-07-01T00:00:00Z'))).toEqual([
      { month: 0, retained: 2, eligible: 2, retention: 1 },
      { month: 1, retained: 1, eligible: 2, retention: 0.5 },
      { month: 2, retained: 1, eligible: 1, retention: 1 },
    ]);
  });

  it('distinguishes no return from an unobserved interval in the detail records', () => {
    const membership = cohortMembership(users, events, 2, '2026-07-01T00:00:00Z');
    expect(
      membership.map(({ id, eligible, retained, outcome }) => ({
        id,
        eligible,
        retained,
        outcome,
      })),
    ).toEqual([
      { id: 'a', eligible: true, retained: false, outcome: 'Did not return' },
      { id: 'b', eligible: true, retained: true, outcome: 'Returned' },
      { id: 'c', eligible: true, retained: false, outcome: 'Did not return' },
      { id: 'd', eligible: false, retained: null, outcome: 'Not yet observed' },
    ]);
    expect(
      cohortMembership(users, [], 0, '2026-07-01T00:00:00Z').every((row) => row.retained === true),
    ).toBe(true);
  });

  it('keeps immature signup cohorts visible only in the membership explanation', () => {
    const recent = [{ id: 'new', cohortMonth: '2026-06', channel: 'Organic' }];
    expect(retentionByCohort(recent, [], '2026-06-30T23:59:59Z')).toEqual([]);
    expect(cohortMembership(recent, [], 0, '2026-06-30T23:59:59Z')[0]).toMatchObject({
      eligible: false,
      retained: null,
      outcome: 'Not yet observed',
    });
    expect(retentionByCohort(recent, [], '2026-07-01T00:00:00Z')[0]).toMatchObject({
      eligible: 1,
      retained: 1,
    });
  });

  it('returns empty results for empty populations and honors an explicit age limit', () => {
    expect(retentionByCohort([], events)).toEqual([]);
    expect(overallRetention([])).toEqual([]);
    expect(cohortMembership([], events, 1)).toEqual([]);
    expect(retentionByCohort(users, events, SCIENCE_OBSERVED_THROUGH, 0)).toHaveLength(2);
  });

  it('rejects invalid dates, counts, duplicate cells, and invalid age limits', () => {
    expect(() => retentionByCohort([{ ...users[0], cohortMonth: '2026-13' }], [])).toThrow(
      'Invalid cohort month',
    );
    expect(() => retentionByCohort(users, [], 'not a date')).toThrow('Invalid observation cutoff');
    expect(() => retentionByCohort(users, [{ userId: 'a', occurredAt: 'invalid' }])).toThrow(
      'Invalid activity timestamp',
    );
    expect(() => cohortMembership(users, [], -1)).toThrow('maxMonth');
    expect(() => cohortMembership(users, [], 1.5)).toThrow('maxMonth');
    const cell = { cohortMonth: '2026-04', month: 1, retained: 1, eligible: 2, retention: 0.5 };
    expect(() => overallRetention([cell, cell])).toThrow('Duplicate retention cell');
    expect(() => overallRetention([{ ...cell, eligible: 0 }])).toThrow('valid unique-user counts');
    expect(() => overallRetention([{ ...cell, retained: 3 }])).toThrow('valid unique-user counts');
  });
});

describe('binary prediction evaluation', () => {
  it('matches a hand-calculated confusion matrix and derived metrics', () => {
    expect(
      evaluatePredictions([
        { label: 1, score: 0.9 },
        { label: 1, score: 0.7 },
        { label: 0, score: 0.8 },
        { label: 0, score: 0.1 },
        { label: 1, score: 0.2 },
        { label: 1, score: 0.3 },
      ]),
    ).toEqual({
      threshold: 0.5,
      total: 6,
      tp: 2,
      fp: 1,
      tn: 1,
      fn: 2,
      predictedPositive: 3,
      actualPositive: 4,
      precision: 2 / 3,
      recall: 0.5,
      f1: 4 / 7,
      accuracy: 0.5,
    });
  });

  it('uses an inclusive threshold, including valid endpoint scores', () => {
    const rows = [
      { label: 1 as const, score: 0.5 },
      { label: 0 as const, score: 0 },
      { label: 1 as const, score: 1 },
    ];
    expect(evaluatePredictions(rows, 0.5)).toMatchObject({ tp: 2, tn: 1, fp: 0, fn: 0 });
    expect(evaluatePredictions(rows, 0)).toMatchObject({ predictedPositive: 3, tp: 2, fp: 1 });
    expect(evaluatePredictions(rows, 1)).toMatchObject({
      predictedPositive: 1,
      tp: 1,
      fn: 1,
      tn: 1,
    });
  });

  it('returns null only for undefined ratios, while preserving defined zero scores', () => {
    expect(evaluatePredictions([])).toMatchObject({
      total: 0,
      precision: null,
      recall: null,
      f1: null,
      accuracy: null,
    });
    expect(evaluatePredictions([{ label: 0, score: 0.1 }])).toMatchObject({
      precision: null,
      recall: null,
      f1: null,
      accuracy: 1,
    });
    expect(evaluatePredictions([{ label: 1, score: 0.1 }])).toMatchObject({
      precision: null,
      recall: 0,
      f1: 0,
      accuracy: 0,
    });
    expect(evaluatePredictions([{ label: 0, score: 0.9 }])).toMatchObject({
      precision: 0,
      recall: null,
      f1: 0,
      accuracy: 0,
    });
  });

  it('annotates records without changing them and evaluates exactly the supplied slice', () => {
    const rows = Object.freeze([
      Object.freeze({ id: 'a', segment: 'A', label: 1 as const, score: 0.9 }),
      Object.freeze({ id: 'b', segment: 'B', label: 0 as const, score: 0.8 }),
      Object.freeze({ id: 'c', segment: 'A', label: 1 as const, score: 0.2 }),
      Object.freeze({ id: 'd', segment: 'B', label: 0 as const, score: 0.1 }),
    ]);
    expect(predictionRows(rows).map(({ outcome, correct }) => [outcome, correct])).toEqual([
      ['TP', true],
      ['FP', false],
      ['FN', false],
      ['TN', true],
    ]);
    expect('prediction' in rows[0]).toBe(false);
    expect(evaluatePredictions(rows.filter((row) => row.segment === 'A'))).toMatchObject({
      total: 2,
      tp: 1,
      fn: 1,
      fp: 0,
      tn: 0,
    });
  });

  it('rejects invalid scores and thresholds instead of silently changing the population', () => {
    for (const score of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => evaluatePredictions([{ label: 1, score }])).toThrow('finite scores');
    }
    for (const threshold of [-0.1, 1.1, Number.NaN]) {
      expect(() => evaluatePredictions([], threshold)).toThrow('Threshold');
      expect(() => predictionRows([], threshold)).toThrow('Threshold');
    }
  });
});

describe('original science fixtures', () => {
  it('contains bounded uniquely identified datasets and deliberate nullable measurements', () => {
    expect(labSamples).toHaveLength(180);
    expect(cohortUsers).toHaveLength(240);
    expect(modelPredictions).toHaveLength(360);
    for (const rows of [labSamples, cohortUsers, modelPredictions]) {
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    }
    expect(labSamples.some((row) => row.yieldPct === null)).toBe(true);
    expect(
      labSamples.every((row) => row.yieldPct == null || (row.yieldPct >= 0 && row.yieldPct <= 1)),
    ).toBe(true);
  });

  it('keeps membership records and aggregate retention exactly reconcilable at every age', () => {
    const cells = retentionByCohort(cohortUsers, cohortEvents);
    expect(cells).toHaveLength(21);
    expect(overallRetention(cells)[0]).toMatchObject({
      retained: 240,
      eligible: 240,
      retention: 1,
    });
    for (const total of overallRetention(cells)) {
      const records = cohortMembership(cohortUsers, cohortEvents, total.month);
      expect(records.filter((row) => row.eligible)).toHaveLength(total.eligible);
      expect(records.filter((row) => row.retained)).toHaveLength(total.retained);
    }
  });

  it('keeps every model outcome in the confusion totals for all segments and thresholds', () => {
    for (const segment of ['Starter', 'Growth', 'Enterprise']) {
      const rows = modelPredictions.filter((row) => row.segment === segment);
      for (const threshold of [0, 0.25, 0.5, 0.75, 1]) {
        const result = evaluatePredictions(rows, threshold);
        expect(result.total).toBe(120);
        expect(result.tp + result.fp + result.tn + result.fn).toBe(120);
        expect(predictionRows(rows, threshold).filter((row) => row.outcome === 'TP')).toHaveLength(
          result.tp,
        );
      }
    }
  });
});
