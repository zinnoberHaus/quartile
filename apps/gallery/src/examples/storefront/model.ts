// Data helpers for the storefront example: schema, aggregations, export and URL state.
import { type Dataset, dataset, makeFormatter, type Predicate, type Row } from '@quartile/react';
import {
  CATEGORIES,
  CHANNELS,
  type Channel,
  type DateRange,
  dayKey,
  PERIODS,
  type Period,
  PRODUCT_INFO,
  REGIONS,
  rangeForPeriod,
  type StorefrontFact,
} from '../../data/storefront';

export type Fact = StorefrontFact;
export type ChartStyle = 'Area' | 'Line' | 'Bars';
export const CHART_STYLES: ChartStyle[] = ['Area', 'Line', 'Bars'];

/** Publisher ids. Fields set from the URL or the filter bar are re-published under these. */
export const SOURCE = {
  filters: 'sf-filters',
  trend: 'sf-trend',
  region: 'sf-region',
  channel: 'sf-channel',
  products: 'sf-products',
  url: 'sf-url',
} as const;

/** The view that "owns" a field, so a chip, a URL and a click all behave like that view's click. */
export const FIELD_OWNER: Record<string, string> = {
  region: SOURCE.region,
  channel: SOURCE.channel,
  product: SOURCE.products,
};

export const CHANNEL_COLORS: Record<Channel, string> = {
  'Organic search': 'var(--q-cat-1)',
  'Paid social': 'var(--q-cat-2)',
  Email: 'var(--q-cat-3)',
  Direct: 'var(--q-cat-4)',
};

export function factsDataset(rows: Fact[]): Dataset<Fact> {
  return dataset(rows, {
    date: { label: 'Date', format: 'date-short' },
    region: { label: 'Region' },
    channel: { label: 'Channel' },
    product: { label: 'Product' },
    category: { label: 'Category' },
    sku: { label: 'SKU' },
    revenue: { label: 'Net revenue', format: 'currency', currency: 'USD', unit: 'USD' },
    revenue_prev: { label: 'Previous', format: 'currency', currency: 'USD', unit: 'USD' },
    revenue_change: { label: 'Change', format: 'percent' },
    orders: { label: 'Orders', format: 'integer', unit: 'COUNT' },
    orders_prev: { label: 'Orders (previous)', format: 'integer', unit: 'COUNT' },
    sessions: { label: 'Sessions', format: 'integer', unit: 'COUNT' },
    sessions_prev: { label: 'Sessions (previous)', format: 'integer', unit: 'COUNT' },
    views: { label: 'Product views', format: 'integer', unit: 'COUNT' },
    carts: { label: 'Added to cart', format: 'integer', unit: 'COUNT' },
    checkouts: { label: 'Checkout', format: 'integer', unit: 'COUNT' },
  });
}

export const fmt = {
  int: makeFormatter('integer'),
  money: makeFormatter('currency-compact'),
  currency: makeFormatter('currency'),
  pct: makeFormatter({ style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  pct2: makeFormatter({ style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

export function sumOf(rows: readonly Fact[], key: keyof Fact) {
  let s = 0;
  for (const r of rows) s += r[key] as number;
  return s;
}

export function totals(rows: readonly Fact[]) {
  const revenue = sumOf(rows, 'revenue');
  const orders = sumOf(rows, 'orders');
  const sessions = sumOf(rows, 'sessions');
  return {
    revenue,
    orders,
    sessions,
    views: sumOf(rows, 'views'),
    carts: sumOf(rows, 'carts'),
    checkouts: sumOf(rows, 'checkouts'),
    revenuePrev: sumOf(rows, 'revenue_prev'),
    ordersPrev: sumOf(rows, 'orders_prev'),
    sessionsPrev: sumOf(rows, 'sessions_prev'),
    aov: orders ? revenue / orders : Number.NaN,
    conversion: sessions ? orders / sessions : Number.NaN,
  };
}

/** Revenue and previous revenue per bucket, in date order. */
export function perBucket(rows: readonly Fact[]) {
  const map = new Map<string, { date: string; revenue: number; previous: number }>();
  for (const r of rows) {
    let b = map.get(r.date);
    if (!b) {
      b = { date: r.date, revenue: 0, previous: 0 };
      map.set(r.date, b);
    }
    b.revenue += r.revenue;
    b.previous += r.revenue_prev;
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Merges consecutive points so a sparkline has at most `max` of them. */
export function downsample(values: number[], max: number) {
  if (values.length <= max) return values;
  const out: number[] = [];
  const step = values.length / max;
  for (let i = 0; i < max; i++) {
    let s = 0;
    const a = Math.round(i * step);
    const b = Math.round((i + 1) * step);
    for (let j = a; j < b; j++) s += values[j];
    out.push(s);
  }
  return out;
}

export type ProductRow = Row & {
  rank: number;
  product: string;
  sku: string;
  category: string;
  revenue: number;
  /** Same as revenue; the Share column shows it as a share of the column total. */
  share: number;
  previous: number;
  change: number | null;
  trend: number[];
  status: string;
};

/** One row per product: revenue, change vs the previous period, trend and stock status. */
export function productRows(rows: Fact[]): ProductRow[] {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const di = new Map(dates.map((d, i) => [d, i]));
  const by = new Map<string, { revenue: number; previous: number; series: number[] }>();
  for (const r of rows) {
    let p = by.get(r.product);
    if (!p) {
      p = { revenue: 0, previous: 0, series: dates.map(() => 0) };
      by.set(r.product, p);
    }
    p.revenue += r.revenue;
    p.previous += r.revenue_prev;
    p.series[di.get(r.date) ?? 0] += r.revenue;
  }
  const out: ProductRow[] = [...by].map(([name, p]) => {
    const info = PRODUCT_INFO.get(name);
    return {
      rank: 0,
      product: name,
      sku: info?.sku ?? '',
      category: info?.category ?? '',
      revenue: p.revenue,
      share: p.revenue,
      previous: p.previous,
      change: p.previous > 0 ? p.revenue / p.previous - 1 : null,
      trend: downsample(p.series, 24),
      status: info?.status ?? '',
    };
  });
  [...out]
    .sort((a, b) => b.revenue - a.revenue)
    .forEach((r, i) => {
      r.rank = i + 1;
    });
  return out;
}

// ── Export ─────────────────────────────────────────────────────────────────────

const CSV_COLUMNS: (keyof Fact)[] = [
  'date',
  'region',
  'channel',
  'product',
  'sku',
  'category',
  'revenue',
  'orders',
  'sessions',
  'views',
  'carts',
  'checkouts',
  'revenue_prev',
  'orders_prev',
  'sessions_prev',
];

function csvCell(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: readonly Fact[]) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(','));
  return `${lines.join('\n')}\n`;
}

/** Saves text as a file through a temporary object URL. */
export function download(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A compact JSON description of what the dashboard currently shows. */
export function summaryJSON(rows: Fact[], range: DateRange, predicates: Predicate[]) {
  const t = totals(rows);
  const group = (key: 'region' | 'channel') => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + r.revenue);
    return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v)]));
  };
  const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  return JSON.stringify(
    {
      source: 'Quartile storefront example · sample data generated in the browser',
      period: { start: dayKey(range.start), end: dayKey(range.end) },
      filters: predicates.map(({ field, op, value }) => ({ field, op, value })),
      totals: {
        revenue: round(t.revenue),
        orders: Math.round(t.orders),
        avg_order_value: round(t.aov),
        conversion_rate: round(t.conversion, 4),
        previous_revenue: round(t.revenuePrev),
      },
      revenue_by_region: group('region'),
      revenue_by_channel: group('channel'),
      products: productRows(rows)
        .sort((a, b) => a.rank - b.rank)
        .map((p) => ({
          rank: p.rank,
          product: p.product,
          sku: p.sku,
          revenue: round(p.revenue),
          change: p.change == null ? null : round(p.change, 4),
        })),
    },
    null,
    2,
  );
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  el.remove();
  if (!ok) throw new Error('Copy is not available here');
}

// ── URL state (standalone page only) ───────────────────────────────────────────

export interface UrlState {
  range?: DateRange;
  compare?: boolean;
  chart?: ChartStyle;
  filters: { field: string; values: string[] }[];
}

const FILTER_FIELDS: Record<string, readonly string[]> = {
  region: REGIONS,
  channel: CHANNELS,
  product: [...PRODUCT_INFO.keys()],
  category: CATEGORIES,
};

function parseDay(s: string | null) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function readUrlState(search: string): UrlState {
  const q = new URLSearchParams(search);
  const out: UrlState = { filters: [] };
  const period = q.get('period');
  if (period && (PERIODS as string[]).includes(period))
    out.range = rangeForPeriod(period as Period);
  const from = parseDay(q.get('from'));
  const to = parseDay(q.get('to'));
  if (from && to) out.range = { start: from, end: to };
  if (q.get('compare') === '0') out.compare = false;
  const chart = q.get('chart');
  if (chart && (CHART_STYLES as string[]).includes(chart)) out.chart = chart as ChartStyle;
  for (const [field, allowed] of Object.entries(FILTER_FIELDS)) {
    const values = q.getAll(field).filter((v) => allowed.includes(v));
    if (values.length) out.filters.push({ field, values });
  }
  return out;
}

export function writeUrlState(
  period: Period | null,
  range: DateRange,
  compare: boolean,
  chart: ChartStyle,
  predicates: Predicate[],
) {
  const q = new URLSearchParams();
  if (period) {
    if (period !== '30D') q.set('period', period);
  } else {
    q.set('from', dayKey(range.start));
    q.set('to', dayKey(range.end));
  }
  if (!compare) q.set('compare', '0');
  if (chart !== 'Area') q.set('chart', chart);
  for (const p of predicates) {
    if (!(p.field in FILTER_FIELDS)) continue;
    const values = p.op === 'in' ? p.value : p.op === 'eq' ? [p.value] : [];
    for (const v of values) q.append(p.field, String(v));
  }
  const s = q.toString();
  return `${window.location.pathname}${s ? `?${s}` : ''}${window.location.hash}`;
}
