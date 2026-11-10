import { describe, expect, it } from 'vitest';
import { resolveData } from '../data/schema';
import type { DataInput } from '../data/types';
import { compileBlock } from './compile';
import type { Diagnostic } from './diagnostics';
import { scanDocument } from './document';
import { readSourceValue, rowLimitOf } from './source';
import { parseTable } from './table';

const of = (severity: Diagnostic['severity'], c: { diagnostics: Diagnostic[] }) =>
  c.diagnostics.filter((d) => d.severity === severity).map((d) => d.message);
const over = (source: string, data: DataInput) =>
  compileBlock(`${source}data: d\n`, { datasets: { d: data } });

/** Views that name every field they draw. */
const NAMED: [string, string][] = [
  ['bar sum(revenue) by region\ntitle: Revenue\n', 'BarChart'],
  ['line sum(revenue) by month and plan\n', 'LineChart'],
  ['area revenue, cost by month\nstacked: yes\n', 'AreaChart'],
  ['donut sum(tickets) by priority\n', 'DonutChart'],
  ['barlist sum(amount) by region\nlimit: 5\n', 'BarList'],
  ['kpi sum(revenue) as "Revenue"\nformat: currency USD\n', 'KPI'],
  ['kpi sum(revenue) by month vs last_year\n', 'KPI'],
  ['kpi count\n', 'KPI'],
  ['table region, revenue by plan\nsort: -revenue\n', 'DataTable'],
  ['scatter price vs weight\n', 'ScatterPlot'],
  ['histogram latency\n', 'Histogram'],
  ['heatmap sum(n) by day and hour\n', 'Heatmap'],
  ['calendar sum(n) by date\n', 'CalendarHeatmap'],
  ['sankey n by from and to\n', 'Sankey'],
  ['box latency by service\n', 'BoxPlot'],
  ['funnel sum(users) by step\n', 'Funnel'],
  ['sparkline sum(revenue) by month\n', 'Sparkline'],
  ['filters region, plan\n', 'FilterBar'],
  ['bar sum(revenue) by region\nrevenue.format: currency EUR\nx.label: Where\n', 'BarChart'],
  // Nothing is said about brushing over categories: what `month` holds is not known yet.
  ['line sum(revenue) by month\nbrush: yes\n', 'LineChart'],
];

describe('a dataset with no rows', () => {
  it('compiles every view that names its fields, and reports nothing', () => {
    for (const [source, component] of NAMED) {
      const compiled = over(source, []);
      expect(compiled.diagnostics, source).toEqual([]);
      expect(compiled.spec, source).toMatchObject({ component });
      expect(compiled.pending, source).toBe(false);
      expect(compiled.empty, source).toBeUndefined();
    }
    expect(over('bar sum(revenue) by region\ntitle: Revenue by region\n', []).title).toBe(
      'Revenue by region',
    );
  });

  it('waits, without an error, when the fields would have to be inferred', () => {
    for (const source of ['line\n', 'table\n', 'bar\ntitle: Orders\n', 'scatter\n', 'kpi\n']) {
      const compiled = over(source, []);
      expect(compiled.diagnostics, source).toEqual([]);
      expect(compiled.spec, source).toBeUndefined();
      expect(compiled.empty, source).toBe(true);
      expect(compiled.pending, source).toBe(false);
    }
    expect(over('bar\ntitle: Orders\n', []).title).toBe('Orders');
    // The same view draws once there are rows to infer from.
    const drawn = over('line\n', [
      { month: '2026-01-01', revenue: 1 },
      { month: '2026-02-01', revenue: 2 },
    ]);
    expect(drawn.spec).toMatchObject({ component: 'LineChart', x: 'month', y: 'revenue' });
    expect(drawn.empty).toBeUndefined();
  });

  it('checks names again as soon as there are rows', () => {
    const rows = [{ region: 'EMEA', revenue: 1 }];
    expect(of('error', over('bar sum(revenu) by regions\n', []))).toEqual([]);
    expect(of('error', over('bar sum(sales) by region\n', rows))).toEqual([
      'There is no column “sales”.',
    ]);
  });

  it('still checks names against a header that came without rows', () => {
    const header = readSourceValue('region,revenue,month\n');
    expect(resolveData(header)).toMatchObject({ rows: [] });
    expect(Object.keys(resolveData(header).schema)).toEqual(['region', 'revenue', 'month']);

    const known = over('bar sum(revenue) by region\n', header);
    expect(known.diagnostics).toEqual([]);
    expect(known.spec).toMatchObject({ component: 'BarChart', x: 'region' });

    const unknown = over('bar sum(sales) by region\n', header);
    expect(unknown.diagnostics).toEqual([
      {
        severity: 'error',
        message: 'There is no column “sales”.',
        line: 1,
        hint: 'Columns: region, revenue, month.',
      },
    ]);

    // A table lays out the header's columns; a chart it cannot infer waits, without guesses.
    expect(over('table\n', header).spec).toMatchObject({
      component: 'DataTable',
      columns: [{ field: 'region' }, { field: 'revenue' }, { field: 'month' }],
    });
    const inferred = over('line\n', header);
    expect(inferred.diagnostics).toEqual([]);
    expect(inferred.empty).toBe(true);
  });

  it('keeps the header of an empty table in every format', () => {
    for (const text of [
      'region,revenue\n',
      'region\trevenue\n',
      '| region | revenue |\n| --- | --- |\n',
      '[["region","revenue"]]',
      '{"values":[["region","revenue"]],"range":"A1:B1"}',
    ]) {
      const table = parseTable(text);
      expect(table.rows, text).toEqual([]);
      expect(table.columns, text).toEqual(['region', 'revenue']);
      expect(Object.keys(resolveData(readSourceValue(text)).schema), text).toEqual([
        'region',
        'revenue',
      ]);
    }
    expect(parseTable('[]').columns).toEqual([]);
    expect(parseTable('{"results":[]}').columns).toEqual([]);
  });

  it('is no error for rows written in the block either', () => {
    for (const data of ['[]', '{"results": []}', '{"data": [], "meta": {"total": 0}}', '']) {
      const compiled = compileBlock(`bar sum(revenue) by region\ntitle: Revenue\n---\n${data}\n`);
      expect(of('error', compiled), data).toEqual([]);
      expect(of('warning', compiled), data).toEqual([]);
      expect(compiled.spec, data).toMatchObject({ component: 'BarChart', title: 'Revenue' });
    }
    const header = compileBlock('bar sum(sales) by region\n---\nregion,revenue\n');
    expect(of('error', header)).toEqual(['There is no column “sales”.']);
  });

  it('waits for more while the block still streams', () => {
    const streaming = compileBlock('bar sum(revenue) by region\ndata: d\n', {
      datasets: { d: [] },
      partial: true,
    });
    expect(streaming.pending).toBe(true);
    expect(streaming.spec).toBeUndefined();
    expect(streaming.empty).toBeUndefined();
  });

  it('defines an empty named dataset that other blocks draw their empty state from', () => {
    const source = 'data orders\nsrc: /api/orders\ntotal.format: currency USD\n';
    const defined = compileBlock(source, { datasets: { orders: [] } });
    expect(defined.diagnostics).toEqual([]);
    expect(defined.defines).toMatchObject({ name: 'orders', dataset: { rows: [] } });
    // A table needs a column, so the block itself has nothing to lay out yet.
    expect(defined.spec).toBeUndefined();
    expect(defined.empty).toBe(true);

    const scan = scanDocument(
      [
        '```quartile',
        'data orders',
        '---',
        '[]',
        '```',
        '',
        '```quartile',
        'kpi sum(total) as "Revenue"',
        'data: orders',
        '```',
      ].join('\n'),
    );
    expect(scan.diagnostics).toEqual([]);
    expect(scan.blocks[1].compiled.spec).toMatchObject({ component: 'KPI', label: 'Revenue' });
  });

  it('draws the views of a dashboard that name their fields, and waits as a whole otherwise', () => {
    const mixed = compileBlock(
      'dashboard Sales\ndata: d\n\nkpi sum(revenue) as "Revenue"\nbar sum(revenue) by region\ntable\n',
      { datasets: { d: [] } },
    );
    expect(mixed.diagnostics).toEqual([]);
    expect(
      (mixed.spec as { layout: { component: string }[] }).layout.map((v) => v.component),
    ).toEqual(['KPI', 'BarChart']);
    expect(mixed.empty).toBeUndefined();

    const inferred = compileBlock('dashboard Sales\ndata: d\n\nline\ntable\n', {
      datasets: { d: [] },
    });
    expect(inferred.diagnostics).toEqual([]);
    expect(inferred.spec).toBeUndefined();
    expect(inferred.empty).toBe(true);
    expect(inferred.title).toBe('Sales');
  });
});

describe('one problem, one message', () => {
  const only = (source: string) => {
    const compiled = compileBlock(source);
    expect(compiled.spec, source).toBeUndefined();
    expect(compiled.empty, source).toBeUndefined();
    return of('error', compiled);
  };

  it('reports only the data that could not be read', () => {
    const json = JSON.stringify({ data: { items: [{ region: 'EMEA', revenue: 1 }] } });
    expect(only(`bar sum(revenue) by region\npath: data.rows\n---\n${json}\n`)).toEqual([
      'The path `data.rows` stops at `rows`: there is no such key at `data`.',
    ]);
    expect(only(`bar sum(revenue) by region\npath: data[*]\n---\n${json}\n`)).toEqual([
      '`data[*]` is not a path this language reads.',
    ]);
    expect(
      only('bar sum(revenue) by region\n---\n{"current":[{"a":1}],"previous":[{"a":2}]}\n'),
    ).toEqual(['Several keys hold rows: `current`, `previous`.']);
    expect(only('bar sum(revenue) by region\n---\n{"status":"error","message":"no"}\n')).toEqual([
      'Expected an array of rows or an object of columns.',
    ]);
    const invalid = only('kpi sum(revenue)\n---\n[{"revenue": 1},\n');
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatch(/^The data is not valid JSON/);
    expect(only('table region, revenue\n---\nregion,revenue\n"EMEA,1\n')).toEqual([
      'A quoted value is never closed.',
    ]);
  });

  it('holds for every view of a dashboard', () => {
    const errors = only(
      'dashboard Sales\npath: nope\n\nkpi sum(revenue)\nbar sum(revenue) by region\ntable\n---\n{"data":[{"region":"EMEA","revenue":1}]}\n',
    );
    expect(errors).toEqual([
      'The path `nope` stops at `nope`: there is no such key at the top level.',
    ]);
  });

  it('still reports a wrong field when the data itself is fine', () => {
    const compiled = compileBlock('bar sum(sales) by area\n---\nregion,revenue\nEMEA,1\n');
    expect(of('error', compiled)).toEqual([
      'There is no column “area”.',
      'There is no column “sales”.',
    ]);
  });
});

describe('rows cut to a limit', () => {
  const csv = `region,revenue\n${Array.from({ length: 12 }, (_, i) => `R${i},${i}`).join('\n')}\n`;
  const json = JSON.stringify(
    Array.from({ length: 12 }, (_, i) => ({ region: `R${i}`, revenue: i })),
  );

  it('says how many rows the data held', () => {
    expect(parseTable(csv, { maxRows: 5 })).toMatchObject({ rowsTotal: 12 });
    expect(parseTable(json, { maxRows: 5 })).toMatchObject({ rowsTotal: 12 });
    expect(parseTable(csv, { maxRows: 12 })).not.toHaveProperty('rowsTotal');
    expect(parseTable(json)).not.toHaveProperty('rowsTotal');
  });

  it('records the cut of rows written in the block, beside the warning it already gave', () => {
    const compiled = compileBlock(`bar sum(revenue) by region\n---\n${csv}`, { maxRows: 5 });
    expect(compiled.rowLimits).toEqual([{ data: 'data', kept: 5, total: 12 }]);
    expect(of('warning', compiled)).toEqual(['Kept the first 5 rows; 7 more were ignored.']);
    expect(compileBlock(`bar sum(revenue) by region\n---\n${csv}`)).not.toHaveProperty('rowLimits');
  });

  it('keeps the warning for a loaded source, in every block drawn from it', () => {
    for (const text of [csv, json]) {
      const loaded = readSourceValue(text, { maxRows: 5 });
      expect(rowLimitOf(resolveData(loaded).rows)).toEqual({ kept: 5, total: 12, loaded: true });

      const chart = compileBlock('bar sum(revenue) by region\nsrc: /api/rows\n', {
        datasets: { 'url:/api/rows': loaded },
      });
      expect(chart.rowLimits).toEqual([{ data: 'url:/api/rows', kept: 5, total: 12 }]);
      expect(chart.diagnostics).toEqual([
        {
          severity: 'warning',
          message: 'Kept the first 5 of 12 rows.',
          line: 1,
          hint: 'The page keeps a limited number of rows from a source; its host can raise `maxRows`.',
        },
      ]);
      expect(chart.spec).toMatchObject({ component: 'BarChart' });
    }
    expect(rowLimitOf(resolveData(readSourceValue(csv)).rows)).toBeUndefined();
  });

  it('follows a named dataset into the blocks that read it, once per block', () => {
    const loaded = readSourceValue(csv, { maxRows: 5 });
    const defined = compileBlock('data sales\nsrc: /sales.csv\nrevenue.format: currency EUR\n', {
      datasets: { sales: loaded },
    });
    expect(defined.rowLimits).toEqual([{ data: 'sales', kept: 5, total: 12 }]);
    expect(of('warning', defined)).toEqual(['Kept the first 5 of 12 rows.']);

    // Other blocks see the described copy, which holds the same rows.
    const described = defined.defines?.dataset as DataInput;
    const dashboard = compileBlock(
      'dashboard Sales\ndata: sales\n\nkpi sum(revenue)\nbar sum(revenue) by region\ntable\n',
      { datasets: { sales: described } },
    );
    expect(dashboard.rowLimits).toEqual([{ data: 'sales', kept: 5, total: 12 }]);
    expect(of('warning', dashboard)).toEqual(['Kept the first 5 of 12 rows.']);
  });
});
