/**
 * Page-wide state shared by every embedded Quartile element: datasets defined by `data` blocks
 * anywhere on the page, selections shared by elements over the same dataset, and the page's
 * source-loading policy.
 */
import type { DataInput } from '../data/types';
import { dict } from '../lang/dict';
import {
  createPolicyLoader,
  createSourceLoader,
  parseSourceOrigins,
  readSourceValue,
  type SourceLoader,
  type SourceValue,
} from '../lang/source';
import { SourceStore } from '../markdown/sourceStore';
import { SelectionStore } from '../selection/store';

/**
 * Which `src:` URLs the page may fetch: `none`, `same-origin` and exact origins such as
 * `https://api.example.com`, as one space- or comma-separated string or as a list; or a function
 * that decides per URL. Only http(s) URLs are ever fetched, whichever form is used.
 */
export type SourcePolicy =
  | 'none'
  | 'same-origin'
  | (string & {})
  | readonly string[]
  | ((url: URL) => boolean);

export interface EmbedOptions {
  /** Fence languages upgraded on the page. Default `quartile`. */
  languages?: readonly string[];
  /**
   * Which `src:` URLs the page may fetch. `none` (default) fetches nothing; `same-origin`
   * fetches the page's own files, e.g. `src: data/sales.csv` next to a docs page; an exact
   * origin (`https://api.example.com`) allows that API, without the page's cookies.
   */
  sources?: SourcePolicy;
  /** Replaces fetching entirely, e.g. to read through an authenticated API. */
  loadSource?: (url: string, signal: AbortSignal) => Promise<SourceValue>;
  /** Shortest `refresh:` interval a block may ask for, in seconds. Default 10. */
  minRefresh?: number;
  /**
   * Rows kept from each loaded `src:` response; blocks drawn from a longer one say how many of
   * its rows they show. Default 50,000.
   */
  maxRows?: number;
  /** Largest response the built-in loader reads, in bytes. Default 5,000,000. */
  maxBytes?: number;
  /** Time the built-in loader allows for a response, in milliseconds. Default 15,000. */
  timeoutMs?: number;
}

type Listener = () => void;

/** Rows kept per loaded source; pages chart larger files than a block holds inline. */
const MAX_SOURCE_ROWS = 50_000;

const warned = new Set<string>();

function warnRejected(tokens: readonly string[]) {
  for (const token of tokens) {
    if (warned.has(token)) continue;
    warned.add(token);
    console.warn(
      `[quartile] Ignored the data source “${token}”. Use none, same-origin or an exact origin such as https://api.example.com (no wildcards, paths or other schemes).`,
    );
  }
}

export class PageScope {
  /** Datasets defined by `data` blocks on the page. */
  datasets: Record<string, DataInput> = dict();
  private owners = new Map<string, string>();
  private listeners = new Set<Listener>();
  private stores = new Map<string, SelectionStore>();
  private builtIn?: { key: unknown; loader: SourceLoader | undefined };
  options: EmbedOptions = {};
  /** Loads, retries and refreshes the page's `src:` URLs for every element. */
  readonly sources = new SourceStore({
    loader: () => this.loader(),
    minRefresh: () => this.options.minRefresh,
    maxRows: () => this.options.maxRows ?? MAX_SOURCE_ROWS,
  });

  constructor(private readonly id: string) {
    this.sources.subscribe(() => this.emit());
  }

  /** Dataset names whose `src` is loading. */
  get pending(): readonly string[] {
    return this.sources.getSnapshot().pending;
  }

  /** Why a source failed, by dataset name. */
  get errors(): Readonly<Record<string, string>> {
    return this.sources.getSnapshot().errors;
  }

  /** Rows as loaded, before the defining block's field settings are applied. */
  get loaded(): Readonly<Record<string, DataInput>> {
    return this.sources.getSnapshot().loaded;
  }

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
    const same = Object.hasOwn(this.datasets, name) && this.datasets[name] === data;
    if (same) return;
    this.owners.set(name, owner);
    const next = dict(this.datasets);
    next[name] = data;
    this.datasets = next;
    this.emit();
  }

  unregister(name: string, owner: string) {
    if (this.owners.get(name) !== owner) return;
    this.owners.delete(name);
    const rest = dict(this.datasets);
    delete rest[name];
    this.datasets = rest;
    this.emit();
  }

  /** Reads a URL once under the source policy, outside the page's shared sources. */
  load(url: string, path?: string): Promise<DataInput> {
    const loader = this.loader();
    if (!loader) return Promise.reject(new Error('The page does not load remote data.'));
    return Promise.resolve(loader(url, new AbortController().signal)).then((value) =>
      readSourceValue(value, { path, maxRows: this.options.maxRows ?? MAX_SOURCE_ROWS }),
    );
  }

  /** Loads `url` into the page's sources under `name`, so every element can read it. */
  requestSource(name: string, url: string, path?: string) {
    if (Object.hasOwn(this.datasets, name)) return;
    this.sources.request({ name, url, path });
  }

  /**
   * Fetches the page's `src:` data again now: every source in use, or those of one URL. Charts
   * keep their rows until the new ones arrive.
   */
  reload(url?: string): Promise<void> {
    return this.sources.reload(url);
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

  /** Names of the selection groups used so far, in the order they were first used. */
  groups(): string[] {
    return [...this.stores.keys()];
  }

  /** The loader elements receive, honoring the page's source policy. Undefined when off. */
  loader(): ((url: string, signal: AbortSignal) => Promise<SourceValue>) | undefined {
    if (this.options.loadSource) return this.options.loadSource;
    const { sources: policy = 'none', maxBytes, timeoutMs } = this.options;
    const key =
      typeof policy === 'function'
        ? policy
        : `${typeof policy === 'string' ? policy : policy.join(' ')}\u0000${maxBytes}\u0000${timeoutMs}`;
    if (this.builtIn?.key !== key) this.builtIn = { key, loader: this.policyLoader(policy) };
    return this.builtIn.loader;
  }

  /** Builds the fetching loader for a policy; the same code path as `createSourceLoader`. */
  private policyLoader(policy: SourcePolicy): SourceLoader | undefined {
    const { maxBytes, timeoutMs } = this.options;
    if (typeof policy === 'function') {
      return createPolicyLoader(
        (url) =>
          policy(url) ? undefined : `This page does not allow data from \`${url.origin}\`.`,
        { maxBytes, timeoutMs },
      );
    }
    const allowed = parseSourceOrigins(policy);
    warnRejected(allowed.rejected);
    if (!allowed.sameOrigin && allowed.origins.length === 0) return undefined;
    return createSourceLoader({
      origins: [...(allowed.sameOrigin ? ['same-origin'] : []), ...allowed.origins],
      maxBytes,
      timeoutMs,
    });
  }
}

let page: PageScope | undefined;

/** The page's shared scope. */
export function pageScope(): PageScope {
  page ??= new PageScope('qpage');
  return page;
}
