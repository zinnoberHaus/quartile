import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompiledBlock } from '../lang/compile';
import type { Diagnostic } from '../lang/diagnostics';
import { createSourceLoader } from '../lang/source';
import { QuartileBlock } from './QuartileBlock';
import { QuartileDocument, type QuartileDocumentHandle } from './QuartileDocument';

const api = (revenue: number) => ({
  status: 'ok',
  data: { items: [{ region: 'EMEA', revenue }], total: 1 },
});
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('QuartileDocument sources', () => {
  it('reads the rows a block’s path names, from JSON text or parsed JSON', async () => {
    const loadSource = vi.fn(async (url: string) =>
      url.endsWith('text') ? JSON.stringify(api(12)) : api(30),
    );
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock
          source={'kpi sum(revenue) as "Text"\nsrc: /api/text\npath: data.items\nformat: integer\n'}
        />
        <QuartileBlock
          source={
            'kpi sum(revenue) as "Parsed"\nsrc: /api/parsed\npath: data.items\nformat: integer\n'
          }
        />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('12')).toBeTruthy());
    expect(screen.getByText('30')).toBeTruthy();
    expect(loadSource).toHaveBeenCalledTimes(2);
  });

  it('reads an envelope without a path when one key holds the rows', async () => {
    const loadSource = vi.fn(async () => ({ data: [{ revenue: 41 }], meta: { page: 1 } }));
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'kpi sum(revenue) as "Envelope"\nsrc: /api/v1\nformat: integer\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('41')).toBeTruthy());
  });

  it('shows why a path did not resolve', async () => {
    const loadSource = vi.fn(async () => api(1));
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'kpi sum(revenue)\nsrc: /api/x\npath: data.rows\n'} />
      </QuartileDocument>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'Could not load /api/x: The path `data.rows` stops at `rows`: there is no such key at `data`. Keys there: `items`, `total`.',
        ),
      ).toBeTruthy(),
    );
  });

  it('shows the allowlist when a packaged loader refuses a URL', async () => {
    const fetch = vi.fn();
    const loadSource = createSourceLoader({ origins: ['https://api.example.com'], fetch });
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'kpi sum(revenue)\nsrc: https://evil.example/x.csv\n'} />
      </QuartileDocument>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'Could not load https://evil.example/x.csv: This page allows data from: https://api.example.com; `https://evil.example` is not allowed.',
        ),
      ).toBeTruthy(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('describes a data block’s loaded rows for the blocks that read it', async () => {
    const loadSource = vi.fn(async () => ({ data: [{ region: 'EMEA', revenue: 1200 }] }));
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'kpi sum(revenue) as "Revenue"\ndata: sales\n'} />
        <QuartileBlock
          source={'data sales\nsrc: /api/sales\npath: data\nrevenue.format: currency EUR\n'}
        />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('€1,200')).toBeTruthy());
    expect(loadSource).toHaveBeenCalledTimes(1);
  });

  it('reloads on refresh, keeps the last rows when a reload fails, and stops on unmount', async () => {
    vi.useFakeTimers();
    const answers: (() => ReturnType<typeof api>)[] = [
      () => api(1),
      () => api(2),
      () => {
        throw new Error('HTTP 503');
      },
      () => api(4),
    ];
    const loadSource = vi.fn(async () => (answers.shift() ?? (() => api(9)))());
    const { unmount } = render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock
          source={
            'kpi sum(revenue) as "Live"\nsrc: /api/live\npath: data.items\nrefresh: 30s\nformat: integer\n'
          }
        />
      </QuartileDocument>,
    );
    await tick();
    expect(screen.getByText('1')).toBeTruthy();
    await tick(29_000);
    expect(loadSource).toHaveBeenCalledTimes(1);
    await tick(1_000);
    expect(screen.getByText('2')).toBeTruthy();
    // The failed reload leaves the chart as it was.
    await tick(30_000);
    expect(loadSource).toHaveBeenCalledTimes(3);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText(/Could not load/)).toBeNull();
    await tick(30_000);
    expect(screen.getByText('4')).toBeTruthy();
    unmount();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(loadSource).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes a data block’s source for every block over the dataset', async () => {
    vi.useFakeTimers();
    let n = 0;
    const loadSource = vi.fn(async () => `region,revenue\nEMEA,${++n}\n`);
    render(
      <QuartileDocument loadSource={loadSource} dataDisplay="hidden">
        <QuartileBlock
          source={'data live\nsrc: /live.csv\nrefresh: 1m\nrevenue.format: currency EUR\n'}
        />
        <QuartileBlock source={'kpi sum(revenue) as "Revenue"\ndata: live\n'} />
      </QuartileDocument>,
    );
    await tick();
    expect(screen.getByText('€1')).toBeTruthy();
    await tick(60_000);
    expect(screen.getByText('€2')).toBeTruthy();
  });

  it('raises a short refresh to minRefresh, with a note', async () => {
    vi.useFakeTimers();
    const loadSource = vi.fn(async () => api(1));
    const seen: Diagnostic[][] = [];
    let compiled: CompiledBlock | undefined;
    const source = 'kpi sum(revenue)\nsrc: /api/fast\npath: data.items\nrefresh: 1s\n';
    const { rerender } = render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock
          source={source}
          onDiagnostics={(d, c) => {
            seen.push(d);
            compiled = c;
          }}
        />
      </QuartileDocument>,
    );
    await tick();
    expect(compiled?.sources[0].refresh).toBe(10);
    expect(seen.at(-1)?.map((d) => d.message)).toContain(
      'Refresh raised from 1s to 10s, the shortest interval this page allows.',
    );
    await tick(9_000);
    expect(loadSource).toHaveBeenCalledTimes(1);
    await tick(1_000);
    expect(loadSource).toHaveBeenCalledTimes(2);

    // A host that allows faster polling says so.
    rerender(
      <QuartileDocument loadSource={loadSource} minRefresh={1}>
        <QuartileBlock source={source} onDiagnostics={(_d, c) => (compiled = c)} />
      </QuartileDocument>,
    );
    await tick();
    expect(compiled?.sources[0].refresh).toBe(1);
    const before = loadSource.mock.calls.length;
    await tick(3_000);
    expect(loadSource.mock.calls.length).toBeGreaterThanOrEqual(before + 2);
  });

  it('polls only while the page is visible', async () => {
    vi.useFakeTimers();
    let state: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    const loadSource = vi.fn(async () => api(1));
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'kpi sum(revenue)\nsrc: /api/v\npath: data.items\nrefresh: 10\n'} />
      </QuartileDocument>,
    );
    await tick();
    state = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await tick(120_000);
    expect(loadSource).toHaveBeenCalledTimes(1);
    state = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(loadSource).toHaveBeenCalledTimes(2);
  });

  it('offers reload() on its ref', async () => {
    let n = 0;
    const loadSource = vi.fn(async () => api(++n * 5));
    const ref = createRef<QuartileDocumentHandle>();
    render(
      <QuartileDocument ref={ref} loadSource={loadSource}>
        <QuartileBlock
          source={'kpi sum(revenue) as "A"\nsrc: /api/a\npath: data.items\nformat: integer\n'}
        />
        <QuartileBlock source={'kpi sum(revenue) as "B"\nsrc: /api/b\npath: data.items\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('5')).toBeTruthy());
    expect(loadSource).toHaveBeenCalledTimes(2);
    await act(() => ref.current!.reload('/api/a'));
    expect(loadSource).toHaveBeenCalledTimes(3);
    expect(loadSource).toHaveBeenLastCalledWith('/api/a', expect.any(AbortSignal));
    expect(screen.getByText('15')).toBeTruthy();
    await act(() => ref.current!.reload());
    expect(loadSource).toHaveBeenCalledTimes(5);
  });

  it('loads once under StrictMode’s double mount', async () => {
    const loadSource = vi.fn(async () => api(8));
    render(
      <StrictMode>
        <QuartileDocument loadSource={loadSource}>
          <QuartileBlock
            source={
              'kpi sum(revenue) as "Strict"\nsrc: /api/s\npath: data.items\nformat: integer\n'
            }
          />
        </QuartileDocument>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByText('8')).toBeTruthy());
    expect(loadSource.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('waits for a streaming block to finish before asking for its source', async () => {
    const loadSource = vi.fn(async () => api(3));
    const { rerender } = render(
      <QuartileDocument loadSource={loadSource} streaming>
        <QuartileBlock source={'kpi sum(revenue)\nsrc: /api/stream\npath: data.it'} />
      </QuartileDocument>,
    );
    await act(async () => {});
    expect(loadSource).not.toHaveBeenCalled();
    rerender(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock
          source={'kpi sum(revenue)\nsrc: /api/stream\npath: data.items\nformat: integer\n'}
        />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
    expect(loadSource).toHaveBeenCalledTimes(1);
  });

  it('fetches nothing for a name the host already provides', async () => {
    const loadSource = vi.fn(async () => api(1));
    render(
      <QuartileDocument loadSource={loadSource} data={{ sales: [{ revenue: 77 }] }}>
        <QuartileBlock source={'data sales\nsrc: /api/sales\nrefresh: 10\n'} />
        <QuartileBlock source={'kpi sum(revenue) as "Host"\ndata: sales\nformat: integer\n'} />
      </QuartileDocument>,
    );
    await act(async () => {});
    expect(screen.getByText('77')).toBeTruthy();
    expect(loadSource).not.toHaveBeenCalled();
  });
});
