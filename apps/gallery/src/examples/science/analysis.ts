import {
  type CohortEvent,
  type CohortUser,
  type ModelPrediction,
  SCIENCE_OBSERVED_THROUGH,
} from './data';

export type RetentionCell = {
  cohortMonth: string;
  month: number;
  retained: number;
  eligible: number;
  retention: number;
};

export type OverallRetention = Omit<RetentionCell, 'cohortMonth'>;
export type CohortMembership = CohortUser & {
  eligible: boolean;
  retained: boolean | null;
  outcome: 'Returned' | 'Did not return' | 'Not yet observed';
};
export type PredictionOutcome = 'TP' | 'FP' | 'TN' | 'FN';
export type EvaluatedPrediction = ModelPrediction & {
  prediction: 0 | 1;
  outcome: PredictionOutcome;
  correct: boolean;
};
export type ModelEvaluation = {
  threshold: number;
  total: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  predictedPositive: number;
  actualPositive: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  accuracy: number | null;
};

function monthIndex(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError(`Invalid cohort month: ${month}; expected YYYY-MM.`);
  }
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

function instant(value: string | Date, label: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError(`Invalid ${label}.`);
  return date;
}

function prepareRetention(
  users: readonly CohortUser[],
  events: readonly CohortEvent[],
  cutoff: string | Date,
  maxMonth: number,
) {
  if (!Number.isSafeInteger(maxMonth) || maxMonth < 0) {
    throw new RangeError('maxMonth must be a nonnegative safe integer.');
  }
  const observed = instant(cutoff, 'observation cutoff');
  const lastComplete = observed.getUTCFullYear() * 12 + observed.getUTCMonth() - 1;
  const uniqueUsers = new Map<string, CohortUser>();
  const cohorts = new Map<
    string,
    { index: number; users: Set<string>; active: Map<number, Set<string>> }
  >();
  for (const user of users) {
    const index = monthIndex(user.cohortMonth);
    if (!user.id) throw new Error('Each cohort user needs a nonempty ID.');
    const previous = uniqueUsers.get(user.id);
    if (
      previous &&
      (previous.cohortMonth !== user.cohortMonth || previous.channel !== user.channel)
    ) {
      throw new Error(`Conflicting cohort records for user ${user.id}.`);
    }
    uniqueUsers.set(user.id, user);
    if (index > lastComplete) continue;
    let cohort = cohorts.get(user.cohortMonth);
    if (!cohort) {
      cohort = { index, users: new Set(), active: new Map() };
      cohorts.set(user.cohortMonth, cohort);
    }
    cohort.users.add(user.id);
  }

  for (const event of events) {
    const user = uniqueUsers.get(event.userId);
    if (!user) continue;
    const cohort = cohorts.get(user.cohortMonth);
    if (!cohort) continue;
    const date = instant(event.occurredAt, 'activity timestamp');
    const bucket = date.getUTCFullYear() * 12 + date.getUTCMonth();
    const age = bucket - cohort.index;
    if (
      date.getTime() >= observed.getTime() ||
      bucket > lastComplete ||
      age < 1 ||
      age > maxMonth
    ) {
      continue;
    }
    let active = cohort.active.get(age);
    if (!active) {
      active = new Set();
      cohort.active.set(age, active);
    }
    active.add(user.id);
  }

  return { uniqueUsers, cohorts, lastComplete };
}

/**
 * Exact return activity in completed UTC calendar months. Month 0 is the signup baseline.
 * Pass the chosen population of users; events outside that population are ignored.
 * The cutoff is exclusive. Omitted cells are immature, not zero retention.
 */
export function retentionByCohort(
  users: readonly CohortUser[],
  events: readonly CohortEvent[],
  cutoff: string | Date = SCIENCE_OBSERVED_THROUGH,
  maxMonth = 5,
): RetentionCell[] {
  const { cohorts, lastComplete } = prepareRetention(users, events, cutoff, maxMonth);
  const cells: RetentionCell[] = [];
  for (const [cohortMonth, cohort] of [...cohorts].sort(([a], [b]) => a.localeCompare(b))) {
    const eligible = cohort.users.size;
    const lastAge = Math.min(maxMonth, lastComplete - cohort.index);
    for (let month = 0; month <= lastAge; month++) {
      const retained = month === 0 ? eligible : (cohort.active.get(month)?.size ?? 0);
      cells.push({ cohortMonth, month, retained, eligible, retention: retained / eligible });
    }
  }
  return cells;
}

/** One record per unique user explaining the numerator and denominator for one age month. */
export function cohortMembership(
  users: readonly CohortUser[],
  events: readonly CohortEvent[],
  month: number,
  cutoff: string | Date = SCIENCE_OBSERVED_THROUGH,
): CohortMembership[] {
  const { uniqueUsers, cohorts, lastComplete } = prepareRetention(users, events, cutoff, month);
  return [...uniqueUsers.values()].map((user) => {
    const eligible = monthIndex(user.cohortMonth) + month <= lastComplete;
    const retained = eligible
      ? month === 0 || (cohorts.get(user.cohortMonth)?.active.get(month)?.has(user.id) ?? false)
      : null;
    return {
      ...user,
      eligible,
      retained,
      outcome: retained == null ? 'Not yet observed' : retained ? 'Returned' : 'Did not return',
    };
  });
}

/** Aggregate cohort numerators and eligible denominators, never an average of percentages. */
export function overallRetention(cells: readonly RetentionCell[]): OverallRetention[] {
  const totals = new Map<number, { retained: number; eligible: number }>();
  const seen = new Set<string>();
  for (const cell of cells) {
    if (
      !Number.isSafeInteger(cell.month) ||
      cell.month < 0 ||
      !Number.isSafeInteger(cell.retained) ||
      cell.retained < 0 ||
      !Number.isSafeInteger(cell.eligible) ||
      cell.eligible < 1 ||
      cell.retained > cell.eligible
    ) {
      throw new RangeError(
        'Retention cells need valid unique-user counts and a nonnegative month.',
      );
    }
    const key = `${cell.cohortMonth}:${cell.month}`;
    if (seen.has(key)) throw new Error(`Duplicate retention cell: ${key}.`);
    seen.add(key);
    const total = totals.get(cell.month) ?? { retained: 0, eligible: 0 };
    total.retained += cell.retained;
    total.eligible += cell.eligible;
    totals.set(cell.month, total);
  }
  return [...totals]
    .sort(([a], [b]) => a - b)
    .map(([month, total]) => ({
      month,
      ...total,
      retention: total.retained / total.eligible,
    }));
}

type ScoredLabel = Pick<ModelPrediction, 'label' | 'score'>;

function validateThreshold(threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('Threshold must be a finite number from 0 through 1.');
  }
}

function predictionFor(row: ScoredLabel, threshold: number): 0 | 1 {
  if (
    (row.label !== 0 && row.label !== 1) ||
    !Number.isFinite(row.score) ||
    row.score < 0 ||
    row.score > 1
  ) {
    throw new RangeError('Evaluation requires binary labels and finite scores from 0 through 1.');
  }
  return row.score >= threshold ? 1 : 0;
}

function outcomeFor(label: 0 | 1, prediction: 0 | 1): PredictionOutcome {
  return prediction === 1 ? (label === 1 ? 'TP' : 'FP') : label === 1 ? 'FN' : 'TN';
}

/** Preserve the input population; these annotations are for inspection, not model training. */
export function predictionRows(
  rows: readonly ModelPrediction[],
  threshold = 0.5,
): EvaluatedPrediction[] {
  validateThreshold(threshold);
  return rows.map((row) => {
    const prediction = predictionFor(row, threshold);
    return {
      ...row,
      prediction,
      outcome: outcomeFor(row.label, prediction),
      correct: prediction === row.label,
    };
  });
}

/** Unweighted binary classification metrics for exactly the supplied evaluation population. */
export function evaluatePredictions(
  rows: readonly ScoredLabel[],
  threshold = 0.5,
): ModelEvaluation {
  validateThreshold(threshold);
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const row of rows) {
    const prediction = predictionFor(row, threshold);
    if (prediction === 1 && row.label === 1) tp++;
    else if (prediction === 1) fp++;
    else if (row.label === 1) fn++;
    else tn++;
  }
  const ratio = (numerator: number, denominator: number) =>
    denominator === 0 ? null : numerator / denominator;
  return {
    threshold,
    total: rows.length,
    tp,
    fp,
    tn,
    fn,
    predictedPositive: tp + fp,
    actualPositive: tp + fn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    f1: ratio(2 * tp, 2 * tp + fp + fn),
    accuracy: ratio(tp + tn, rows.length),
  };
}
