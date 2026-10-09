import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { type Table, tableFromIPC, tableToIPC } from 'apache-arrow';
import type { FieldOverride } from '../data/types';
import type { QueryOptions, QueryPlan, QueryResult, QuerySource } from '../query/types';
import { compileQuery, quoteIdentifier } from './compile';
import { type ArrowColumnInfo, inspectArrow, ORDINAL, resultRows } from './schema';

export interface OwnedDuckDB {
  database: AsyncDuckDB;
  /** Terminate the owned database/worker and revoke any owned asset URLs. */
  dispose(): Promise<void>;
}

export type DuckDBBackendOptions =
  | { database: AsyncDuckDB; connection?: never; create?: never }
  | { connection: AsyncDuckDBConnection; database?: never; create?: never }
  | { create: () => Promise<OwnedDuckDB>; database?: never; connection?: never };

export interface ArrowSourceOptions {
  id: string;
  version?: string;
  fields?: Record<string, FieldOverride>;
}

export interface DuckDBSource extends QuerySource {
  readonly columns: readonly ArrowColumnInfo[];
}

export interface DuckDBBackend {
  /** Copies into a private relation; input buffers/tables remain caller-owned. */
  fromArrow(input: Table | Uint8Array, options: ArrowSourceOptions): Promise<DuckDBSource>;
  /** Terminates an owned factory; otherwise drops relations and closes adapter-created connections. */
  dispose(): Promise<void>;
}

function abortError() {
  const error = new Error('The query was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

/** Settle the caller promptly, but retain the execution lock until the operation cleans up. */
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

let sequence = 0;
function privateName() {
  // Internal only; never interpolate application IDs as relation identifiers.
  sequence += 1;
  const random =
    globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? Math.random().toString(36).slice(2);
  return `quartile_${random}_${sequence}`;
}

/** Connect lazily at application setup, not import time. Uses one serialized connection. */
export async function createDuckDBBackend(options: DuckDBBackendOptions): Promise<DuckDBBackend> {
  if ([options.database, options.connection, options.create].filter(Boolean).length !== 1)
    throw new Error('Supply exactly one database, connection, or owned factory.');
  const owned = options.create ? await options.create() : undefined;
  let connection: AsyncDuckDBConnection;
  try {
    connection = options.connection ?? (await (owned?.database ?? options.database)!.connect());
  } catch (error) {
    await owned?.dispose();
    throw error;
  }
  const closeConnection = !options.connection;
  let tail = Promise.resolve();
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const ownedLifetime = new AbortController();
  const sources = new Map<string, { source: DuckDBSource; abort: AbortController }>();
  const reserved = new Set<string>();
  let importing = 0;
  const importsFinished = new Set<() => void>();
  const finishImport = () => {
    importing -= 1;
    if (!importing) {
      for (const resolve of importsFinished) resolve();
      importsFinished.clear();
    }
  };
  const schedule = <T>(operation: () => Promise<T>) => {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const prepared = async (
    sql: string,
    params: (string | number | boolean)[],
    signal: AbortSignal,
  ) => {
    throwIfAborted(signal);
    const statement = await connection.prepare(sql);
    try {
      throwIfAborted(signal);
      const result = await statement.query(...params);
      throwIfAborted(signal);
      return result;
    } finally {
      await statement.close();
    }
  };
  return {
    async fromArrow(input, options) {
      if (disposed) throw new Error('The DuckDB backend has been disposed.');
      if (typeof options.id !== 'string' || !options.id || reserved.has(options.id))
        throw new Error('An Arrow source requires a nonempty, unique ID.');
      if (
        options.version !== undefined &&
        (typeof options.version !== 'string' || !options.version)
      )
        throw new Error('An Arrow source version must be a nonempty string.');
      const id = options.id;
      const table = input instanceof Uint8Array ? tableFromIPC(input) : input;
      const { schema, columns } = inspectArrow(table, options.fields);
      const bytes = tableToIPC(table, 'stream');
      const relation = privateName();
      const imported = `${relation}_input`;
      const version = options.version ?? relation;
      const lifetime = new AbortController();
      reserved.add(id);
      importing += 1;
      try {
        const importOperation = schedule(async () => {
          if (disposed) throw new Error('The DuckDB backend has been disposed.');
          try {
            await connection.insertArrowFromIPCStream(bytes, { name: imported, create: true });
            await connection.query(
              `CREATE TABLE ${quoteIdentifier(relation)} AS SELECT row_number() OVER () AS ${quoteIdentifier(ORDINAL)}, * FROM ${quoteIdentifier(imported)}`,
            );
          } catch (error) {
            await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(relation)}`);
            throw error;
          } finally {
            await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(imported)}`);
          }
        });
        // A failed worker may never settle its request. An explicitly owned database
        // can be terminated, so release ingestion callers when that ownership ends.
        await (owned ? abortable(importOperation, ownedLifetime.signal) : importOperation);
      } catch (error) {
        reserved.delete(id);
        finishImport();
        throw error;
      }
      let sourceDisposal: Promise<void> | undefined;
      const source: DuckDBSource = {
        kind: 'query-source',
        id,
        version,
        schema,
        columns,
        query(plan: QueryPlan, { signal, requestId }: QueryOptions): Promise<QueryResult> {
          if (disposed || lifetime.signal.aborted)
            return Promise.reject(new Error('The query source has been disposed.'));
          if (signal.aborted) return Promise.reject(abortError());
          // Compile immediately so mutating a plan while it is queued cannot alter its meaning.
          let compiled: ReturnType<typeof compileQuery>;
          try {
            compiled = compileQuery(plan, schema, relation);
          } catch (error) {
            return Promise.reject(error);
          }
          const controller = new AbortController();
          const abort = () => controller.abort();
          signal.addEventListener('abort', abort, { once: true });
          lifetime.signal.addEventListener('abort', abort, { once: true });
          const operation = schedule(async () => {
            throwIfAborted(controller.signal);
            const count =
              compiled.totalRows ??
              Number(
                (await prepared(compiled.countSql!, compiled.countParams!, controller.signal))
                  .getChild('total')
                  ?.get(0),
              );
            if (!Number.isSafeInteger(count) || count < 0)
              throw new Error('Unsafe query row count.');
            const result = await prepared(compiled.sql, compiled.params, controller.signal);
            const rows = resultRows(result, compiled.schema, compiled.finiteFields);
            throwIfAborted(controller.signal);
            return {
              requestId,
              sourceVersion: version,
              rows,
              schema: compiled.schema,
              totalRows: count,
              complete: compiled.offset === 0 && rows.length === count,
            };
          });
          const cleanup = () => {
            signal.removeEventListener('abort', abort);
            lifetime.signal.removeEventListener('abort', abort);
          };
          operation.then(cleanup, cleanup);
          return abortable(operation, controller.signal);
        },
        dispose() {
          if (disposed && owned) return disposal!;
          if (!sourceDisposal) {
            lifetime.abort();
            sourceDisposal = schedule(async () => {
              try {
                await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(relation)}`);
              } finally {
                sources.delete(id);
                reserved.delete(id);
              }
            });
          }
          return sourceDisposal;
        },
      };
      Object.freeze(source);
      sources.set(id, { source, abort: lifetime });
      // Disposal may have started while ingestion was awaiting the worker.
      if (disposed) {
        try {
          await source.dispose();
        } finally {
          finishImport();
        }
        throw new Error('The DuckDB backend has been disposed.');
      }
      finishImport();
      return source;
    },
    dispose() {
      if (!disposal) {
        disposed = true;
        for (const { abort } of sources.values()) abort.abort();
        if (owned) {
          // Terminating an owned database releases every private relation/connection.
          // Do not await SQL cleanup: fatal worker errors can leave those promises pending.
          ownedLifetime.abort();
          sources.clear();
          reserved.clear();
          disposal = Promise.resolve().then(() => owned.dispose());
          return disposal;
        }
        const drops = [...sources.values()].map(({ source }) => source.dispose());
        disposal = (async () => {
          const errors: unknown[] = [];
          for (const result of await Promise.allSettled(drops)) {
            if (result.status === 'rejected') errors.push(result.reason);
          }
          if (importing) await new Promise<void>((resolve) => importsFinished.add(resolve));
          await tail;
          try {
            if (closeConnection) await connection.close();
          } catch (error) {
            errors.push(error);
          }
          if (errors.length) throw new AggregateError(errors, 'DuckDB cleanup failed.');
        })();
      }
      return disposal;
    },
  };
}
