/** Original deterministic fixtures: no real customers, measurements, or trained model. */
export type LabSample = {
  id: string;
  batch: string;
  material: string;
  instrument: string;
  temperatureC: number | null;
  pressureKpa: number | null;
  /** A ratio in [0, 1], formatted as a percentage in the interface. */
  yieldPct: number | null;
  durationMin: number | null;
  passed: boolean | null;
  measuredAt: string;
};

export type CohortUser = { id: string; cohortMonth: string; channel: string };
export type CohortEvent = { userId: string; occurredAt: string };
export type ModelPrediction = { id: string; segment: string; label: 0 | 1; score: number };

/** Exclusive observation cutoff: September 2026 is the last complete UTC calendar month. */
export const SCIENCE_OBSERVED_THROUGH = '2026-10-01T00:00:00.000Z';

export const labSamples: LabSample[] = Array.from({ length: 180 }, (_, i) => {
  const batchIndex = Math.floor(i / 30);
  const temperature = 18 + ((i * 17) % 600) / 10 + (batchIndex === 4 ? 10 : 0);
  const yieldRatio = (72 + ((i * 13) % 25) - (batchIndex === 4 ? 8 : 0)) / 100;
  const temperatureC = i % 17 === 0 ? null : Math.round(temperature * 10) / 10;
  const yieldPct = i % 19 === 0 ? null : yieldRatio;
  return {
    id: `sample-${String(i + 1).padStart(3, '0')}`,
    batch: `Batch ${String(batchIndex + 1).padStart(2, '0')}`,
    material: ['Alloy', 'Polymer', 'Ceramic'][i % 3],
    instrument: ['Bench A', 'Bench B', 'Bench C'][Math.floor(i / 3) % 3],
    temperatureC,
    pressureKpa: i % 23 === 0 ? null : (950 + ((i * 29) % 210)) / 10,
    yieldPct,
    durationMin: i % 31 === 0 ? null : 15 + ((i * 7) % 50),
    passed: temperatureC == null || yieldPct == null ? null : yieldPct >= 0.8 && temperatureC < 80,
    measuredAt: new Date(Date.UTC(2026, 7, 1) + i * 6 * 60 * 60 * 1000).toISOString(),
  };
});

const cohortSizes = [28, 34, 38, 42, 46, 52];
const channels = ['Organic', 'Paid', 'Partner'];
export const cohortUsers: CohortUser[] = [];
export const cohortEvents: CohortEvent[] = [];

for (const [cohortIndex, size] of cohortSizes.entries()) {
  for (let local = 0; local < size; local++) {
    const index = cohortUsers.length;
    const user: CohortUser = {
      id: `user-${String(index + 1).padStart(3, '0')}`,
      cohortMonth: `2026-${String(cohortIndex + 4).padStart(2, '0')}`,
      channel: channels[index % channels.length],
    };
    cohortUsers.push(user);
    for (let age = 0; age <= 5 - cohortIndex; age++) {
      const channelShift = user.channel === 'Organic' ? 4 : user.channel === 'Paid' ? -7 : 0;
      const returnRate = 82 - age * 11 + channelShift + (cohortIndex - 2) * 2;
      if (age !== 0 && (index * 37 + age * 29 + cohortIndex * 13) % 100 >= returnRate) continue;
      const month = cohortIndex + 3 + age;
      cohortEvents.push({
        userId: user.id,
        occurredAt: new Date(Date.UTC(2026, month, 10, 9)).toISOString(),
      });
      // Repeat activity in a month intentionally exercises unique-user retention.
      if (index % 17 === 0) {
        cohortEvents.push({
          userId: user.id,
          occurredAt: new Date(Date.UTC(2026, month, 18, 14)).toISOString(),
        });
      }
    }
  }
}

/** Stable integer mixing supplies fixture variation without runtime randomness. */
function fraction(index: number, salt: number) {
  let value = Math.imul(index + 1, 0x45d9f3b) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

export const modelPredictions: ModelPrediction[] = Array.from({ length: 360 }, (_, i) => {
  const segment = ['Starter', 'Growth', 'Enterprise'][i % 3];
  const score = i === 0 ? 0 : i === 1 ? 1 : Math.round(fraction(i, 1729) * 1000) / 1000;
  const segmentShift = segment === 'Starter' ? 0.08 : segment === 'Enterprise' ? -0.08 : 0;
  const chance = Math.max(0.02, Math.min(0.98, 0.1 + score * 0.8 + segmentShift));
  return {
    id: `prediction-${String(i + 1).padStart(3, '0')}`,
    segment,
    label: fraction(i, 7919) < chance ? 1 : 0,
    score,
  };
});
