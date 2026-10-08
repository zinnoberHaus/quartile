/**
 * Derived sample data for the distribution and flow charts. Everything comes from kestrel.ts;
 * nothing here adds new numbers.
 */
import { dataset } from '@quartile/react';
import { campaigns, channelOutcomes, orders, sessionLengths, yearDaily } from './kestrel';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const HOURS = Array.from({ length: 24 }, (_, h) => h);

export const pad2 = (v: unknown) => String(v).padStart(2, '0');

/** Session length in minutes, labelled and formatted for the histogram. */
export const sessions = dataset(sessionLengths, {
  minutes: {
    label: 'Session length',
    format: (v: unknown) => `${Number(v).toFixed(1).replace(/\.0$/, '')} min`,
  },
});

/** Campaigns, with conversion formatted as a percentage. */
export const campaignData = dataset(campaigns, {
  conversion_rate: { label: 'Conversion', format: 'percent' },
});

/** Orders with weekday and hour, for the "Orders by hour" matrix. */
export const ordersByHour = orders.map((o) => {
  const [y, m, d] = o.date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return { weekday: WEEKDAYS[(day + 6) % 7], hour: o.hour, amount: o.amount };
});

/** Channel → outcome sessions, named for the Sankey. */
export const channelFlows = channelOutcomes.map((f) => ({
  channel: f.from,
  outcome: f.to,
  sessions: f.value,
}));

/** Order amounts by region, for box plots. */
export const regionAmounts = orders.map((o) => ({ region: o.region, amount: o.amount }));

export { yearDaily };
