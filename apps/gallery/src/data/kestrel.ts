/**
 * Kestrel Goods: a fictional storefront used by every Quartile demo.
 * Deterministic (seeded), so screenshots and tests are stable. Covers Sep 7 – Oct 6, 2026.
 */

export function rng(seed = 31) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const REGIONS = [
  'North America',
  'Europe',
  'Asia Pacific',
  'Latin America',
  'Middle East & Africa',
] as const;
export const CHANNELS = ['Organic search', 'Paid social', 'Email', 'Direct'] as const;
export const CATEGORIES = ['Apparel', 'Footwear', 'Home', 'Accessories', 'Kids'] as const;
export const STATUSES = [
  'Paid',
  'Paid',
  'Paid',
  'Paid',
  'Paid',
  'Paid',
  'Paid',
  'Pending',
  'Refunded',
] as const;

export type Region = (typeof REGIONS)[number];
export type Channel = (typeof CHANNELS)[number];
export type Category = (typeof CATEGORIES)[number];

export const PRODUCTS: {
  name: string;
  sku: string;
  category: Category;
  price: number;
  status: 'In stock' | 'Low stock' | 'Backorder';
}[] = [
  { name: 'Field Jacket', sku: 'KST-1042', category: 'Apparel', price: 248, status: 'In stock' },
  {
    name: 'Trail Runner 2',
    sku: 'KST-2210',
    category: 'Footwear',
    price: 164,
    status: 'Low stock',
  },
  { name: 'Wool Throw', sku: 'KST-3307', category: 'Home', price: 132, status: 'In stock' },
  { name: 'Canvas Tote', sku: 'KST-4415', category: 'Accessories', price: 58, status: 'In stock' },
  { name: 'Merino Crew', sku: 'KST-1120', category: 'Apparel', price: 96, status: 'In stock' },
  { name: 'Stoneware Set', sku: 'KST-3381', category: 'Home', price: 118, status: 'Backorder' },
  { name: 'Court Sneaker', sku: 'KST-2274', category: 'Footwear', price: 128, status: 'In stock' },
  { name: 'Rain Shell Kids', sku: 'KST-5502', category: 'Kids', price: 74, status: 'Low stock' },
  { name: 'Leather Belt', sku: 'KST-4460', category: 'Accessories', price: 64, status: 'In stock' },
  { name: 'Linen Shirt', sku: 'KST-1187', category: 'Apparel', price: 88, status: 'In stock' },
  { name: 'Hiking Boot', sku: 'KST-2291', category: 'Footwear', price: 212, status: 'In stock' },
  { name: 'Mini Backpack', sku: 'KST-5531', category: 'Kids', price: 46, status: 'In stock' },
];

const START = new Date(2026, 8, 7);
export const DAYS = 30;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateAt(i: number) {
  return new Date(START.getFullYear(), START.getMonth(), START.getDate() + i);
}

export type Order = {
  id: string;
  date: string;
  hour: number;
  region: Region;
  channel: Channel;
  category: Category;
  product: string;
  sku: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Refunded';
};

const REGION_W = [0.41, 0.27, 0.17, 0.09, 0.06];
const CHANNEL_W = [0.32, 0.3, 0.23, 0.15];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const HOUR_W = Array.from(
  { length: 24 },
  (_, h) => 0.15 + Math.exp(-((h - 19) ** 2) / 18) + 0.6 * Math.exp(-((h - 12) ** 2) / 10),
);

function pick<T>(items: readonly T[], weights: number[], r: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i] / total;
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

/** About 3,400 orders across the 30 days. */
export const orders: Order[] = (() => {
  const r = rng(7);
  const out: Order[] = [];
  let n = 10400;
  for (let i = 0; i < DAYS; i++) {
    const d = dateAt(i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const count = Math.round((104 + i * 0.9) * (weekend ? 0.82 : 1) * (0.9 + r() * 0.2));
    for (let k = 0; k < count; k++) {
      const p = PRODUCTS[Math.floor(r() ** 1.35 * PRODUCTS.length)];
      out.push({
        id: `KST-${n++}`,
        date: dayKey(d),
        hour: pick(HOURS, HOUR_W, r()),
        region: pick(REGIONS, REGION_W, r()),
        channel: pick(CHANNELS, CHANNEL_W, r()),
        category: p.category,
        product: p.name,
        sku: p.sku,
        amount: Math.round(p.price * (0.55 + r() * 0.9) * 100) / 100,
        status: STATUSES[Math.floor(r() * STATUSES.length)],
      });
    }
  }
  return out;
})();

/** Daily totals with the previous period for comparison. Revenue in USD. */
export const daily = (() => {
  const r = rng(31);
  return Array.from({ length: DAYS }, (_, i) => {
    const d = dateAt(i);
    const wk = d.getDay() === 0 || d.getDay() === 6 ? 0.8 : 1;
    const revenue = Math.round((41200 + i * 120) * wk * (1 + (r() - 0.5) * 0.12));
    const previous = Math.round((39400 + i * 90) * wk * (1 + (r() - 0.5) * 0.12));
    const orderCount = Math.round(revenue / (70 + r() * 5));
    const sessions = Math.round(orderCount / (0.029 + r() * 0.005));
    return {
      date: dayKey(d),
      revenue,
      previous,
      orders: orderCount,
      sessions,
      conversion_rate: orderCount / sessions,
      aov: revenue / orderCount,
      users: Math.round((12400 + i * 42) * wk * (1 + (r() - 0.5) * 0.07)),
      users_previous: Math.round((11600 + i * 28) * wk * (1 + (r() - 0.5) * 0.07)),
    };
  });
})();

/** Monthly revenue by channel, Nov 2024 – Oct 2026, with a pricing change in Mar 2026. */
export const monthlyByChannel = (() => {
  const r = rng(11);
  const base = { 'Organic search': 210, 'Paid social': 150, Email: 95, Direct: 70 } as Record<
    Channel,
    number
  >;
  const out: { month: string; channel: Channel; revenue: number }[] = [];
  for (let m = 0; m < 24; m++) {
    const d = new Date(2024, 10 + m, 1);
    const growth = 1 + m * 0.025 + (m >= 16 ? 0.12 : 0);
    for (const c of CHANNELS) {
      const seasonal = 1 + 0.18 * Math.sin(((d.getMonth() - 2) / 12) * Math.PI * 2);
      out.push({
        month: dayKey(d),
        channel: c,
        revenue: Math.round(base[c] * 1000 * growth * seasonal * (0.94 + r() * 0.12)),
      });
    }
  }
  return out;
})();

export const funnel = [
  { step: 'Sessions', value: 586098 },
  { step: 'Product views', value: 334076 },
  { step: 'Added to cart', value: 60256 },
  { step: 'Checkout', value: 29580 },
  { step: 'Purchased', value: 18259 },
];

/** Session length in minutes, for histograms. */
export const sessionLengths = (() => {
  const r = rng(5);
  return Array.from({ length: 1600 }, () => {
    const u = r() + r() + r();
    return { minutes: Math.max(0.2, Math.min(12, (u / 3) * 8.4 + (r() < 0.2 ? r() * 4 : 0))) };
  });
})();

/** Sessions vs conversion per campaign, for scatter plots. */
export const campaigns = (() => {
  const r = rng(19);
  return Array.from({ length: 36 }, (_, i) => {
    const sessions = Math.round(800 + r() * 14000);
    return {
      campaign: `Campaign ${i + 1}`,
      channel: CHANNELS[i % 4],
      sessions,
      conversion_rate: 0.012 + r() * 0.04 + (sessions > 9000 ? 0.006 : 0),
      revenue: Math.round(sessions * (1.5 + r() * 4.5)),
    };
  });
})();

/** One value per day for a year, for calendar heatmaps. */
export const yearDaily = (() => {
  const r = rng(23);
  const start = new Date(2025, 9, 7);
  return Array.from({ length: 365 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const wk = d.getDay() === 0 || d.getDay() === 6 ? 0.7 : 1;
    return { date: dayKey(d), orders: Math.round((420 + i * 0.6) * wk * (0.7 + r() * 0.6)) };
  });
})();

/** Channel → outcome flows, for Sankey diagrams. */
export const channelOutcomes = [
  { from: 'Organic search', to: 'Purchased', value: 5840 },
  { from: 'Organic search', to: 'Abandoned cart', value: 9210 },
  { from: 'Organic search', to: 'Bounced', value: 12400 },
  { from: 'Paid social', to: 'Purchased', value: 5480 },
  { from: 'Paid social', to: 'Abandoned cart', value: 10100 },
  { from: 'Paid social', to: 'Bounced', value: 16800 },
  { from: 'Email', to: 'Purchased', value: 4150 },
  { from: 'Email', to: 'Abandoned cart', value: 3900 },
  { from: 'Email', to: 'Bounced', value: 3100 },
  { from: 'Direct', to: 'Purchased', value: 2790 },
  { from: 'Direct', to: 'Abandoned cart', value: 2400 },
  { from: 'Direct', to: 'Bounced', value: 4700 },
];
