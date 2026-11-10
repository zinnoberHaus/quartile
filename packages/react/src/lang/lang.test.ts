import { describe, expect, it } from 'vitest';
import { resolveData } from '../data/schema';
import type { ComponentSpec, DashboardSpec } from '../spec/schema';
import { compileBlock, layoutSpans } from './compile';
import { findFencedBlocks, scanDocument } from './document';
import { readFormat } from './formats';
import { parseBlock, parseFieldExpr, parseSentence } from './parse';
import { parseNumberToken, parseTable } from './table';

const rowsOf = (compiled: ReturnType<typeof compileBlock>, name?: string) => {
  const spec = compiled.spec as ComponentSpec;
  return resolveData(compiled.data[name ?? (spec.data as string)]).rows;
};

describe('parseTable', () => {
  it('reads CSV with quoted values and types each column', () => {
    const t = parseTable('region,revenue,active\n"Europe, West","$1,200",true\nAsia,$900,false\n');
    expect(t.format).toBe('csv');
    expect(t.rows).toEqual([
      { region: 'Europe, West', revenue: 1200, active: true },
      { region: 'Asia', revenue: 900, active: false },
    ]);
    // Whole amounts display without cents; axes keep compact currency ticks.
    expect(t.fields.revenue).toMatchObject({
      currency: 'USD',
      format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
      axisFormat: 'currency-compact',
    });
    expect(parseTable('k,v\na,$1.50\n').fields.v).toMatchObject({ format: 'currency' });
  });

  it('rejoins numbers split by an unquoted thousands separator', () => {
    const t = parseTable('region,revenue\nEurope,1,200\nAsia,900\n');
    expect(t.rows[0]).toEqual({ region: 'Europe', revenue: 1200 });
    expect(t.diagnostics.some((d) => /thousands separator/.test(d.message))).toBe(true);
  });

  it('reads Markdown tables, ignoring alignment rows and emphasis', () => {
    const t = parseTable(
      '| Month | Sales |\n|:---|---:|\n| 2026-01 | **120** |\n| 2026-02 | 135 |\n',
    );
    expect(t.format).toBe('markdown');
    expect(t.rows).toEqual([
      { Month: '2026-01-01', Sales: 120 },
      { Month: '2026-02-01', Sales: 135 },
    ]);
    expect(t.fields.Month).toMatchObject({ type: 'temporal', format: 'month' });
  });

  it('reads tab and semicolon separated values', () => {
    expect(parseTable('a\tb\n1\t2\n').rows).toEqual([{ a: 1, b: 2 }]);
    expect(parseTable('a;b\nx;2\n').rows).toEqual([{ a: 'x', b: 2 }]);
  });

  it('turns percentages into ratios with a percent format', () => {
    const t = parseTable('browser,share\nChrome,65.5%\nSafari,19%\n');
    expect(t.rows.map((r) => r.share)).toEqual([0.655, 0.19]);
    expect(t.fields.share.format).toMatchObject({ style: 'percent', maximumFractionDigits: 1 });
  });

  it('expands compact suffixes, accounting negatives and currency codes', () => {
    const t = parseTable('k,v\na,1.2M\nb,(300)\nc,EUR 40\n');
    expect(t.rows.map((r) => r.v)).toEqual([1_200_000, -300, 40]);
    expect(t.fields.v).toMatchObject({ format: 'currency-compact', currency: 'EUR' });
  });

  it('keeps missing values missing', () => {
    const t = parseTable('k,v\na,\nb,N/A\nc,—\nd,4\n');
    expect(t.rows.map((r) => r.v)).toEqual([null, null, null, 4]);
  });

  it('reads quarters as dates labelled by quarter', () => {
    const t = parseTable('q,v\n2026-Q1,1\nQ2 2026,2\n');
    expect(t.rows.map((r) => r.q)).toEqual(['2026-01-01', '2026-04-01']);
    const format = t.fields.q.format as (v: unknown) => string;
    expect(format('2026-04-01')).toBe('Q2 2026');
  });

  it('shows years without digit grouping', () => {
    const t = parseTable('year,v\n2024,1\n2025,2\n');
    expect(t.fields.year.format).toMatchObject({ useGrouping: false });
  });

  it('reads JSON rows, columns objects and arrays of arrays', () => {
    expect(parseTable('[{"a":1},{"a":2}]').rows).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseTable('{"a":[1,2],"b":["x","y"]}').rows).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ]);
    expect(parseTable('[["a","b"],[1,"x"]]').rows).toEqual([{ a: 1, b: 'x' }]);
  });

  it('holds back an unfinished record while streaming', () => {
    // Markdown renderers append a newline to code blocks, so the last line waits regardless.
    expect(parseTable('a,b\n1,2\n3,En\n', { partial: true }).rows).toEqual([{ a: 1, b: 2 }]);
    const t = parseTable('a,b\n1,2\n3,', { partial: true });
    expect(t.rows).toEqual([{ a: 1, b: 2 }]);
    expect(t.truncated).toBe(true);
    const json = parseTable('[{"a":1},{"a":2},{"a"', { partial: true });
    expect(json.rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('caps rows', () => {
    const t = parseTable(`a\n${Array.from({ length: 20 }, (_, i) => i).join('\n')}\n`, {
      maxRows: 5,
    });
    expect(t.rows).toHaveLength(5);
    expect(t.diagnostics.some((d) => d.severity === 'warning')).toBe(true);
  });
});

describe('parseNumberToken', () => {
  it.each([
    ['1,234.5', 1234.5],
    ['-$1.2M', -1_200_000],
    ['€ 40', 40],
    ['3e3', 3000],
    ['−7', -7],
    ['12%', 12],
  ])('%s → %d', (text, value) => {
    expect(parseNumberToken(text)?.value).toBe(value);
  });

  it.each(['12 apples', '1,2,3', 'Q1', '5 MB', '$'])('rejects %s', (text) => {
    expect(parseNumberToken(text)).toBeNull();
  });
});

describe('sentences', () => {
  it('reads measures, dimensions, versus fields and flags', () => {
    const s = parseSentence('sum(revenue), cost by month and region stacked');
    expect(s.measures.map((m) => [m.field, m.aggregate])).toEqual([
      ['revenue', 'sum'],
      ['cost', undefined],
    ]);
    expect(s.dims.map((d) => d.field)).toEqual(['month', 'region']);
    expect(s.flags).toEqual(['stacked']);
    expect(parseSentence('price vs rating').versus?.field).toBe('rating');
  });

  it('keeps quoted names and labels', () => {
    const s = parseSentence('avg("Order value") as "Average order" over `Sales month`');
    expect(s.measures[0]).toMatchObject({
      field: 'Order value',
      aggregate: 'mean',
      label: 'Average order',
    });
    expect(s.dims[0].field).toBe('Sales month');
  });

  it('reads counts', () => {
    expect(parseFieldExpr('count(*)')).toMatchObject({ field: null, aggregate: 'count' });
    expect(parseFieldExpr('count')).toMatchObject({ field: null, aggregate: 'count' });
    expect(parseFieldExpr('count(user_id)')).toMatchObject({
      field: 'user_id',
      aggregate: 'count',
    });
  });
});

describe('parseBlock', () => {
  it('reads a header, properties and data', () => {
    const b = parseBlock(
      'bar chart revenue by region\ntitle: Revenue: Q3\n---\nregion,revenue\nEU,1\n',
    );
    expect(b.type).toBe('view');
    expect(b.views[0].kind).toBe('bar');
    expect(b.views[0].props[0]).toMatchObject({ norm: 'title', value: 'Revenue: Q3', line: 2 });
    expect(b.data).toMatchObject({ line: 4 });
  });

  it('accepts the YAML way of writing a chart, with indented data', () => {
    const b = parseBlock(
      'title: Sales\ntype: line\nx: month\ny: sales\ndata:\n  month,sales\n  2026-01,4\n',
    );
    expect(b.views[0].kind).toBe('line');
    expect(b.views[0].props.map((p) => p.norm)).toEqual(['title', 'x', 'y']);
    expect(b.data?.text).toContain('month,sales');
  });

  it('reads rows written without a separator', () => {
    const b = parseBlock('donut share by browser\nbrowser,share\nChrome,65\n');
    expect(b.data?.text).toContain('Chrome');
  });

  it('turns several views into a dashboard and data blocks into datasets', () => {
    const d = parseBlock(
      'dashboard Overview\ndata: orders\nkpi sum(amount)\nbar sum(amount) by region\n',
    );
    expect(d.type).toBe('dashboard');
    expect(d.title).toBe('Overview');
    expect(d.views.map((v) => v.kind)).toEqual(['kpi', 'bar']);
    const data = parseBlock('data orders\nsrc: /orders.csv\n');
    expect(data).toMatchObject({ type: 'data', name: 'orders' });
  });

  it('waits for the last line while streaming', () => {
    const b = parseBlock('bar revenue by reg', { partial: true });
    expect(b.views).toHaveLength(0);
    expect(b.diagnostics).toHaveLength(0);
    expect(parseBlock('bar revenue by reg\n', { partial: true }).views).toHaveLength(0);
    expect(parseBlock('bar revenue by region\ntitle: R', { partial: true }).views[0].props).toEqual(
      [],
    );
  });

  it('reports unknown lines with their line number', () => {
    const b = parseBlock('bar revenue by region\nthis is not valid\n');
    expect(b.diagnostics[0]).toMatchObject({ severity: 'error', line: 2 });
  });
});

describe('readFormat', () => {
  it.each([
    ['currency EUR', { format: 'currency', currency: 'EUR' }],
    ['$', { format: 'currency', currency: 'USD' }],
    ['%', { format: 'percent' }],
    ['compact', { format: 'compact' }],
    ['month', { format: 'month' }],
    ['%b %Y', { format: 'month' }],
  ])('%s', (text, expected) => {
    expect(readFormat(text)).toMatchObject(expected);
  });

  it('reads d3-style number specifiers', () => {
    expect(readFormat('.1%').format).toMatchObject({ style: 'percent', maximumFractionDigits: 1 });
    expect(readFormat('$,.0f').format).toMatchObject({
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    expect(readFormat(',d').format).toMatchObject({ maximumFractionDigits: 0, useGrouping: true });
    expect(readFormat('.2s').format).toMatchObject({
      notation: 'compact',
      maximumSignificantDigits: 2,
    });
  });

  it('reads decimals and durations', () => {
    expect(readFormat('2 decimals').format).toMatchObject({
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(readFormat('percent 1').format).toMatchObject({
      style: 'percent',
      maximumFractionDigits: 1,
    });
    expect(readFormat('seconds').format).toEqual({ type: 'duration', unit: 'second' });
    expect(readFormat('sec').currency).toBeUndefined();
  });

  it('explains unknown formats', () => {
    expect(readFormat('sparkly').problem).toMatch(/Unknown format/);
  });
});

describe('compileBlock', () => {
  it('compiles a bar chart to a validated spec over inline rows', () => {
    const c = compileBlock(
      'bar revenue by region\ntitle: Revenue\n---\nregion,revenue\nEU,10\nUS,20\n',
    );
    expect(c.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(c.spec).toEqual({
      component: 'BarChart',
      title: 'Revenue',
      x: 'region',
      y: 'revenue',
      data: 'data',
    });
    expect(rowsOf(c)).toHaveLength(2);
  });

  it('sums rows that share a position and averages rates', () => {
    const c = compileBlock(
      'bar amount, rate by region\n---\nregion,amount,rate\nEU,1,10%\nEU,2,20%\n',
    );
    expect((c.spec as ComponentSpec).y).toEqual([
      { field: 'amount', aggregate: 'sum' },
      { field: 'rate', aggregate: 'mean' },
    ]);
  });

  it('orders categories on a line chart instead of dropping them', () => {
    const c = compileBlock('line revenue by quarter\n---\nquarter,revenue\nQ1,10\nQ2,12\nQ3,9\n');
    const spec = c.spec as ComponentSpec;
    expect(spec.x).toBe('quarter__order');
    expect(spec.brush).toBe(false);
    const { rows, schema } = resolveData(c.data[spec.data as string]);
    expect(rows.map((r) => r.quarter__order)).toEqual([0, 1, 2]);
    expect((schema.quarter__order.format as (v: unknown) => string)(1)).toBe('Q2');
    expect(schema.quarter__order.label).toBe('Quarter');
  });

  it('counts rows', () => {
    const kpi = compileBlock('kpi count as "Orders"\n---\nid\n1\n2\n3\n');
    expect(kpi.spec).toMatchObject({
      component: 'KPI',
      label: 'Orders',
      value: { field: 'count', aggregate: 'sum' },
    });
    const bars = compileBlock('barlist count by region\n---\nregion\nEU\nEU\nUS\n');
    expect((bars.spec as ComponentSpec).value).toBeUndefined();
    const grouped = compileBlock(
      'table count, sum(amount) by region\n---\nregion,amount\nEU,1\nEU,2\n',
    );
    expect((grouped.spec as ComponentSpec).columns).toEqual([
      { field: 'region' },
      { field: 'region', key: 'count', aggregate: 'count', label: 'Count' },
      { field: 'amount', aggregate: 'sum', key: 'sum_amount' },
    ]);
  });

  it('infers encodings the author left out', () => {
    const c = compileBlock('line\n---\nmonth,revenue,cost\n2026-01,1,2\n2026-02,3,4\n');
    expect(c.spec).toMatchObject({ x: 'month', y: ['revenue', 'cost'] });
    const scatter = compileBlock('scatter\n---\nname,price,rating\na,1,2\nb,3,4\n');
    expect(scatter.spec).toMatchObject({ x: 'price', y: 'rating' });
  });

  it('matches column names loosely and reports unknown ones with the alternatives', () => {
    const near = compileBlock('bar Revnue by REGION\n---\nregion,revenue\nEU,1\n');
    expect(near.spec).toMatchObject({ x: 'region', y: 'revenue' });
    expect(near.diagnostics.some((d) => d.severity === 'warning')).toBe(true);
    const missing = compileBlock('bar profit by region\n---\nregion,revenue\nEU,1\n');
    expect(missing.spec).toBeUndefined();
    expect(missing.diagnostics.find((d) => d.severity === 'error')).toMatchObject({
      line: 1,
      hint: 'Columns: region, revenue.',
    });
  });

  it('applies properties through the component schema, with aliases and shorthands', () => {
    const c = compileBlock(
      [
        'bar revenue by month and region',
        'stacked: yes',
        'format: $,.0f',
        'x.label: Month',
        'height: 300px',
        'legend: no',
        'sparkly: true',
        '---',
        'month,region,revenue',
        '2026-01,EU,1',
      ].join('\n'),
    );
    const spec = c.spec as ComponentSpec;
    expect(spec).toMatchObject({ stack: true, height: 300, legend: false, group: 'region' });
    // `format` describes the measure field, so axes keep automatic short ticks.
    expect(spec.format).toBeUndefined();
    const schema = resolveData(c.data[spec.data as string]).schema;
    expect(schema.revenue.format).toMatchObject({ style: 'currency', currency: 'USD' });
    expect(schema.month.label).toBe('Month');
    expect(c.diagnostics.find((d) => d.severity === 'warning')).toMatchObject({ line: 7 });
  });

  it('sorts and limits tables', () => {
    const c = compileBlock(
      'table id, amount\nsort: amount desc\nlimit: 1\n---\nid,amount\na,1\nb,2\n',
    );
    expect(c.spec).toMatchObject({ sort: '-amount', limit: 1 });
  });

  it('lays out dashboards in rows of twelve', () => {
    const c = compileBlock(
      'dashboard Orders\nkpi sum(amount)\nkpi count\nkpi mean(amount)\nbar sum(amount) by region\nline sum(amount) by date\n---\ndate,region,amount\n2026-01-01,EU,1\n2026-01-02,US,2\n',
    );
    const dash = c.spec as DashboardSpec;
    expect(dash.title).toBe('Orders');
    expect(dash.layout.map((l) => [l.component, l.span])).toEqual([
      ['KPI', 4],
      ['KPI', 4],
      ['KPI', 4],
      ['BarChart', 6],
      ['LineChart', 6],
    ]);
    expect(dash.layout[3]).toMatchObject({ select: true });
    expect(dash.layout[4]).toMatchObject({ brush: true });
  });

  it('links views over a named dataset and waits for rows while streaming', () => {
    const orders = [{ region: 'EU', amount: 1 }];
    const c = compileBlock('bar sum(amount) by region\ndata: orders\n', { datasets: { orders } });
    expect(c.link).toBe('orders');
    const inline = compileBlock('bar amount by region\n---\nregion,amount\nEU,1\n');
    expect(inline.link).toBeNull();
    const streaming = compileBlock('bar amount by region\n---\nregion,amo', { partial: true });
    expect(streaming).toMatchObject({ pending: true, diagnostics: [] });
    const missing = compileBlock('bar amount by region\n');
    expect(missing.diagnostics[0]).toMatchObject({
      severity: 'error',
      message: 'This chart has no data.',
    });
  });

  it('accepts version 1 and warns about others', () => {
    const ok = compileBlock('bar revenue by region\nversion: 1\n---\nregion,revenue\nEU,1\n');
    expect(ok.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    const later = compileBlock('bar revenue by region\nversion: 2\n---\nregion,revenue\nEU,1\n');
    expect(later.diagnostics.find((d) => d.severity === 'warning')).toMatchObject({ line: 2 });
    expect(later.spec).toBeTruthy();
  });

  it('applies dashboard field settings to a named dataset', () => {
    const c = compileBlock(
      'dashboard\ndata: orders\namount.label: Net revenue\nbar sum(amount) by region\n',
      {
        datasets: { orders: [{ region: 'EU', amount: 1 }] },
      },
    );
    const spec = (c.spec as DashboardSpec).layout[0];
    expect(resolveData(c.data[spec.data as string]).schema.amount.label).toBe('Net revenue');
    expect(spec.title).toBe('Net revenue by region');
  });

  it('reports schema problems at the property line', () => {
    const c = compileBlock('bar revenue by region\nspan: 40\n---\nregion,revenue\nEU,1\n');
    expect(c.diagnostics.find((d) => d.line === 2)).toBeTruthy();
  });

  it('accepts the JSON spec with inline rows', () => {
    const c = compileBlock(
      JSON.stringify({
        component: 'BarList',
        category: 'region',
        value: 'amount',
        data: [{ region: 'EU', amount: 2 }],
      }),
    );
    expect(c.spec).toMatchObject({ component: 'BarList', data: 'data' });
    expect(rowsOf(c)).toEqual([{ region: 'EU', amount: 2 }]);
    const rows = compileBlock('[{"a":"x","b":1}]');
    expect(rows.spec).toMatchObject({ component: 'DataTable' });
  });

  it('defines datasets and asks the host for sources', () => {
    const c = compileBlock('data orders\namount.format: currency EUR\n---\nid,amount\n1,5\n');
    expect(c.type).toBe('data');
    expect(c.defines?.name).toBe('orders');
    expect(resolveData(c.defines!.dataset).schema.amount).toMatchObject({
      currency: 'EUR',
      format: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 },
    });
    const remote = compileBlock('data sales\nsrc: https://example.com/sales.csv\n');
    expect(remote.sources).toEqual([
      { name: 'sales', url: 'https://example.com/sales.csv', line: 2 },
    ]);
    expect(remote.pending).toBe(true);
  });
});

describe('layoutSpans', () => {
  it('stretches a short row and respects explicit spans', () => {
    expect(layoutSpans([{ kind: 'kpi' }, { kind: 'kpi' }])).toEqual([6, 6]);
    expect(layoutSpans([{ kind: 'bar' }, { kind: 'line' }, { kind: 'table' }])).toEqual([6, 6, 12]);
    expect(layoutSpans([{ kind: 'bar', span: 4 }, { kind: 'line' }])).toEqual([4, 8]);
    // Headline numbers get their own row instead of stretching beside a chart.
    expect(layoutSpans([{ kind: 'kpi' }, { kind: 'kpi' }, { kind: 'line' }])).toEqual([6, 6, 12]);
  });
});

describe('documents', () => {
  it('finds fences by CommonMark rules', () => {
    const md = [
      'Intro',
      '```quartile',
      'bar a by b',
      '```',
      '~~~~ Quartile title=x',
      'kpi a',
      '~~~~',
      '```js',
      'no',
      '```',
      '````quartile',
      'line a by b',
    ].join('\n');
    const blocks = findFencedBlocks(md);
    expect(blocks.map((b) => [b.line, b.lang, b.meta, b.closed])).toEqual([
      [2, 'quartile', '', true],
      [5, 'quartile', 'title=x', true],
      [11, 'quartile', '', false],
    ]);
    expect(blocks[0].source).toBe('bar a by b\n');
  });

  it('lets blocks use datasets defined anywhere in the document', () => {
    const md =
      '```quartile\nbar sum(amount) by region\ndata: orders\n```\n\n```quartile\ndata orders\n---\nregion,amount\nEU,1\nEU,2\n```\n';
    const scan = scanDocument(md);
    expect(Object.keys(scan.datasets)).toEqual(['orders']);
    expect(scan.blocks[0].compiled.spec).toMatchObject({ component: 'BarChart', data: 'orders' });
    expect(scan.blocks[0].compiled.link).toBe('orders');
  });
});
