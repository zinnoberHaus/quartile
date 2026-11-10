// The blocks and snippets handed to the documentation for remote data, run as written.
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { compileBlock } from '../lang/compile';
import { createSourceLoader } from '../lang/source';
import { QuartileBlock } from './QuartileBlock';
import { QuartileDocument } from './QuartileDocument';

const visitorsBlock = `line sum(visitors) by day
title: Visitors, last 7 days
src: https://api.example.com/v1/analytics/visitors?range=7d
path: data.results
refresh: 5m
`;

const visitorsResponse = `{
  "status": "ok",
  "data": {
    "results": [
      { "day": "2026-11-03", "visitors": 1840 },
      { "day": "2026-11-04", "visitors": 2015 },
      { "day": "2026-11-05", "visitors": 1962 }
    ],
    "next_cursor": null
  },
  "meta": { "request_id": "req_8f2c" }
}`;

const inlineBlock = `bar sum(revenue) by region
title: Revenue by region
path: data.items
---
{"status": "ok", "data": {"items": [{"region": "EMEA", "revenue": 1200000}, {"region": "APAC", "revenue": 860000}], "total": 2}}
`;

const envelopeBlock = `donut sum(tickets) by priority
---
{"data": [{"priority": "Urgent", "tickets": 14}, {"priority": "Normal", "tickets": 52}], "meta": {"page": 1}}
`;

const ordersBlock = `data orders
src: /api/orders.json
path: orders
refresh: 30s
total.format: currency USD
`;

const revenueBlock = `kpi sum(total) as "Revenue"
data: orders
`;

describe('remote data examples', () => {
  it('an API envelope with path and refresh', async () => {
    const compiled = compileBlock(visitorsBlock);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.sources).toEqual([
      {
        name: 'url:https://api.example.com/v1/analytics/visitors?range=7d path:data.results',
        url: 'https://api.example.com/v1/analytics/visitors?range=7d',
        line: 3,
        path: 'data.results',
        refresh: 300,
      },
    ]);

    const fetch = vi.fn(async () => new Response(visitorsResponse));
    const loadSource = createSourceLoader({
      origins: ['same-origin', 'https://api.example.com'],
      fetch,
    });
    const { container } = render(
      <QuartileDocument loadSource={loadSource} minRefresh={30}>
        <QuartileBlock source={visitorsBlock} />
      </QuartileDocument>,
    );
    await waitFor(() =>
      expect(screen.getByRole('figure', { name: 'Visitors, last 7 days' })).toBeTruthy(),
    );
    expect(container.querySelector('svg path')).not.toBeNull();
    expect(container.querySelector('.q-block-error')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('inline JSON read through path, and an envelope read without one', () => {
    const inline = compileBlock(inlineBlock);
    expect(inline.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(inline.spec).toMatchObject({ component: 'BarChart', x: 'region' });
    render(<QuartileBlock source={inlineBlock} />);
    expect(screen.getByRole('figure', { name: 'Revenue by region' })).toBeTruthy();

    const envelope = compileBlock(envelopeBlock);
    expect(envelope.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(envelope.diagnostics.map((d) => d.message)).toContain('Read rows from `data`.');
    expect(envelope.spec).toMatchObject({ component: 'DonutChart', category: 'priority' });
  });

  it('a named dataset loaded from an API and read by another block', async () => {
    expect(compileBlock(ordersBlock).sources).toEqual([
      { name: 'orders', url: '/api/orders.json', line: 2, path: 'orders', refresh: 30 },
    ]);
    const loadSource = vi.fn(async () => ({
      orders: [
        { id: 1001, total: 129 },
        { id: 1002, total: 80 },
      ],
      page: 1,
    }));
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={ordersBlock} />
        <QuartileBlock source={revenueBlock} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('$209')).toBeTruthy());
    await act(async () => {});
    expect(loadSource).toHaveBeenCalledTimes(1);
    expect(loadSource).toHaveBeenCalledWith('/api/orders.json', expect.any(AbortSignal));
  });
});
