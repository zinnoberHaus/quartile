import { IMPORT_LIMITS, type ImportedData, parseDatasetText } from './import-data';

export type SourceFormat = 'auto' | 'csv' | 'json';

/** Fetch a bounded browser snapshot. Authentication and database queries belong to the caller's server. */
export async function loadDatasetURL(
  input: string,
  format: SourceFormat,
  signal: AbortSignal,
): Promise<ImportedData & { source: string }> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a complete http:// or https:// data URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP(S) data URL without embedded credentials.');

  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    headers: { Accept: 'application/json, text/csv' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`The source returned HTTP ${response.status}. Check the data endpoint.`);
  }
  if (Number(response.headers.get('content-length')) > IMPORT_LIMITS.bytes) {
    await response.body?.cancel();
    throw new Error('Load a response smaller than 5 MB.');
  }
  if (!response.body) throw new Error('The source returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function decode(chunk?: Uint8Array, stream = false) {
    try {
      return decoder.decode(chunk, { stream });
    } catch {
      throw new Error('Use UTF-8 encoded CSV or JSON; the response contains invalid text bytes.');
    }
  }
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > IMPORT_LIMITS.bytes) throw new Error('Load a response smaller than 5 MB.');
      text += decode(chunk.value, true);
    }
    text += decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const finalURL = response.url ? new URL(response.url) : url;
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const csv =
    format === 'csv' ||
    (format === 'auto' &&
      (contentType === 'text/csv' ||
        (contentType !== 'application/json' && finalURL.pathname.toLowerCase().endsWith('.csv'))));
  // Query strings and fragments may contain tokens. Never use them as visible source labels.
  const filename = finalURL.pathname.split('/').pop() || 'Dataset';
  const parserName = `${filename}.${csv ? 'csv' : 'json'}`;
  const result = parseDatasetText(text, parserName);
  return {
    ...result,
    label: result.label === parserName ? filename : result.label,
    source: `${finalURL.origin}${finalURL.pathname}`,
  };
}
