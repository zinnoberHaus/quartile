import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChartState } from '../charts/core/ChartFrame';
import { resolveData } from '../data/schema';
import type { DataInput } from '../data/types';
import { type CompiledBlock, compileBlock } from '../lang/compile';
import { type Diagnostic, hasErrors } from '../lang/diagnostics';
import { parseBlock } from '../lang/parse';
import { cx } from '../lib/cx';
import { useQuartile } from '../provider/QuartileProvider';
import { Selection, SelectionStoreProvider, useSelectionStore } from '../selection/Selection';
import { type SelectionChange, type SelectionEvent, SelectionStore } from '../selection/store';
import { SelectionWatch } from '../selection/watch';
import type { ViewAction } from '../spec/actions';
import { SpecView } from '../spec/SpecView';
import { type DataDisplay, useQuartileDocument } from './QuartileDocument';

export interface QuartileBlockProps {
  /** The block body: the text between the ```quartile fences. */
  source: string;
  /** The block may still grow (a streaming answer). Defaults to the document's state. */
  streaming?: boolean;
  /** Extra named datasets, for blocks rendered outside a QuartileDocument. */
  data?: Record<string, DataInput>;
  /** How a `data` block renders. Defaults to the document's choice, or a collapsed summary. */
  dataDisplay?: DataDisplay;
  /** Let the block set chart colors. Defaults to the document's choice, or true. */
  blockColors?: boolean;
  /** Receives warnings and errors after each compile. */
  onDiagnostics?: (diagnostics: Diagnostic[], compiled: CompiledBlock) => void;
  /** Replaces the default view of a block that cannot be drawn. */
  renderError?: (props: { source: string; diagnostics: Diagnostic[] }) => ReactNode;
  /**
   * Names the block's selection group when it stands alone (its own rows, or `link: no`).
   * Defaults to `block-<n>`, n being the block's number in its document. Blocks that link by
   * `link:` or by a named dataset keep that name.
   */
  group?: string;
  /** Called after every change of the selection group this block takes part in. */
  onSelectionChange?: (change: SelectionChange) => void;
  /**
   * Controls the block's views may show: a default list for views that do not set `actions:`,
   * or `false` for none whatever the block asks. Defaults to the document's choice.
   */
  actions?: readonly ViewAction[] | false;
  className?: string;
  style?: CSSProperties;
}

const EMPTY: Record<string, DataInput> = {};

/**
 * Renders one Quartile block. Inside a QuartileDocument it shares datasets and selections with
 * the other blocks; on its own it renders inline data. Invalid blocks show their errors with the
 * source, so the content is never lost.
 */
export function QuartileBlock({
  source,
  streaming: streamingProp,
  data = EMPTY,
  dataDisplay: dataDisplayProp,
  blockColors: blockColorsProp,
  onDiagnostics,
  renderError,
  group,
  onSelectionChange,
  actions: actionsProp,
  className,
  style,
}: QuartileBlockProps) {
  const doc = useQuartileDocument();
  const owner = useId();
  const actions = actionsProp ?? doc?.actions;
  const standalone = group ?? `block-${doc?.blockNumber(owner) ?? 1}`;
  const streaming = streamingProp ?? doc?.streaming ?? false;
  const dataDisplay = dataDisplayProp ?? doc?.dataDisplay ?? 'summary';
  const blockColors = blockColorsProp ?? doc?.blockColors ?? true;
  const datasets = useMemo(
    () => (doc ? { ...doc.datasets, ...data } : data),
    [doc?.datasets, data, doc],
  );
  const parsed = useMemo(() => parseBlock(source, { partial: streaming }), [source, streaming]);
  // A `data` block depends only on its own rows (or its loaded source), not on other datasets.
  const isData = parsed.type === 'data';
  // Rows loaded from the block's own `src:` come first, so reloaded rows are described again.
  const raw = isData && parsed.name ? doc?.loaded[parsed.name] : undefined;
  const own = raw ?? (isData && parsed.name ? datasets[parsed.name] : undefined);
  const scope = useMemo(
    () => (isData ? (own && parsed.name ? { [parsed.name]: own } : EMPTY) : datasets),
    [isData, own, parsed.name, datasets],
  );
  const compiled = useMemo(
    () =>
      compileBlock(parsed, {
        datasets: scope,
        pendingDatasets: doc?.pending,
        minRefresh: doc?.minRefresh,
        blockColors,
      }),
    [parsed, scope, doc?.pending, doc?.minRefresh, blockColors],
  );

  // A `data` block makes its rows available to the rest of the document. The effect is keyed by
  // name and source text, so recompiling the same definition never re-registers it.
  const definedName = compiled.complete ? compiled.defines?.name : undefined;
  const definedData = useRef(compiled.defines?.dataset);
  definedData.current = compiled.defines?.dataset;
  const register = doc?.register;
  const unregister = doc?.unregister;
  useEffect(() => {
    const value = definedData.current;
    if (!definedName || !value || !register || !unregister) return;
    register(definedName, value, owner, source, raw);
    return () => unregister(definedName, owner);
  }, [definedName, register, unregister, owner, source, raw]);

  // `src:` URLs go to the host's loader, if it has one. A complete block holds its sources
  // while it is mounted, which keeps a `refresh:` timer running and stops it afterwards.
  const retainSource = doc?.retainSource;
  const sourceKey = JSON.stringify(
    compiled.complete ? compiled.sources.filter((s) => !Object.hasOwn(data, s.name)) : [],
  );
  useEffect(() => {
    if (!retainSource) return;
    const releases = (JSON.parse(sourceKey) as CompiledBlock['sources']).map(retainSource);
    return () => {
      for (const release of releases) release();
    };
  }, [sourceKey, retainSource]);

  const report = useRef(onDiagnostics);
  report.current = onDiagnostics;
  useEffect(() => {
    report.current?.(compiled.diagnostics, compiled);
  }, [compiled]);

  const sourceProblem = compiled.sources
    .map((s) =>
      doc?.sourceErrors[s.name]
        ? `Could not load ${s.url}: ${doc.sourceErrors[s.name]}`
        : !doc?.canLoad && !Object.hasOwn(datasets, s.name)
          ? `This page does not load remote data (${s.url}).`
          : null,
    )
    .find(Boolean);

  const kind =
    compiled.type === 'dashboard'
      ? 'dashboard'
      : compiled.type === 'data'
        ? 'data'
        : ((compiled.spec as { component?: string } | undefined)?.component ??
          parsed.views[0]?.kind);
  const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
  const warnings = compiled.diagnostics.filter((d) => d.severity === 'warning');
  const failed = hasErrors(compiled.diagnostics) && !streaming;

  let body: ReactNode;
  if (compiled.type === 'empty') {
    body = streaming ? <BlockSkeleton title={undefined} /> : null;
  } else if (sourceProblem && !compiled.spec) {
    body = (
      <BlockError
        title="This chart has no data"
        diagnostics={[{ severity: 'error', message: sourceProblem }]}
        source={source}
      />
    );
  } else if (failed && compiled.type === 'dashboard' && compiled.spec) {
    // Valid views still render; the broken ones are listed under the dashboard.
    body = (
      <>
        <BlockSelection
          compiled={compiled}
          standalone={standalone}
          anonymous={group === undefined}
          onChange={onSelectionChange}
        >
          <SpecView spec={compiled.spec} data={compiled.data} linked actions={actions} />
        </BlockSelection>
        <BlockError title="Some views could not be drawn" diagnostics={errors} source={source} />
      </>
    );
  } else if (failed) {
    body = renderError ? (
      renderError({ source, diagnostics: compiled.diagnostics })
    ) : (
      <BlockError title="This chart could not be drawn" diagnostics={errors} source={source} />
    );
  } else if (compiled.type === 'data' && compiled.defines) {
    body = <DataBlock compiled={compiled} display={dataDisplay} />;
  } else if (!compiled.spec) {
    // No rows and no fields named to draw an empty chart from: not loading, and not an error.
    body = compiled.empty ? (
      <BlockEmpty title={compiled.title} />
    ) : (
      <BlockSkeleton title={compiled.title} />
    );
  } else {
    body = (
      <BlockSelection
        compiled={compiled}
        standalone={standalone}
        anonymous={group === undefined}
        onChange={onSelectionChange}
      >
        <SpecView spec={compiled.spec} data={compiled.data} linked actions={actions} />
      </BlockSelection>
    );
  }
  if (body === null) return null;
  // A reader must not take part of the data for all of it: say so under what was drawn.
  const drawn =
    !!compiled.spec &&
    !(failed && compiled.type !== 'dashboard') &&
    !(compiled.type === 'data' && dataDisplay === 'hidden');
  return (
    <div
      className={cx('q-block', className)}
      style={style}
      data-kind={kind}
      data-streaming={streaming || undefined}
      data-warnings={warnings.length || undefined}
    >
      {body}
      {drawn ? <RowLimitNote limits={compiled.rowLimits} /> : null}
    </div>
  );
}

/** "Showing the first 5,000 of 12,400 rows.", under a view whose data was cut to a limit. */
function RowLimitNote({ limits }: { limits: CompiledBlock['rowLimits'] }) {
  const { locale } = useQuartile();
  if (!limits?.length) return null;
  const count = new Intl.NumberFormat(locale);
  return (
    <>
      {limits.map((limit) => (
        <p key={limit.data} className="q-block-note">
          Showing the first {count.format(limit.kept)} of {count.format(limit.total)} rows
          {limits.length > 1 ? ` of ${limit.data.replace(/^url:/, '')}` : ''}.
        </p>
      ))}
    </>
  );
}

/**
 * Puts a block's views in their selection group and reports the group's changes. A block linked
 * by `link:` or a named dataset shares the document's store for that name; one that stands alone
 * gets a store of its own under `standalone`, which the document can still reach by name. A lone
 * chart inside a host's `<Selection>` keeps using it.
 */
function BlockSelection({
  compiled,
  standalone,
  anonymous,
  onChange,
  children,
}: {
  compiled: CompiledBlock;
  standalone: string;
  anonymous: boolean;
  onChange?: (change: SelectionChange) => void;
  children: ReactNode;
}) {
  const doc = useQuartileDocument();
  const nearest = useSelectionStore();
  const id = useId();
  const [own] = useState(() => new SelectionStore(`selection:${id}`));
  const listener = useRef(onChange);
  listener.current = onChange;
  const notify = doc?.selectionChanged;
  const report = useCallback(
    (change: SelectionChange, event: SelectionEvent) => {
      listener.current?.(change);
      notify?.(change, event);
    },
    [notify],
  );
  const dashboard = compiled.type === 'dashboard';
  // A JSON dashboard that names its selection keeps that id, registered for `useSelection(id)`.
  const named = dashboard
    ? (compiled.spec as { selection?: unknown } | undefined)?.selection
    : null;
  let name: string | undefined;
  let store: SelectionStore | null = null;
  if (compiled.link && doc) {
    name = compiled.link;
    store = doc.store(name);
  } else if (typeof named !== 'string' && (dashboard || !nearest)) {
    name = doc ? standalone : (compiled.link ?? standalone);
    store = doc ? doc.store(name, anonymous) : own;
  }
  const watch = <SelectionWatch group={name} onChange={report} />;
  if (store) {
    return (
      <SelectionStoreProvider store={store}>
        {watch}
        {children}
      </SelectionStoreProvider>
    );
  }
  if (typeof named === 'string') {
    return (
      <Selection id={named}>
        {watch}
        {children}
      </Selection>
    );
  }
  return (
    <>
      {watch}
      {children}
    </>
  );
}

function DataBlock({ compiled, display }: { compiled: CompiledBlock; display: DataDisplay }) {
  if (display === 'hidden' || !compiled.defines) return null;
  const { rows, schema } = resolveData(compiled.defines.dataset);
  const columns = Object.keys(schema).length;
  // A source that answered with nothing has no columns to lay a table out with.
  const table = compiled.spec ? (
    <SpecView spec={compiled.spec} data={compiled.data} />
  ) : (
    <BlockEmpty title={compiled.defines.name} />
  );
  if (display === 'table') return table;
  return (
    <details className="q-block-data">
      <summary>
        <span className="q-block-data-name">{compiled.defines.name}</span>
        <span className="q-block-data-meta">
          {rows.length.toLocaleString()} {rows.length === 1 ? 'row' : 'rows'} · {columns}{' '}
          {columns === 1 ? 'column' : 'columns'}
        </span>
      </summary>
      {table}
    </details>
  );
}

function BlockSkeleton({ title }: { title?: string }) {
  return (
    <div className="q-block-skeleton">
      {title ? <div className="q-spec-card-title">{title}</div> : null}
      <div className="q-chart" style={{ height: 200 }} data-status="loading" aria-busy="true">
        <ChartState status="loading" loading="Drawing chart…" />
      </div>
    </div>
  );
}

/** The empty state of a view that has no rows and no named fields to draw an empty chart from. */
function BlockEmpty({ title }: { title?: string }) {
  return (
    <div className="q-block-skeleton" data-state="empty">
      {title ? <div className="q-spec-card-title">{title}</div> : null}
      <div
        className="q-chart"
        style={{ height: 200 }}
        data-status="empty"
        role="figure"
        aria-label={title ?? 'Chart'}
      >
        <ChartState status="empty" />
      </div>
    </div>
  );
}

function BlockError({
  title,
  diagnostics,
  source,
}: {
  title: string;
  diagnostics: Diagnostic[];
  source: string;
}) {
  return (
    <div className="q-block-error" role="group" aria-label={title}>
      <div className="q-block-error-title">{title}</div>
      <ul className="q-block-error-list">
        {diagnostics.map((d, i) => (
          <li key={i}>
            {d.line ? <span className="q-block-error-line">line {d.line}</span> : null}
            <span>{d.message}</span>
            {d.hint ? <span className="q-block-error-hint">{d.hint}</span> : null}
          </li>
        ))}
      </ul>
      <details className="q-block-error-source">
        <summary>Block source</summary>
        <pre>
          <code>{source}</code>
        </pre>
      </details>
    </div>
  );
}
