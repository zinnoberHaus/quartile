/**
 * Remote data for blocks: the settings a block may write next to `src:` (`path:`, `refresh:`),
 * the conversion of a loaded response into rows, and a bounded, allowlisted loader hosts can
 * hand to their documents. Blocks only name a URL; whether anything is fetched, from where and
 * with which headers is always the host's code.
 */
import { dataset, isDataset } from '../data/schema';
import type { DataInput, Row } from '../data/types';
import { type Diagnostic, info, warning } from './diagnostics';
import type { PropEntry } from './parse';
import { parseTable } from './table';

/* ------------------------------------------------------------------------------------------ */
/* Block settings                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** Normalized keys read as `path:`. `rows` is not one of them: it already means `limit`. */
export const PATH_KEYS: ReadonlySet<string> = new Set(['path', 'rowspath', 'datapath', 'jsonpath']);

/** Settings that describe the block's data rather than its view. */
export const SOURCE_KEYS: ReadonlySet<string> = new Set([...PATH_KEYS, 'refresh', 'url']);

const UNIT_SECONDS: Record<string, number> = {
  '': 1,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
};
const OFF = new Set(['0', 'no', 'off', 'false', 'none', 'never']);
/** Longest interval a timer can hold (2^31 − 1 ms), in whole seconds. */
const MAX_REFRESH = 2_147_483;

/**
 * Reads `30s`, `5m`, `1h` or a number of seconds. Returns the interval in seconds, `0` when
 * refreshing is switched off, or undefined when the text is not an interval.
 */
export function parseRefresh(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  if (OFF.has(t)) return 0;
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/.exec(t);
  if (!m || !Object.hasOwn(UNIT_SECONDS, m[2])) return undefined;
  const seconds = Number(m[1]) * UNIT_SECONDS[m[2]];
  return Number.isFinite(seconds) ? Math.min(seconds, MAX_REFRESH) : undefined;
}

function unquote(s: string): string {
  const t = s.trim();
  return t.length >= 2 && /^["'`]/.test(t) && t[0] === t[t.length - 1] ? t.slice(1, -1) : t;
}

function seconds(n: number): string {
  return `${Number(n.toFixed(3))}s`;
}

export interface SourceSettings {
  path?: string;
  pathLine?: number;
  /** Seconds between reloads; absent when the block does not refresh. */
  refresh?: number;
}

/** Reads `path:` and `refresh:` from a block's settings and reports the ones that cannot apply. */
export function readSourceSettings(
  props: readonly PropEntry[],
  context: { inline: boolean; src: boolean; minRefresh?: number },
  diagnostics: Diagnostic[],
): SourceSettings {
  const out: SourceSettings = {};
  const pathProp = props.find((p) => PATH_KEYS.has(p.norm));
  if (pathProp) {
    if (context.inline || context.src) {
      out.path = unquote(pathProp.value);
      out.pathLine = pathProp.line;
    } else {
      diagnostics.push(
        warning(
          '`path:` applies to a `src:` response or to JSON rows after `---`; it was ignored.',
          pathProp.line,
        ),
      );
    }
  }
  const refreshProp = props.find((p) => p.norm === 'refresh');
  if (refreshProp) {
    const value = parseRefresh(unquote(refreshProp.value));
    if (value === undefined) {
      diagnostics.push(
        warning(
          `“${refreshProp.value}” is not a refresh interval; it was ignored.`,
          refreshProp.line,
          'Use a duration or seconds: 30s, 5m, 1h, 90.',
        ),
      );
    } else if (value > 0 && context.inline) {
      diagnostics.push(
        warning(
          '`refresh:` reloads a `src:` URL; this block’s rows are written in it, so it was ignored.',
          refreshProp.line,
        ),
      );
    } else if (value > 0 && !context.src) {
      diagnostics.push(
        warning(
          '`refresh:` reloads a `src:` URL; this block has none, so it was ignored.',
          refreshProp.line,
          'Write `refresh:` in the block that has `src:`.',
        ),
      );
    } else if (value > 0) {
      const floor = context.minRefresh;
      if (floor !== undefined && value < floor) {
        diagnostics.push(
          info(
            `Refresh raised from ${seconds(value)} to ${seconds(floor)}, the shortest interval this page allows.`,
            refreshProp.line,
          ),
        );
        out.refresh = floor;
      } else out.refresh = value;
    }
  }
  return out;
}

/** The dataset name of a chart's own `src:`; a `data` block uses its own name instead. */
export function sourceDataset(url: string, path?: string): string {
  return path === undefined ? `url:${url}` : `url:${url} path:${path}`;
}

/* ------------------------------------------------------------------------------------------ */
/* Loaded values                                                                               */
/* ------------------------------------------------------------------------------------------ */

/**
 * What a host's loader may return: rows, a dataset, CSV/TSV/Markdown/JSON text, or parsed JSON
 * that holds the rows (`{ "data": [...] }`), which `path:` or the single-list rule locates.
 */
export type SourceValue =
  | DataInput
  | string
  | { readonly [key: string]: unknown }
  | readonly unknown[];

function isRows(value: unknown): value is Row[] {
  return (
    Array.isArray(value) && value.every((v) => !!v && typeof v === 'object' && !Array.isArray(v))
  );
}

/**
 * Turns a loader's result into rows. A dataset, and rows without a `path:`, are the host's own
 * shaping and pass through; text and other JSON are read like inline data. Throws with the first
 * problem, so the block can show why its source has no rows.
 */
export function readSourceValue(
  value: unknown,
  options: { path?: string; maxRows?: number } = {},
): DataInput {
  if (isDataset(value)) return value;
  if (options.path === undefined && isRows(value)) return value;
  const table = parseTable(value, options);
  const problem = table.diagnostics.find((d) => d.severity === 'error');
  if (problem)
    throw new Error(problem.hint ? `${problem.message} ${problem.hint}` : problem.message);
  return dataset(table.rows, table.fields);
}

/* ------------------------------------------------------------------------------------------ */
/* Origins                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export interface SourceOrigins {
  /** The page's own origin is allowed. */
  sameOrigin: boolean;
  /** Exact origins (scheme, host and port) that are allowed, normalized. */
  origins: string[];
  /** Tokens that are not `none`, `same-origin` or an exact http(s) origin. */
  rejected: string[];
}

function exactOrigin(token: string): string | undefined {
  if (token.includes('*')) return undefined;
  let url: URL;
  try {
    url = new URL(token);
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname) return undefined;
  if (url.username || url.password || url.search || url.hash) return undefined;
  if (url.pathname !== '/' && url.pathname !== '') return undefined;
  return url.origin;
}

/**
 * Reads an allowlist written as `none`, `same-origin` and exact origins, separated by spaces or
 * commas. An origin is matched whole (scheme, host and port), so wildcards, paths and schemes
 * other than http(s) are rejected rather than widened to something the author did not write.
 */
export function parseSourceOrigins(input: string | readonly string[]): SourceOrigins {
  const tokens = (typeof input === 'string' ? [input] : input)
    .flatMap((t) => String(t).split(/[\s,]+/))
    .filter(Boolean);
  const out: SourceOrigins = { sameOrigin: false, origins: [], rejected: [] };
  for (const token of tokens) {
    const word = token.toLowerCase();
    if (word === 'none') continue;
    if (word === 'same-origin') {
      out.sameOrigin = true;
      continue;
    }
    const origin = exactOrigin(token);
    if (!origin) out.rejected.push(token);
    else if (!out.origins.includes(origin)) out.origins.push(origin);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* Loader                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export const DEFAULT_MAX_BYTES = 5_000_000;
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Shortest refresh interval, in seconds, a host allows unless it says otherwise. */
export const DEFAULT_MIN_REFRESH = 10;

export interface SourceFetchOptions {
  /** Resolves relative URLs. Defaults to `document.baseURI` where there is a document. */
  base?: string | URL;
  /**
   * Request headers, e.g. an API key. They come from the host's code only; nothing a block
   * writes can add or change one. A request that carries them does not follow redirects, so an
   * allowed origin cannot pass them on to another one.
   */
  headers?: Record<string, string> | ((url: URL) => Record<string, string>);
  /** Largest response body read, in bytes. Default 5,000,000. */
  maxBytes?: number;
  /** Time allowed for the whole response, in milliseconds. Default 15,000. */
  timeoutMs?: number;
  /** The fetch implementation. Defaults to the global `fetch`, looked up at each request. */
  fetch?: typeof fetch;
}

export interface SourceLoaderOptions extends SourceFetchOptions {
  /**
   * Exact origins the loader may read (`https://api.example.com`, with a port when it is not
   * the default), and `'same-origin'` for the page's own origin where there is a `location`.
   */
  origins: readonly string[];
}

/** Loads the text behind a `src:` URL. Fits `QuartileDocument loadSource` and the server's. */
export type SourceLoader = (url: string, signal?: AbortSignal) => Promise<string>;

function pageOrigin(): string | undefined {
  return typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
    ? location.origin
    : undefined;
}

function abortError(): Error {
  return typeof DOMException === 'function'
    ? new DOMException('The request was cancelled.', 'AbortError')
    : new Error('The request was cancelled.');
}

/** Settles with `work`, or rejects as soon as `signal` aborts, even if `work` ignores it. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(abortError());
    if (signal.aborted) return cancel();
    signal.addEventListener('abort', cancel, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

async function readBody(res: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const tooLarge = () =>
    new Error(`The response is larger than ${maxBytes.toLocaleString('en-US')} bytes.`);
  const declared = Number(res.headers?.get?.('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    void res.body?.cancel?.().catch(() => {});
    throw tooLarge();
  }
  const reader = res.body?.getReader?.();
  if (!reader) {
    const text = await untilAborted(res.text(), signal);
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw tooLarge();
    return text;
  }
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await untilAborted(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw tooLarge();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    void reader.cancel().catch(() => {});
  }
}

/**
 * The loader behind `createSourceLoader` and the embed script. `refuse` returns why a URL may
 * not be read, or undefined to allow it; http(s) is required before it is asked.
 */
export function createPolicyLoader(
  refuse: (url: URL) => string | undefined,
  options: SourceFetchOptions = {},
): SourceLoader {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const check = (url: URL): string | undefined =>
    /^https?:$/.test(url.protocol)
      ? refuse(url)
      : `Only http: and https: URLs are loaded; \`${url.protocol}\` is not allowed.`;

  return async (raw, signal) => {
    const base = options.base ?? (typeof document !== 'undefined' ? document.baseURI : undefined);
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      throw new Error(
        base === undefined
          ? `\`${raw}\` is a relative URL and there is no page or \`base\` to resolve it against.`
          : `\`${raw}\` is not a URL.`,
      );
    }
    const refusal = check(url);
    if (refusal) throw new Error(refusal);
    if (signal?.aborted) throw abortError();

    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== 'function') throw new Error('This environment has no `fetch`.');
    const sameOrigin = url.origin === pageOrigin();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const headers =
        typeof options.headers === 'function' ? options.headers(url) : options.headers;
      const res = await untilAborted(
        fetcher(url.href, {
          signal: controller.signal,
          // Cookies and HTTP credentials never leave the page's own origin.
          credentials: sameOrigin ? 'same-origin' : 'omit',
          ...(headers && Object.keys(headers).length
            ? { headers, redirect: 'error' as const }
            : {}),
        }),
        controller.signal,
      );
      // An allowed origin must not hand the request on to one that is not.
      if (res.url) {
        const landed = new URL(res.url);
        if (landed.origin !== url.origin && check(landed)) {
          throw new Error(
            `The request was redirected to \`${landed.origin}\`, which is not allowed.`,
          );
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await readBody(res, maxBytes, controller.signal);
    } catch (err) {
      if (timedOut)
        throw new Error(`No response within ${Number((timeoutMs / 1000).toFixed(1))} s.`);
      if (signal?.aborted) throw abortError();
      if (err instanceof TypeError) {
        const crossOrigin = typeof document !== 'undefined' && !sameOrigin;
        const why = [
          'The request failed.',
          ...(crossOrigin ? ['Another origin must allow this page to read it (CORS).'] : []),
          ...(options.headers ? ['Requests that carry `headers` do not follow redirects.'] : []),
        ];
        throw new Error(why.join(' '));
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  };
}

/** Why `url` is outside an allowlist, in words a page author can act on. */
export function originRefusal(allowed: SourceOrigins, url: URL): string | undefined {
  if (allowed.sameOrigin && url.origin === pageOrigin()) return undefined;
  if (allowed.origins.includes(url.origin)) return undefined;
  const who = typeof document === 'undefined' ? 'This loader' : 'This page';
  const names = [...(allowed.sameOrigin ? ['same-origin'] : []), ...allowed.origins];
  return names.length
    ? `${who} allows data from: ${names.join(', ')}; \`${url.origin}\` is not allowed.`
    : `${who} allows no data sources; \`${url.origin}\` is not allowed.`;
}

/**
 * A loader for `src:` URLs that reads only the origins the host lists. Cookies are sent to the
 * page's own origin only, the response is bounded in size and time, and anything outside the
 * list is refused before a request is made.
 *
 *   const loadSource = createSourceLoader({ origins: ['same-origin', 'https://api.example.com'] });
 *   <QuartileDocument loadSource={loadSource}>…</QuartileDocument>
 */
export function createSourceLoader(options: SourceLoaderOptions): SourceLoader {
  const allowed = parseSourceOrigins(options.origins ?? []);
  if (allowed.rejected.length) {
    throw new TypeError(
      `createSourceLoader: “${allowed.rejected[0]}” is not an exact origin. Use a scheme, host and optional port, e.g. “https://api.example.com”, or “same-origin”.`,
    );
  }
  return createPolicyLoader((url) => originRefusal(allowed, url), options);
}
