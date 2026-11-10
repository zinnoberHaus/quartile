import { describe, expect, it } from 'vitest';
import type { ComponentSpec, DashboardSpec } from '../spec/schema';
import { compileBlock } from './compile';
import { scanDocument } from './document';

const rows = 'month,region,amount\n2026-07,EMEA,120\n2026-07,APAC,80\n2026-08,EMEA,40\n';
const orders = [
  { month: '2026-07-01', region: 'EMEA', amount: 120 },
  { month: '2026-07-01', region: 'APAC', amount: 80 },
  { month: '2026-08-01', region: 'EMEA', amount: 40 },
];
/** The compiled view with its group, after checking that the block has no errors. */
function spec(
  source: string,
  datasets: Record<string, typeof orders> = { orders },
): ComponentSpec & { link: string | null } {
  const c = compileBlock(source, { datasets });
  expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return { ...(c.spec as ComponentSpec), link: c.link };
}

describe('views in a named group publish by default', () => {
  it('switches on what a dashboard switches on: click on marks, brush on scales', () => {
    expect(spec('bar sum(amount) by region\ndata: orders\n')).toMatchObject({
      select: true,
      link: 'orders',
    });
    expect(spec('barlist sum(amount) by region\ndata: orders\n').select).toBe(true);
    expect(spec('donut sum(amount) by region\ndata: orders\n').select).toBe(true);
    expect(spec('line sum(amount) by month\ndata: orders\n').brush).toBe(true);
    expect(spec('area sum(amount) by month\ndata: orders\n').brush).toBe(true);
    expect(spec('histogram amount\ndata: orders\n').brush).toBe(true);
    // Kinds a dashboard leaves alone stay as they are.
    const kpi = spec('kpi sum(amount)\ndata: orders\n');
    expect('select' in kpi || 'brush' in kpi).toBe(false);
    expect('select' in spec('table region, amount\ndata: orders\n')).toBe(false);
    expect('select' in spec('heatmap sum(amount) by month and region\ndata: orders\n')).toBe(false);
  });

  it('covers every way a group is named: a dataset, the only dataset, and link:', () => {
    // The document's single dataset is used without `data:`, and names the group all the same.
    expect(spec('barlist sum(amount) by region\n')).toMatchObject({ select: true, link: 'orders' });
    // A chart's own `src:`, once the host has loaded it.
    expect(
      spec('barlist sum(amount) by region\nsrc: /orders.csv\n', { 'url:/orders.csv': orders }),
    ).toMatchObject({ select: true, link: 'url:/orders.csv' });
    // Inline rows joined to a named group.
    expect(spec(`barlist sum(amount) by region\nlink: sales\n---\n${rows}`)).toMatchObject({
      select: true,
      link: 'sales',
    });
  });

  it('lets a view opt out with select: no, brush: no or link: no', () => {
    expect(spec('bar sum(amount) by region\nselect: no\ndata: orders\n').select).toBe(false);
    expect(spec('line sum(amount) by month\nbrush: off\ndata: orders\n').brush).toBe(false);
    const apart = spec('bar sum(amount) by region\nlink: no\ndata: orders\n');
    expect(apart.link).toBeNull();
    expect('select' in apart).toBe(false);
  });

  it('never brushes a line over categories, in a group or not', () => {
    const c = spec('line sum(amount) by region\ndata: orders\n');
    expect(c.brush).toBe(false);
  });

  it('leaves a lone block with its own rows as it was: nothing published unless asked', () => {
    const lone = spec(`bar sum(amount) by region\n---\n${rows}`, {});
    expect(lone.link).toBeNull();
    expect('select' in lone).toBe(false);
    expect('brush' in spec(`line sum(amount) by month\n---\n${rows}`, {})).toBe(false);
    expect(spec(`bar sum(amount) by region\nselect: true\n---\n${rows}`, {}).select).toBe(true);
  });

  it('leaves dashboards as they were', () => {
    const c = compileBlock(`dashboard\nbar sum(amount) by region\nkpi sum(amount)\n---\n${rows}`);
    const [bar, kpi] = (c.spec as DashboardSpec).layout;
    expect(bar.select).toBe(true);
    expect('select' in kpi).toBe(false);
    expect(c.link).toBeNull();
  });

  it('applies to blocks over a data block of the same document', () => {
    const md = [
      '```quartile',
      'barlist sum(amount) by region',
      'data: sales',
      '```',
      '```quartile',
      'line sum(amount) by month',
      'data: sales',
      '```',
      '```quartile',
      'data sales',
      '---',
      rows.trim(),
      '```',
    ].join('\n');
    const [list, line] = scanDocument(md).blocks.map((b) => b.compiled);
    expect(list.spec).toMatchObject({ component: 'BarList', select: true });
    expect(line.spec).toMatchObject({ component: 'LineChart', brush: true });
    expect([list.link, line.link]).toEqual(['sales', 'sales']);
  });
});
