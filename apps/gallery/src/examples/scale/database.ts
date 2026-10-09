import { AsyncDuckDB, selectBundle, VoidLogger } from '@duckdb/duckdb-wasm';
import ehWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvpWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import mvpWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { createDuckDBBackend } from '@quartile/react/duckdb';
import type { QuerySource } from '@quartile/react/query';
import { REQUEST_FIELDS } from './data';
import { mainThreadHeapBytes } from './measurement';
import { generateSample } from './sample';

export interface ScaleSession {
  source: QuerySource;
  sourceRows: number;
  ipcBytes: number;
  generationMs: number;
  engineStartupMs: number;
  ingestionMs: number;
  setupMs: number;
  heapBefore: number | null;
  heapAfter: number | null;
  dispose(): Promise<void>;
}

export async function loadWorkerSource(
  count: number,
  signal: AbortSignal,
  onPhase: (phase: string) => void,
): Promise<ScaleSession> {
  const setupStarted = performance.now();
  const heapBefore = mainThreadHeapBytes();
  onPhase('Generating deterministic Arrow data in a worker…');
  const sample = await generateSample(count, signal);
  signal.throwIfAborted();
  const ipcBytes = sample.bytes.byteLength;
  onPhase('Starting the local DuckDB worker…');
  const engineStarted = performance.now();
  const bundle = await selectBundle({
    mvp: { mainModule: mvpWasmUrl, mainWorker: mvpWorkerUrl },
    eh: { mainModule: ehWasmUrl, mainWorker: ehWorkerUrl },
  });
  signal.throwIfAborted();
  if (!bundle.mainWorker) throw new Error('No compatible DuckDB worker bundle is available.');
  const worker = new Worker(bundle.mainWorker);
  const database = new AsyncDuckDB(new VoidLogger(), worker);
  const setupAbort = new AbortController();
  let wasmObjectUrl: string | undefined;
  let backend: Awaited<ReturnType<typeof createDuckDBBackend>> | undefined;
  let workerFailed = false;
  let rejectWorker: (reason: Error) => void = () => {};
  const engineFailure = new Promise<never>((_resolve, reject) => {
    rejectWorker = reject;
  });
  const onWorkerError = (event: ErrorEvent) => {
    // DuckDB's instantiate promise may remain pending when loading WASM fails inside its worker.
    // Surface the actual worker failure and release this owned engine instead of waiting forever.
    event.preventDefault();
    workerFailed = true;
    rejectWorker(new Error(event.message || 'The database worker failed during initialization.'));
  };
  const onMessageError = () => {
    workerFailed = true;
    rejectWorker(new Error('A database worker initialization message could not be decoded.'));
  };
  worker.addEventListener('error', onWorkerError);
  worker.addEventListener('messageerror', onMessageError);
  let rejectAbort: (reason: DOMException) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    setupAbort.abort();
    void database.terminate();
    worker.terminate();
    rejectAbort(new DOMException('Database initialization cancelled', 'AbortError'));
  };
  signal.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(() => {
    workerFailed = true;
    const error = new Error('Database initialization exceeded 90 seconds. Retry the sample.');
    setupAbort.abort(error);
    rejectWorker(error);
    void database.terminate();
    worker.terminate();
  }, 90_000);
  try {
    // Fetch errors inside DuckDB's worker can leave instantiate() pending. Fetch the packaged,
    // same-origin asset here so HTTP/abort failures are observable, then give the worker its blob.
    const response = await Promise.race([
      fetch(bundle.mainModule, { signal: setupAbort.signal }),
      aborted,
      engineFailure,
    ]);
    if (!response.ok) throw new Error(`Database WASM asset returned HTTP ${response.status}.`);
    const wasm = await Promise.race([response.blob(), aborted, engineFailure]);
    wasmObjectUrl = URL.createObjectURL(wasm);
    await Promise.race([
      database.instantiate(wasmObjectUrl, bundle.pthreadWorker),
      aborted,
      engineFailure,
    ]);
    const engineStartupMs = performance.now() - engineStarted;
    backend = await Promise.race([
      createDuckDBBackend({
        create: async () => ({
          database,
          dispose: async () => {
            await database.terminate();
            worker.terminate();
          },
        }),
      }),
      aborted,
      engineFailure,
    ]);
    onPhase('Importing Arrow into the worker-owned database…');
    const ingestionStarted = performance.now();
    const source = await Promise.race([
      backend.fromArrow(sample.bytes, { id: 'scale-requests', fields: REQUEST_FIELDS }),
      aborted,
      engineFailure,
    ]);
    signal.throwIfAborted();
    const ingestionMs = performance.now() - ingestionStarted;
    const owner = backend;
    let disposed = false;
    return {
      source,
      sourceRows: count,
      ipcBytes,
      generationMs: sample.generationMs,
      engineStartupMs,
      ingestionMs,
      setupMs: performance.now() - setupStarted,
      heapBefore,
      heapAfter: mainThreadHeapBytes(),
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        let releaseDeadline: ReturnType<typeof setTimeout> | undefined;
        try {
          // A fatal engine error can leave DuckDB's connection promises pending. This example
          // owns the entire worker, so it can bound graceful cleanup and always terminate it.
          await Promise.race([
            owner.dispose().catch(() => undefined),
            new Promise<void>((resolve) => {
              releaseDeadline = setTimeout(resolve, 1_000);
            }),
          ]);
        } finally {
          clearTimeout(releaseDeadline);
          await database.terminate();
          worker.terminate();
        }
      },
    };
  } catch (error) {
    setupAbort.abort();
    if (backend && !signal.aborted && !workerFailed) {
      await backend.dispose().catch(() => undefined);
    }
    await database.terminate();
    worker.terminate();
    throw error;
  } finally {
    clearTimeout(deadline);
    if (wasmObjectUrl) URL.revokeObjectURL(wasmObjectUrl);
    signal.removeEventListener('abort', abort);
    worker.removeEventListener('error', onWorkerError);
    worker.removeEventListener('messageerror', onMessageError);
  }
}
