import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { dataset } from '../data/schema';
import type { DataInput } from '../data/types';
import { DEFAULT_LANGUAGES, findFencedBlocks, scanDocument } from '../lang/document';
import { parseTable } from '../lang/table';
import { QuartileProvider, type QuartileProviderProps } from '../provider/QuartileProvider';
import { type SelectionChange, type SelectionEvent, SelectionStore } from '../selection/store';
import type { ViewAction } from '../spec/actions';

export type DataDisplay = 'summary' | 'table' | 'hidden';

export interface QuartileDocumentContextValue {
  /** Host datasets, `data` blocks and loaded sources, by name. */
  datasets: Record<string, DataInput>;
  /** Names whose rows are still loading. */
  pending: readonly string[];
  /** Why a source failed, by dataset name. */
  sourceErrors: Readonly<Record<string, string>>;
  streaming: boolean;
  dataDisplay: DataDisplay;
  languages: readonly string[];
  /** Registers a `data` block's rows under its name; `key` identifies the definition. */
  register(name: string, data: DataInput, owner: string, key: string): void;
  unregister(name: string, owner: string): void;
  /** Asks the host's loader for a URL. Does nothing without `loadSource`. */
  requestSource(name: string, url: string): void;
  /** True when the host supplied a loader. */
  canLoad: boolean;
  /**
   * The selection store of `group`, created on first use: a dataset name, a `link:` name, or a
   * standalone block's `block-<n>`. `anonymous` marks a group the document named itself.
   */
  store(group: string, anonymous?: boolean): SelectionStore;
  /** 1-based number of a block among the document's blocks, in the order they first render. */
  blockNumber(owner: string): number;
  /** Passes a block's selection change to `onSelectionChange`, once per store event. */
  selectionChanged(change: SelectionChange, event: SelectionEvent): void;
  /** The host's default actions for views, or false when it allows none. */
  actions?: readonly ViewAction[] | false;
  /**
   * Whether the document's Markdown closes the fence holding `source`: true for finished
   * blocks of a streaming answer, undefined when the document was not given its Markdown.
   */
  isClosed(source: string): boolean | undefined;
}

const DocumentContext = createContext<QuartileDocumentContextValue | null>(null);

/** The enclosing Quartile document, or null for a standalone block. */
export function useQuartileDocument(): QuartileDocumentContextValue | null {
  return useContext(DocumentContext);
}

export interface QuartileDocumentProps extends Omit<QuartileProviderProps, 'children'> {
  /** Named datasets blocks can read with `data: name`. Authorize them before passing them in. */
  data?: Record<string, DataInput>;
  /**
   * The document's Markdown source. With it, `data` blocks anywhere in the document are known on
   * the first render, including during server rendering; without it, blocks register as they mount.
   */
  markdown?: string;
  /**
   * Loads a block's `src:` URL. Return rows, a dataset, or CSV/JSON text. Without a loader no
   * request is made and the block says so: remote data is the host's decision.
   */
  loadSource?: (url: string, signal: AbortSignal) => Promise<DataInput | string>;
  /** The content is still being written, e.g. a streaming answer. Incomplete blocks wait. */
  streaming?: boolean;
  /**
   * Names of datasets the host is still loading. Blocks over them show a placeholder instead
   * of an error until the rows arrive in `data`.
   */
  pending?: readonly string[];
  /** How `data` blocks render: a collapsed summary (default), an open table, or nothing. */
  dataDisplay?: DataDisplay;
  /** Fence languages read as Quartile blocks. Defaults to `quartile`. */
  languages?: readonly string[];
  /** Wrap children in a QuartileProvider (default). Pass false inside an existing provider. */
  provider?: boolean;
  /**
   * Supplies the selection store for a link group. Pass one factory to several documents (for
   * example separate embedded elements on one page) so they share selections.
   */
  stores?: (group: string) => SelectionStore;
  /**
   * Called after every change of a selection group the document's blocks take part in, once per
   * change however many blocks share the group. Groups are named by `link:`, else by the
   * dataset, else `block-<n>` for a block with its own rows.
   */
  onSelectionChange?: (change: SelectionChange) => void;
  /**
   * Controls views may show: `table`, `rows` (the rows behind a view) and `download` (those
   * rows as CSV). A list is the default for views whose block does not set `actions:`; `false`
   * shows none whatever a block asks. Without it, only blocks that ask show any.
   */
  actions?: readonly ViewAction[] | false;
  children?: ReactNode;
}

interface Registered {
  owner: string;
  key: string;
  data: DataInput;
}

function toDataInput(value: DataInput | string): DataInput {
  if (typeof value !== 'string') return value;
  const table = parseTable(value);
  const problem = table.diagnostics.find((d) => d.severity === 'error');
  if (problem) throw new Error(problem.message);
  return dataset(table.rows, table.fields);
}

/**
 * Scopes Quartile blocks rendered from one Markdown document: datasets defined once and used by
 * any block, shared selections between blocks over the same dataset, streaming state, and the
 * host's optional loader for `src:` URLs.
 */
export function QuartileDocument({
  data,
  markdown,
  loadSource,
  streaming = false,
  pending: hostPending,
  dataDisplay = 'summary',
  languages = DEFAULT_LANGUAGES,
  provider = true,
  stores: externalStores,
  onSelectionChange,
  actions,
  children,
  ...providerProps
}: QuartileDocumentProps) {
  const docId = useId();
  const [registered, setRegistered] = useState<Record<string, Registered>>({});
  const [loaded, setLoaded] = useState<Record<string, DataInput>>({});
  const [loading, setLoading] = useState<Record<string, true>>({});
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const stores = useRef(new Map<string, SelectionStore>());
  const requested = useRef(new Map<string, AbortController>());
  const loaderRef = useRef(loadSource);
  loaderRef.current = loadSource;

  // Datasets defined anywhere in the Markdown, known before any block mounts.
  const scanned = useMemo(
    () =>
      markdown === undefined
        ? undefined
        : scanDocument(markdown, { languages, datasets: data, partial: streaming }),
    [markdown, languages, data, streaming],
  );

  // Fences the Markdown already closes: their blocks are complete even while the answer streams.
  const closedSources = useMemo(() => {
    if (markdown === undefined) return undefined;
    const closed = new Set<string>();
    for (const b of findFencedBlocks(markdown, languages))
      if (b.closed) closed.add(b.source.trimEnd());
    return closed;
  }, [markdown, languages]);

  const datasets = useMemo(() => {
    const out: Record<string, DataInput> = { ...(scanned?.datasets ?? {}), ...(data ?? {}) };
    for (const [name, r] of Object.entries(registered)) {
      if (!Object.hasOwn(out, name)) out[name] = r.data;
    }
    for (const [name, rows] of Object.entries(loaded)) out[name] = rows;
    return out;
  }, [scanned, data, registered, loaded]);

  const pending = useMemo(
    () => [...Object.keys(loading), ...(hostPending ?? [])],
    [loading, hostPending],
  );

  const register = useCallback((name: string, value: DataInput, owner: string, key: string) => {
    setRegistered((current) => {
      const existing = current[name];
      if (existing && existing.key === key) return current;
      if (existing && existing.owner !== owner) return current;
      return { ...current, [name]: { owner, key, data: value } };
    });
  }, []);

  const unregister = useCallback((name: string, owner: string) => {
    setRegistered((current) => {
      if (current[name]?.owner !== owner) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const requestSource = useCallback((name: string, url: string) => {
    const loader = loaderRef.current;
    const key = `${name}\u0000${url}`;
    if (!loader || requested.current.has(key)) return;
    const controller = new AbortController();
    requested.current.set(key, controller);
    setLoading((l) => ({ ...l, [name]: true }));
    loader(url, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setLoaded((l) => ({ ...l, [name]: toDataInput(value) }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSourceErrors((e) => ({
          ...e,
          [name]: err instanceof Error ? err.message : 'The data could not be loaded.',
        }));
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(({ [name]: _done, ...rest }) => rest);
      });
  }, []);

  useEffect(
    () => () => {
      for (const c of requested.current.values()) c.abort();
    },
    [],
  );

  // Sources named in the Markdown start loading as soon as the document mounts.
  useEffect(() => {
    for (const s of scanned?.sources ?? []) {
      if (!Object.hasOwn(data ?? {}, s.name)) requestSource(s.name, s.url);
    }
  }, [scanned, data, requestSource]);

  const store = useCallback(
    (group: string, anonymous = false) => {
      if (externalStores) return externalStores(group);
      let s = stores.current.get(group);
      if (!s) {
        const id = `${docId.replace(/[^a-zA-Z0-9]/g, '')}-${group}`;
        // Components that print a store's id treat "selection" plus a separator as unnamed.
        s = new SelectionStore(anonymous ? `selection:${id}` : `doc${id}`);
        stores.current.set(group, s);
      }
      return s;
    },
    [docId, externalStores],
  );

  // Numbers are handed out during render, so server and client count blocks in the same order.
  const numbers = useRef(new Map<string, number>());
  const blockNumber = useCallback((owner: string) => {
    let n = numbers.current.get(owner);
    if (n === undefined) {
      n = numbers.current.size + 1;
      numbers.current.set(owner, n);
    }
    return n;
  }, []);

  const selectionListener = useRef(onSelectionChange);
  selectionListener.current = onSelectionChange;
  const lastSelectionEvent = useRef<SelectionEvent | null>(null);
  // Every block over a group reports the same store event; the host hears it once.
  const selectionChanged = useCallback((change: SelectionChange, event: SelectionEvent) => {
    if (lastSelectionEvent.current === event) return;
    lastSelectionEvent.current = event;
    selectionListener.current?.(change);
  }, []);

  const value = useMemo<QuartileDocumentContextValue>(
    () => ({
      datasets,
      pending,
      sourceErrors,
      streaming,
      dataDisplay,
      languages,
      register,
      unregister,
      requestSource,
      canLoad: !!loadSource,
      store,
      blockNumber,
      selectionChanged,
      actions,
      isClosed: (source: string) => closedSources?.has(source.trimEnd()),
    }),
    [
      datasets,
      pending,
      sourceErrors,
      streaming,
      dataDisplay,
      languages,
      register,
      unregister,
      requestSource,
      loadSource,
      store,
      blockNumber,
      selectionChanged,
      actions,
      closedSources,
    ],
  );

  const content = <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
  return provider ? <QuartileProvider {...providerProps}>{content}</QuartileProvider> : content;
}
