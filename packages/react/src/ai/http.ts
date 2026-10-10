import { ANALYSIS_LIMITS, safeJson, utf8Bytes } from './limits';
import type { AssistantAdapter } from './types';

export interface HttpAssistantAdapterOptions {
  /** An application-owned endpoint. Never a URL supplied by a model. */
  endpoint: string;
  id?: string;
  label?: string;
  mode?: AssistantAdapter['mode'];
  headers?: Readonly<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
}

async function readBounded(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > ANALYSIS_LIMITS.payloadBytes) {
    await response.body?.cancel();
    throw new Error('Assistant response exceeds 64 KiB.');
  }
  if (!response.body) {
    const text = await response.text();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (utf8Bytes(text) > ANALYSIS_LIMITS.payloadBytes)
      throw new Error('Assistant response exceeds 64 KiB.');
    return safeJson(text);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > ANALYSIS_LIMITS.payloadBytes) {
        await reader.cancel();
        throw new Error('Assistant response exceeds 64 KiB.');
      }
      chunks.push(chunk.value);
    }
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return safeJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

/** POST the bounded request to your backend; credentials/model SDKs stay on that backend.
 * The endpoint returns an AnalysisPlan JSON object. HTTP success does not bypass validation.
 */
export function createHttpAssistantAdapter(options: HttpAssistantAdapterOptions): AssistantAdapter {
  if (
    !options.endpoint ||
    !/^(https?:\/\/|\/(?!\/))/.test(options.endpoint) ||
    options.endpoint.includes('\\')
  )
    throw new Error('Expected an HTTP(S) or root-relative backend endpoint.');
  const endpoint = options.endpoint;
  const fetcher =
    options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  return {
    id: options.id ?? 'application-backend',
    label: options.label ?? 'Application backend',
    mode: options.mode ?? 'live',
    async generate(request, { signal }) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const body = JSON.stringify(safeJson(request));
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body,
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Assistant request failed (HTTP ${response.status}).`);
      }
      return readBounded(response, signal);
    },
  };
}
