import {
  BarChart,
  DataExplorer,
  type Dataset,
  FilterBar,
  Histogram,
  KPI,
  LineChart,
  QuartileProvider,
  type Row,
  ScatterPlot,
  type Schema,
  Selection,
  useSelectionStore,
} from '@quartile/react';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import license from '../../../../../LICENSE?raw';
import { Link, useLocation } from '../../router';
import { Wordmark } from '../../shell/Logo';
import { links } from '../../shell/links';
import { lineDataError } from './chart-data';
import chartRuntime from './chart-data.ts?raw';
import { createZip, reactSource, starterFiles } from './export';
import {
  type BlockType,
  blockError,
  blockTypes,
  createBlock,
  draftKey,
  parseProject,
  presetProject,
  projectLimit,
  type StudioBlock,
  type StudioProject,
} from './model';
import {
  type LoadedSource,
  loadSource,
  type SourceId,
  sourcePresets,
  validateSourceConfig,
} from './sources';
import sourceRuntime from './sources.ts?raw';
import './studio.css';

const labels: Record<BlockType, string> = {
  metric: 'Metric',
  line: 'Line chart',
  bar: 'Bar chart',
  scatter: 'Scatter plot',
  histogram: 'Histogram',
  table: 'Data table',
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';
function download(name: string, content: string | Uint8Array, type = 'application/json') {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const blob = new Blob([new Uint8Array(bytes).buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResetChartSelections({ signature }: { signature: string }) {
  const store = useSelectionStore();
  const previous = useRef(signature);
  useEffect(() => {
    if (previous.current !== signature) {
      store?.clear();
      previous.current = signature;
    }
  }, [signature, store]);
  return null;
}

function BlockView({
  block,
  data,
  rowIds,
}: {
  block: StudioBlock;
  data: Dataset<Row>;
  rowIds: Map<Row, string>;
}) {
  const error =
    blockError(block, data.schema) ||
    (block.type === 'line' ? lineDataError(data, block.x!, block.color) : null);
  if (error)
    return <p className="st-inline-error">{error} Select this component to configure it.</p>;
  switch (block.type) {
    case 'metric':
      return (
        <KPI
          data={data}
          label={block.title}
          value={block.aggregate === 'count' ? undefined : block.y}
          aggregate={block.aggregate ?? 'mean'}
        />
      );
    case 'line':
      return (
        <LineChart
          id={block.id}
          data={data}
          x={block.x!}
          y={block.y!}
          color={block.color}
          brush
          height={280}
        />
      );
    case 'bar':
      return (
        <BarChart
          id={block.id}
          data={data}
          x={block.x!}
          y={block.y!}
          group={block.color}
          select
          height={280}
        />
      );
    case 'scatter':
      return (
        <ScatterPlot
          id={block.id}
          data={data}
          x={block.x!}
          y={block.y!}
          color={block.color}
          select
          height={280}
        />
      );
    case 'histogram':
      return <Histogram id={block.id} data={data} x={block.x!} bins={20} brush height={260} />;
    case 'table':
      return (
        <DataExplorer
          data={data}
          columns={block.columns!.map((key) => ({
            field: key,
            label: data.schema[key]?.label ?? key,
          }))}
          rowKey={(row) => rowIds.get(row)!}
        />
      );
  }
}

function FieldSelect({
  label,
  value,
  schema,
  types,
  optional,
  onChange,
}: {
  label: string;
  value?: string;
  schema: Schema;
  types?: string[];
  optional?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="st-field">
      {label}
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{optional ? 'None' : 'Choose a field'}</option>
        {Object.values(schema)
          .filter((field) => !types || types.includes(field.type))
          .map((field) => (
            <option key={field.name} value={field.name}>
              {field.label}
              {field.unit ? ` · ${field.unit}` : ''}
            </option>
          ))}
      </select>
    </label>
  );
}

function Inspector({
  block,
  schema,
  index,
  count,
  update,
  move,
  remove,
}: {
  block: StudioBlock;
  schema: Schema;
  index: number;
  count: number;
  update: (block: StudioBlock) => void;
  move: (direction: -1 | 1) => void;
  remove: () => void;
}) {
  const patch = (part: Partial<StudioBlock>) => update({ ...block, ...part });
  return (
    <div
      className="st-inspector"
      id="studio-inspector"
      tabIndex={-1}
      data-testid="component-inspector"
    >
      <div className="st-section-label">
        <span>03 / Configure</span>
        <span>{String(index + 1).padStart(2, '0')}</span>
      </div>
      <label className="st-field">
        Component
        <select
          aria-label="Component"
          value={block.type}
          onChange={(event) =>
            update({
              ...createBlock(event.target.value as BlockType, schema, block.id),
              span: block.span,
            })
          }
        >
          {blockTypes.map((type) => (
            <option key={type} value={type}>
              {labels[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="st-field">
        Title
        <input
          maxLength={120}
          value={block.title}
          onChange={(event) => patch({ title: event.target.value })}
        />
      </label>
      <label className="st-field">
        Width
        <select
          aria-label="Width"
          value={block.span}
          onChange={(event) => patch({ span: Number(event.target.value) as 6 | 12 })}
        >
          <option value={6}>Half canvas</option>
          <option value={12}>Full canvas</option>
        </select>
      </label>
      {block.type === 'metric' && (
        <>
          <label className="st-field">
            Aggregation
            <select
              aria-label="Aggregation"
              value={block.aggregate ?? 'mean'}
              onChange={(event) =>
                patch({
                  aggregate: event.target.value as StudioBlock['aggregate'],
                  y:
                    event.target.value === 'count'
                      ? undefined
                      : (block.y ??
                        Object.values(schema).find((f) => f.type === 'quantitative')?.name),
                })
              }
            >
              <option value="count">Count records</option>
              <option value="mean">Mean of non-null values</option>
              <option value="sum">Sum of non-null values</option>
            </select>
          </label>
          {block.aggregate !== 'count' && (
            <FieldSelect
              label="Value"
              value={block.y}
              schema={schema}
              types={['quantitative']}
              onChange={(y) => patch({ y })}
            />
          )}
        </>
      )}
      {!['metric', 'table'].includes(block.type) && (
        <FieldSelect
          label={block.type === 'histogram' ? 'Distribution field' : 'X axis'}
          value={block.x}
          schema={schema}
          types={
            block.type === 'bar'
              ? undefined
              : block.type === 'line'
                ? ['quantitative', 'temporal']
                : ['quantitative']
          }
          onChange={(x) => patch({ x })}
        />
      )}
      {['line', 'bar', 'scatter'].includes(block.type) && (
        <>
          <FieldSelect
            label="Y axis"
            value={block.y}
            schema={schema}
            types={['quantitative']}
            onChange={(y) => patch({ y })}
          />
          <FieldSelect
            label="Series"
            value={block.color}
            schema={schema}
            types={['nominal', 'boolean']}
            optional
            onChange={(color) => patch({ color })}
          />
        </>
      )}
      {block.type === 'table' && (
        <fieldset className="st-columns">
          <legend>Table fields</legend>
          {Object.values(schema).map((field) => (
            <label key={field.name}>
              <input
                type="checkbox"
                checked={block.columns?.includes(field.name) ?? false}
                onChange={(event) =>
                  patch({
                    columns: event.target.checked
                      ? [...(block.columns ?? []), field.name]
                      : block.columns?.filter((key) => key !== field.name),
                  })
                }
              />
              {field.label}
            </label>
          ))}
        </fieldset>
      )}
      {block.type === 'bar' && (
        <p className="st-help">
          Bars sum rows sharing an X / series value. Choose additive measures; avoid summing
          temperatures, rates, or magnitudes.
        </p>
      )}
      {block.type === 'metric' && block.aggregate === 'mean' && (
        <p className="st-help">
          An unweighted mean across non-null values. Filter the data to compare a meaningful
          population.
        </p>
      )}
      <div className="st-actions">
        <button type="button" disabled={index === 0} onClick={() => move(-1)}>
          Move up
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => move(1)}>
          Move down
        </button>
      </div>
      <button className="st-remove" type="button" onClick={remove}>
        Remove component
      </button>
    </div>
  );
}

export function StudioPage() {
  const location = useLocation();
  const requestedSource = new URLSearchParams(location.search).get('source');
  const initialSource = sourcePresets.some((p) => p.id === requestedSource)
    ? (requestedSource as Exclude<SourceId, 'custom'>)
    : 'weather';
  const [project, setProject] = useState<StudioProject>(() => presetProject(initialSource));
  const [selected, setSelected] = useState('trend');
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [custom, setCustom] = useState(false);
  const [url, setURL] = useState('');
  const [rowsPath, setRowsPath] = useState('');
  const [loaded, setLoaded] = useState<{
    sourceKey: string;
    revision: number;
    result: LoadedSource;
  } | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'cancelled'>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addType, setAddType] = useState<BlockType>('line');
  const controller = useRef<AbortController | null>(null);
  const importer = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const seedCustom = useRef(false);
  const sourceKey = JSON.stringify(project.source);
  const result =
    loaded?.sourceKey === sourceKey && loaded.revision === revision ? loaded.result : null;
  const schema =
    result?.data.schema ?? sourcePresets.find((p) => p.id === project.source.kind)?.fields ?? {};
  const rowIds = useMemo(
    () => new Map(result?.data.rows.map((row, index) => [row, String(index)])),
    [result],
  );
  const selectedBlock = project.blocks.find((block) => block.id === selected);
  const filters = useMemo(
    () =>
      result
        ? Object.values(result.data.schema)
            .filter(
              (field) =>
                (field.type === 'nominal' || field.type === 'boolean') &&
                new Set(result.data.rows.map((row) => row[field.name])).size <= 24,
            )
            .slice(0, 3)
            .map((field) => ({ field: field.name, pinned: true }))
        : [],
    [result],
  );
  let code = '';
  let configurationError = '';
  try {
    code = reactSource(project);
  } catch (error) {
    configurationError = message(error);
  }
  const invalidBlock = project.blocks.find(
    (block) =>
      blockError(block, schema) ||
      (result && block.type === 'line' && lineDataError(result.data, block.x!, block.color)),
  );
  const exportReady = !!result && !configurationError && !invalidBlock;

  useEffect(() => {
    try {
      setHasDraft(localStorage.getItem(draftKey) !== null);
    } catch {
      /* Explicit saves report unavailable storage. */
    }
  }, []);
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    setPhase('loading');
    setError('');
    setLoaded(null);
    loadSource(JSON.parse(sourceKey), { signal: request.signal }).then(
      (next) => {
        if (request.signal.aborted) return;
        setLoaded({ sourceKey, revision, result: next });
        setPhase('ready');
        const shouldSeed = seedCustom.current;
        seedCustom.current = false;
        setProject((current) => {
          if (
            !shouldSeed ||
            current.source.kind !== 'custom' ||
            current.blocks.length !== 0 ||
            JSON.stringify(current.source) !== sourceKey
          )
            return current;
          return {
            ...current,
            blocks: [
              createBlock('metric', next.data.schema, 'records'),
              createBlock('table', next.data.schema, 'records-table'),
            ],
          };
        });
      },
      (reason) => {
        if (!request.signal.aborted) {
          setError(message(reason));
          setPhase('error');
        }
      },
    );
    return () => request.abort();
  }, [sourceKey, revision]);

  function applyProject(next: StudioProject, action: string, seed = false) {
    seedCustom.current = seed;
    setProject(next);
    setSelected(next.blocks[0]?.id ?? '');
    setCustom(next.source.kind === 'custom');
    setURL(next.source.url ?? '');
    setRowsPath(next.source.rowsPath ?? '');
    setRevision((n) => n + 1);
    setNotice(action);
  }
  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > projectLimit) throw new Error('Project exceeds 64 KiB.');
      applyProject(parseProject(await file.text()), 'Project imported. Loading its source.');
    } catch (error) {
      setNotice(`Import failed: ${message(error)}`);
    }
  }
  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify(parseProject(project)));
      setHasDraft(true);
      setNotice(
        'Draft saved in this browser. Only configuration was saved; source records and table selections were not.',
      );
    } catch (error) {
      setNotice(`Draft could not be saved: ${message(error)}`);
    }
  }
  function restoreDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) throw new Error('No saved draft found.');
      applyProject(parseProject(raw), 'Saved draft restored. Loading its source.');
    } catch (error) {
      setNotice(`Restore failed: ${message(error)}`);
    }
  }
  function configure(id: string) {
    setSelected(id);
    setMode('visual');
    if (window.matchMedia('(max-width: 720px)').matches)
      requestAnimationFrame(() => {
        const inspector = document.getElementById('studio-inspector');
        inspector?.scrollIntoView({ block: 'start' });
        inspector?.focus({ preventScroll: true });
      });
  }
  function updateBlock(next: StudioBlock) {
    setProject((p) => ({
      ...p,
      blocks: p.blocks.map((block) => (block.id === next.id ? next : block)),
    }));
  }
  function moveBlock(direction: -1 | 1) {
    setProject((p) => {
      const blocks = [...p.blocks];
      const index = blocks.findIndex((b) => b.id === selected);
      if (index < 0 || !blocks[index + direction]) return p;
      [blocks[index], blocks[index + direction]] = [blocks[index + direction], blocks[index]];
      return { ...p, blocks };
    });
  }
  function addBlock() {
    if (project.blocks.length >= 16) return;
    const id = `component-${Date.now().toString(36)}-${++sequence.current}`;
    setProject((p) => ({ ...p, blocks: [...p.blocks, createBlock(addType, schema, id)] }));
    setSelected(id);
    setMode('visual');
  }
  async function exportStarter() {
    if (!exportReady) return;
    setExporting(true);
    setNotice('Preparing the React starter…');
    try {
      const manifestResponse = await fetch('/starter/manifest.json', {
        signal: AbortSignal.timeout(20000),
      });
      if (!manifestResponse.ok)
        throw new Error('Starter package is unavailable. Retry or download the React source.');
      const manifest = await manifestResponse.json();
      if (
        manifest.version !== '0.1.0' ||
        typeof manifest.bytes !== 'number' ||
        manifest.bytes < 1 ||
        manifest.bytes > 2 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(manifest.sha256)
      )
        throw new Error('Invalid starter package manifest.');
      const response = await fetch('/starter/quartile-react-0.1.0.tgz', {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error('Starter package could not be downloaded. Retry in a moment.');
      const library = new Uint8Array(await response.arrayBuffer());
      if (library.byteLength !== manifest.bytes)
        throw new Error('Starter package size did not match its manifest.');
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', library)),
        (n) => n.toString(16).padStart(2, '0'),
      ).join('');
      if (digest !== manifest.sha256)
        throw new Error('Starter package verification failed. Refresh and try again.');
      download(
        'quartile-react-starter.zip',
        createZip(starterFiles(project, sourceRuntime, library, license, chartRuntime)),
        'application/zip',
      );
      setNotice(
        'Starter downloaded. Unzip it, then run npm install and npm run dev. The Quartile preview package is included.',
      );
    } catch (error) {
      setNotice(`Export failed: ${message(error)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <QuartileProvider>
      <div className="st-page">
        <header className="st-header">
          <Link to="/" aria-label="Quartile component gallery">
            <Wordmark />
          </Link>
          <nav aria-label="Studio navigation">
            <span aria-current="page">
              App Studio <small>preview</small>
            </span>
            <Link to="/examples/explore">Data workbench</Link>
            <a href={`${links.docs}/docs/studio`}>Guide ↗</a>
          </nav>
          <a href={links.github}>Source ↗</a>
        </header>
        <main>
          <section className="st-intro">
            <div>
              <p className="st-eyebrow">FROM PUBLIC DATA TO YOUR OWN APP</p>
              <h1>
                A working analysis.
                <br />
                <em>Your way of building.</em>
              </h1>
              <p>
                Start with a real API. Shape the view, inspect the records, then take the React code
                with you.
              </p>
            </div>
            <div className="st-intro-note">
              <span className="st-open-dot" />
              Open source · Apache-2.0
              <br />
              <strong>One dataset. Every view connected.</strong>
              <span>Visual composition → native React</span>
              <Link to="/examples/assistant">Explore the AI workbench →</Link>
            </div>
          </section>
          <nav className="st-mobile-jump" aria-label="Workspace shortcuts">
            <Link to="#studio-canvas">View analysis ↓</Link>
            <Link to="#studio-controls">Project controls ↑</Link>
          </nav>
          <div className="st-workspace">
            <aside className="st-sidebar" id="studio-controls" aria-label="Project controls">
              <div className="st-section-label">
                <span>01 / Connect data</span>
                <span>GET</span>
              </div>
              <div className="st-sources">
                {sourcePresets.map((preset) => (
                  <Link
                    key={preset.id}
                    to={`/studio?source=${preset.id}`}
                    onClick={(event) => {
                      if (
                        requestedSource === preset.id &&
                        event.button === 0 &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey
                      )
                        applyProject(
                          presetProject(preset.id),
                          'Template reset. Loading its source.',
                        );
                    }}
                    className={!custom && project.source.kind === preset.id ? 'is-active' : ''}
                    aria-current={!custom && project.source.kind === preset.id ? 'true' : undefined}
                  >
                    <span>
                      {preset.id === 'weather' ? '01' : preset.id === 'earthquakes' ? '02' : '03'}
                    </span>
                    <div>
                      <strong>
                        {preset.id === 'weather'
                          ? 'Weather & operations'
                          : preset.id === 'earthquakes'
                            ? 'Event monitoring'
                            : 'Development research'}
                      </strong>
                      <small>
                        {preset.id === 'weather'
                          ? 'Open-Meteo / hourly forecast'
                          : preset.id === 'earthquakes'
                            ? 'USGS / earthquake events'
                            : 'World Bank / life expectancy'}
                      </small>
                    </div>
                    <span>↗</span>
                  </Link>
                ))}
                <button
                  type="button"
                  className={custom ? 'is-active' : ''}
                  onClick={() => setCustom((value) => !value)}
                >
                  + Connect a public JSON API
                </button>
              </div>
              {custom && (
                <form
                  className="st-custom"
                  onSubmit={(event) => {
                    event.preventDefault();
                    try {
                      const source = validateSourceConfig({ kind: 'custom', url, rowsPath });
                      applyProject(
                        { version: 1, name: 'My public data analysis', source, blocks: [] },
                        'Loading your public API.',
                        true,
                      );
                    } catch (error) {
                      setNotice(message(error));
                    }
                  }}
                >
                  <label className="st-field">
                    Public HTTPS URL
                    <input
                      type="url"
                      required
                      value={url}
                      placeholder="https://example.org/data.json"
                      onChange={(event) => setURL(event.target.value)}
                    />
                  </label>
                  <label className="st-field">
                    Records path (optional)
                    <input
                      value={rowsPath}
                      placeholder="data.records"
                      onChange={(event) => setRowsPath(event.target.value)}
                    />
                  </label>
                  <p className="st-help">
                    A JSON array, or a dot path to one. Flat records, public CORS access, no API
                    keys. Up to 5,000 rows / 2 MiB.
                  </p>
                  <button type="submit">Load public JSON</button>
                </form>
              )}
              <div className="st-section-label">
                <span>02 / Compose</span>
                <span>{project.blocks.length} / 16</span>
              </div>
              <label className="st-field">
                Project name
                <input
                  value={project.name}
                  maxLength={120}
                  onChange={(event) => setProject((p) => ({ ...p, name: event.target.value }))}
                />
              </label>
              <div className="st-component-list">
                {project.blocks.map((block, index) => (
                  <button
                    type="button"
                    key={block.id}
                    aria-pressed={selected === block.id}
                    onClick={() => {
                      configure(block.id);
                    }}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <span>
                      {block.title || labels[block.type]}
                      <small>
                        {labels[block.type]} · {block.span === 12 ? 'full' : 'half'} width
                      </small>
                    </span>
                    {blockError(block, schema) && <span title="Needs configuration">!</span>}
                  </button>
                ))}
              </div>
              <div className="st-add">
                <label className="st-field">
                  Add component
                  <select
                    aria-label="Add component"
                    value={addType}
                    onChange={(event) => setAddType(event.target.value as BlockType)}
                  >
                    {blockTypes.map((type) => (
                      <option value={type} key={type}>
                        {labels[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!result || project.blocks.length >= 16}
                  onClick={addBlock}
                >
                  Add +
                </button>
              </div>
              {selectedBlock && (
                <Inspector
                  block={selectedBlock}
                  schema={schema}
                  index={project.blocks.indexOf(selectedBlock)}
                  count={project.blocks.length}
                  update={updateBlock}
                  move={moveBlock}
                  remove={() => {
                    setProject((p) => ({
                      ...p,
                      blocks: p.blocks.filter((b) => b.id !== selected),
                    }));
                    setSelected('');
                  }}
                />
              )}
            </aside>
            <section className="st-canvas" id="studio-canvas" aria-label="Analysis canvas">
              <div className="st-canvas-toolbar">
                <div className="st-mode" role="group" aria-label="Editor mode">
                  <button
                    type="button"
                    aria-pressed={mode === 'visual'}
                    onClick={() => setMode('visual')}
                  >
                    Visual canvas
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === 'code'}
                    onClick={() => setMode('code')}
                  >
                    React source
                  </button>
                </div>
                <span className="st-status" data-phase={phase}>
                  <i />
                  {phase === 'ready'
                    ? `${result?.data.rows.length.toLocaleString() ?? 0} records`
                    : phase === 'loading'
                      ? 'Fetching source…'
                      : phase === 'cancelled'
                        ? 'Cancelled'
                        : 'Source unavailable'}
                </span>
                {phase === 'loading' ? (
                  <button
                    type="button"
                    onClick={() => {
                      controller.current?.abort();
                      setPhase('cancelled');
                    }}
                  >
                    Cancel request
                  </button>
                ) : (
                  <button type="button" onClick={() => setRevision((n) => n + 1)}>
                    {phase === 'error' ? 'Retry source' : 'Reload source'}
                  </button>
                )}
              </div>
              {notice && (
                <p className="st-notice" role="status">
                  {notice}
                </p>
              )}
              {configurationError && (
                <p className="st-inline-error" role="alert">
                  {configurationError}
                </p>
              )}
              <div className="st-canvas-heading">
                <span className="st-eyebrow">
                  {project.source.kind === 'custom'
                    ? 'YOUR PUBLIC API'
                    : project.source.kind.toUpperCase()}{' '}
                  / ANALYSIS
                </span>
                <h2>{project.name || 'Untitled analysis'}</h2>
                <p>
                  Filter a category or brush a chart to follow the same records across views. Table
                  view filters apply within that table.
                </p>
              </div>
              {result && (
                <div className="st-source-credit" role="group" aria-label="Data attribution">
                  {result.attribution.map((credit) => (
                    <a
                      key={`${credit.url}:${credit.label}`}
                      href={credit.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {credit.label}
                      {credit.license ? ` · ${credit.license}` : ''} ↗
                    </a>
                  ))}
                  {project.source.kind === 'weather' && (
                    <span className="st-terms-note">
                      Free API for non-commercial use.{' '}
                      <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">
                        Provider terms ↗
                      </a>
                    </span>
                  )}
                </div>
              )}
              {mode === 'code' ? (
                <div className="st-code">
                  <div>
                    <span>src/App.tsx</span>
                    <button
                      type="button"
                      disabled={!exportReady}
                      onClick={() => download('App.tsx', code, 'text/plain')}
                    >
                      Download React source
                    </button>
                  </div>
                  <p className="st-help">
                    Native JSX, ready to edit. The starter ZIP includes the API helper, styles,
                    build configuration, and Quartile preview package.
                  </p>
                  <pre>
                    <code>{code}</code>
                  </pre>
                </div>
              ) : (
                <>
                  {phase === 'loading' && (
                    <div className="st-loading" role="status">
                      <span className="st-loading-line" />
                      Requesting and validating the public API…
                      <small>The workspace appears when real records arrive.</small>
                      <div aria-hidden="true" />
                    </div>
                  )}
                  {phase === 'error' && (
                    <div className="st-empty" role="alert">
                      <strong>We couldn’t load this source.</strong>
                      <p>{error}</p>
                      <button type="button" onClick={() => setRevision((n) => n + 1)}>
                        Try again
                      </button>
                    </div>
                  )}
                  {phase === 'cancelled' && (
                    <div className="st-empty">
                      <strong>Request cancelled.</strong>
                      <p>No source records are loaded.</p>
                      <button type="button" onClick={() => setRevision((n) => n + 1)}>
                        Load source
                      </button>
                    </div>
                  )}
                  {result &&
                    (result.data.rows.length === 0 ? (
                      <div className="st-empty" role="status">
                        This source returned no records. Choose another source or reload later.
                      </div>
                    ) : (
                      <Selection key={result.fetchedAt} id="studio-analysis">
                        <ResetChartSelections
                          signature={JSON.stringify(
                            project.blocks.map(({ id, type, x, y, color }) => ({
                              id,
                              type,
                              x,
                              y,
                              color,
                            })),
                          )}
                        />
                        <FilterBar data={result.data} fields={filters} />
                        <div className="st-block-grid">
                          {project.blocks.map((block) => (
                            <section
                              key={block.id}
                              className="st-block"
                              data-selected={selected === block.id || undefined}
                              data-block-id={block.id}
                              style={{ gridColumn: `span ${block.span}` }}
                            >
                              <div className="st-block-heading">
                                <span>{labels[block.type]}</span>
                                <button
                                  type="button"
                                  aria-label={`Configure ${block.title}`}
                                  aria-pressed={selected === block.id}
                                  onClick={() => configure(block.id)}
                                >
                                  Configure ↗
                                </button>
                              </div>
                              {block.type !== 'metric' && <h3>{block.title}</h3>}
                              <BlockView block={block} data={result.data} rowIds={rowIds} />
                              {block.type === 'bar' && (
                                <p className="st-help">Sum per X / series combination.</p>
                              )}
                            </section>
                          ))}
                        </div>
                        {project.blocks.length === 0 && (
                          <div className="st-empty">
                            Add a component from the project controls to begin.
                          </div>
                        )}
                      </Selection>
                    ))}
                </>
              )}
              {result && (
                <details className="st-provenance">
                  <summary>
                    Source & methodology{' '}
                    <span>
                      {result.label} · fetched {new Date(result.fetchedAt).toLocaleTimeString()}
                    </span>
                  </summary>
                  <a href={result.requestedURL} target="_blank" rel="noreferrer">
                    Open the API response ↗
                  </a>
                  {result.attribution.map((credit) => (
                    <p key={`${credit.url}:${credit.label}`}>
                      <a href={credit.url} target="_blank" rel="noreferrer">
                        {credit.label}
                      </a>
                      {credit.license && ` · ${credit.license}`}
                    </p>
                  ))}
                  {result.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  <p>
                    Fetched {new Date(result.fetchedAt).toLocaleString()}. This is browser receipt
                    time. Reload to request new data.
                  </p>
                </details>
              )}
              <section className="st-export">
                <div>
                  <span className="st-eyebrow">04 / MAKE IT YOURS</span>
                  <h3>Leave with a working app.</h3>
                  <p>
                    Export the React starter, or save your composition and keep editing here. No
                    account or Quartile registry release required.
                  </p>
                </div>
                <div className="st-export-actions">
                  <button
                    type="button"
                    className="st-primary"
                    disabled={!exportReady || exporting}
                    onClick={exportStarter}
                  >
                    {exporting ? 'Preparing starter…' : 'Download React starter ↓'}
                  </button>
                  {!exportReady && (
                    <p className="st-help">
                      Load a source and configure every component to export runnable code.
                    </p>
                  )}
                  <div className="st-actions">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          download(
                            'quartile-project.json',
                            JSON.stringify(parseProject(project), null, 2),
                          );
                          setNotice('Project JSON exported. This contains configuration only.');
                        } catch (error) {
                          setNotice(message(error));
                        }
                      }}
                    >
                      Export project JSON
                    </button>
                    <button type="button" onClick={() => importer.current?.click()}>
                      Import project
                    </button>
                    <input
                      ref={importer}
                      type="file"
                      accept=".json,application/json"
                      aria-label="Import project JSON"
                      hidden
                      onChange={importProject}
                    />
                  </div>
                  <div className="st-actions">
                    <button type="button" onClick={saveDraft}>
                      Save local draft
                    </button>
                    <button type="button" disabled={!hasDraft} onClick={restoreDraft}>
                      Restore draft
                    </button>
                    {hasDraft && (
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.removeItem(draftKey);
                            setHasDraft(false);
                            setNotice('Local draft deleted.');
                          } catch (error) {
                            setNotice(message(error));
                          }
                        }}
                      >
                        Delete draft
                      </button>
                    )}
                  </div>
                  <p className="st-help">
                    Saving is opt-in and local to this browser. Project files include source URLs;
                    never put credentials in them. Current table filters, chart selections, and API
                    records are not saved.
                  </p>
                </div>
              </section>
            </section>
          </div>
          <footer className="st-footer">
            <p>Built with the same components you export.</p>
            <a href={`${links.docs}/docs/api-data`}>Read the API recipe →</a>
            <a href={`${links.github}/tree/main/apps/gallery/src/examples/studio`}>
              Inspect the Studio source →
            </a>
          </footer>
        </main>
      </div>
    </QuartileProvider>
  );
}
