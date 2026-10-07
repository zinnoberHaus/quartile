import { dataset, makeFormatter } from '@quartile/react';
import { daily, orders, PRODUCTS } from './kestrel';

const prevRatio = new Map(daily.map((d) => [d.date, d.previous / d.revenue]));
const stockOf = new Map(PRODUCTS.map((p) => [p.name, p.status]));

/**
 * Kestrel orders with two derived fields for the data-display demos:
 * - `previous_amount`: the order's amount scaled by that day's previous/current revenue ratio in
 *   `daily`, so a "previous period" total follows the same filters (sample data only);
 * - `stock`: the product's stock status from the catalog.
 */
export const orderLines = orders.map((o) => ({
  ...o,
  previous_amount: Math.round(o.amount * (prevRatio.get(o.date) ?? 1) * 100) / 100,
  stock: stockOf.get(o.product) ?? 'In stock',
}));

export type OrderLine = (typeof orderLines)[number];

export const orderData = dataset(orderLines, {
  date: { label: 'Date' },
  amount: { label: 'Revenue', format: 'currency' },
  previous_amount: { label: 'Previous', format: 'currency' },
  stock: { label: 'Status' },
});

const money = makeFormatter('currency-compact');
const int = makeFormatter('integer');

/** "2,104 orders · $187.4K" for the rows that pass every predicate. */
export function ordersSummary(rows: { amount: number }[]) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return `${int(rows.length)} orders · ${money(total)}`;
}

export const STOCK_TONES = {
  'In stock': 'positive',
  'Low stock': 'warning',
  Backorder: 'negative',
} as const;
