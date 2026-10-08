/**
 * Shapes of the Kestrel sample data used by the trend charts in the gallery. Everything here is
 * derived from ./kestrel.ts, so the numbers match the rest of the page.
 */
import { DAYS, daily, monthlyByChannel, orders, REGIONS } from './kestrel';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

/** Revenue per channel and month for Jan–Aug of 2025 and 2026; BarChart sums the channels. */
export const monthsByYear = monthlyByChannel.flatMap((r) => {
  const [y, m] = r.month.split('-').map(Number);
  if (m > MONTHS.length || (y !== 2025 && y !== 2026)) return [];
  return [{ month: MONTHS[m - 1], year: String(y), channel: r.channel, revenue: r.revenue }];
});

/** Revenue by region over the last 15 days, with the change against the 15 days before. */
export const regionRevenue = (() => {
  const half = Math.floor(DAYS / 2);
  const dates = [...new Set(orders.map((o) => o.date))].sort();
  const recent = new Set(dates.slice(half));
  return REGIONS.map((region) => {
    let cur = 0;
    let prev = 0;
    for (const o of orders) {
      if (o.region !== region || o.status === 'Refunded') continue;
      if (recent.has(o.date)) cur += o.amount;
      else prev += o.amount;
    }
    return { region, revenue: Math.round(cur * 100) / 100, change: prev ? cur / prev - 1 : 0 };
  });
})();

/**
 * Paid and pending orders (refunds excluded). Spread into plain object types: `Order` is an
 * interface, which TypeScript does not treat as assignable to the components' `Row` record type.
 */
export const paidOrders = orders.filter((o) => o.status !== 'Refunded').map((o) => ({ ...o }));

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
const firstWeek = daily.slice(0, 7);
const lastWeek = daily.slice(-7);

/**
 * KPI rows for the sparkline list. `change` compares the mean of the last 7 days with the mean of
 * the first 7 days of the 30-day window (percentage points for rates).
 */
export const sparkRows = [
  {
    label: 'Net revenue',
    key: 'revenue' as const,
    value: daily.reduce((s, d) => s + d.revenue, 0),
    format: 'currency-compact' as const,
    change: mean(lastWeek.map((d) => d.revenue)) / mean(firstWeek.map((d) => d.revenue)) - 1,
    kind: 'percent' as const,
  },
  {
    label: 'Orders',
    key: 'orders' as const,
    value: daily.reduce((s, d) => s + d.orders, 0),
    format: 'integer' as const,
    change: mean(lastWeek.map((d) => d.orders)) / mean(firstWeek.map((d) => d.orders)) - 1,
    kind: 'percent' as const,
  },
  {
    label: 'Conversion rate',
    key: 'conversion_rate' as const,
    value: daily.reduce((s, d) => s + d.orders, 0) / daily.reduce((s, d) => s + d.sessions, 0),
    format: 'percent' as const,
    change:
      (mean(lastWeek.map((d) => d.conversion_rate)) -
        mean(firstWeek.map((d) => d.conversion_rate))) *
      100,
    kind: 'pt' as const,
  },
  {
    label: 'Avg. order value',
    key: 'aov' as const,
    value: daily.reduce((s, d) => s + d.revenue, 0) / daily.reduce((s, d) => s + d.orders, 0),
    format: 'currency' as const,
    change: mean(lastWeek.map((d) => d.aov)) / mean(firstWeek.map((d) => d.aov)) - 1,
    kind: 'percent' as const,
  },
];
