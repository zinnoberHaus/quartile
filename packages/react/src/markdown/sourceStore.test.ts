import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveData } from '../data/schema';
import { SourceStore } from './sourceStore';

const csv = (n: number) => `region,amount\nEMEA,${n}\n`;
const amount = (store: SourceStore, name: string) =>
  resolveData(store.getSnapshot().loaded[name]).rows[0]?.amount;

/** A loader whose requests are answered by hand, to hold one open across timer ticks. */
function manualLoader() {
  const calls: {
    url: string;
    signal: AbortSignal;
    resolve(v: unknown): void;
    reject(e: Error): void;
  }[] = [];
  const load = vi.fn(
    (url: string, signal: AbortSignal) =>
      new Promise<unknown>((resolve, reject) => {
        calls.push({ url, signal, resolve, reject });
      }),
  );
  return { load, calls };
}

let visibility: DocumentVisibilityState = 'visible';
function show(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('SourceStore', () => {
  it('loads a source once and shares one request between blocks and paths', async () => {
    const load = vi.fn(async () => ({ a: [{ n: 1 }], b: [{ n: 2 }, { n: 3 }] }));
    const store = new SourceStore({ loader: () => load });
    const seen = vi.fn();
    store.subscribe(seen);
    store.retain({ name: 'first', url: '/api', path: 'a' });
    store.retain({ name: 'second', url: '/api', path: 'b' });
    store.request({ name: 'first', url: '/api', path: 'a' });
    expect(store.getSnapshot().pending).toEqual(['first', 'second']);
    await vi.runAllTimersAsync();
    expect(load).toHaveBeenCalledTimes(1);
    expect(resolveData(store.getSnapshot().loaded.first).rows).toEqual([{ n: 1 }]);
    expect(resolveData(store.getSnapshot().loaded.second).rows).toEqual([{ n: 2 }, { n: 3 }]);
    expect(store.getSnapshot().pending).toEqual([]);
    expect(seen).toHaveBeenCalled();
    // Nothing asked for a refresh, so nothing is scheduled.
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a loader', async () => {
    const store = new SourceStore({ loader: () => undefined });
    store.retain({ name: 'x', url: '/x.csv', refresh: 30 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.canLoad()).toBe(false);
    expect(store.getSnapshot()).toEqual({ loaded: {}, pending: [], errors: {} });
  });

  it('reloads on the block’s interval, raised to the host floor', async () => {
    let n = 0;
    const load = vi.fn(async () => csv(++n));
    const store = new SourceStore({ loader: () => load, minRefresh: () => 20 });
    store.retain({ name: 'slow', url: '/slow.csv', refresh: 60 });
    store.retain({ name: 'fast', url: '/fast.csv', refresh: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    // 2s is below the floor of 20s: nothing reloads before then.
    await vi.advanceTimersByTimeAsync(19_000);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(load.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      '/slow.csv',
      '/fast.csv',
      '/fast.csv',
    ]);
    expect(amount(store, 'fast')).toBe(3);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(load.mock.calls.filter((c) => (c as unknown[])[0] === '/slow.csv')).toHaveLength(2);
    expect(store.minRefresh()).toBe(20);
    expect(new SourceStore({ loader: () => load }).minRefresh()).toBe(10);
    expect(new SourceStore({ loader: () => load, minRefresh: () => 0.2 }).minRefresh()).toBe(1);
  });

  it('uses the shortest interval any mounted block asked for', async () => {
    const load = vi.fn(async () => csv(1));
    const store = new SourceStore({ loader: () => load });
    store.retain({ name: 'x', url: '/x.csv', refresh: 300 });
    const release = store.retain({ name: 'x', url: '/x.csv', refresh: 30 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(270_000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('pauses while the page is hidden and catches up when it is shown', async () => {
    const load = vi.fn(async () => csv(1));
    const store = new SourceStore({ loader: () => load });
    store.retain({ name: 'x', url: '/x.csv', refresh: 30 });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    show('hidden');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(load).toHaveBeenCalledTimes(1);
    // Overdue: one request at once, not one per missed tick.
    show('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(load).toHaveBeenCalledTimes(2);
    // Shown again before the next tick is due: the timer resumes, it does not fire early.
    show('hidden');
    show('visible');
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('never overlaps requests for one URL', async () => {
    const { load, calls } = manualLoader();
    const store = new SourceStore({ loader: () => load });
    store.retain({ name: 'x', url: '/x.csv', refresh: 10 });
    expect(load).toHaveBeenCalledTimes(1);
    // The first answer takes longer than several intervals.
    await vi.advanceTimersByTimeAsync(60_000);
    void store.reload();
    void store.reload('/x.csv');
    store.request({ name: 'x', url: '/x.csv' });
    expect(load).toHaveBeenCalledTimes(1);
    calls[0].resolve(csv(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(amount(store, 'x')).toBe(1);
    // The next reload is counted from the answer, not from the request.
    await vi.advanceTimersByTimeAsync(9_999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good rows when a reload fails, and tries again next time', async () => {
    const answers: (() => Promise<unknown>)[] = [
      async () => csv(1),
      async () => {
        throw new Error('HTTP 503');
      },
      async () => '{"error":"rate limited"}',
      async () => csv(4),
    ];
    const load = vi.fn(() => answers.shift()!());
    const store = new SourceStore({ loader: () => load });
    store.retain({ name: 'x', url: '/x.csv', refresh: 10 });
    await vi.advanceTimersByTimeAsync(0);
    const first = store.getSnapshot().loaded.x;
    expect(amount(store, 'x')).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().loaded.x).toBe(first);
    expect(store.getSnapshot().errors).toEqual({});
    // An answer that is not rows is a failed reload too.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot().loaded.x).toBe(first);
    expect(store.getSnapshot().pending).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(amount(store, 'x')).toBe(4);
  });

  it('stops reloading when no mounted block uses the source', async () => {
    const load = vi.fn(async () => csv(1));
    const store = new SourceStore({ loader: () => load });
    const a = store.retain({ name: 'x', url: '/x.csv', refresh: 10 });
    const b = store.retain({ name: 'x', url: '/x.csv', refresh: 10 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(2);
    a();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(3);
    b();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    // Its rows remain for a block that mounts again, and the timer resumes with it.
    expect(amount(store, 'x')).toBe(1);
    await store.reload();
    expect(load).toHaveBeenCalledTimes(3);
    store.retain({ name: 'x', url: '/x.csv', refresh: 10 });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('does not cache a failure: a later request tries again', async () => {
    const answers: (() => Promise<unknown>)[] = [
      async () => {
        throw new Error('HTTP 500');
      },
      async () => csv(2),
    ];
    const load = vi.fn(() => answers.shift()!());
    const store = new SourceStore({ loader: () => load });
    store.request({ name: 'x', url: '/x.csv' });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().errors).toEqual({ x: 'HTTP 500' });
    // Asked again at once (a re-render): the failure stands for a few seconds.
    await vi.advanceTimersByTimeAsync(4_000);
    store.request({ name: 'x', url: '/x.csv' });
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    store.request({ name: 'x', url: '/x.csv' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().pending).toEqual(['x']);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().errors).toEqual({});
    expect(amount(store, 'x')).toBe(2);
  });

  it('retries a failed source on its next refresh tick', async () => {
    const answers: (() => Promise<unknown>)[] = [
      async () => {
        throw new Error('No response within 15 s.');
      },
      async () => csv(7),
    ];
    const load = vi.fn(() => answers.shift()!());
    const store = new SourceStore({ loader: () => load });
    store.retain({ name: 'x', url: '/x.csv', refresh: 30 });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().errors).toEqual({ x: 'No response within 15 s.' });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getSnapshot().errors).toEqual({});
    expect(amount(store, 'x')).toBe(7);
  });

  it('reports a path that does not resolve for that block only', async () => {
    const load = vi.fn(async () => ({ data: { items: [{ n: 1 }] } }));
    const store = new SourceStore({ loader: () => load });
    store.request({ name: 'good', url: '/api', path: 'data.items' });
    store.request({ name: 'bad', url: '/api', path: 'data.rows' });
    await vi.advanceTimersByTimeAsync(0);
    expect(Object.keys(store.getSnapshot().loaded)).toEqual(['good']);
    expect(store.getSnapshot().errors).toEqual({
      bad: 'The path `data.rows` stops at `rows`: there is no such key at `data`. Keys there: `items`.',
    });
  });

  it('reloads on demand: everything in use, or one URL', async () => {
    let n = 0;
    const load = vi.fn(async () => csv(++n));
    const store = new SourceStore({ loader: () => load });
    store.retain({ name: 'a', url: '/a.csv' });
    store.retain({ name: 'b', url: 'b.csv' });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    const before = store.getSnapshot().loaded.a;
    await store.reload('/b.csv');
    expect(load.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['/a.csv', 'b.csv', 'b.csv']);
    expect(store.getSnapshot().loaded.a).toBe(before);
    expect(amount(store, 'b')).toBe(3);
    await store.reload();
    expect(load).toHaveBeenCalledTimes(5);
    expect(amount(store, 'a')).toBe(4);
  });

  it('follows a name to its new URL and drops the old rows', async () => {
    const load = vi.fn(async (url: string) => csv(url === '/v1.csv' ? 1 : 2));
    const store = new SourceStore({ loader: () => load });
    store.retain({ name: 'sales', url: '/v1.csv', refresh: 10 });
    await vi.advanceTimersByTimeAsync(0);
    expect(amount(store, 'sales')).toBe(1);
    store.retain({ name: 'sales', url: '/v2.csv' });
    expect(store.getSnapshot().loaded).toEqual({});
    await vi.advanceTimersByTimeAsync(0);
    expect(amount(store, 'sales')).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('aborts what is in flight when disposed, and can start again', async () => {
    const { load, calls } = manualLoader();
    const store = new SourceStore({ loader: () => load });
    const release = store.retain({ name: 'x', url: '/x.csv', refresh: 10 });
    expect(calls[0].signal.aborted).toBe(false);
    release();
    store.dispose();
    expect(calls[0].signal.aborted).toBe(true);
    expect(store.getSnapshot().pending).toEqual([]);
    // Mounted again straight away, as React StrictMode does.
    store.retain({ name: 'x', url: '/x.csv', refresh: 10 });
    expect(load).toHaveBeenCalledTimes(2);
    calls[0].resolve(csv(1));
    calls[1].resolve(csv(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(amount(store, 'x')).toBe(2);
    store.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
