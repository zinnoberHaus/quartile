/**
 * Loads the `src:` URLs of a document or a page and keeps them fresh. One request per URL at a
 * time, shared by every block that names it; a failed URL can be asked for again; a block's
 * `refresh:` reloads on a timer while the page is visible and a mounted block still uses it.
 * No React here: QuartileDocument subscribes to it and the embed's page scope owns one.
 */
import type { DataInput } from '../data/types';
import { dict } from '../lang/dict';
import { DEFAULT_MIN_REFRESH, readSourceValue } from '../lang/source';

/** One block's request for remote rows, as the compiler records it in `sources`. */
export interface SourceRequest {
  /** Dataset name the rows are stored under. */
  name: string;
  url: string;
  /** Where the rows are in a JSON response. */
  path?: string;
  /** Seconds between reloads. */
  refresh?: number;
}

export interface SourceSnapshot {
  /** Rows by dataset name. Kept when a later reload fails. */
  loaded: Readonly<Record<string, DataInput>>;
  /** Names loading for the first time. */
  pending: readonly string[];
  /** Why a source has no rows, by dataset name. */
  errors: Readonly<Record<string, string>>;
}

export interface SourceStoreOptions {
  /** The host's loader right now, or undefined when the host loads nothing. */
  loader: () => ((url: string, signal: AbortSignal) => unknown) | undefined;
  /** Shortest refresh interval in seconds. Default 10; never below 1. */
  minRefresh?: () => number | undefined;
  /**
   * Rows kept per source; a view drawn from a longer one says so. Defaults to the table reader's
   * limit of 5,000.
   */
  maxRows?: number | (() => number | undefined);
  /** How long a failed source waits before a block's request tries it again. Default 5,000 ms. */
  retryAfterMs?: number;
}

interface Entry {
  name: string;
  url: string;
  path?: string;
  data?: DataInput;
  error?: string;
  failedAt?: number;
  loading: boolean;
  /** Mounted blocks using the source, with the refresh each asked for. */
  holders: Map<symbol, number | undefined>;
  /** A block has held it, so it counts as unused once they are all gone. */
  held: boolean;
}

interface Target {
  inflight?: Promise<void>;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  settledAt?: number;
}

const EMPTY: SourceSnapshot = { loaded: dict(), pending: [], errors: dict() };
/** Longest delay a timer holds without overflowing to "now". */
const MAX_DELAY = 2 ** 31 - 1;

function sameRecord<T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function sameUrl(a: string, b: string): boolean {
  if (a === b) return true;
  if (typeof document === 'undefined') return false;
  try {
    return new URL(a, document.baseURI).href === new URL(b, document.baseURI).href;
  } catch {
    return false;
  }
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export class SourceStore {
  private entries = new Map<string, Entry>();
  private targets = new Map<string, Target>();
  private listeners = new Set<() => void>();
  private snapshot: SourceSnapshot = EMPTY;
  private watching = false;

  constructor(private readonly options: SourceStoreOptions) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SourceSnapshot => this.snapshot;

  /** True when the host has a loader, so a block without rows is waiting rather than refused. */
  canLoad(): boolean {
    return !!this.options.loader();
  }

  /** The shortest refresh interval this host allows, in seconds. */
  minRefresh(): number {
    const floor = this.options.minRefresh?.();
    return Math.max(1, typeof floor === 'number' && floor > 0 ? floor : DEFAULT_MIN_REFRESH);
  }

  /** Loads a source once. A source that failed is tried again after a short wait. */
  request(source: SourceRequest): void {
    this.ensure(this.entry(source));
  }

  /**
   * Loads a source and keeps it for a mounted block; `refresh` reloads it on a timer. Returns
   * the release. Timers stop when the last block using a URL lets go.
   */
  retain(source: SourceRequest): () => void {
    const entry = this.entry(source);
    const token = Symbol(source.name);
    entry.holders.set(token, source.refresh);
    entry.held = true;
    this.ensure(entry);
    this.arm(entry.url);
    return () => {
      entry.holders.delete(token);
      this.arm(entry.url);
    };
  }

  /**
   * Fetches again now: every source in use, or those of one URL. Rows stay on screen until the
   * new ones arrive, and stay if the reload fails. Resolves when the requests have settled.
   */
  reload(url?: string): Promise<void> {
    const urls = new Set<string>();
    for (const entry of this.entries.values()) {
      if (url !== undefined && !sameUrl(entry.url, url)) continue;
      // Its blocks have left the page.
      if (entry.held && entry.holders.size === 0) continue;
      urls.add(entry.url);
    }
    return Promise.all([...urls].map((u) => this.fetch(u))).then(() => undefined);
  }

  /** Stops requests, timers and listeners. The store can be used again afterwards. */
  dispose(): void {
    for (const target of this.targets.values()) {
      clearTimeout(target.timer);
      target.timer = undefined;
      target.controller?.abort();
      // Cleared here, not when the aborted request settles, so a block that mounts again at
      // once (React StrictMode) starts a new request instead of waiting on the cancelled one.
      target.controller = undefined;
      target.inflight = undefined;
    }
    for (const entry of this.entries.values()) entry.loading = false;
    this.watch(false);
    this.publish();
  }

  private entry(source: SourceRequest): Entry {
    let entry = this.entries.get(source.name);
    if (entry && (entry.url !== source.url || entry.path !== source.path)) {
      // The name now points somewhere else (an edited block): its old rows do not apply.
      const previous = entry.url;
      entry.holders.clear();
      this.entries.delete(source.name);
      entry = undefined;
      this.arm(previous);
    }
    if (!entry) {
      entry = {
        name: source.name,
        url: source.url,
        path: source.path,
        loading: false,
        holders: new Map(),
        held: false,
      };
      this.entries.set(source.name, entry);
      this.publish();
    }
    return entry;
  }

  private ensure(entry: Entry): void {
    if (entry.data !== undefined || entry.loading) return;
    const retryAfter = this.options.retryAfterMs ?? 5000;
    if (entry.error !== undefined && Date.now() - (entry.failedAt ?? 0) < retryAfter) return;
    void this.fetch(entry.url);
  }

  private at(url: string): Entry[] {
    return [...this.entries.values()].filter((e) => e.url === url);
  }

  /** Marks the sources of a URL that have no rows yet as waiting for the request. */
  private markWaiting(url: string): void {
    for (const entry of this.at(url)) {
      if (entry.data === undefined) {
        entry.loading = true;
        entry.error = undefined;
      }
    }
    this.publish();
  }

  /** One request per URL at a time: a second caller joins the one in flight. */
  private fetch(url: string): Promise<void> {
    let target = this.targets.get(url);
    if (target?.inflight) {
      this.markWaiting(url);
      return target.inflight;
    }
    const load = this.options.loader();
    if (!load) return Promise.resolve();
    if (!target) {
      target = {};
      this.targets.set(url, target);
    }
    const state = target;
    clearTimeout(state.timer);
    state.timer = undefined;
    const controller = new AbortController();
    state.controller = controller;
    this.markWaiting(url);

    const fail = (entry: Entry, reason: unknown) => {
      entry.failedAt = Date.now();
      // Rows already on screen stay; only a source without any reports the failure.
      if (entry.data === undefined) {
        entry.error = reason instanceof Error ? reason.message : 'The data could not be loaded.';
      }
    };
    let work: Promise<unknown>;
    try {
      work = Promise.resolve(load(url, controller.signal));
    } catch (reason) {
      work = Promise.reject(reason);
    }
    state.inflight = work
      .then(
        (value) => {
          if (state.controller !== controller) return;
          for (const entry of this.at(url)) {
            try {
              const { maxRows } = this.options;
              entry.data = readSourceValue(value, {
                path: entry.path,
                maxRows: typeof maxRows === 'function' ? maxRows() : maxRows,
              });
              entry.error = undefined;
              entry.failedAt = undefined;
            } catch (reason) {
              fail(entry, reason);
            }
          }
        },
        (reason: unknown) => {
          if (state.controller !== controller) return;
          for (const entry of this.at(url)) fail(entry, reason);
        },
      )
      .finally(() => {
        if (state.controller !== controller) return;
        state.inflight = undefined;
        state.controller = undefined;
        state.settledAt = Date.now();
        for (const entry of this.at(url)) entry.loading = false;
        this.publish();
        this.arm(url);
      });
    return state.inflight;
  }

  /** Seconds between reloads of a URL: the shortest any mounted block asked for, floored. */
  private interval(url: string): number | undefined {
    let shortest: number | undefined;
    for (const entry of this.at(url)) {
      for (const refresh of entry.holders.values()) {
        if (typeof refresh !== 'number' || !(refresh > 0)) continue;
        shortest = Math.min(shortest ?? Number.POSITIVE_INFINITY, refresh);
      }
    }
    return shortest === undefined ? undefined : Math.max(shortest, this.minRefresh());
  }

  /** (Re)schedules the next reload of a URL, or cancels it when nothing asks for one. */
  private arm(url: string): void {
    let target = this.targets.get(url);
    clearTimeout(target?.timer);
    if (target) target.timer = undefined;
    const interval = this.interval(url);
    this.watch([...this.entries.values()].some((e) => this.interval(e.url) !== undefined));
    // A request in flight re-arms when it settles; a hidden page re-arms when it is shown.
    if (interval === undefined || target?.inflight || pageHidden()) return;
    if (!target) {
      target = {};
      this.targets.set(url, target);
    }
    const state = target;
    const due = (state.settledAt ?? Date.now()) + interval * 1000;
    state.timer = setTimeout(
      () => {
        state.timer = undefined;
        if (!pageHidden()) void this.fetch(url);
      },
      Math.min(Math.max(0, due - Date.now()), MAX_DELAY),
    );
  }

  private onVisibility = () => {
    // Hidden: timers stop. Shown again: overdue sources reload at once, the rest resume.
    for (const url of new Set([...this.entries.values()].map((e) => e.url))) this.arm(url);
  };

  private watch(on: boolean): void {
    if (typeof document === 'undefined' || on === this.watching) return;
    this.watching = on;
    if (on) document.addEventListener('visibilitychange', this.onVisibility);
    else document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private publish(): void {
    const loaded: Record<string, DataInput> = dict();
    const errors: Record<string, string> = dict();
    const pending: string[] = [];
    for (const entry of this.entries.values()) {
      if (entry.data !== undefined) loaded[entry.name] = entry.data;
      if (entry.error !== undefined) errors[entry.name] = entry.error;
      if (entry.loading) pending.push(entry.name);
    }
    const last = this.snapshot;
    const next: SourceSnapshot = {
      loaded: sameRecord(loaded, last.loaded) ? last.loaded : loaded,
      errors: sameRecord(errors, last.errors) ? last.errors : errors,
      pending:
        pending.length === last.pending.length && pending.every((n, i) => n === last.pending[i])
          ? last.pending
          : pending,
    };
    if (
      next.loaded === last.loaded &&
      next.errors === last.errors &&
      next.pending === last.pending
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}
