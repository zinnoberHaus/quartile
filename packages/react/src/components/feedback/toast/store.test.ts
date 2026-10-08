import { createToastStore, TOAST_EXIT_MS } from './store';

describe('toast store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('adds toasts with defaults and notifies subscribers', () => {
    const store = createToastStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const id = store.show({ title: 'Report exported' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject([
      { id, title: 'Report exported', tone: 'neutral', duration: 5000, open: true },
    ]);
  });

  it('replaces a toast that reuses an id', () => {
    const store = createToastStore();
    store.show({ id: 'export', title: 'Exporting…' });
    store.show({ id: 'export', title: 'Exported', tone: 'success' });
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0]).toMatchObject({ title: 'Exported', tone: 'success' });
  });

  it('closes first, then removes after the exit animation', () => {
    const store = createToastStore();
    const a = store.show({ title: 'A' });
    store.show({ title: 'B' });
    store.dismiss(a);
    expect(store.getSnapshot().find((t) => t.id === a)?.open).toBe(false);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(store.getSnapshot().map((t) => t.title)).toEqual(['B']);
  });

  it('dismisses everything without an id, and showing again cancels a pending removal', () => {
    const store = createToastStore();
    store.show({ id: 'x', title: 'X' });
    store.show({ title: 'Y' });
    store.dismiss();
    store.show({ id: 'x', title: 'X again' });
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(store.getSnapshot().map((t) => t.title)).toEqual(['X again']);
  });
});
