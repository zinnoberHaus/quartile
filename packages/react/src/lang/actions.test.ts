import { describe, expect, it } from 'vitest';
import { sourceRows } from '../data/origin';
import { resolveData } from '../data/schema';
import { actionsFor, csvFileName, resolveActions } from '../spec/actions';
import type { ComponentSpec, DashboardSpec } from '../spec/schema';
import { compileBlock } from './compile';
import { parseBlock } from './parse';

const rows = 'region,amount\nEMEA,120\nAPAC,80\nEMEA,40\n';
const warnings = (c: ReturnType<typeof compileBlock>) =>
  c.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
const errors = (c: ReturnType<typeof compileBlock>) =>
  c.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

describe('actions:', () => {
  it('lists the controls a view shows, in toolbar order', () => {
    const c = compileBlock(`bar sum(amount) by region\nactions: download, rows\n---\n${rows}`);
    expect(warnings(c)).toEqual([]);
    expect((c.spec as ComponentSpec).actions).toEqual(['rows', 'download']);
    const all = compileBlock(
      `bar sum(amount) by region\nActions: [Table, rows and download]\n---\n${rows}`,
    );
    expect((all.spec as ComponentSpec).actions).toEqual(['table', 'rows', 'download']);
  });

  it('is absent unless written, and none means an empty list', () => {
    const plain = compileBlock(`bar sum(amount) by region\n---\n${rows}`);
    expect('actions' in (plain.spec as ComponentSpec)).toBe(false);
    for (const word of ['none', 'no', 'off', 'false']) {
      const c = compileBlock(`bar sum(amount) by region\nactions: ${word}\n---\n${rows}`);
      expect(warnings(c)).toEqual([]);
      expect((c.spec as ComponentSpec).actions).toEqual([]);
    }
  });

  it('reports words that are not actions and actions a kind cannot offer', () => {
    const unknown = compileBlock(`bar sum(amount) by region\nactions: rows, export\n---\n${rows}`);
    expect(warnings(unknown)).toEqual(['“export” is not an action; it was ignored.']);
    expect(unknown.diagnostics.find((d) => d.severity === 'warning')).toMatchObject({
      line: 2,
      hint: 'Actions: table, rows, download, or none.',
    });
    expect((unknown.spec as ComponentSpec).actions).toEqual(['rows']);

    const kpi = compileBlock(`kpi sum(amount)\nactions: table, rows\n---\n${rows}`);
    expect(warnings(kpi)).toEqual(['A kpi has no “table” action; it was ignored.']);
    expect((kpi.spec as ComponentSpec).actions).toEqual(['rows']);

    const table = compileBlock(`table region, amount\nactions: rows, download\n---\n${rows}`);
    expect(warnings(table)).toEqual(['A table has no “rows” action; it was ignored.']);
    expect((table.spec as ComponentSpec).actions).toEqual(['download']);
  });

  it('set on a dashboard is the default for its views; a view may say otherwise', () => {
    const c = compileBlock(
      `dashboard Sales\nactions: table, rows\nkpi sum(amount)\nbar sum(amount) by region\nline sum(amount) by region\nactions: none\nfilters region\n---\n${rows}`,
    );
    expect(errors(c)).toEqual([]);
    expect(warnings(c)).toEqual([]);
    const layout = (c.spec as DashboardSpec).layout;
    expect(layout.map((item) => [item.component, item.actions])).toEqual([
      ['KPI', ['rows']],
      ['BarChart', ['table', 'rows']],
      ['LineChart', []],
      ['FilterBar', []],
    ]);
    const plain = compileBlock(
      `dashboard\nkpi sum(amount)\nbar sum(amount) by region\n---\n${rows}`,
    );
    expect((plain.spec as DashboardSpec).layout.every((item) => !('actions' in item))).toBe(true);
  });

  it('is validated in JSON specs', () => {
    const ok = compileBlock(
      JSON.stringify({
        component: 'BarList',
        category: 'region',
        value: 'amount',
        actions: ['rows', 'download'],
        data: [{ region: 'EU', amount: 2 }],
      }),
    );
    expect(errors(ok)).toEqual([]);
    const bad = compileBlock(
      JSON.stringify({
        component: 'BarList',
        category: 'region',
        actions: ['print'],
        data: [{ region: 'EU', amount: 2 }],
      }),
    );
    expect(errors(bad)[0]).toMatch(/\/actions\/0: Expected one of "table", "rows", "download"/);
  });
});

describe('which component offers what', () => {
  it('follows the components: charts all three, numbers their rows, tables a download', () => {
    expect(actionsFor('BarChart')).toEqual(['table', 'rows', 'download']);
    expect(actionsFor('ScatterPlot')).toEqual(['table', 'rows', 'download']);
    expect(actionsFor('Sparkline')).toEqual(['rows', 'download']);
    expect(actionsFor('KPI')).toEqual(['rows', 'download']);
    expect(actionsFor('DataTable')).toEqual(['download']);
    expect(actionsFor('FilterBar')).toEqual([]);
    expect(actionsFor('Nope')).toEqual([]);
  });

  it('lets the host set a default and turn everything off', () => {
    expect(resolveActions('BarChart', undefined, undefined)).toEqual([]);
    expect(resolveActions('BarChart', undefined, ['download', 'rows'])).toEqual([
      'rows',
      'download',
    ]);
    expect(resolveActions('BarChart', ['table'], ['rows'])).toEqual(['table']);
    expect(resolveActions('BarChart', [], ['rows'])).toEqual([]);
    expect(resolveActions('BarChart', ['table', 'rows'], false)).toEqual([]);
    expect(resolveActions('KPI', undefined, ['table', 'rows'])).toEqual(['rows']);
    expect(resolveActions('BarChart', ['rows', 'print', 'rows'], undefined)).toEqual(['rows']);
  });

  it('names the file after the title', () => {
    expect(csvFileName('Revenue by region, Q3 2026')).toBe('revenue-by-region-q3-2026.csv');
    expect(csvFileName('  ../../etc/passwd  ')).toBe('etc-passwd.csv');
    expect(csvFileName('Ventes par région')).toBe('ventes-par-région.csv');
    expect(csvFileName('***')).toBe('rows.csv');
    expect(csvFileName(undefined)).toBe('rows.csv');
  });
});

describe('view: table', () => {
  it('switches the display of a view that has its kind, instead of adding a view', () => {
    const c = compileBlock(`bar sum(amount) by region\nview: table\n---\n${rows}`);
    expect(c.type).toBe('view');
    expect(errors(c)).toEqual([]);
    expect(c.spec).toMatchObject({ component: 'BarChart', view: 'table' });
    const chart = compileBlock(`bar sum(amount) by region\nView: Chart\n---\n${rows}`);
    expect(chart.spec).toMatchObject({ component: 'BarChart', view: 'chart' });
  });

  it('applies to the view it follows inside a dashboard', () => {
    const c = compileBlock(
      `dashboard\nkpi sum(amount)\nbar sum(amount) by region\nview: table\nline sum(amount) by region\n---\n${rows}`,
    );
    const layout = (c.spec as DashboardSpec).layout;
    expect(layout.map((item) => [item.component, item.view])).toEqual([
      ['KPI', undefined],
      ['BarChart', 'table'],
      ['LineChart', undefined],
    ]);
  });

  it('still names the kind when the block has no header kind', () => {
    expect(parseBlock('view: bar\nx: region\ny: amount\n').views.map((v) => v.kind)).toEqual([
      'bar',
    ]);
    const yaml = compileBlock(`view: bar\nx: region\ny: amount\n---\n${rows}`);
    expect(yaml.spec).toMatchObject({ component: 'BarChart', x: 'region' });
    expect((yaml.spec as ComponentSpec).view).toBeUndefined();
    const table = compileBlock(`view: table\n---\n${rows}`);
    expect(table.type).toBe('view');
    expect(table.spec).toMatchObject({ component: 'DataTable' });
    // The YAML form with a kind line first: `view:` then chooses the display.
    const both = compileBlock(`type: bar\nx: region\ny: amount\nview: table\n---\n${rows}`);
    expect(both.spec).toMatchObject({ component: 'BarChart', view: 'table' });
  });

  it('warns where a kind has no table view', () => {
    const kpi = compileBlock(`kpi sum(amount)\nview: table\n---\n${rows}`);
    expect(warnings(kpi)).toEqual(['A kpi has no table view; “view” was ignored.']);
    expect(kpi.spec).toMatchObject({ component: 'KPI' });
    const table = compileBlock(`table region, amount\nview: table\n---\n${rows}`);
    expect(warnings(table)).toEqual([]);
  });
});

describe('filters', () => {
  it('compile with named fields, inferred fields, and inside a dashboard', () => {
    const named = compileBlock(`filters region\n---\n${rows}`);
    expect(errors(named)).toEqual([]);
    expect(named.spec).toMatchObject({ component: 'FilterBar', fields: [{ field: 'region' }] });
    const dash = compileBlock(`dashboard\nfilters\nkpi sum(amount)\n---\n${rows}`);
    expect(errors(dash)).toEqual([]);
    expect((dash.spec as DashboardSpec).layout[0]).toMatchObject({
      component: 'FilterBar',
      fields: [{ field: 'region' }],
    });
  });
});

describe('the rows behind a view', () => {
  it('are the author’s rows, without the columns a view adds for drawing', () => {
    const c = compileBlock(`bar count by region\n---\n${rows}`);
    const spec = c.spec as ComponentSpec;
    const drawn = resolveData(c.data[spec.data as string]);
    expect(Object.keys(drawn.schema)).toContain('count');
    const behind = sourceRows(c.data[spec.data as string]);
    expect(Object.keys(behind.schema)).toEqual(['region', 'amount']);
    expect(behind.rows).toEqual([
      { region: 'EMEA', amount: 120 },
      { region: 'APAC', amount: 80 },
      { region: 'EMEA', amount: 40 },
    ]);
    // Field settings written on the view still describe those rows.
    const described = compileBlock(
      `bar sum(amount) by region\namount.label: Net revenue\n---\n${rows}`,
    );
    const input = described.data[(described.spec as ComponentSpec).data as string];
    expect(sourceRows(input).schema.amount.label).toBe('Net revenue');
  });
});
