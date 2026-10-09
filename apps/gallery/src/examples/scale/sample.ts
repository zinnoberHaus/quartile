export interface GeneratedSample {
  bytes: Uint8Array;
  generationMs: number;
}

/** Raw records stay outside the React thread. Only a transferable Arrow IPC buffer crosses it. */
export function generateSample(count: number, signal: AbortSignal): Promise<GeneratedSample> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Sample generation cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./sample.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException('Sample generation cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'The sample worker could not start.'));
    };
    worker.onmessage = (
      event: MessageEvent<GeneratedSample & { type: string; message?: string }>,
    ) => {
      finish();
      if (event.data.type === 'ready') resolve(event.data);
      else reject(new Error(event.data.message || 'Sample generation failed.'));
    };
    worker.postMessage({ count });
  });
}
