import {
  createContext,
  forwardRef,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { DataInput } from '../data/types';
import { dict } from '../lang/dict';
import { DEFAULT_LANGUAGES, findFencedBlocks, scanDocument } from '../lang/document';
import type { SourceValue } from '../lang/source';
import { QuartileProvider, type QuartileProviderProps } from '../provider/QuartileProvider';
import { type SelectionHandle, selectionHandle } from '../selection/handle';
import { type SelectionChange, type SelectionEvent, SelectionStore } from '../selection/store';
import { knownActions, type ViewAction } from '../spec/actions';
import { type SourceRequest, SourceStore } from './sourceStore';

export type DataDisplay = 'summary' | 'table' | 'hidden';

export interface QuartileDocumentContextValue {
  /** Host datasets, `data` blocks and loaded sources, by name. */
  datasets: Record<string, DataInput>;
  /** Names whose rows are still loading. */
  pending: readonly string[];
  /** Why a source failed, by dataset name. */
  sourceErrors: Readonly<Record<string, string>>;
  /** Rows as loaded from `src:` URLs, before a `data` block's field settings describe them. */
  loaded: Readonly<Record<string, DataInput>>;
  streaming: boolean;
  dataDisplay: DataDisplay;
  /** Whether blocks may set chart colors. */
  blockColors: boolean;
  languages: readonly string[];
  /**
   * Registers a `data` block's rows under its name; `key` identifies the definition and `basis`
   * the loaded rows it describes, so reloaded rows are registered again.
   */
  register(name: string, data: DataInput, owner: string, key: string, basis?: unknown): void;
  unregister(name: string, owner: string): void;
  /** Asks the host's loader for a URL. Does nothing without `loadSource`. */
  requestSource(name: string, url: string, path?: string): void;
  /**
   * Holds a source for a mounted block: loads it and reloads it on its `refresh:`. Returns the
   * release; reloading stops when no mounted block holds the URL.
   */
  retainSource(source: SourceRequest): () => void;
  /** Fetches the document's sources again now, or only those of one URL. */
  reloadSources(url?: string): Promise<void>;
  /** The shortest `refresh:` interval this document allows, in seconds. */
  minRefresh: number;
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
   * Loads a block's `src:` URL. Return rows, a dataset, CSV/JSON text or parsed JSON. Without a
   * loader no request is made and the block says so: remote data is the host's decision.
   */
  loadSource?: (url: string, signal: AbortSignal) => Promise<SourceValue>;
  /**
   * The shortest `refresh:` interval a block may ask for, in seconds. Shorter values are raised
   * to it. Default 10.
   */
  minRefresh?: number;
  /**
   * Rows kept from each loaded `src:` response. A longer one is cut, and the blocks drawn from
   * it say how many of its rows they show. Default 5,000.
   */
  maxRows?: number;
  /**
   * Shares loaded sources, their refresh timers and errors with other documents, as the embed
   * does for the elements of one page. It replaces `loadSource` and `minRefresh`.
   */
  sourceStore?: SourceStore;
  /** The content is still being written, e.g. a streaming answer. Incomplete blocks wait. */
  streaming?: boolean;
  /**
   * Names of datasets the host is still loading. Blocks over them show a placeholder instead
   * of an error until the rows arrive in `data`.
   */
  pending?: readonly string[];
  /** How `data` blocks render: a collapsed summary (default), an open table, or nothing. */
  dataDisplay?: DataDisplay;
  /**
   * Let blocks set chart colors (`colors:`, `color: #2f45e8`). Defaults to true. Pass false to
   * keep every chart on the page's own palette; the setting is then dropped with a note.
   */
  blockColors?: boolean;
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

/** What a ref to a QuartileDocument offers. */
export interface QuartileDocumentHandle {
  /**
   * Fetches the document's `src:` data again now, or only the sources of one URL. Rows stay on
   * screen until the new ones arrive. Resolves when the requests have settled.
   */
  reload(url?: string): Promise<void>;
  /**
   * Reads and writes one of the document's selection groups by name: a `link:` name, a dataset
   * name, or a standalone block's `block-<n>`. A group exists from its first use.
   */
  selection(group: string): SelectionHandle;
  /** Names of the document's selection groups, in the order they were first used. */
  groups(): string[];
}

interface Registered {
  owner: string;
  key: string;
  data: DataInput;
  basis?: unknown;
}

/**
 * Scopes Quartile blocks rendered from one Markdown document: datasets defined once and used by
 * any block, shared selections between blocks over the same dataset, streaming state, and the
 * host's optional loader for `src:` URLs.
 */
function DocumentScope({
  data,
  markdown,
  loadSource,
  minRefresh,
  maxRows,
  sourceStore,
  handle,
  streaming = false,
  pending: hostPending,
  dataDisplay = 'summary',
  blockColors = true,
  languages = DEFAULT_LANGUAGES,
  provider = true,
  stores: externalStores,
  onSelectionChange,
  actions: actionsProp,
  children,
  ...providerProps
}: QuartileDocumentProps & { handle?: Ref<QuartileDocumentHandle> }) {
  const docId = useId();
  const [registered, setRegistered] = useState<Record<string, Registered>>(() => dict());
  const stores = useRef(new Map<string, SelectionStore>());
  const loaderRef = useRef(loadSource);
  loaderRef.current = loadSource;
  const floorRef = useRef(minRefresh);
  floorRef.current = minRefresh;
  const maxRowsRef = useRef(maxRows);
  maxRowsRef.current = maxRows;
  const dataRef = useRef(data);
  dataRef.current = data;
  // Loading, retrying and refreshing live in a store, which the embed shares across a page.
  const ownSources = useRef<SourceStore | null>(null);
  if (!sourceStore && !ownSources.current) {
    ownSources.current = new SourceStore({
      loader: () => loaderRef.current,
      minRefresh: () => floorRef.current,
      maxRows: () => maxRowsRef.current,
    });
  }
  const sources = sourceStore ?? ownSources.current!;
  const {
    loaded,
    pending: loading,
    errors: sourceErrors,
  } = useSyncExternalStore(sources.subscribe, sources.getSnapshot, sources.getSnapshot);
  const canLoad = sourceStore ? sourceStore.canLoad() : !!loadSource;
  const floor = sources.minRefresh();

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
    const out: Record<string, DataInput> = dict(scanned?.datasets, data);
    for (const [name, r] of Object.entries(registered)) {
      if (!Object.hasOwn(out, name)) out[name] = r.data;
    }
    // Loaded rows come last, so a `data` block's described version of them stands in front.
    for (const [name, rows] of Object.entries(loaded)) {
      if (!Object.hasOwn(out, name)) out[name] = rows;
    }
    return out;
  }, [scanned, data, registered, loaded]);

  const pending = useMemo(() => [...loading, ...(hostPending ?? [])], [loading, hostPending]);

  const register = useCallback(
    (name: string, value: DataInput, owner: string, key: string, basis?: unknown) => {
      setRegistered((current) => {
        const existing = Object.hasOwn(current, name) ? current[name] : undefined;
        if (existing && existing.key === key && existing.basis === basis) return current;
        if (existing && existing.owner !== owner) return current;
        const next = dict(current);
        next[name] = { owner, key, data: value, basis };
        return next;
      });
    },
    [],
  );

  const unregister = useCallback((name: string, owner: string) => {
    setRegistered((current) => {
      if (!Object.hasOwn(current, name) || current[name].owner !== owner) return current;
      const rest = dict(current);
      delete rest[name];
      return rest;
    });
  }, []);

  const requestSource = useCallback(
    (name: string, url: string, path?: string) => sources.request({ name, url, path }),
    [sources],
  );

  const retainSource = useCallback(
    (source: SourceRequest) =>
      // Rows the host passed under this name are the data; nothing is fetched for it. With a
      // shared store, `data` holds described copies of these very sources, so it never stands in.
      !sourceStore && Object.hasOwn(dataRef.current ?? {}, source.name)
        ? () => {}
        : sources.retain(source),
    [sources, sourceStore],
  );

  const reloadSources = useCallback((url?: string) => sources.reload(url), [sources]);

  useEffect(() => () => ownSources.current?.dispose(), []);

  // Sources named in the Markdown start loading as soon as the document mounts.
  useEffect(() => {
    for (const s of scanned?.sources ?? []) {
      if (!Object.hasOwn(data ?? {}, s.name)) sources.request(s);
    }
  }, [scanned, data, sources]);

  // Every group asked for, whoever keeps its store, so a ref can list them.
  const groupNames = useRef(new Set<string>());
  const store = useCallback(
    (group: string, anonymous = false) => {
      groupNames.current.add(group);
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

  useImperativeHandle(
    handle,
    () => ({
      reload: reloadSources,
      selection: (group: string) => selectionHandle(group, store),
      groups: () => [...groupNames.current],
    }),
    [reloadSources, store],
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

  // Hosts usually write the list inline; compare it by content so blocks do not re-render for it.
  const actionsKey =
    actionsProp === undefined || actionsProp === false ? actionsProp : actionsProp.join(' ');
  const actions = useMemo(
    () => (typeof actionsKey === 'string' ? knownActions(actionsKey.split(' ')) : actionsKey),
    [actionsKey],
  );

  const selectionListener = useRef(onSelectionChange);
  selectionListener.current = onSelectionChange;
  const reportedEvents = useRef(new WeakSet<SelectionEvent>());
  // Every block over a group reports the same store event; the host hears it once, also when its
  // handler changes another group while the blocks of this one are still reporting.
  const selectionChanged = useCallback((change: SelectionChange, event: SelectionEvent) => {
    if (reportedEvents.current.has(event)) return;
    reportedEvents.current.add(event);
    selectionListener.current?.(change);
  }, []);

  const value = useMemo<QuartileDocumentContextValue>(
    () => ({
      datasets,
      pending,
      sourceErrors,
      loaded,
      streaming,
      dataDisplay,
      blockColors,
      languages,
      register,
      unregister,
      requestSource,
      retainSource,
      reloadSources,
      minRefresh: floor,
      canLoad,
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
      loaded,
      streaming,
      dataDisplay,
      blockColors,
      languages,
      register,
      unregister,
      requestSource,
      retainSource,
      reloadSources,
      floor,
      canLoad,
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

/**
 * Scopes the Quartile blocks of one Markdown document; see `QuartileDocumentProps`. A ref
 * offers `reload()` to fetch the document's `src:` data again, and `selection(group)` and
 * `groups()` to read, set and clear its selections from outside.
 */
export const QuartileDocument = forwardRef<QuartileDocumentHandle, QuartileDocumentProps>(
  function QuartileDocument(props, ref) {
    return <DocumentScope {...props} handle={ref} />;
  },
);
