import { describe, expect, it } from 'vitest';
import { resolveData } from '../data/schema';
import { httpUrl } from '../spec/provenance';
import type { ComponentSpec, DashboardSpec } from '../spec/schema';
import { compileBlock } from './compile';

const rows = 'region,amount\nEMEA,120\nAPAC,80\n';
const orders = [
  { region: 'EMEA', amount: 120 },
  { region: 'APAC', amount: 80 },
];
const messages = (c: ReturnType<typeof compileBlock>, severity: string) =>
  c.diagnostics.filter((d) => d.severity === severity).map((d) => d.message);

describe('httpUrl', () => {
  it('accepts absolute http and https addresses', () => {
    expect(httpUrl('https://data.worldbank.org/indicator/NY.GDP.MKTP.CD')).toBe(
      'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD',
    );
    expect(httpUrl('  HTTP://Example.org  ')).toBe('http://example.org/');
  });

  it('refuses every other scheme, relative paths, credentials and broken input', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.org/x.csv',
      '//example.org/x',
      '/reports/q3',
      'example.org',
      'https://',
      'https:///path',
      'https://bank.example@evil.example/login',
      'https://user:secret@example.org/',
      'https://example.org/a b',
      'https://example.org/\nx',
      'java\tscript:alert(1)',
      '',
      42,
      null,
      undefined,
    ]) {
      expect(httpUrl(bad)).toBeNull();
    }
  });
});

describe('provenance settings', () => {
  it('compile onto the view, and no longer name a dataset', () => {
    const c = compileBlock(
      `bar sum(amount) by region\ntitle: Revenue\nsource: World Bank, WDI\nsource.url: https://data.worldbank.org/\nasof: 2026-11-01\n---\n${rows}`,
    );
    expect(messages(c, 'error')).toEqual([]);
    expect(messages(c, 'warning')).toEqual([]);
    expect(c.spec).toMatchObject({
      component: 'BarChart',
      data: 'data',
      source: 'World Bank, WDI',
      sourceUrl: 'https://data.worldbank.org/',
      asOf: '2026-11-01',
    });
  });

  it('accept the aliases people write', () => {
    for (const [key, prop] of [
      ['credit', 'source'],
      ['Attribution', 'source'],
      ['source name', 'source'],
      ['sourceurl', 'sourceUrl'],
      ['Source URL', 'sourceUrl'],
      ['source-url', 'sourceUrl'],
      ['as of', 'asOf'],
      ['As-Of', 'asOf'],
      ['updated', 'asOf'],
    ] as const) {
      const value = prop === 'sourceUrl' ? 'https://example.org/data' : 'Eurostat';
      const c = compileBlock(`kpi sum(amount)\n${key}: ${value}\n---\n${rows}`);
      expect(messages(c, 'warning')).toEqual([]);
      expect((c.spec as ComponentSpec)[prop]).toBe(value);
    }
  });

  it('keep text as written, quotes removed, colons kept', () => {
    const c = compileBlock(
      `kpi sum(amount)\nsource: "OECD: Main Economic Indicators"\nas of: Q3 2026\n---\n${rows}`,
    );
    expect(c.spec).toMatchObject({ source: 'OECD: Main Economic Indicators', asOf: 'Q3 2026' });
  });

  it('drop a link that is not http or https, with a warning, and still draw the chart', () => {
    for (const bad of [
      'javascript:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      '/internal/report',
      'https://bank.example@evil.example/',
    ]) {
      const c = compileBlock(
        `bar sum(amount) by region\nsource: Finance\nsource.url: ${bad}\n---\n${rows}`,
      );
      expect(messages(c, 'error')).toEqual([]);
      expect(messages(c, 'warning')).toEqual([
        '“source.url” is not an http or https link; it was ignored.',
      ]);
      expect(c.diagnostics.find((d) => d.severity === 'warning')?.line).toBe(3);
      const spec = c.spec as ComponentSpec;
      expect(spec.source).toBe('Finance');
      expect(spec.sourceUrl).toBeUndefined();
      expect(JSON.stringify(spec)).not.toContain(bad);
    }
  });

  it('describe the dashboard before the first view, and a view after its header', () => {
    const c = compileBlock(
      `dashboard Sales\nsource: Internal CRM\nupdated: 2026-11-10T09:30:00Z\nkpi sum(amount)\nbar sum(amount) by region\ncredit: Regional finance\n---\n${rows}`,
    );
    const dash = c.spec as DashboardSpec;
    expect(dash).toMatchObject({ source: 'Internal CRM', asOf: '2026-11-10T09:30:00Z' });
    expect(dash.layout[0].source).toBeUndefined();
    expect(dash.layout[1].source).toBe('Regional finance');
  });

  it('stay with a data block, shown under its table', () => {
    const c = compileBlock(`data sales\nsource: Eurostat\n---\n${rows}`);
    expect(c.spec).toMatchObject({ component: 'DataTable', source: 'Eurostat' });
  });

  it('are checked in JSON specs too: a bad link is dropped, not fatal', () => {
    const c = compileBlock(
      JSON.stringify({
        source: 'Board pack',
        sourceUrl: 'javascript:alert(1)',
        layout: [
          {
            component: 'KPI',
            label: 'Revenue',
            value: 'amount',
            source: 'Finance',
            sourceUrl: 'data:text/html,x',
            asOf: '2026-11-01',
            data: orders,
          },
          {
            component: 'BarList',
            category: 'region',
            value: 'amount',
            sourceUrl: 'https://example.org/regions',
            data: orders,
          },
        ],
      }),
    );
    expect(messages(c, 'error')).toEqual([]);
    expect(messages(c, 'warning')).toEqual([
      '“sourceUrl” is not an http or https link; it was ignored.',
      '“sourceUrl” is not an http or https link; it was ignored.',
    ]);
    const dash = c.spec as DashboardSpec;
    expect(dash.source).toBe('Board pack');
    expect(dash.sourceUrl).toBeUndefined();
    expect(dash.layout[0]).toMatchObject({ source: 'Finance', asOf: '2026-11-01' });
    expect(dash.layout[0].sourceUrl).toBeUndefined();
    expect(dash.layout[1].sourceUrl).toBe('https://example.org/regions');
  });
});

describe('source as a dataset name (compatibility)', () => {
  it('still names a known dataset when the view has no other data, with a warning', () => {
    const c = compileBlock('bar sum(amount) by region\nsource: orders\n', {
      datasets: { orders },
    });
    expect(messages(c, 'error')).toEqual([]);
    const [note] = c.diagnostics.filter((d) => d.severity === 'warning');
    expect(note).toMatchObject({
      message: 'Read “source: orders” as the dataset “orders”.',
      line: 2,
      hint: 'Write “data: orders”. “source:” now says where the data came from.',
    });
    const spec = c.spec as ComponentSpec;
    expect(spec.data).toBe('orders');
    expect(spec.source).toBeUndefined();
    expect(c.link).toBe('orders');
  });

  it('waits for a dataset that is still loading', () => {
    const c = compileBlock('bar sum(amount) by region\nsource: orders\n', {
      pendingDatasets: ['orders'],
    });
    expect(c.pending).toBe(true);
    expect(messages(c, 'error')).toEqual([]);
  });

  it('is provenance whenever the view has inline rows, data: or src:', () => {
    const inline = compileBlock(`bar sum(amount) by region\nsource: orders\n---\n${rows}`, {
      datasets: { orders: [{ region: 'Other', amount: 1 }] },
    });
    expect(messages(inline, 'warning')).toEqual([]);
    expect(inline.spec).toMatchObject({ data: 'data', source: 'orders' });
    expect(resolveData(inline.data.data).rows).toHaveLength(2);

    const named = compileBlock('bar sum(amount) by region\ndata: orders\nsource: archive\n', {
      datasets: { orders, archive: [] },
    });
    expect(messages(named, 'warning')).toEqual([]);
    expect(named.spec).toMatchObject({ data: 'orders', source: 'archive' });

    const remote = compileBlock('bar sum(amount) by region\nsrc: /orders.csv\nsource: orders\n', {
      datasets: { orders, 'url:/orders.csv': orders },
    });
    expect(messages(remote, 'warning')).toEqual([]);
    expect(remote.spec).toMatchObject({ data: 'url:/orders.csv', source: 'orders' });
  });

  it('is provenance when no dataset has that exact name', () => {
    const c = compileBlock('bar sum(amount) by region\nsource: Orders\n', {
      datasets: { orders },
    });
    // The document's only dataset is used as before; the text is shown as the source.
    expect(messages(c, 'warning')).toEqual([]);
    expect(c.spec).toMatchObject({ data: 'orders', source: 'Orders' });

    const none = compileBlock('bar sum(amount) by region\nsource: World Bank\n', {
      datasets: { orders, visits: [] },
    });
    expect(messages(none, 'error')).toEqual(['This chart has no data.']);
  });

  it('applies to a dashboard’s own settings in the same way', () => {
    const legacy = compileBlock('dashboard\nsource: orders\nkpi sum(amount)\nbarlist by region\n', {
      datasets: { orders, visits: [] },
    });
    expect(messages(legacy, 'error')).toEqual([]);
    expect(messages(legacy, 'warning')).toEqual(['Read “source: orders” as the dataset “orders”.']);
    const dash = legacy.spec as DashboardSpec;
    expect(dash.source).toBeUndefined();
    expect(dash.layout.map((item) => item.data)).toEqual(['orders', 'orders']);

    const stated = compileBlock(
      `dashboard\nsource: orders\nkpi sum(amount)\nbarlist by region\n---\n${rows}`,
      { datasets: { orders } },
    );
    expect(messages(stated, 'warning')).toEqual([]);
    expect((stated.spec as DashboardSpec).source).toBe('orders');
  });
});
