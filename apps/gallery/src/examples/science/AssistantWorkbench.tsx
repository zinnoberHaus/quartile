import {
  BarChart,
  Button,
  type Dataset,
  DataTable,
  dataset,
  FilterBar,
  Histogram,
  LineChart,
  type Predicate,
  type Primitive,
  QuartileProvider,
  type Row,
  ScatterPlot,
  Selection,
  type SelectionApi,
  useSelection,
} from '@quartile/react';
import {
  type AnalysisFilter,
  type AnalysisPlan,
  type AnalysisViewState,
  type AssistantAdapter,
  AssistantPanel,
  createAnalysisContext,
  createHttpAssistantAdapter,
  profileDataset,
  reduceAnalysisPlan,
  useAnalysisAssistant,
} from '@quartile/react/ai';
import { useMemo, useState } from 'react';
import { links } from '../../shell/links';
import { labSamples } from './data';
import { ScienceHeader } from './ScienceWorkbench';
import './science.css';

// Plan fields are runtime-validated against this schema, rather than a compile-time field union.
const samples: Dataset<Row> = dataset(labSamples, {
  id: { type: 'nominal', label: 'Sample' },
  temperatureC: { type: 'quantitative', label: 'Temperature', unit: '°C', format: 'number' },
  pressureKpa: { type: 'quantitative', label: 'Pressure', unit: 'kPa', format: 'number' },
  yieldPct: { type: 'quantitative', label: 'Yield', format: 'percent' },
  durationMin: { type: 'quantitative', label: 'Duration', unit: 'min', format: 'number' },
  measuredAt: { type: 'temporal', label: 'Measured', format: 'date-short' },
});
const initialView: AnalysisViewState = {
  filters: [],
  chart: { chart: 'histogram', x: 'yieldPct' },
  sort: { field: 'yieldPct', direction: 'desc' },
  table: { fields: ['id', 'batch', 'material', 'temperatureC', 'yieldPct', 'passed'], limit: 20 },
};

/** These explicit local rules exercise the same validation/apply path as a real backend. */
const localPlanner: AssistantAdapter = {
  id: 'documented-local-rules',
  label: 'Local demonstration rules',
  mode: 'deterministic',
  async generate({ prompt, context }, { signal }) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const text = prompt.toLowerCase();
    if (/reset|clear/.test(text))
      return {
        version: 1,
        title: 'Return to all samples',
        summary: 'Remove the current filters and restore the yield distribution.',
        actions: [
          ...context.selection.map((filter) => ({ type: 'clear-filter', field: filter.field })),
          { type: 'chart', chart: 'histogram', x: 'yieldPct' },
          { type: 'sort', field: 'yieldPct', direction: 'desc' },
        ],
      };
    if (/failed|failures/.test(text))
      return {
        version: 1,
        title: 'Inspect failed samples',
        summary: 'Select samples whose recorded passed flag is false. Sort the lowest yield first.',
        actions: [
          { type: 'filter', field: 'passed', op: 'eq', value: false },
          { type: 'sort', field: 'yieldPct', direction: 'asc' },
          { type: 'table', fields: ['id', 'batch', 'material', 'yieldPct', 'passed'], limit: 30 },
        ],
      };
    if (/scatter|temperature.*yield/.test(text))
      return {
        version: 1,
        title: 'Compare temperature and yield',
        summary:
          'Draw one point per sample. This shows association in the fictional data, not a causal effect.',
        actions: [
          { type: 'chart', chart: 'scatter', x: 'temperatureC', y: 'yieldPct' },
          { type: 'table', fields: ['id', 'batch', 'temperatureC', 'yieldPct'], limit: 20 },
        ],
      };
    if (/pressure/.test(text))
      return {
        version: 1,
        title: 'Explore pressure',
        summary: 'Show the pressure distribution and order records by the recorded pressure.',
        actions: [
          { type: 'chart', chart: 'histogram', x: 'pressureKpa' },
          { type: 'sort', field: 'pressureKpa', direction: 'desc' },
        ],
      };
    if (/yield|distribution/.test(text))
      return {
        version: 1,
        title: 'Explore sample yield',
        summary: 'Show the yield distribution using the current selection.',
        actions: [
          { type: 'chart', chart: 'histogram', x: 'yieldPct' },
          { type: 'sort', field: 'yieldPct', direction: 'desc' },
        ],
      };
    throw new Error(
      'The local rules support failed samples, temperature versus yield, pressure, yield distribution, and reset. Connect a model backend for open-ended requests.',
    );
  },
};

function publish(selection: SelectionApi, filters: readonly AnalysisFilter[]) {
  selection.clear();
  for (const filter of filters)
    selection.set(
      filter.field,
      (Array.isArray(filter.value) ? [...filter.value] : filter.value) as Primitive | Primitive[],
      { op: filter.op, source: 'assistant-plan' },
    );
}

function AssistedAnalysis() {
  const selection = useSelection();
  const [view, setView] = useState<AnalysisViewState>(initialView);
  const [adapter, setAdapter] = useState<AssistantAdapter>(localPlanner);
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8787/api/analysis');
  const [connectionMessage, setConnectionMessage] = useState(
    'Local mode makes no network requests and does not call a model.',
  );
  const [includeProfile, setIncludeProfile] = useState(true);
  const [history, setHistory] = useState<{ view: AnalysisViewState; predicates: Predicate[] }[]>(
    [],
  );
  const [applied, setApplied] = useState<AnalysisPlan | null>(null);
  const [notice, setNotice] = useState('Choose a suggested request or describe the view you want.');
  const rows = useMemo(() => selection.filter(labSamples), [selection]);
  const profile = useMemo(() => profileDataset({ ...samples, rows }, { maxRows: 1000 }), [rows]);
  const context = useMemo(
    () =>
      createAnalysisContext({
        schema: samples.schema,
        source: {
          id: 'materials-lab',
          version: 'fixture-2026-10-v1',
          label: 'Materials experiment',
        },
        selection: selection.predicates,
        profile: includeProfile ? profile : undefined,
        provenance: [
          {
            label: 'Data origin',
            detail:
              '180 deterministic fictional measurements; no external source or live experiment.',
          },
          {
            label: 'Current view',
            detail: JSON.stringify({ chart: view.chart, sort: view.sort, table: view.table }),
          },
        ],
      }),
    [selection.predicates, profile, includeProfile, view],
  );
  const assistant = useAnalysisAssistant({
    adapter,
    context,
    onApply: (plan) => {
      const current = { ...view, filters: context.selection };
      const next = reduceAnalysisPlan(plan, current, context);
      setHistory((previous) =>
        [...previous, { view: current, predicates: [...selection.predicates] }].slice(-5),
      );
      setView(next);
      publish(selection, next.filters);
      setApplied(plan);
      setNotice(`Applied “${plan.title}”. You can undo this change.`);
    },
  });
  const chart = view.chart ?? initialView.chart!;
  const table = view.table ?? initialView.table!;
  function connect() {
    try {
      const url = new URL(endpoint, window.location.origin);
      if (
        url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
        throw new Error('Use an HTTPS endpoint or a local development server.');
      if (url.username || url.password)
        throw new Error('Keep credentials on the backend, not in the URL.');
      setAdapter(
        createHttpAssistantAdapter({
          endpoint: url.href,
          id: url.href,
          label: `Your backend (${url.host})`,
        }),
      );
      setConnectionMessage(
        'Backend selected. Propose changes sends the displayed context and your request to this endpoint.',
      );
    } catch (error) {
      setConnectionMessage(error instanceof Error ? error.message : String(error));
    }
  }
  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setView(previous.view);
    selection.clear();
    for (const predicate of previous.predicates)
      selection.set(predicate.field, predicate.value, {
        op: predicate.op,
        source: predicate.source,
      });
    setApplied(null);
    setNotice('Restored the previous analysis view.');
  }
  const chartProps = {
    id: 'assistant-analysis-chart',
    data: samples,
    height: 290,
    'aria-label': 'Assistant analysis chart',
  };
  return (
    <>
      <div className="sc-source-bar">
        <div>
          <strong>Materials experiment</strong>
          <span>
            {rows.length} of {labSamples.length} sample records in the current selection
          </span>
        </div>
        <div className="sc-source-actions">
          <Button onClick={undo} disabled={!history.length}>
            Undo last plan
          </Button>
          <Button
            onClick={() => {
              assistant.discard();
              selection.clear();
              setView(initialView);
              setApplied(null);
              setHistory([]);
              setNotice('Restored the original view.');
            }}
          >
            Reset analysis
          </Button>
        </div>
      </div>
      <div className="sc-assistant-layout">
        <aside className="sc-assistant-rail">
          <details className="sc-backend">
            <summary>Model connection</summary>
            <p>
              The local demonstration uses documented rules. To use a model, run the{' '}
              <a href={`${links.github}/tree/main/examples/ai-server`}>backend example</a> or supply
              your own endpoint.
            </p>
            <label className="sc-field">
              Backend endpoint
              <input
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="sc-source-actions">
              <Button onClick={connect}>Use backend</Button>
              <Button
                onClick={() => {
                  setAdapter(localPlanner);
                  setConnectionMessage(
                    'Local mode makes no network requests and does not call a model.',
                  );
                }}
              >
                Use local rules
              </Button>
            </div>
            <p role="status">{connectionMessage}</p>
          </details>
          <label className="sc-profile-toggle">
            <input
              type="checkbox"
              checked={includeProfile}
              onChange={(event) => setIncludeProfile(event.target.checked)}
            />{' '}
            Include field quality and range summaries
          </label>
          <AssistantPanel
            assistant={assistant}
            title="Plan the next view"
            placeholder="For example: show failed samples"
          />
          <div className="sc-suggestions">
            <span>Try a request</span>
            {[
              'Show failed samples',
              'Compare temperature and yield',
              'Show pressure distribution',
              'Reset the filters',
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={assistant.status === 'loading'}
                onClick={() => {
                  void assistant.submit(prompt);
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </aside>
        <div className="sc-assistant-result">
          <FilterBar
            data={samples}
            fields={[
              { field: 'batch', pinned: true },
              { field: 'material', pinned: true },
              { field: 'passed', pinned: true },
            ]}
            summary={(filtered) => `${filtered.length} samples`}
          />
          <section className="sc-panel">
            <div className="sc-panel-heading">
              <div>
                <h2>
                  {chart.chart === 'scatter'
                    ? `${samples.schema[chart.x].label} and ${samples.schema[chart.y].label}`
                    : `${samples.schema[chart.x].label} ${chart.chart === 'histogram' ? 'distribution' : 'analysis'}`}
                </h2>
                <p>
                  Charts and table share the current selection. Every proposed change requires
                  Apply.
                </p>
              </div>
            </div>
            {chart.chart === 'histogram' ? (
              <Histogram {...chartProps} x={chart.x} brush bins={20} />
            ) : chart.chart === 'scatter' ? (
              <ScatterPlot
                {...chartProps}
                x={chart.x}
                y={chart.y}
                label="id"
                color="batch"
                select="id"
              />
            ) : chart.chart === 'bar' ? (
              <BarChart {...chartProps} x={chart.x} y={chart.y} select />
            ) : (
              <LineChart {...chartProps} x={chart.x} y={chart.y} brush />
            )}
          </section>
          <DataTable
            data={samples}
            rowKey="id"
            columns={table.fields.map((field) => ({
              field,
              label: samples.schema[field].label,
              width: 140,
            }))}
            sort={
              view.sort ? `${view.sort.direction === 'desc' ? '-' : ''}${view.sort.field}` : null
            }
            onSortChange={(sort) =>
              setView((current) => ({
                ...current,
                sort: sort
                  ? {
                      field: sort.replace(/^[-+]/, ''),
                      direction: sort.startsWith('-') ? 'desc' : 'asc',
                    }
                  : undefined,
              }))
            }
            limit={table.limit}
            pageSize={10}
            aria-label="Assistant analysis records"
            caption={`Shows up to ${table.limit} matching records. The profile describes the entire current selection.`}
          />
          <p className="sc-application-status" role="status">
            {notice}
          </p>
          {applied && (
            <details className="sc-method">
              <summary>Last applied proposal: {applied.title}</summary>
              <p>{applied.summary}</p>
              <pre>{JSON.stringify(applied, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

export function AssistantWorkbench() {
  const [dark, setDark] = useState(false);
  return (
    <QuartileProvider theme={dark ? 'dark' : 'light'} density="compact" className="sc-page">
      <ScienceHeader current="assistant" />
      <main className="sc-main">
        <div className="sc-intro">
          <div>
            <span>Schema-aware, model-agnostic analysis</span>
            <h1>Ask. Inspect. Apply.</h1>
            <p>
              Give an assistant the schema, selection and bounded profile of your data. Review its
              proposed filters, charts and table changes before they reach the workspace.
            </p>
          </div>
          <Button aria-pressed={dark} onClick={() => setDark(!dark)}>
            Dark theme
          </Button>
        </div>
        <Selection id="science-assistant">
          <AssistedAnalysis />
        </Selection>
        <footer className="sc-footer">
          <span>Local rules by default; connect your backend for model-generated plans.</span>
          <a href={`${links.github}/tree/main/examples/ai-server`}>Run the model backend</a>
          <a href={`${links.docs}/docs/ai-assistance`}>AI integration guide</a>
          <a href={`${links.github}/tree/main/packages/react/src/ai`}>Library source</a>
        </footer>
      </main>
    </QuartileProvider>
  );
}
