// @vitest-environment node
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { Float64, Int32, Table, vectorFromArray } from 'apache-arrow';
import type { QueryPlan } from '../query/types';
import { createDuckDBBackend } from './backend';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const input = () => new Table({ amount: vectorFromArray([10, 20], new Float64()) });
const count = () => new Table({ total: vectorFromArray([2], new Int32()) });
const plan: QueryPlan = { kind: 'rows', predicates: [], window: { offset: 0, limit: 10 } };
const request = (signal = new AbortController().signal, requestId = 'test') => ({
  signal,
  requestId,
});

function fakeConnection() {
  const events: string[] = [];
  const execute = vi.fn(async (sql: string) =>
    sql.includes('count(*) AS total') ? count() : input(),
  );
  const insert = vi.fn(async () => {
    events.push('insert');
  });
  const connection = {
    insertArrowFromIPCStream: insert,
    query: vi.fn(async (sql: string) => {
      events.push(sql.startsWith('DROP') ? 'drop' : 'create');
      return count();
    }),
    prepare: vi.fn(async (sql: string) => {
      events.push('prepare');
      return {
        query: async () => {
          events.push('execute');
          return execute(sql);
        },
        close: vi.fn(async () => {
          events.push('statement-close');
        }),
      };
    }),
    close: vi.fn(async () => {
      events.push('connection-close');
    }),
  };
  return {
    connection: connection as unknown as AsyncDuckDBConnection,
    mock: connection,
    execute,
    insert,
    events,
  };
}

describe('DuckDB adapter lifecycle', () => {
  it('rejects a queued aborted request without running it and preserves other source requests', async () => {
    const fake = fakeConnection();
    const backend = await createDuckDBBackend({ connection: fake.connection });
    const firstSource = await backend.fromArrow(input(), { id: 'first' });
    const secondSource = await backend.fromArrow(input(), { id: 'second' });
    const started = deferred<void>();
    const gate = deferred<Table>();
    fake.execute.mockImplementationOnce(async () => {
      started.resolve();
      return gate.promise;
    });
    const first = firstSource.query(plan, request());
    await started.promise;
    const controller = new AbortController();
    const skipped = firstSource.query(plan, request(controller.signal));
    const rejected = expect(skipped).rejects.toMatchObject({ name: 'AbortError' });
    const other = secondSource.query(plan, request(undefined, 'other'));
    controller.abort();
    await rejected;
    expect(fake.mock.prepare).toHaveBeenCalledTimes(1);
    gate.resolve(count());
    await first;
    expect(await other).toMatchObject({ requestId: 'other', totalRows: 2 });
    expect(fake.mock.prepare).toHaveBeenCalledTimes(4);
    await backend.dispose();
    expect(fake.mock.close).not.toHaveBeenCalled();
  });

  it('settles active abort promptly but holds the connection until its statement closes', async () => {
    const fake = fakeConnection();
    const backend = await createDuckDBBackend({ connection: fake.connection });
    const source = await backend.fromArrow(input(), { id: 'orders' });
    const started = deferred<void>();
    const gate = deferred<Table>();
    fake.execute.mockImplementationOnce(async () => {
      started.resolve();
      return gate.promise;
    });
    const controller = new AbortController();
    const active = source.query(plan, request(controller.signal));
    const rejected = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    controller.abort();
    await rejected;
    const next = source.query(plan, request());
    await Promise.resolve();
    expect(fake.mock.prepare).toHaveBeenCalledTimes(1);
    gate.resolve(count());
    await next;
    expect(fake.mock.prepare).toHaveBeenCalledTimes(3);
    expect(
      fake.events.slice(fake.events.indexOf('execute'), fake.events.indexOf('execute') + 3),
    ).toEqual(['execute', 'statement-close', 'prepare']);
    await backend.dispose();
  });

  it('closes a failed statement and allows subsequent requests', async () => {
    const fake = fakeConnection();
    const backend = await createDuckDBBackend({ connection: fake.connection });
    const source = await backend.fromArrow(input(), { id: 'orders' });
    fake.execute.mockRejectedValueOnce(new Error('engine failure'));
    await expect(source.query(plan, request())).rejects.toThrow('engine failure');
    expect(fake.events.at(-1)).toBe('statement-close');
    expect((await source.query(plan, request())).rows).toHaveLength(2);
    await backend.dispose();
  });

  it('terminates an owned database once without waiting for a hung worker query', async () => {
    const fake = fakeConnection();
    const cleanup = vi.fn(async () => {
      fake.events.push('factory-dispose');
    });
    const database = { connect: async () => fake.connection } as unknown as AsyncDuckDB;
    const backend = await createDuckDBBackend({
      create: async () => ({ database, dispose: cleanup }),
    });
    const source = await backend.fromArrow(input(), { id: 'orders' });
    const started = deferred<void>();
    const gate = deferred<Table>();
    fake.execute.mockImplementationOnce(async () => {
      started.resolve();
      return gate.promise;
    });
    const active = source.query(plan, request());
    const rejected = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    const disposal = backend.dispose();
    expect(backend.dispose()).toBe(disposal);
    await rejected;
    expect(fake.mock.close).not.toHaveBeenCalled();
    await disposal;
    expect(fake.events.at(-1)).toBe('factory-dispose');
    expect(fake.mock.close).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
    await source.dispose();
    // The worker promise intentionally never settles. Disposal must still complete.
  });

  it('rejects a hung owned import promptly when the backend is disposed', async () => {
    const fake = fakeConnection();
    const started = deferred<void>();
    const gate = deferred<void>();
    fake.insert.mockImplementationOnce(async () => {
      started.resolve();
      return gate.promise;
    });
    const cleanup = vi.fn(async () => {});
    const database = { connect: async () => fake.connection } as unknown as AsyncDuckDB;
    const backend = await createDuckDBBackend({
      create: async () => ({ database, dispose: cleanup }),
    });
    const importing = backend.fromArrow(input(), { id: 'orders' });
    const rejected = expect(importing).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    await backend.dispose();
    await rejected;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('waits for in-flight ingestion and drops its new relation before closing', async () => {
    const fake = fakeConnection();
    const started = deferred<void>();
    const gate = deferred<void>();
    fake.insert.mockImplementationOnce(async () => {
      started.resolve();
      return gate.promise;
    });
    const database = { connect: async () => fake.connection } as unknown as AsyncDuckDB;
    const backend = await createDuckDBBackend({ database });
    const importing = backend.fromArrow(input(), { id: 'orders' });
    const rejected = expect(importing).rejects.toThrow('disposed');
    await started.promise;
    const disposal = backend.dispose();
    expect(fake.mock.close).not.toHaveBeenCalled();
    gate.resolve();
    await rejected;
    await disposal;
    expect(fake.events.slice(-4)).toEqual(['create', 'drop', 'drop', 'connection-close']);
    expect(fake.mock.close).toHaveBeenCalledOnce();
  });

  it('cleans up an owned factory after connection setup fails', async () => {
    const cleanup = vi.fn(async () => {});
    const database = {
      connect: async () => {
        throw new Error('connect failed');
      },
    } as unknown as AsyncDuckDB;
    await expect(
      createDuckDBBackend({ create: async () => ({ database, dispose: cleanup }) }),
    ).rejects.toThrow('connect failed');
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
