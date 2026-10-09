// @vitest-environment node
import { createRequire } from 'node:module';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { createDuckDB, NODE_RUNTIME, VoidLogger } from '@duckdb/duckdb-wasm/blocking';
import {
  Bool,
  DateDay,
  Float64,
  Int64,
  Table,
  TimestampMillisecond,
  tableFromArrays,
  tableToIPC,
  Utf8,
  vectorFromArray,
} from 'apache-arrow';
import type { QueryPlan } from '../query/types';
import { createDuckDBBackend, type DuckDBBackend } from './backend';

const require = createRequire(import.meta.url);
let database: Awaited<ReturnType<typeof createDuckDB>>;
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  database = await createDuckDB(
    {
      mvp: {
        mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'),
        mainWorker: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-mvp.worker.cjs'),
      },
      eh: {
        mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm'),
        mainWorker: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-eh.worker.cjs'),
      },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  );
  await database.instantiate();
}, 30_000);

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
afterAll(() => database.reset());

// Execute real SQL in DuckDB's Node Wasm runtime. This shim changes only sync/async calling
// convention; browser worker scheduling is covered separately in the runnable browser example.
async function backend(): Promise<DuckDBBackend> {
  const connection = database.connect();
  const asyncConnection = {
    query: async (sql: string) => connection.query(sql),
    insertArrowFromIPCStream: async (
      bytes: Uint8Array,
      options: { name: string; create: boolean },
    ) => connection.insertArrowFromIPCStream(bytes, options),
    prepare: async (sql: string) => {
      const statement = connection.prepare(sql);
      return {
        query: async (...params: (string | number | boolean)[]) => statement.query(...params),
        close: async () => statement.close(),
      };
    },
  } as unknown as AsyncDuckDBConnection;
  const result = await createDuckDBBackend({ connection: asyncConnection });
  cleanups.push(async () => {
    await result.dispose();
    connection.close();
  });
  return result;
}

const fixture = () =>
  new Table({
    region: vectorFromArray(['Europe', 'Europe', "O'Brien", '', null, 'Europe'], new Utf8()),
    amount: vectorFromArray(
      [10, 20, -5, null, Number.NaN, Number.POSITIVE_INFINITY],
      new Float64(),
    ),
    healthy: vectorFromArray([true, false, true, false, null, true], new Bool()),
    at: vectorFromArray(
      [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z'), null, null, null, null],
      new TimestampMillisecond(),
    ),
  });
const options = () => ({ requestId: 'test', signal: new AbortController().signal });
const rowsPlan: QueryPlan = { kind: 'rows', predicates: [], window: { offset: 0, limit: 10 } };

describe('DuckDB source with the real Wasm engine', () => {
  it('ingests Arrow IPC and pages bounded rows without changing input ownership', async () => {
    const bytes = tableToIPC(fixture(), 'stream');
    const snapshot = bytes.slice();
    const source = await (await backend()).fromArrow(bytes, { id: 'orders' });
    const result = await source.query(
      { ...rowsPlan, kind: 'rows', fields: ['region', 'amount'], window: { offset: 1, limit: 2 } },
      options(),
    );
    expect(result.rows).toEqual([
      { region: 'Europe', amount: 20 },
      { region: "O'Brien", amount: -5 },
    ]);
    expect(result.totalRows).toBe(6);
    expect(result.complete).toBe(false);
    expect(bytes).toEqual(snapshot);
    expect(source.columns.find((column) => column.name === 'at')?.type).toBe('temporal');
  });

  it('binds quoted string values and filters before aggregating', async () => {
    const source = await (await backend()).fromArrow(fixture(), { id: 'orders' });
    const result = await source.query(
      {
        kind: 'aggregate',
        predicates: [{ field: 'region', op: 'eq', value: "O'Brien" }],
        groupBy: [],
        measures: [{ field: 'amount', aggregate: 'sum', as: 'revenue' }],
        limit: 10,
      },
      options(),
    );
    expect(result.rows).toEqual([{ revenue: -5 }]);
    const injection = await source.query(
      {
        ...rowsPlan,
        predicates: [{ field: 'region', op: 'eq', value: "'; DROP TABLE orders; --" }],
      },
      options(),
    );
    expect(injection.rows).toEqual([]);
    expect((await source.query(rowsPlan, options())).totalRows).toBe(6);
  });

  it('keeps ISO-looking text literal and quotes unusual fields and output aliases', async () => {
    const name = 'label"; DROP TABLE orders; --';
    const source = await (await backend()).fromArrow(
      new Table({
        [name]: vectorFromArray(['2026-10-01', '2026-10-02'], new Utf8()),
        amount: vectorFromArray([4, 9], new Float64()),
      }),
      { id: 'quoted' },
    );
    const result = await source.query(
      {
        kind: 'aggregate',
        groupBy: [name],
        limit: 10,
        predicates: [{ field: name, op: 'eq', value: '2026-10-01' }],
        measures: [{ aggregate: 'sum', field: 'amount', as: 'sum"value' }],
      },
      options(),
    );
    expect(result.rows).toEqual([{ [name]: '2026-10-01', 'sum"value': 4 }]);
    await expect(
      source.query(
        { ...rowsPlan, predicates: [{ field: 'amount', op: 'eq', value: new Date(4) }] },
        options(),
      ),
    ).rejects.toThrow('quantitative type');
  });

  it('handles null inclusion, missing values and finite-only numeric measures', async () => {
    const source = await (await backend()).fromArrow(fixture(), { id: 'orders' });
    const nulls = await source.query(
      { ...rowsPlan, predicates: [{ field: 'region', op: 'in', value: [null, ''] }] },
      options(),
    );
    expect(nulls.totalRows).toBe(2);
    const result = await source.query(
      {
        kind: 'aggregate',
        predicates: [],
        groupBy: [],
        limit: 10,
        measures: [
          { aggregate: 'count', as: 'rows' },
          { aggregate: 'count', field: 'region', as: 'present' },
          { aggregate: 'sum', field: 'amount', as: 'sum' },
          { aggregate: 'mean', field: 'amount', as: 'mean' },
          { aggregate: 'min', field: 'amount', as: 'min' },
          { aggregate: 'max', field: 'amount', as: 'max' },
        ],
      },
      options(),
    );
    expect(result.rows).toEqual([{ rows: 6, present: 4, sum: 25, mean: 25 / 3, min: -5, max: 20 }]);
  });

  it('returns exact group counts and complete empty results', async () => {
    const source = await (await backend()).fromArrow(fixture(), { id: 'orders' });
    const plan: QueryPlan = {
      kind: 'aggregate',
      predicates: [],
      groupBy: ['region'],
      measures: [{ aggregate: 'count', as: 'n' }],
      limit: 2,
    };
    const result = await source.query(plan, options());
    expect(result.totalRows).toBe(4);
    expect(result.rows).toHaveLength(2);
    expect(result.complete).toBe(false);
    const empty = await source.query(
      { ...plan, predicates: [{ field: 'region', op: 'in', value: [] }] },
      options(),
    );
    expect(empty).toMatchObject({ rows: [], totalRows: 0, complete: true });
    const scalar = await source.query(
      {
        ...plan,
        groupBy: [],
        predicates: [{ field: 'region', op: 'in', value: [] }],
        measures: [
          { aggregate: 'sum', field: 'amount', as: 'sum' },
          { aggregate: 'mean', field: 'amount', as: 'mean' },
        ],
      },
      options(),
    );
    expect(scalar.rows).toEqual([{ sum: 0, mean: null }]);
  });

  it('rejects aggregate overflow without changing finite raw values', async () => {
    const source = await (await backend()).fromArrow(
      new Table({
        amount: vectorFromArray([1e308, 1e308], new Float64()),
      }),
      { id: 'overflow' },
    );
    await expect(
      source.query(
        {
          kind: 'aggregate',
          predicates: [],
          groupBy: [],
          limit: 1,
          measures: [{ field: 'amount', aggregate: 'sum', as: 'total' }],
        },
        options(),
      ),
    ).rejects.toThrow('Nonfinite aggregate result');
    expect((await source.query(rowsPlan, options())).rows).toEqual([
      { amount: 1e308 },
      { amount: 1e308 },
    ]);
  });

  it('normalizes temporal rows and binds inclusive date ranges in epoch milliseconds', async () => {
    const source = await (await backend()).fromArrow(fixture(), { id: 'orders' });
    const result = await source.query(
      {
        ...rowsPlan,
        predicates: [
          { field: 'at', op: 'between', value: [new Date('2026-01-02T00:00:00Z'), null] },
        ],
      },
      options(),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].at).toEqual(new Date('2026-01-02T00:00:00Z'));
  });

  it('ingests inferred string dictionaries and Arrow day dates with declared metadata', async () => {
    const dictionary = tableFromArrays({ category: ['A', 'B'] }).getChild('category')!;
    const source = await (await backend()).fromArrow(
      new Table({
        category: dictionary,
        day: vectorFromArray(
          [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z')],
          new DateDay(),
        ),
      }),
      { id: 'dictionary', fields: { category: { label: 'Segment' } } },
    );
    expect(source.columns[0].physicalType).toContain('Dictionary');
    expect(source.schema.category).toMatchObject({ type: 'nominal', label: 'Segment' });
    const result = await source.query(
      { ...rowsPlan, predicates: [{ field: 'day', op: 'eq', value: '2026-01-02' }] },
      options(),
    );
    expect(result.rows).toEqual([{ category: 'B', day: new Date('2026-01-02T00:00:00Z') }]);
  });

  it('counts histogram edges once, includes the last edge, and retains zero bins', async () => {
    const source = await (await backend()).fromArrow(fixture(), { id: 'orders' });
    const result = await source.query(
      { kind: 'histogram', predicates: [], field: 'amount', edges: [-10, 0, 10, 20, 30] },
      options(),
    );
    expect(result.rows).toEqual([
      { x0: -10, x1: 0, count: 1 },
      { x0: 0, x1: 10, count: 0 },
      { x0: 10, x1: 20, count: 1 },
      { x0: 20, x1: 30, count: 1 },
    ]);
    const last = await source.query(
      { kind: 'histogram', predicates: [], field: 'amount', edges: [0, 20] },
      options(),
    );
    expect(last.rows).toEqual([{ x0: 0, x1: 20, count: 2 }]);
    expect(result).toMatchObject({ totalRows: 4, complete: true });
  });

  it('validates identifiers and types, and keeps borrowed connections usable after disposal', async () => {
    const adapter = await backend();
    await expect(
      adapter.fromArrow(new Table({ id: vectorFromArray([1n], new Int64()) }), { id: 'unsafe' }),
    ).rejects.toThrow('Unsupported Arrow type');
    const source = await adapter.fromArrow(fixture(), { id: 'orders' });
    await expect(
      source.query(
        { ...rowsPlan, predicates: [{ field: 'missing', op: 'eq', value: 1 }] },
        options(),
      ),
    ).rejects.toThrow('Unknown query field');
    await expect(
      source.query(
        { ...rowsPlan, predicates: [{ field: 'amount', op: 'eq', value: '10' }] },
        options(),
      ),
    ).rejects.toThrow('quantitative type');
    await source.dispose();
    await source.dispose();
    await expect(source.query(rowsPlan, options())).rejects.toThrow('disposed');
    const replacement = await adapter.fromArrow(fixture(), { id: 'orders' });
    expect((await replacement.query(rowsPlan, options())).totalRows).toBe(6);
  });
});
