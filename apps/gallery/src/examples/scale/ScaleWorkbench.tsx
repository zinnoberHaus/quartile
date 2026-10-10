import {
  BarList,
  Button,
  DataTable,
  KPI,
  QuartileProvider,
  ScatterPlot,
  type ScatterRendererState,
  Selection,
  useSelection,
} from '@quartile/react';
import {
  type DataQueryState,
  type QueryRequest,
  QueryResultView,
  useDataQuery,
} from '@quartile/react/query';
import { useEffect, useRef, useState } from 'react';
import { Link } from '../../router';
import { Wordmark } from '../../shell/Logo';
import { links } from '../../shell/links';
import { REGIONS, SAMPLE_SEED, SAMPLE_SIZES } from './data';
import { loadWorkerSource, type ScaleSession } from './database';
import {
  downloadMeasurement,
  environmentSnapshot,
  formatBytes,
  formatCount,
  formatMs,
  mainThreadHeapBytes,
} from './measurement';
import './scale.css';

const PAGE_SIZE = 25;
const SERVICE_PLAN: QueryRequest = {
  kind: 'aggregate',
  groupBy: ['service'],
  measures: [{ aggregate: 'count', as: 'requests' }],
  orderBy: [{ field: 'service', direction: 'asc' }],
  limit: 4,
};
const METRICS_PLAN: QueryRequest = {
  kind: 'aggregate',
  groupBy: [],
  measures: [
    { aggregate: 'count', as: 'requests' },
    { field: 'latency', aggregate: 'mean', as: 'meanLatency' },
    { field: 'error', aggregate: 'mean', as: 'errorRate' },
  ],
  limit: 1,
};
const ROW_FIELDS = ['requestId', 'service', 'region', 'latency', 'payload', 'error'];
const TABLE_COLUMNS = [
  { field: 'requestId', sortable: false },
  { field: 'service', sortable: false },
  { field: 'region', sortable: false },
  { field: 'latency', sortable: false },
  { field: 'payload', sortable: false },
  { field: 'error', sortable: false },
];

function QueryTiming({ query }: { query: DataQueryState }) {
  return <span className="scale-timing">Query → result: {formatMs(query.durationMs)}</span>;
}

function QueryLoading() {
  return (
    <div className="scale-loading" role="status">
      Querying the worker…
    </div>
  );
}

function WorkerViews({ session }: { session: ScaleSession }) {
  const selection = useSelection();
  const selectionKey = JSON.stringify(selection.predicates);
  const [pagination, setPagination] = useState({ key: selectionKey, offset: 0 });
  const offset = pagination.key === selectionKey ? pagination.offset : 0;
  useEffect(() => {
    setPagination((current) =>
      current.key === selectionKey ? current : { key: selectionKey, offset: 0 },
    );
  }, [selectionKey]);
  const [markLimit, setMarkLimit] = useState(2_000);
  const [renderer, setRenderer] = useState<'svg' | 'canvas' | 'webgl'>('canvas');
  const [rendererState, setRendererState] = useState<ScatterRendererState>();
  const [tableView, setTableView] = useState(false);
  const currentRenderer = rendererState?.requested === renderer ? rendererState : undefined;
  const requestKey = JSON.stringify([selectionKey, offset, markLimit, renderer, tableView]);
  const start = useRef({ key: requestKey, at: performance.now() });
  if (start.current.key !== requestKey) start.current = { key: requestKey, at: performance.now() };
  const [frame, setFrame] = useState<{ key: string; ms: number; heap: number | null }>();

  const services = useDataQuery(session.source, SERVICE_PLAN, { id: 'scale-service' });
  const metrics = useDataQuery(session.source, METRICS_PLAN, { id: 'scale-metrics' });
  const table = useDataQuery(
    session.source,
    {
      kind: 'rows',
      fields: ROW_FIELDS,
      orderBy: [{ field: 'requestId', direction: 'asc' }],
      window: { offset, limit: PAGE_SIZE },
    },
    { id: 'scale-table' },
  );
  const scatter = useDataQuery(
    session.source,
    {
      kind: 'rows',
      fields: ROW_FIELDS,
      orderBy: [{ field: 'requestId', direction: 'asc' }],
      window: { offset: 0, limit: markLimit },
    },
    { id: 'scale-scatter' },
  );
  const ready = [services, metrics, table, scatter].every((query) => query.status === 'ready');
  const resultKey = [services, metrics, table, scatter]
    .map((query) => query.result?.requestId)
    .join(':');

  const measurementKey = `${requestKey}:${resultKey}:${JSON.stringify(currentRenderer)}`;
  const waiting = [services, metrics, table, scatter].some((query) => query.status === 'loading');
  const wasWaiting = useRef(false);
  if (waiting && !wasWaiting.current) start.current = { key: requestKey, at: performance.now() };
  wasWaiting.current = waiting;

  useEffect(() => {
    if (!ready) return;
    const current = start.current;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setFrame({
          key: measurementKey,
          ms: performance.now() - current.at,
          heap: mainThreadHeapBytes(),
        });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [ready, measurementKey]);

  const currentFrame = frame?.key === measurementKey ? frame : undefined;
  const region = selection.predicates.find((predicate) => predicate.field === 'region');
  const regionValue = region?.op === 'eq' ? String(region.value) : '';
  const slow = selection.predicates.some((predicate) => predicate.field === 'latency');
  const returnedRows = [services, metrics, table, scatter].reduce(
    (count, query) => count + (query.result?.rows.length ?? 0),
    0,
  );
  const report = () =>
    downloadMeasurement({
      environment: environmentSnapshot(),
      versions: { duckdbWasm: '1.32.0', arrow: '17.0.0', sampleSeed: SAMPLE_SEED },
      sourceRows: session.sourceRows,
      arrowIPCBytes: session.ipcBytes,
      setup: {
        totalMs: session.setupMs,
        generationMs: session.generationMs,
        engineStartupMs: session.engineStartupMs,
        ingestionMs: session.ingestionMs,
        mainThreadHeapBefore: session.heapBefore,
        mainThreadHeapAfter: session.heapAfter,
      },
      view: {
        requestedRenderer: renderer,
        activeRenderer: tableView || !scatter.result?.rows.length ? null : currentRenderer?.active,
        rendererFallbackReason: currentRenderer?.reason ?? null,
        markLimit,
        offset,
        tableView,
        predicates: selection.predicates,
      },
      queries: Object.fromEntries(
        Object.entries({ services, metrics, table, scatter }).map(([name, query]) => [
          name,
          {
            status: query.status,
            requestId: query.result?.requestId,
            durationMs: query.durationMs,
            returnedRows: query.result?.rows.length,
            totalRows: query.result?.totalRows,
            complete: query.result?.complete,
          },
        ]),
      ),
      viewRequestToNextFrameMs: currentFrame?.ms ?? null,
      mainThreadHeapAfterView: currentFrame?.heap ?? null,
      measurementNotes: [
        'Query durations include queueing, worker execution, transfer and decoding; they are not CPU timings.',
        'Views with an unchanged query reuse their previous result and duration; request IDs identify reused results.',
        'View request to next frame starts during the React render initiating the view, ends after two requestAnimationFrame callbacks, and is not a guaranteed screen-presentation measurement.',
        'Scatter rows are the first matching IDs, not a random or representative sample.',
        'Heap estimates omit worker, WASM and GPU allocations and may include memory awaiting garbage collection.',
      ],
    });

  return (
    <>
      <div className="scale-filters">
        <label>
          Region
          <select
            value={regionValue}
            onChange={(event) =>
              selection.set('region', event.target.value || null, { source: 'scale-region' })
            }
          >
            <option value="">All regions</option>
            {REGIONS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button
          aria-pressed={slow}
          onClick={() =>
            slow
              ? selection.clear('latency')
              : selection.set('latency', [500, 2500], { op: 'between', source: 'scale-latency' })
          }
        >
          Latency 500–2,500 ms
        </Button>
        <Button onClick={() => selection.clear()} disabled={!selection.predicates.length}>
          Clear selection
        </Button>
        <span role="status">
          {selection.predicates.length} active{' '}
          {selection.predicates.length === 1 ? 'filter' : 'filters'}
        </span>
      </div>
      <QueryResultView query={metrics} loading={<QueryLoading />}>
        {(_data, result) => {
          const value = result.rows[0];
          return (
            <div className="scale-kpis">
              <KPI
                label="Matching requests"
                value={Number(value?.requests ?? 0)}
                format="integer"
              />
              <KPI
                label="Mean latency"
                value={value?.meanLatency == null ? null : Number(value.meanLatency)}
                unit="ms"
              />
              <KPI
                label="Error rate"
                value={value?.errorRate == null ? null : Number(value.errorRate)}
                format="percent"
              />
            </div>
          );
        }}
      </QueryResultView>
      <div className="scale-grid">
        <section className="scale-panel">
          <div className="scale-panel-heading">
            <h2>Requests by service</h2>
            <QueryTiming query={services} />
          </div>
          <p>
            Click a service. This view excludes its own filter so the alternatives remain available.
          </p>
          <QueryResultView query={services} loading={<QueryLoading />}>
            {(data) => (
              <BarList
                id={services.sourceId}
                data={data}
                category="service"
                value="requests"
                format="integer"
                prepared
                select
                aria-label="Requests by service"
              />
            )}
          </QueryResultView>
        </section>
        <section className="scale-panel scale-measurement" aria-label="Live measurement">
          <h2>A bounded result, not the whole dataset</h2>
          <dl>
            <div>
              <dt>Source rows in worker</dt>
              <dd>{formatCount(session.sourceRows)}</dd>
            </div>
            <div>
              <dt>Rows returned across current views</dt>
              <dd>{ready ? formatCount(returnedRows) : 'Querying…'}</dd>
            </div>
            <div>
              <dt>View request → next frame</dt>
              <dd data-testid="scale-frame-time">{formatMs(currentFrame?.ms)}</dd>
            </div>
            <div>
              <dt>Main-thread heap estimate</dt>
              <dd>{formatBytes(currentFrame?.heap ?? null)}</dd>
            </div>
          </dl>
          <p>
            The frame measurement includes all current view queries and React updates. Heap
            estimates exclude the database worker, WASM and GPU memory.
          </p>
          <Button onClick={report} disabled={!ready || !currentFrame}>
            Download this measurement
          </Button>
        </section>
        <section className="scale-panel scale-wide">
          <div className="scale-panel-heading">
            <h2>Response size and latency</h2>
            <QueryTiming query={scatter} />
          </div>
          <div className="scale-scatter-toolbar">
            <label>
              Renderer
              <select
                value={renderer}
                onChange={(event) => setRenderer(event.target.value as typeof renderer)}
              >
                <option value="svg">SVG</option>
                <option value="canvas">Canvas</option>
                <option value="webgl">WebGL</option>
              </select>
            </label>
            <label>
              Maximum plotted rows
              <select
                value={markLimit}
                onChange={(event) => setMarkLimit(Number(event.target.value))}
              >
                <option value={2_000}>2,000</option>
                <option value={10_000}>10,000</option>
              </select>
            </label>
            <Button aria-pressed={tableView} onClick={() => setTableView(!tableView)}>
              View scatter as a table
            </Button>
          </div>
          <p>
            {scatter.result
              ? `${formatCount(scatter.result.rows.length)} marks from ${formatCount(scatter.result.totalRows)} matching rows. `
              : 'Querying a bounded set of points. '}
            The first matching request IDs are plotted, not a random sample. Click a point to select
            its request.
          </p>
          {!tableView && !!scatter.result?.rows.length && currentRenderer && (
            <p className="scale-renderer-status" role="status">
              {currentRenderer.active === 'svg'
                ? 'SVG'
                : currentRenderer.active === 'webgl'
                  ? 'WebGL'
                  : 'Canvas'}{' '}
              active
              {currentRenderer.reason ? ` · Fallback: ${currentRenderer.reason}` : ''}
            </p>
          )}
          <QueryResultView query={scatter} loading={<QueryLoading />}>
            {(data) => (
              <ScatterPlot
                id={scatter.sourceId}
                data={data}
                x="payload"
                y="latency"
                color="service"
                label="requestId"
                select="requestId"
                typedSelection
                renderer={renderer}
                onRendererChange={setRendererState}
                height={340}
                view={tableView ? 'table' : 'chart'}
                aria-label="Latency and response size for bounded matching requests"
              />
            )}
          </QueryResultView>
        </section>
        <section className="scale-panel scale-wide">
          <div className="scale-panel-heading">
            <h2>Matching request records</h2>
            <QueryTiming query={table} />
          </div>
          <p>
            Exactly one page is requested from the worker. IDs define a stable order; headers do not
            sort a partial page.
          </p>
          <QueryResultView query={table} loading={<QueryLoading />}>
            {(data, result) => (
              <>
                <DataTable
                  data={data}
                  columns={TABLE_COLUMNS}
                  rowKey="requestId"
                  virtualize={false}
                  aria-label="Worker-paged request records"
                />
                <nav className="scale-pagination" aria-label="Request table pages">
                  <span>
                    {result.totalRows
                      ? `${formatCount(offset + 1)}–${formatCount(offset + result.rows.length)} of ${formatCount(result.totalRows)}`
                      : 'No matching requests'}
                  </span>
                  <Button
                    disabled={offset === 0}
                    onClick={() =>
                      setPagination({ key: selectionKey, offset: Math.max(0, offset - PAGE_SIZE) })
                    }
                  >
                    Previous page
                  </Button>
                  <Button
                    disabled={offset + result.rows.length >= result.totalRows}
                    onClick={() => setPagination({ key: selectionKey, offset: offset + PAGE_SIZE })}
                  >
                    Next page
                  </Button>
                </nav>
              </>
            )}
          </QueryResultView>
        </section>
      </div>
      <details className="scale-details">
        <summary>Measurement method and active predicates</summary>
        <p>
          Source generation runs in its own worker. Its transferable Arrow IPC buffer is imported
          into DuckDB-WASM; only bounded query results enter React. Filters run before aggregation.
          Each chart uses its own publisher ID. Superseded queries cannot replace the current view.
          Renderer switches reuse the current bounded result.
        </p>
        <dl className="scale-setup-metrics">
          <div>
            <dt>Arrow IPC buffer</dt>
            <dd>{formatBytes(session.ipcBytes)}</dd>
          </div>
          <div>
            <dt>Generation in sample worker</dt>
            <dd>{formatMs(session.generationMs)}</dd>
          </div>
          <div>
            <dt>Database startup</dt>
            <dd>{formatMs(session.engineStartupMs)}</dd>
          </div>
          <div>
            <dt>Arrow ingestion</dt>
            <dd>{formatMs(session.ingestionMs)}</dd>
          </div>
          <div>
            <dt>Complete setup</dt>
            <dd>{formatMs(session.setupMs)}</dd>
          </div>
          <div>
            <dt>Metrics query → result</dt>
            <dd>{formatMs(metrics.durationMs)}</dd>
          </div>
        </dl>
        <p>
          Two animation-frame callbacks approximate the next rendering opportunity; they do not
          establish a presentation timestamp. Runs depend on your browser, device, viewport, cache
          and thermal state. No universal row-count limit is claimed. The download includes the
          environment and limitations for comparison.
        </p>
        <pre>{JSON.stringify(selection.predicates, null, 2)}</pre>
      </details>
    </>
  );
}

export function ScaleWorkbench() {
  const [size, setSize] = useState(100_000);
  const [dark, setDark] = useState(false);
  const [session, setSession] = useState<ScaleSession | null>(null);
  const [phase, setPhase] = useState('Choose a dataset size, then start the local workers.');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const owned = useRef<ScaleSession | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      active.current?.abort();
      void owned.current?.dispose().catch(() => undefined);
      owned.current = null;
    };
  }, []);

  const load = async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const previous = owned.current;
    owned.current = null;
    setSession(null);
    setError(undefined);
    setBusy(true);
    try {
      await previous?.dispose();
      const next = await loadWorkerSource(size, controller.signal, (message) => {
        if (alive.current && !controller.signal.aborted) setPhase(message);
      });
      if (!alive.current || controller.signal.aborted) {
        await next.dispose();
        return;
      }
      owned.current = next;
      setSession(next);
      setPhase(`${formatCount(size)} source rows ready in the database worker.`);
    } catch (cause) {
      if (!alive.current || active.current !== controller) return;
      if (controller.signal.aborted) setPhase('Loading cancelled. You can start a new sample.');
      else {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase('The local dataset could not be loaded.');
      }
    } finally {
      if (alive.current && active.current === controller) {
        setBusy(false);
        active.current = null;
      }
    }
  };

  return (
    <QuartileProvider theme={dark ? 'dark' : 'light'} className="scale-page">
      <header className="scale-header">
        <Link to="/">
          <Wordmark />
        </Link>
        <nav aria-label="Examples">
          <Link to="/examples/storefront">Storefront</Link>
          <Link to="/examples/operations">Operations</Link>
          <Link to="/examples/scale">Worker queries</Link>
          <Link to="/studio">App Studio</Link>
        </nav>
        <a href={links.docs}>Docs</a>
      </header>
      <main className="scale-main">
        <div className="scale-intro">
          <div>
            <span>Quartile preview · deterministic sample data</span>
            <h1>Explore more rows. Return fewer.</h1>
            <p>
              A real Arrow dataset, a DuckDB database in a browser worker, and linked views with
              explicit result limits. Change a filter and inspect the work behind the update.
            </p>
          </div>
          <a href={`${links.github}/tree/main/apps/gallery/src/examples/scale`}>
            View source and method
          </a>
        </div>
        <div className="scale-toolbar">
          <label>
            Source rows
            <select
              value={size}
              disabled={busy}
              onChange={(event) => setSize(Number(event.target.value))}
            >
              {SAMPLE_SIZES.map((count) => (
                <option key={count} value={count}>
                  {formatCount(count)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="signal" onClick={() => void load()} disabled={busy}>
            {session ? 'Reload sample' : 'Load sample data'}
          </Button>
          {busy && <Button onClick={() => active.current?.abort()}>Cancel loading</Button>}
          <Button aria-pressed={dark} onClick={() => setDark(!dark)}>
            Dark theme
          </Button>
        </div>
        <p className="scale-phase" role="status" aria-busy={busy}>
          {phase}
        </p>
        {error && (
          <div className="scale-error" role="alert">
            <strong>Unable to initialize the example</strong>
            <p>{error}</p>
            <p>
              Worker and WASM assets must be served from this site. Reload the sample after
              resolving the error.
            </p>
          </div>
        )}
        {session ? (
          <Selection key={session.source.version} id="worker-requests">
            <WorkerViews session={session} />
          </Selection>
        ) : (
          <section className="scale-empty">
            <h2>The dataset stays with the worker.</h2>
            <p>
              Loading creates fictional requests with a fixed seed. The database returns service
              totals, one metrics row, 25 table records, and at most the requested scatter marks. No
              backend service or customer data is used.
            </p>
            <p>
              The first load also downloads the local WebAssembly engine. Setup timings are reported
              separately from view queries.
            </p>
          </section>
        )}
        <footer className="scale-footer">
          Arrow 17 · DuckDB-WASM 1.32 · source-only Quartile preview. All database and sample worker
          resources are disposed when this example unmounts or reloads.
        </footer>
      </main>
    </QuartileProvider>
  );
}
