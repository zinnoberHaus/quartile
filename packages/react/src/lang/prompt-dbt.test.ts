import { describe, expect, it } from 'vitest';
import { resolveData } from '../data/schema';
import type { ComponentSpec } from '../spec/schema';
import { compileBlock } from './compile';
import { dbtDataset, dbtExposureYaml, dbtFields, fieldTypeOf, rowsFromDbtShow } from './dbt';
import { findFencedBlocks } from './document';
import {
  chartToolInputToBlock,
  quartileBlockTool,
  quartileChartTool,
  quartilePrompt,
} from './prompt';

describe('quartilePrompt', () => {
  it('teaches only syntax that compiles', () => {
    const prompt = quartilePrompt();
    const blocks = findFencedBlocks(prompt);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) {
      const c = compileBlock(b.source);
      expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(c.spec).toBeTruthy();
    }
    // Kind examples written inline also parse to the intended kind.
    for (const [, example] of prompt.matchAll(
      /`((?:line|bar|barlist|donut|scatter|histogram|box|heatmap|kpi|table) [^`]+)`/g,
    )) {
      expect(
        compileBlock(`${example}\n`).diagnostics.filter((d) =>
          /Expected a chart type/.test(d.message),
        ),
      ).toEqual([]);
    }
  });

  it('lists host datasets so the model references them instead of pasting rows', () => {
    const prompt = quartilePrompt({
      datasets: [
        {
          name: 'orders',
          description: 'One row per order',
          columns: [{ name: 'amount', type: 'number', description: 'USD' }],
        },
      ],
    });
    expect(prompt).toContain('`orders` — One row per order: amount (number) — USD');
    expect(prompt.length).toBeLessThan(6000);
  });
});

describe('tool schemas', () => {
  it('keeps strict structured-output rules: required properties, no unions or bounds', () => {
    for (const tool of [quartileBlockTool(), quartileChartTool()]) {
      const schema = tool.input_schema;
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
      const text = JSON.stringify(schema);
      expect(text).not.toMatch(
        /"(oneOf|anyOf|allOf|\$ref|minimum|maximum|minLength|maxLength|pattern)"/,
      );
    }
  });

  it('converts structured arguments into a block', () => {
    const block = chartToolInputToBlock({
      kind: 'bar',
      title: 'Revenue, by region',
      measures: ['sum(revenue)'],
      by: ['region'],
      format: 'currency USD',
      columns: ['region', 'revenue'],
      rows: [
        ['EMEA', 1200],
        ['Asia, Pacific', null],
      ],
    });
    expect(block).toContain('"Asia, Pacific",');
    const c = compileBlock(block);
    expect(c.spec).toMatchObject({
      component: 'BarChart',
      title: 'Revenue, by region',
      x: 'region',
    });
  });
});

describe('dbt Charts compatibility', () => {
  it('renders a single-chart YAML with an inline query', () => {
    const c = compileBlock(
      [
        'type: line',
        'title: Revenue',
        'query:',
        '  columns: [month, revenue]',
        '  values:',
        '    - [2026-01, 100]',
        '    - [2026-02, 150]',
        'x: month',
        'y: revenue',
        '',
      ].join('\n'),
    );
    expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(c.spec).toMatchObject({
      component: 'LineChart',
      x: 'month',
      y: 'revenue',
      title: 'Revenue',
    });
    expect(resolveData(c.data[(c.spec as ComponentSpec).data as string]).rows).toHaveLength(2);
  });

  it('explains that inline SQL is not executed', () => {
    const c = compileBlock(
      'type: bar\nquery:\n  sql: select * from orders\nx: region\ny: revenue\n',
    );
    expect(c.diagnostics.find((d) => d.severity === 'error')).toMatchObject({
      line: 3,
      message: expect.stringMatching(/SQL queries run in your data tool/),
    });
    expect(c.spec).toBeUndefined();
  });

  it('reads a named query as a dataset reference', () => {
    const c = compileBlock('type: bar\nquery: monthly_revenue\nx: month\ny: revenue\n', {
      datasets: { monthly_revenue: [{ month: '2026-01', revenue: 1 }] },
    });
    expect(c.spec).toMatchObject({ component: 'BarChart', data: 'monthly_revenue' });
    expect(c.link).toBe('monthly_revenue');
  });
});

describe('dbt artifacts', () => {
  const manifest = {
    metadata: { dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v12.json' },
    nodes: {
      'model.shop.fct_orders': {
        unique_id: 'model.shop.fct_orders',
        name: 'fct_orders',
        resource_type: 'model',
        columns: {
          ordered_at: {
            name: 'ordered_at',
            data_type: 'timestamp',
            description: 'When the order was placed (UTC).',
          },
          amount: {
            name: 'amount',
            data_type: 'numeric(12,2)',
            description: 'Order value after discounts, before tax.',
            config: { meta: { quartile: { label: 'Revenue', format: 'currency EUR' } } },
          },
          channel: { name: 'channel', data_type: 'varchar' },
        },
      },
      'test.shop.not_null': { name: 'fct_orders', resource_type: 'test' },
    },
    metrics: { revenue: { name: 'revenue', label: 'Net revenue', description: 'Sum of amount.' } },
  };

  it('describes fields from column docs, types and meta.quartile', () => {
    const fields = dbtFields(manifest, 'fct_orders');
    expect(fields.amount).toMatchObject({
      label: 'Revenue',
      format: 'currency',
      currency: 'EUR',
      type: 'quantitative',
      description: 'Order value after discounts, before tax.',
    });
    expect(fields.ordered_at).toMatchObject({ type: 'temporal', label: 'Ordered at' });
    expect(fields.revenue).toMatchObject({ label: 'Net revenue', description: 'Sum of amount.' });
    expect(fieldTypeOf('BOOLEAN')).toBe('boolean');
    expect(fieldTypeOf('geography')).toBeUndefined();
  });

  it('builds a documented dataset from dbt show output', () => {
    const show = JSON.stringify({
      node: 'fct_orders',
      show: [{ ordered_at: '2026-09-01', amount: 12.5, channel: 'web' }],
    });
    expect(rowsFromDbtShow(show)).toHaveLength(1);
    const ds = dbtDataset(show, { manifest, model: 'fct_orders' });
    expect(ds.schema.amount.description).toBe('Order value after discounts, before tax.');
    expect(ds.schema.amount.currency).toBe('EUR');
    expect(() => rowsFromDbtShow('{"rows": []}')).toThrow(/dbt show/);
  });

  it('writes exposure YAML for lineage', () => {
    expect(
      dbtExposureYaml({
        name: 'revenue_dashboard',
        label: 'Revenue: weekly',
        dependsOn: ['fct_orders', "source('shop','orders')"],
        url: 'https://example.com/r',
        owner: { name: 'Data team' },
      }),
    ).toBe(
      [
        'exposures:',
        '  - name: revenue_dashboard',
        '    label: "Revenue: weekly"',
        '    type: dashboard',
        '    maturity: medium',
        '    url: https://example.com/r',
        '    depends_on:',
        "      - ref('fct_orders')",
        "      - source('shop','orders')",
        '    owner:',
        '      name: Data team',
        '',
      ].join('\n'),
    );
  });
});
