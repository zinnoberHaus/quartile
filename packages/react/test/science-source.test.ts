// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_LIMITS } from '../../../apps/gallery/src/examples/science/import-data';
import { loadDatasetURL } from '../../../apps/gallery/src/examples/science/load-data';

const signal = () => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

describe('browser data URL snapshots', () => {
  it('loads typed JSON without sending browser credentials, a referrer, or caching a snapshot', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          label: 'Orders',
          rows: [{ region: 'East', amount: 42 }],
          fields: { amount: { type: 'quantitative', format: 'currency', currency: 'USD' } },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await loadDatasetURL(
      'https://data.example/orders?token=secret',
      'auto',
      signal(),
    );
    expect(result.label).toBe('Orders');
    expect(result.rows[0]).toMatchObject({ region: 'East', amount: 42 });
    expect(result.fields.amount).toMatchObject({ currency: 'USD' });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  });

  it('detects CSV from MIME or pathname and permits an explicit format for extensionless APIs', async () => {
    const csv = 'id,amount\n001,42\n002,\n';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8' } }),
      )
      .mockResolvedValueOnce(new Response(csv))
      .mockResolvedValueOnce(new Response(csv));
    vi.stubGlobal('fetch', fetcher);
    for (const [url, format] of [
      ['https://data.example/export?token=private', 'auto'],
      ['https://data.example/export.csv', 'auto'],
      ['https://data.example/export', 'csv'],
    ] as const) {
      const result = await loadDatasetURL(url, format, signal());
      expect(result.rows.map((row) => row.amount)).toEqual([42, null]);
      expect(result.rows[0].id).toBe('001');
      expect(result.label).not.toContain('private');
      expect(result.source).not.toContain('private');
      expect(result.label).not.toContain('.csv.csv');
    }
  });

  it('rejects unsafe URL forms before a request and reports HTTP errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    for (const url of [
      'not a url',
      'file:///data.csv',
      'https://user:password@data.example/export',
    ])
      await expect(loadDatasetURL(url, 'auto', signal())).rejects.toThrow(/URL/);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(loadDatasetURL('https://data.example/export', 'auto', signal())).rejects.toThrow(
      'HTTP 503',
    );
  });

  it('uses a redirect destination to recognize CSV and retain safe source provenance', async () => {
    const response = new Response('id,amount\n001,42', {
      headers: { 'content-type': 'application/octet-stream' },
    });
    Object.defineProperty(response, 'url', {
      value: 'https://cdn.example/orders.csv?token=secret',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const result = await loadDatasetURL('https://data.example/download', 'auto', signal());
    expect(result.label).toBe('orders.csv');
    expect(result.source).toBe('https://cdn.example/orders.csv');
    expect(result.rows[0].amount).toBe(42);
  });

  it('rejects malformed UTF-8 instead of silently corrupting category values', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(new Uint8Array([110, 97, 109, 101, 10, 67, 97, 102, 233, 10])),
        ),
    );
    await expect(loadDatasetURL('https://data.example/file.csv', 'auto', signal())).rejects.toThrow(
      'UTF-8',
    );
  });

  it('enforces byte limits even when Content-Length is absent or false, and cancels the stream', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(IMPORT_LIMITS.bytes));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-length': '1' } })),
    );
    await expect(loadDatasetURL('https://data.example/export', 'json', signal())).rejects.toThrow(
      '5 MB',
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects an advertised oversized response without reading it', async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: { 'content-length': String(IMPORT_LIMITS.bytes + 1) },
        }),
      ),
    );
    await expect(loadDatasetURL('https://data.example/export', 'json', signal())).rejects.toThrow(
      '5 MB',
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('decodes split UTF-8 chunks and a JSON byte-order mark without corrupting values', async () => {
    const bytes = new TextEncoder().encode('\uFEFF[{"city":"東京","value":5}]');
    const stream = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    const result = await loadDatasetURL('https://data.example/export', 'json', signal());
    expect(result.rows[0].city).toBe('東京');
  });

  it('passes cancellation to fetch and never parses an aborted response', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn().mockResolvedValue(new Response('[{"value":1}]'));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      loadDatasetURL('https://data.example/export', 'json', controller.signal),
    ).rejects.toThrow();
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('applies the existing scalar, nonempty, safe-number and row-count contract to remote inputs', async () => {
    for (const input of [
      '[]',
      '[{"x":{"nested":1}}]',
      '[{"id":9007199254740993}]',
      JSON.stringify(Array.from({ length: 10001 }, () => ({ x: 1 }))),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(input)));
      await expect(
        loadDatasetURL('https://data.example/export', 'json', signal()),
      ).rejects.toThrow();
    }
  });
});
