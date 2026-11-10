import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceLoader, parseSourceOrigins } from './source';

const csv = 'region,amount\nEMEA,3\nAPAC,4\n';
type FetchArgs = [string, RequestInit];
const ok = (body: string = csv, init?: ResponseInit) => vi.fn(async () => new Response(body, init));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('parseSourceOrigins', () => {
  it('reads none, same-origin and exact origins, separated by spaces or commas', () => {
    expect(
      parseSourceOrigins('same-origin, https://api.example.com  http://localhost:8080,none'),
    ).toEqual({
      sameOrigin: true,
      origins: ['https://api.example.com', 'http://localhost:8080'],
      rejected: [],
    });
    expect(parseSourceOrigins('none')).toEqual({ sameOrigin: false, origins: [], rejected: [] });
    expect(parseSourceOrigins(['same-origin', 'https://a.example https://b.example'])).toEqual({
      sameOrigin: true,
      origins: ['https://a.example', 'https://b.example'],
      rejected: [],
    });
  });

  it('normalizes case, default ports and a trailing slash', () => {
    expect(parseSourceOrigins('HTTPS://API.Example.com:443/').origins).toEqual([
      'https://api.example.com',
    ]);
    expect(parseSourceOrigins('https://api.example.com:8443').origins).toEqual([
      'https://api.example.com:8443',
    ]);
  });

  it('rejects wildcards, paths, credentials and other schemes instead of widening them', () => {
    const tokens = [
      'https://*.example.com',
      '*',
      'https://api.example.com/v1',
      'https://api.example.com/?key=1',
      'https://user:pw@api.example.com',
      'ftp://files.example.com',
      'javascript:alert(1)',
      'data:text/csv;base64',
      'api.example.com',
    ];
    expect(parseSourceOrigins(tokens)).toEqual({
      sameOrigin: false,
      origins: [],
      rejected: tokens,
    });
  });
});

describe('createSourceLoader', () => {
  it('reads an allowed origin without credentials, and the page origin with them', async () => {
    const fetch = ok();
    const load = createSourceLoader({
      origins: ['same-origin', 'https://api.example.com'],
      fetch,
    });
    await expect(load('https://api.example.com/v1/sales.csv?year=2026')).resolves.toBe(csv);
    await expect(load('data/sales.csv')).resolves.toBe(csv);
    const [remote, local] = fetch.mock.calls as unknown as FetchArgs[];
    expect(remote[0]).toBe('https://api.example.com/v1/sales.csv?year=2026');
    expect(remote[1].credentials).toBe('omit');
    expect(local[0]).toBe(`${window.location.origin}/data/sales.csv`);
    expect(local[1].credentials).toBe('same-origin');
    expect(remote[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses anything outside the list before making a request', async () => {
    const fetch = ok();
    const load = createSourceLoader({ origins: ['https://api.example.com'], fetch });
    const refused = [
      'https://evil.example/x.csv',
      'http://api.example.com/x.csv',
      'https://api.example.com:8443/x.csv',
      'https://sub.api.example.com/x.csv',
      'https://api.example.com.evil.example/x.csv',
      '/same-origin-was-not-listed.csv',
    ];
    for (const url of refused) {
      await expect(load(url), url).rejects.toThrow(
        /allows data from: https:\/\/api\.example\.com;/,
      );
    }
    await expect(load('https://evil.example/x.csv?token=1')).rejects.toThrow(
      'This page allows data from: https://api.example.com; `https://evil.example` is not allowed.',
    );
    await expect(createSourceLoader({ origins: [], fetch })('https://a.example/')).rejects.toThrow(
      'This page allows no data sources; `https://a.example` is not allowed.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads http(s) only', async () => {
    const fetch = ok();
    const load = createSourceLoader({ origins: ['same-origin', 'https://api.example.com'], fetch });
    for (const url of [
      'javascript:alert(1)',
      'data:text/csv,a%0A1',
      'file:///etc/passwd',
      'blob:https://api.example.com/1b2c',
      'ftp://api.example.com/x.csv',
    ]) {
      await expect(load(url), url).rejects.toThrow(/^Only http: and https: URLs are loaded;/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an allowlist entry that is not an exact origin', () => {
    expect(() => createSourceLoader({ origins: ['https://*.example.com'] })).toThrow(TypeError);
    expect(() => createSourceLoader({ origins: ['https://api.example.com/v1'] })).toThrow(
      /is not an exact origin/,
    );
  });

  it('resolves relative URLs against `base` and sends only the host’s headers', async () => {
    const fetch = ok();
    const headers = vi.fn((url: URL) => ({ Authorization: `Bearer ${url.hostname}` }));
    const load = createSourceLoader({
      origins: ['https://api.example.com'],
      base: 'https://api.example.com/v2/',
      headers,
      fetch,
    });
    await load('metrics.json');
    const [url, init] = (fetch.mock.calls as unknown as FetchArgs[])[0];
    expect(url).toBe('https://api.example.com/v2/metrics.json');
    expect(init.headers).toEqual({ Authorization: 'Bearer api.example.com' });
    expect(init.credentials).toBe('omit');
    // A key must not travel with a redirect to another origin.
    expect(init.redirect).toBe('error');

    const fixed = createSourceLoader({
      origins: ['https://api.example.com'],
      headers: { 'X-Api-Key': 'k' },
      fetch,
    });
    await fixed('https://api.example.com/a.csv');
    expect((fetch.mock.calls as unknown as FetchArgs[])[1][1].headers).toEqual({
      'X-Api-Key': 'k',
    });
  });

  it('uses the global fetch at request time when none is given', async () => {
    const load = createSourceLoader({ origins: ['same-origin'] });
    const fetch = ok('a\n1\n');
    vi.stubGlobal('fetch', fetch);
    await expect(load('/a.csv')).resolves.toBe('a\n1\n');
    expect(fetch).toHaveBeenCalledTimes(1);
    // Without host headers, redirects are followed and checked afterwards.
    expect((fetch.mock.calls as unknown as FetchArgs[])[0][1]).not.toHaveProperty('redirect');
    expect((fetch.mock.calls as unknown as FetchArgs[])[0][1]).not.toHaveProperty('headers');
  });

  it('stops at the size limit, by Content-Length and while reading', async () => {
    const declared = ok('x', { headers: { 'content-length': '5000001' } });
    await expect(
      createSourceLoader({ origins: ['same-origin'], fetch: declared })('/big.csv'),
    ).rejects.toThrow('The response is larger than 5,000,000 bytes.');

    let pulled = 0;
    const stream = () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array(400));
        },
      });
    const endless = vi.fn(async () => new Response(stream()));
    await expect(
      createSourceLoader({ origins: ['same-origin'], maxBytes: 1000, fetch: endless })('/big.csv'),
    ).rejects.toThrow('The response is larger than 1,000 bytes.');
    expect(pulled).toBeLessThan(10);

    const fits = ok('a,b\n1,2\n', { headers: { 'content-length': '8' } });
    await expect(
      createSourceLoader({ origins: ['same-origin'], maxBytes: 8, fetch: fits })('/ok.csv'),
    ).resolves.toBe('a,b\n1,2\n');
  });

  it('gives up after the timeout and aborts the request', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const load = createSourceLoader({
      origins: ['same-origin'],
      fetch: fetch as typeof globalThis.fetch,
    });
    const pending = load('/slow.csv');
    const outcome = expect(pending).rejects.toThrow('No response within 15 s.');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect(signal?.aborted).toBe(true);

    const quick = createSourceLoader({
      origins: ['same-origin'],
      timeoutMs: 500,
      fetch: fetch as typeof globalThis.fetch,
    })('/slow.csv');
    const quickOutcome = expect(quick).rejects.toThrow('No response within 0.5 s.');
    await vi.advanceTimersByTimeAsync(500);
    await quickOutcome;
  });

  it('reports HTTP errors, failed requests and cancellation', async () => {
    const missing = vi.fn(async () => new Response('no', { status: 404 }));
    await expect(
      createSourceLoader({ origins: ['same-origin'], fetch: missing })('/gone.csv'),
    ).rejects.toThrow('HTTP 404');

    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      createSourceLoader({ origins: ['https://api.example.com'], fetch: offline })(
        'https://api.example.com/a.csv',
      ),
    ).rejects.toThrow('The request failed. Another origin must allow this page to read it (CORS).');

    const controller = new AbortController();
    const hanging = vi.fn(() => new Promise<Response>(() => {}));
    const cancelled = createSourceLoader({
      origins: ['same-origin'],
      fetch: hanging as typeof globalThis.fetch,
    })('/a.csv', controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('refuses a response that was redirected to an origin outside the list', async () => {
    const redirected = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          url: 'https://elsewhere.example/stolen.csv',
          headers: new Headers(),
          text: async () => csv,
        }) as unknown as Response,
    );
    await expect(
      createSourceLoader({ origins: ['https://api.example.com'], fetch: redirected })(
        'https://api.example.com/a.csv',
      ),
    ).rejects.toThrow(
      'The request was redirected to `https://elsewhere.example`, which is not allowed.',
    );
  });

  it('cannot resolve a relative URL without a page or a base', async () => {
    vi.stubGlobal('document', undefined);
    const load = createSourceLoader({ origins: ['https://api.example.com'], fetch: ok() });
    await expect(load('data/a.csv')).rejects.toThrow(
      '`data/a.csv` is a relative URL and there is no page or `base` to resolve it against.',
    );
    await expect(load('https://other.example/a.csv')).rejects.toThrow(
      'This loader allows data from: https://api.example.com; `https://other.example` is not allowed.',
    );
  });
});
