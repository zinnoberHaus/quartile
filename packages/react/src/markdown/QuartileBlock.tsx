import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef } from 'react';
import { ChartState } from '../charts/core/ChartFrame';
import { resolveData } from '../data/schema';
import type { DataInput } from '../data/types';
import { type CompiledBlock, compileBlock } from '../lang/compile';
import { type Diagnostic, hasErrors } from '../lang/diagnostics';
import { parseBlock } from '../lang/parse';
import { cx } from '../lib/cx';
import { SelectionStoreProvider } from '../selection/Selection';
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
  /** Receives warnings and errors after each compile. */
  onDiagnostics?: (diagnostics: Diagnostic[], compiled: CompiledBlock) => void;
  /** Replaces the default view of a block that cannot be drawn. */
  renderError?: (props: { source: string; diagnostics: Diagnostic[] }) => ReactNode;
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
  onDiagnostics,
  renderError,
  className,
  style,
}: QuartileBlockProps) {
  const doc = useQuartileDocument();
  const owner = useId();
  const streaming = streamingProp ?? doc?.streaming ?? false;
  const dataDisplay = dataDisplayProp ?? doc?.dataDisplay ?? 'summary';
  const datasets = useMemo(
    () => (doc ? { ...doc.datasets, ...data } : data),
    [doc?.datasets, data, doc],
  );
  const parsed = useMemo(() => parseBlock(source, { partial: streaming }), [source, streaming]);
  // A `data` block depends only on its own rows (or its loaded source), not on other datasets.
  const isData = parsed.type === 'data';
  const own = isData && parsed.name ? datasets[parsed.name] : undefined;
  const scope = useMemo(
    () => (isData ? (own && parsed.name ? { [parsed.name]: own } : EMPTY) : datasets),
    [isData, own, parsed.name, datasets],
  );
  const compiled = useMemo(
    () => compileBlock(parsed, { datasets: scope, pendingDatasets: doc?.pending }),
    [parsed, scope, doc?.pending],
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
    register(definedName, value, owner, source);
    return () => unregister(definedName, owner);
  }, [definedName, register, unregister, owner, source]);

  // `src:` URLs go to the host's loader, if it has one.
  const requestSource = doc?.requestSource;
  useEffect(() => {
    if (!requestSource) return;
    for (const s of compiled.sources) {
      if (!Object.hasOwn(datasets, s.name)) requestSource(s.name, s.url);
    }
  }, [compiled.sources, datasets, requestSource]);

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
    const view = (
      <SpecView spec={compiled.spec} data={compiled.data} linked={!!(compiled.link && doc)} />
    );
    body = (
      <>
        {compiled.link && doc ? (
          <SelectionStoreProvider store={doc.store(compiled.link)}>{view}</SelectionStoreProvider>
        ) : (
          view
        )}
        <BlockError title="Some views could not be drawn" diagnostics={errors} source={source} />
      </>
    );
  } else if (failed) {
    body = renderError ? (
      renderError({ source, diagnostics: compiled.diagnostics })
    ) : (
      <BlockError title="This chart could not be drawn" diagnostics={errors} source={source} />
    );
  } else if (!compiled.spec) {
    body = <BlockSkeleton title={compiled.title} />;
  } else if (compiled.type === 'data') {
    body = <DataBlock compiled={compiled} display={dataDisplay} />;
  } else {
    const view = (
      <SpecView spec={compiled.spec} data={compiled.data} linked={!!(compiled.link && doc)} />
    );
    body =
      compiled.link && doc ? (
        <SelectionStoreProvider store={doc.store(compiled.link)}>{view}</SelectionStoreProvider>
      ) : (
        view
      );
  }
  if (body === null) return null;
  return (
    <div
      className={cx('q-block', className)}
      style={style}
      data-kind={kind}
      data-streaming={streaming || undefined}
      data-warnings={warnings.length || undefined}
    >
      {body}
    </div>
  );
}

function DataBlock({ compiled, display }: { compiled: CompiledBlock; display: DataDisplay }) {
  if (display === 'hidden' || !compiled.defines || !compiled.spec) return null;
  const { rows, schema } = resolveData(compiled.defines.dataset);
  const columns = Object.keys(schema).length;
  const table = <SpecView spec={compiled.spec} data={compiled.data} />;
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
