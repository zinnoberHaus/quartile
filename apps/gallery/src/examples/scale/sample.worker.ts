import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { makeRequestColumns } from './data';

// This is a one-job worker: the caller terminates it after success, cancellation, or failure.
self.onmessage = (event: MessageEvent<{ count: number }>) => {
  try {
    const started = performance.now();
    const table = tableFromArrays(makeRequestColumns(event.data.count));
    const ipc = tableToIPC(table, 'stream');
    self.postMessage(
      { type: 'ready', bytes: ipc, generationMs: performance.now() - started },
      { transfer: [ipc.buffer] },
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
