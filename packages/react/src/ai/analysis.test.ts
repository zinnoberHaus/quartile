import { describe, expect, it, vi } from 'vitest';
import { matches } from '../data/predicates';
import { dataset } from '../data/schema';
import { createAnalysisContext } from './context';
import { createHttpAssistantAdapter } from './http';
import { profileDataset } from './profile';
import type { AnalysisPlan, AnalysisViewState } from './types';
import { reduceAnalysisPlan, validateAnalysisPlan } from './validate';

const data = dataset([
  { category: 'A', amount: 10, date: new Date('2026-01-01T00:00:00Z'), enabled: true },
  { category: 'B', amount: 20, date: new Date('2026-01-02T00:00:00Z'), enabled: false },
]);
const context = createAnalysisContext({
  schema: data.schema,
  source: { id: 'sales', version: 'v1' },
});
const plan: AnalysisPlan = {
  version: 1,
  title: 'Inspect large orders',
  summary: 'Focus the distribution and the exact rows.',
  actions: [
    { type: 'filter', field: 'amount', op: 'between', value: [10, 20] },
    { type: 'sort', field: 'amount', direction: 'desc' },
    { type: 'chart', chart: 'histogram', x: 'amount' },
    { type: 'table', fields: ['category', 'amount'], limit: 20 },
  ],
};

describe('bounded profiles and analysis context', () => {
  it('profiles primitive nominal categories by typed identity without inventing numeric statistics', () => {
    const input = dataset(
      [1, '1', true, 0, false, null, '', undefined, Infinity, {}].map((category) => ({ category })),
      { category: { type: 'nominal' } },
    );
    const profile = profileDataset(input);
    expect(profile.fields[0]).toEqual({
      field: 'category',
      type: 'nominal',
      valid: 5,
      invalid: 2,
      missing: 3,
      distinct: 5,
    });
    const result = createAnalysisContext({
      schema: input.schema,
      source: context.source,
      profile,
      selection: [{ field: 'category', op: 'in', value: [1, '1', true, 0, false] }],
    });
    expect(result.selection).toEqual([
      { field: 'category', op: 'in', value: [1, '1', true, 0, false] },
    ]);
    expect(Object.isFrozen(result.selection[0].value)).toBe(true);
  });
  it('reports exact examined-prefix counters, not whole-data estimates or nominal samples', () => {
    const input = dataset(
      [
        { amount: 3, category: 'secret A' },
        { amount: null, category: '' },
        { amount: Infinity, category: 'secret A' },
        { amount: 9, category: 'secret B' },
        { amount: 100, category: 'unexamined' },
      ],
      { amount: { type: 'quantitative' } },
    );
    const profile = profileDataset(input, { maxRows: 4 });
    expect(profile).toMatchObject({ totalRows: 5, scannedRows: 4, complete: false });
    expect(profile.fields[0]).toEqual({
      field: 'amount',
      type: 'quantitative',
      missing: 1,
      invalid: 1,
      valid: 2,
      distinct: 2,
      min: 3,
      max: 9,
      mean: 6,
    });
    expect(profile.fields[1]).toEqual({
      field: 'category',
      type: 'nominal',
      missing: 1,
      invalid: 0,
      valid: 3,
      distinct: 2,
    });
    expect(JSON.stringify(profile)).not.toContain('secret');
    expect(JSON.stringify(profile)).not.toContain('unexamined');
    expect(() => profileDataset(input, { maxRows: 10001 })).toThrow();
    expect(() => profileDataset(input, { fields: ['missing'] })).toThrow();
  });
  it('keeps typed validity, finite means and date extrema explicit', () => {
    const input = dataset(
      [
        { n: 1e308, date: new Date('2026-01-01T00:00:00Z') },
        { n: 1e308, date: new Date('invalid') },
        { n: '2', date: null },
      ],
      { n: { type: 'quantitative' }, date: { type: 'temporal' } },
    );
    const profile = profileDataset(input);
    expect(profile.fields[0]).toMatchObject({ valid: 2, invalid: 1, mean: 1e308 });
    expect(profile.fields[1]).toMatchObject({
      valid: 1,
      invalid: 1,
      missing: 1,
      min: '2026-01-01T00:00:00.000Z',
      max: '2026-01-01T00:00:00.000Z',
    });
    const constant = dataset(Array.from({ length: 100 }, () => ({ n: 0.1 })));
    expect(() =>
      createAnalysisContext({
        schema: constant.schema,
        source: context.source,
        profile: profileDataset(constant),
      }),
    ).not.toThrow();
    expect(profileDataset(dataset([{ n: -1e308 }, { n: 1e308 }])).fields[0].mean).toBe(0);
  });
  it('copies only allowed metadata, strips functions, normalizes dates, and freezes all transport values', () => {
    const format = vi.fn(() => 'secret formatter');
    const schema = { ...data.schema, amount: { ...data.schema.amount, format } };
    const profile = profileDataset(data);
    const result = createAnalysisContext({
      schema,
      source: { id: 'sales', version: 'v1' },
      fields: ['amount', 'date'],
      profile,
      selection: [
        {
          field: 'date',
          op: 'eq',
          value: new Date('2026-01-01T00:00:00Z'),
          source: 'not-sent',
          label: 'not-sent',
        },
      ],
    });
    expect(result.fields.map((f) => f.name)).toEqual(['amount', 'date']);
    expect(result.fields[0]).not.toHaveProperty('format');
    expect(result.profile?.fields).toHaveLength(2);
    expect(result.selection).toEqual([
      { field: 'date', op: 'eq', value: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(format).not.toHaveBeenCalled();
    expect(Object.isFrozen(result.profile?.fields[0])).toBe(true);
    expect(Object.isFrozen(result.selection)).toBe(true);
    schema.amount.label = 'Later';
    expect(result.fields[0].label).toBe('Amount');
  });
  it('never silently drops active filters and rejects inconsistent or oversized context', () => {
    expect(() =>
      createAnalysisContext({
        schema: data.schema,
        source: context.source,
        fields: ['amount'],
        selection: [{ field: 'category', op: 'eq', value: 'A' }],
      }),
    ).toThrow(/active selection/);
    expect(() =>
      createAnalysisContext({
        schema: data.schema,
        source: context.source,
        profile: { ...profileDataset(data), scannedRows: 1 },
      }),
    ).toThrow(/counts/);
    expect(() =>
      createAnalysisContext({
        schema: data.schema,
        source: context.source,
        selection: [{ field: 'category', op: 'in', value: Array(101).fill('A') }],
      }),
    ).toThrow();
    const missing = createAnalysisContext({
      schema: data.schema,
      source: context.source,
      selection: [{ field: 'category', op: 'eq', value: null }],
    });
    expect(missing.selection[0]).toEqual({ field: 'category', op: 'in', value: [null] });
  });
});

describe('analysis plan validation', () => {
  it('accepts primitive nominal filters while preserving exact category matches and transport bounds', () => {
    const values = [1, '1', true, 0, false];
    const rows = values.map((category) => ({ category }));
    for (const value of values) {
      const result = validateAnalysisPlan(
        { ...plan, actions: [{ type: 'filter', field: 'category', op: 'eq', value }] },
        context,
      );
      expect(result.valid).toBe(true);
      if (!result.valid) throw new Error('Expected nominal filter to validate');
      const action = result.plan.actions[0];
      if (action.type !== 'filter' || action.op !== 'eq') throw new Error('Expected equality');
      expect(rows.filter((row) => matches(row, action))).toEqual([{ category: value }]);
      expect(reduceAnalysisPlan(result.plan, { filters: [] }, context).filters).toEqual([
        { field: 'category', op: 'eq', value },
      ]);
    }
    for (const value of [Infinity, NaN, {}, [], 'x'.repeat(501)]) {
      expect(
        validateAnalysisPlan(
          { ...plan, actions: [{ type: 'filter', field: 'category', op: 'eq', value }] },
          context,
        ).valid,
      ).toBe(false);
    }
    expect(() =>
      createAnalysisContext({
        schema: data.schema,
        source: context.source,
        selection: [{ field: 'category', op: 'in', value: Array(101).fill(1) }],
      }),
    ).toThrow(/active selection/);
  });
  it('validates and immutably reduces a complete declarative plan', () => {
    const result = validateAnalysisPlan(JSON.stringify(plan), context);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error('invalid');
    expect(Object.isFrozen(result.plan.actions[0])).toBe(true);
    const previous: AnalysisViewState = {
      filters: [{ field: 'category', op: 'in', value: ['A'] }],
    };
    const next = reduceAnalysisPlan(result.plan, previous, context);
    expect(next.filters).toHaveLength(2);
    expect(next.table).toEqual({ fields: ['category', 'amount'], limit: 20 });
    expect(previous).toEqual({ filters: [{ field: 'category', op: 'in', value: ['A'] }] });
  });
  it.each([
    { type: 'sql', query: 'DROP TABLE orders' },
    { type: 'filter', field: 'unknown', op: 'eq', value: 1 },
    { type: 'filter', field: 'amount', op: 'eq', value: '10' },
    { type: 'filter', field: 'category', op: 'between', value: ['A', 'Z'] },
    { type: 'filter', field: 'amount', op: 'between', value: [20, 10] },
    { type: 'filter', field: 'amount', op: 'between', value: [null, 10] },
    { type: 'filter', field: 'amount', op: 'eq', value: NaN },
    { type: 'filter', field: 'category', op: 'eq', value: null },
    { type: 'filter', field: 'date', op: 'eq', value: '2026-01-01' },
    { type: 'filter', field: 'date', op: 'eq', value: '2026-02-30T00:00:00Z' },
    { type: 'chart', chart: 'scatter', x: 'category', y: 'amount' },
    { type: 'chart', chart: 'line', x: 'date', y: 'category' },
    { type: 'table', fields: ['category', 'category'], limit: 10 },
    { type: 'table', fields: ['amount'], limit: 1001 },
    { type: 'sort', field: 'amount', direction: 'desc', code: 'alert(1)' },
  ])('rejects invalid/unsupported action %# before any reduction', (action) => {
    expect(validateAnalysisPlan({ ...plan, actions: [action] }, context).valid).toBe(false);
    const previous = { filters: [] };
    expect(() =>
      reduceAnalysisPlan({ ...plan, actions: [plan.actions[0], action] }, previous, context),
    ).toThrow();
    expect(previous).toEqual({ filters: [] });
  });
  it('accepts null inclusion, literal nominal values and explicit-timezone dates without coercion', () => {
    const actions = [
      {
        type: 'filter',
        field: 'category',
        op: 'in',
        value: [null, '', '2026-01-01', '<script>alert(1)</script>'],
      },
      {
        type: 'filter',
        field: 'date',
        op: 'between',
        value: ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00+00:00'],
      },
    ];
    const result = validateAnalysisPlan({ ...plan, actions }, context);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.plan.actions).toEqual(actions);
  });
  it('validates leap days for four-digit ISO years without the Date.UTC 1900 offset', () => {
    for (const [date, valid] of [
      ['0000-02-29T00:00:00Z', true],
      ['0096-02-29T00:00:00Z', true],
      ['0100-02-29T00:00:00Z', false],
      ['2000-02-29T00:00:00Z', true],
      ['1900-02-29T00:00:00Z', false],
    ] as const)
      expect(
        validateAnalysisPlan(
          { ...plan, actions: [{ type: 'filter', field: 'date', op: 'eq', value: date }] },
          context,
        ).valid,
      ).toBe(valid);
  });
  it('rejects prototype pollution, accessors without calling them, cycles, functions and excessive payloads', () => {
    expect(validateAnalysisPlan('{"__proto__":{"polluted":true}}', context).valid).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const getter = vi.fn(() => 1);
    expect(
      validateAnalysisPlan(
        Object.defineProperty({}, 'version', { get: getter, enumerable: true }),
        context,
      ).valid,
    ).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const bad of [
      cyclic,
      { ...plan, run: () => {} },
      { ...plan, actions: Array(13).fill(plan.actions[0]) },
      ' '.repeat(65537),
      { ...plan, summary: 'x'.repeat(2001) },
    ])
      expect(validateAnalysisPlan(bad, context).valid).toBe(false);
    expect(
      validateAnalysisPlan({ ...plan, actions: [plan.actions[0], plan.actions[0]] }, context).valid,
    ).toBe(false);
  });
});

describe('application backend adapter', () => {
  const request = { requestId: 'r1', prompt: 'Inspect', context };
  it('posts the bounded request and forwards cancellation without a provider dependency', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(plan), { status: 200 }),
    );
    const adapter = createHttpAssistantAdapter({ endpoint: '/api/assistant', fetch: fetcher });
    const controller = new AbortController();
    expect(await adapter.generate(request, { signal: controller.signal })).toEqual(plan);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/assistant');
    expect(options?.signal).toBe(controller.signal);
    expect(JSON.parse(options?.body as string)).toEqual(request);
    controller.abort();
    await expect(adapter.generate(request, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects HTTP errors, malformed responses and oversized streamed bodies', async () => {
    for (const response of [
      new Response('secret backend detail', { status: 500 }),
      new Response('not JSON'),
      new Response('x'.repeat(65537)),
    ]) {
      const adapter = createHttpAssistantAdapter({
        endpoint: '/api/assistant',
        fetch: vi.fn(async () => response),
      });
      await expect(
        adapter.generate(request, { signal: new AbortController().signal }),
      ).rejects.toThrow();
    }
    expect(() => createHttpAssistantAdapter({ endpoint: 'javascript:alert(1)' })).toThrow();
  });
  it('cancels a response while waiting for another streamed chunk', async () => {
    const stopped = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{'));
      },
      cancel: stopped,
    });
    const adapter = createHttpAssistantAdapter({
      endpoint: '/api/assistant',
      fetch: vi.fn(async () => new Response(stream)),
    });
    const controller = new AbortController();
    const pending = adapter.generate(request, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(stopped).toHaveBeenCalledOnce();
  });
});
