/** Sample data for the Buttons and Inputs sections, derived from the shared Kestrel orders. */
import { orders, PRODUCTS, REGIONS } from './kestrel';

/** Order amounts binned in $10 steps from $0 to $360 (every Kestrel order falls inside). */
export const AMOUNT_MIN = 0;
export const AMOUNT_MAX = 360;
export const AMOUNT_BIN = 10;

export const orderAmounts = orders.map((o) => o.amount);

export const amountHistogram = (() => {
  const bins = new Array((AMOUNT_MAX - AMOUNT_MIN) / AMOUNT_BIN).fill(0) as number[];
  for (const a of orderAmounts) {
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor((a - AMOUNT_MIN) / AMOUNT_BIN)));
    bins[i]++;
  }
  return bins;
})();

export function countInRange([lo, hi]: [number, number]) {
  let n = 0;
  for (const a of orderAmounts) if (a >= lo && a <= hi) n++;
  return n;
}

const usdK = (v: number) => `$${Math.round(v / 1000)}K`;

/** Regions with their revenue over the 30 days, for the Combobox meta column. */
export const regionOptions = REGIONS.map((region) => {
  const revenue = orders.filter((o) => o.region === region).reduce((s, o) => s + o.amount, 0);
  return { value: region, label: region, meta: usdK(revenue) };
});

/** Products by SKU, with list price as the meta column. */
export const productOptions = PRODUCTS.map((p) => ({
  value: p.sku,
  label: p.name,
  meta: `$${p.price}`,
}));

export const metricOptions = [
  { value: 'net', label: 'Net revenue', description: 'sum · USD', group: 'Revenue' },
  { value: 'gross', label: 'Gross revenue', description: 'sum · USD', group: 'Revenue' },
  { value: 'aov', label: 'Avg. order value', description: 'mean · USD', group: 'Revenue' },
  {
    value: 'ltv',
    label: 'Lifetime value',
    description: 'needs plan',
    group: 'Customers',
    disabled: true,
  },
];

export const BUTTON_VARIANTS = [
  ['primary', 'Primary', 'Run query'],
  ['signal', 'Signal', 'Apply filter'],
  ['secondary', 'Secondary', 'Export'],
  ['ghost', 'Ghost', 'Cancel'],
  ['destructive', 'Destructive', 'Delete'],
] as const;

export const BUTTON_STATES = [
  'Default',
  'Hover',
  'Pressed',
  'Focus',
  'Disabled',
  'Loading',
] as const;
