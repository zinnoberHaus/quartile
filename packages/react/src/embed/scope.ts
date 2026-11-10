/**
 * Page-wide state shared by every embedded Quartile element: datasets defined by `data` blocks
 * anywhere on the page, selections shared by elements over the same dataset, and the page's
 * source-loading policy.
 */
import { dataset } from '../data/schema';
import type { DataInput } from '../data/types';
import { parseTable } from '../lang/table';
import { SelectionStore } from '../selection/store';

export type SourcePolicy = 'none' | 'same-origin' | ((url: URL) => boolean);

export interface EmbedOptions {
  /** Fence languages upgraded on the page. Default `quartile`. */
  languages?: readonly string[];
  /**
   * Which `src:` URLs the page may fetch. `none` (default) fetches nothing; `same-origin`
   * fetches the page's own files, e.g. `src: data/sales.csv` next to a docs page.
   */
  sources?: SourcePolicy;
  /** Replaces fetching entirely, e.g. to read through an authenticated API. */
  loadSource?: (url: string, signal: AbortSignal) => Promise<DataInput | string>;
}

type Listener = () => void;

export class PageScope {
  datasets: Record<string, DataInput> = {};
  /** Dataset names whose `src` is loading. */
  pending: string[] = [];
  /** Why a source failed, by dataset name. */
  errors: Record<string, string> = {};
  /** Rows as loaded, before the defining block's field settings are applied. */
  loaded: Record<string, DataInput> = {};
  private requests = new Map<string, Promise<DataInput>>();
  private owners = new Map<string, string>();
  private listeners = new Set<Listener>();
  private stores = new Map<string, SelectionStore>();
  options: EmbedOptions = {};

  constructor(private readonly id: string) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of [...this.listeners]) fn();
  }

  /** Registers a `data` block's rows under its name. The first owner keeps the name. */
  register(name: string, data: DataInput, owner: string) {
    const current = this.owners.get(name);
    if (current && current !== owner) return;
    if (current === owner && this.datasets[name] === data) return;
    if (this.datasets[name] === data) return;
    this.owners.set(name, owner);
    this.datasets = { ...this.datasets, [name]: data };
    this.emit();
  }

  unregister(name: string, owner: string) {
    if (this.owners.get(name) !== owner) return;
    this.owners.delete(name);
    const { [name]: _removed, ...rest } = this.datasets;
    this.datasets = rest;
    this.emit();
  }

  /** Loads a URL once per page under the source policy; repeated calls share the request. */
  load(url: string): Promise<DataInput> {
    let request = this.requests.get(url);
    if (!request) {
      const loader = this.loader();
      if (!loader) return Promise.reject(new Error('The page does not load remote data.'));
      request = loader(url, new AbortController().signal).then((value) => {
        if (typeof value !== 'string') return value;
        const table = parseTable(value, { maxRows: 50_000 });
        return dataset(table.rows, table.fields);
      });
      this.requests.set(url, request);
    }
    return request;
  }

  /** Loads `url` into the page's datasets under `name`, so every element can read it. */
  requestSource(name: string, url: string) {
    if (Object.hasOwn(this.datasets, name) || this.pending.includes(name) || this.errors[name])
      return;
    if (!this.loader()) return;
    this.pending = [...this.pending, name];
    this.emit();
    this.load(url).then(
      (data) => {
        this.pending = this.pending.filter((n) => n !== name);
        this.loaded = { ...this.loaded, [name]: data };
        // Usable at once; a defining `data` block replaces it with its described version.
        if (!this.owners.has(name)) this.datasets = { ...this.datasets, [name]: data };
        this.emit();
      },
      (err: unknown) => {
        this.pending = this.pending.filter((n) => n !== name);
        this.errors = { ...this.errors, [name]: err instanceof Error ? err.message : String(err) };
        this.emit();
      },
    );
  }

  /** One store per link group, shared by every element on the page. */
  store = (group: string): SelectionStore => {
    let s = this.stores.get(group);
    if (!s) {
      s = new SelectionStore(`${this.id}-${group}`);
      this.stores.set(group, s);
    }
    return s;
  };

  /** The loader elements receive, honoring the page's source policy. Undefined when off. */
  loader(): ((url: string, signal: AbortSignal) => Promise<DataInput | string>) | undefined {
    if (this.options.loadSource) return this.options.loadSource;
    const policy = this.options.sources ?? 'none';
    if (policy === 'none') return undefined;
    return async (raw, signal) => {
      const url = new URL(raw, document.baseURI);
      const allowed =
        typeof policy === 'function'
          ? policy(url)
          : url.origin === window.location.origin && /^https?:$/.test(url.protocol);
      if (!allowed) throw new Error(`The page does not allow loading ${url.href}.`);
      const res = await fetch(url, { signal, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const table = parseTable(text, { maxRows: 50_000 });
      const problem = table.diagnostics.find((d) => d.severity === 'error');
      if (problem) throw new Error(problem.message);
      return dataset(table.rows, table.fields);
    };
  }
}

let page: PageScope | undefined;

/** The page's shared scope. */
export function pageScope(): PageScope {
  page ??= new PageScope('qpage');
  return page;
}
