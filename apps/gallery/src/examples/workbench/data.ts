import { dataset } from '@quartile/react';

// Deterministic fictional records. These examples never query a customer service.
export const accountRows = Array.from({ length: 96 }, (_, i) => {
  const plan = ['Starter', 'Team', 'Enterprise'][i % 3];
  const seats = 2 + ((i * 17) % 110);
  return {
    account: `Workspace ${String(i + 1).padStart(3, '0')}`,
    plan,
    region: ['Americas', 'Europe', 'Asia Pacific'][Math.floor(i / 3) % 3],
    seats,
    mrr: seats * (plan === 'Enterprise' ? 42 : plan === 'Team' ? 24 : 12),
    adoption: (35 + ((i * 13) % 65)) / 100,
    status: i % 7 === 0 ? 'Needs attention' : 'Healthy',
  };
});

export const accounts = dataset(accountRows, {
  account: { label: 'Account' },
  mrr: { label: 'Monthly recurring revenue', format: 'currency', currency: 'USD' },
  seats: { label: 'Licensed seats', format: 'integer' },
  adoption: { label: 'Seat adoption', format: 'percent' },
});

export const requestRows = Array.from({ length: 360 }, (_, i) => {
  const service = ['Gateway', 'Search', 'Billing', 'Exports'][i % 4];
  const failed = i % 13 === 0 || (service === 'Search' && i % 7 === 0);
  return {
    request: `req_${String(i + 1).padStart(4, '0')}`,
    service,
    region: ['us-east', 'eu-west', 'ap-south'][Math.floor(i / 4) % 3],
    status: failed ? 'Error' : 'Success',
    latency: 22 + ((i * 37) % 240) + (failed ? 420 : 0) + (service === 'Exports' ? 160 : 0),
    error: failed ? 1 : 0,
  };
});

export const requests = dataset(requestRows, {
  latency: { label: 'Latency (ms)', format: 'integer', unit: 'ms' },
  error: { label: 'Error rate', format: 'percent', unit: '%' },
});

export const initialSpec = {
  title: 'Subscription portfolio',
  description: 'A validated JSON layout using the registered accounts dataset.',
  selection: 'generated-accounts',
  layout: [
    {
      component: 'FilterBar',
      data: 'accounts',
      fields: [{ field: 'region', pinned: true }],
      span: 12,
    },
    { component: 'KPI', data: 'accounts', label: 'MRR', value: 'mrr', format: 'currency', span: 4 },
    {
      component: 'KPI',
      data: 'accounts',
      label: 'Accounts',
      value: { field: 'account', aggregate: 'count' },
      span: 4,
    },
    {
      component: 'KPI',
      data: 'accounts',
      label: 'Adoption',
      value: { field: 'adoption', aggregate: 'mean' },
      format: 'percent',
      span: 4,
    },
    {
      component: 'BarList',
      data: 'accounts',
      title: 'Revenue by plan',
      category: 'plan',
      value: 'mrr',
      select: true,
      span: 6,
    },
    {
      component: 'BarChart',
      data: 'accounts',
      title: 'Revenue by region',
      x: 'region',
      y: { field: 'mrr', aggregate: 'sum' },
      select: true,
      span: 6,
    },
    {
      component: 'DataTable',
      data: 'accounts',
      columns: [{ field: 'account' }, { field: 'plan' }, { field: 'mrr', format: 'currency' }],
      sort: '-mrr',
      pageSize: 5,
      span: 12,
    },
  ],
};
