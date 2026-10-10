import {
  BarList,
  Button,
  createTableViewState,
  DataExplorer,
  type Dataset,
  DataTable,
  type DataTableColumn,
  dataset,
  FilterBar,
  filterTableRows,
  Heatmap,
  Histogram,
  inferSchema,
  Legend,
  LineChart,
  parseTableViewState,
  QuartileProvider,
  Selection,
  serializeTableViewState,
  type TableViewState,
  useSelection,
} from '@quartile/react';
import { profileDataset } from '@quartile/react/ai';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '../../router';
import { Wordmark } from '../../shell/Logo';
import { links } from '../../shell/links';
import {
  cohortMembership,
  evaluatePredictions,
  overallRetention,
  predictionRows,
  retentionByCohort,
} from './analysis';
import { DatasetSource } from './DatasetSource';
import {
  cohortEvents,
  cohortUsers,
  labSamples,
  modelPredictions,
  SCIENCE_OBSERVED_THROUGH,
} from './data';
import './science.css';

export type ScienceKind = 'explore' | 'cohorts' | 'model-evaluation';
const routes = [
  ['explore', 'Dataset explorer'],
  ['cohorts', 'Retention cohorts'],
  ['model-evaluation', 'Model evaluation'],
  ['assistant', 'AI workbench'],
] as const;
const recipes = {
  explore: {
    title: 'Get to know your data.',
    lead: 'Inspect missing values, compare distributions, refine a table view, and follow the records behind a pattern.',
  },
  cohorts: {
    title: 'Who comes back?',
    lead: 'Compare signup cohorts over complete calendar months. Inspect the eligible users and return activity behind each retention rate.',
  },
  'model-evaluation': {
    title: 'Understand the tradeoffs.',
    lead: 'Change a binary classifier’s threshold, compare customer slices, and investigate false positives and missed positives.',
  },
};
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const pct = (value: number | null | undefined) =>
  value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const laboratory = dataset(
  labSamples.map((row) => ({ ...row, _quartile_row: row.id })),
  {
    id: { type: 'nominal', label: 'Sample' },
    temperatureC: { type: 'quantitative', label: 'Temperature', unit: '°C', format: 'number' },
    pressureKpa: { type: 'quantitative', label: 'Pressure', unit: 'kPa', format: 'number' },
    yieldPct: { type: 'quantitative', label: 'Yield', format: 'percent' },
    durationMin: { type: 'quantitative', label: 'Duration', unit: 'min', format: 'number' },
    measuredAt: { type: 'temporal', label: 'Measured', format: 'date-short' },
  },
);

export function ScienceHeader({ current }: { current: string }) {
  return (
    <header className="sc-header">
      <Link to="/">
        <Wordmark />
      </Link>
      <nav aria-label="Data science examples">
        {routes.map(([route, title]) => (
          <a
            key={route}
            href={`/examples/${route}`}
            aria-current={current === route ? 'page' : undefined}
          >
            {title}
          </a>
        ))}
      </nav>
      <a href={links.docs}>Docs</a>
    </header>
  );
}

function Metrics({ items }: { items: { label: string; value: string; note: string }[] }) {
  return (
    <dl className="sc-metrics">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          <span>{item.note}</span>
        </div>
      ))}
    </dl>
  );
}

function SelectionStatus() {
  const selection = useSelection();
  return (
    <div className="sc-selection-status" role="status">
      <span>
        {selection.predicates.length
          ? `${selection.predicates.length} linked selections`
          : 'All records in the current table view'}
      </span>
      {!!selection.predicates.length && (
        <Button size="sm" onClick={() => selection.clear()}>
          Clear chart selection
        </Button>
      )}
    </div>
  );
}

type SavedView = { name: string; view: TableViewState };
function SavedViews({
  view,
  onChange,
  storageKey,
}: {
  view: TableViewState;
  onChange: (view: TableViewState) => void;
  storageKey: string;
}) {
  const [name, setName] = useState('My analysis');
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [status, setStatus] = useState('Views save settings in this browser; data stays separate.');
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (!Array.isArray(raw) || raw.length > 8) throw new Error('Invalid saved views.');
      setSaved(
        raw.map((item) => {
          if (!item || typeof item.name !== 'string' || item.name.length > 60)
            throw new Error('Invalid view name.');
          return { name: item.name, view: parseTableViewState(item.view) };
        }),
      );
    } catch {
      setSaved([]);
      setStatus('Saved views could not be loaded. You can create a new view.');
    }
  }, [storageKey]);
  function save() {
    if (!name.trim()) {
      setStatus('Name the view before saving.');
      return;
    }
    const next = [
      ...saved.filter((item) => item.name !== name.trim()),
      { name: name.trim(), view: parseTableViewState(serializeTableViewState(view)) },
    ].slice(-8);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setStatus(`Saved “${name.trim()}”. Record data was not stored.`);
    } catch {
      setStatus('Browser storage is unavailable. The current view still works.');
    }
  }
  function remove(nameToRemove: string) {
    const next = saved.filter((item) => item.name !== nameToRemove);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setStatus(`Deleted “${nameToRemove}”.`);
    } catch {
      setStatus('Could not update browser storage.');
    }
  }
  return (
    <details className="sc-saved-views">
      <summary>
        Saved table views <span>{saved.length}</span>
      </summary>
      <div className="sc-saved-form">
        <label className="sc-field">
          View name
          <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </label>
        <Button onClick={save}>Save view</Button>
      </div>
      <div className="sc-view-list">
        {saved.map((item) => (
          <div key={item.name}>
            <Button
              onClick={() => {
                onChange(parseTableViewState(item.view));
                setStatus(`Loaded “${item.name}”.`);
              }}
            >
              {item.name}
            </Button>
            <button
              type="button"
              onClick={() => remove(item.name)}
              aria-label={`Delete view ${item.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <p role="status">{status}</p>
    </details>
  );
}

function Explorer({
  data,
  onData,
  label,
}: {
  data: Dataset;
  onData: (data: Dataset) => void;
  label: string;
}) {
  const selection = useSelection();
  const [view, setView] = useState(() =>
    createTableViewState({ pageSize: 10, pinnedColumns: { left: ['id'], right: [] } }),
  );
  const [field, setField] = useState('temperatureC');
  const [category, setCategory] = useState('batch');
  const [message, setMessage] = useState(
    'Edits affect this browser session. Export a CSV to keep the changed records.',
  );
  const fields = Object.values(data.schema).filter((item) => item.name !== '_quartile_row');
  const numeric = fields.filter((item) => item.type === 'quantitative');
  const categories = fields.filter((item) => item.type === 'nominal' || item.type === 'boolean');
  const x = numeric.some((item) => item.name === field) ? field : numeric[0]?.name;
  const group = categories.some((item) => item.name === category) ? category : categories[0]?.name;
  const columns: DataTableColumn[] = fields.map((item) => ({
    field: item.name,
    label: item.label,
    width: item.name === 'id' ? 120 : 140,
    cell: item.type === 'quantitative' ? 'number' : 'text',
    format: item.format,
    aggregate: item.type === 'quantitative' ? 'mean' : undefined,
    editable:
      item.name === 'id'
        ? false
        : {
            type:
              item.type === 'quantitative'
                ? 'number'
                : item.type === 'boolean'
                  ? 'boolean'
                  : item.type === 'temporal'
                    ? 'date'
                    : 'text',
            nullable: true,
          },
  }));
  const localRows = useMemo(
    () =>
      filterTableRows(
        data.rows,
        view,
        data.schema,
        Object.keys(data.schema).filter((name) => name !== '_quartile_row'),
      ),
    [data, view],
  );
  const linkedRows = useMemo(() => selection.filter(localRows), [selection, localRows]);
  const chartData = useMemo(() => ({ ...data, rows: localRows }), [data, localRows]);
  const profile = useMemo(
    () =>
      profileDataset(
        { ...data, rows: linkedRows },
        {
          maxRows: 10000,
          fields: Object.keys(data.schema).filter((name) => name !== '_quartile_row'),
        },
      ),
    [data, linkedRows],
  );
  const missing = profile.fields.reduce((total, item) => total + item.missing, 0);
  return (
    <>
      <Metrics
        items={[
          {
            label: 'Records in focus',
            value: number.format(linkedRows.length),
            note: `${number.format(data.rows.length)} source records`,
          },
          {
            label: 'Fields',
            value: String(fields.length),
            note: `${numeric.length} quantitative fields`,
          },
          {
            label: 'Missing cells',
            value: number.format(missing),
            note: 'Null, undefined or empty string',
          },
          {
            label: 'Profile coverage',
            value: profile.complete ? 'Complete' : 'Sampled',
            note: `${number.format(profile.scannedRows)} examined rows`,
          },
        ]}
      />
      <SelectionStatus />
      <div className="sc-analysis-grid">
        <section className="sc-panel sc-distribution">
          <div className="sc-panel-heading">
            <div>
              <h2>Distribution</h2>
              <p>Brush a range to inspect its records.</p>
            </div>
            <label className="sc-field">
              Measure
              <select
                value={x ?? ''}
                disabled={!numeric.length}
                onChange={(event) => setField(event.target.value)}
              >
                {numeric.map((item) => (
                  <option value={item.name} key={item.name}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {x ? (
            <Histogram
              id="science-distribution"
              data={chartData}
              x={x}
              bins={20}
              brush
              median
              height={250}
              aria-label={`${data.schema[x].label} distribution`}
            />
          ) : (
            <p className="sc-empty">
              No numeric fields in this dataset. Use the table’s typed filters to explore it.
            </p>
          )}
        </section>
        <section className="sc-panel">
          <div className="sc-panel-heading">
            <div>
              <h2>Composition</h2>
              <p>Select a category to compare its measurements.</p>
            </div>
            <label className="sc-field">
              Group
              <select
                value={group ?? ''}
                disabled={!categories.length}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option value={item.name} key={item.name}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {group ? (
            <BarList
              id="science-categories"
              data={chartData}
              category={group}
              select
              limit={8}
              aria-label="Record composition"
            />
          ) : (
            <p>No categorical fields. Choose a numeric range or refine the table.</p>
          )}
        </section>
      </div>
      <details className="sc-profiles">
        <summary>
          Field quality <span>Exact counts in the current selection</span>
        </summary>
        <DataTable
          data={profile.fields.map((item) => ({
            ...item,
            range: item.min == null ? '—' : `${String(item.min)} … ${String(item.max)}`,
          }))}
          selection={false}
          rowKey="field"
          columns={[
            { field: 'field', label: 'Field', width: 160 },
            { field: 'type', width: 120 },
            { field: 'missing', cell: 'number' },
            { field: 'invalid', cell: 'number' },
            { field: 'distinct', cell: 'number' },
            { field: 'range', width: 'minmax(240px, 1fr)' },
          ]}
          aria-label="Field quality profile"
        />
      </details>
      <section className="sc-ledger">
        <div className="sc-ledger-intro">
          <div>
            <h2>Explore the records</h2>
            <p>
              Search and table filters also refine the charts. Grouping shows means for quantitative
              fields; grouped records are read-only.
            </p>
          </div>
          <span>{label}</span>
        </div>
        <SavedViews
          view={view}
          onChange={setView}
          storageKey={`quartile-explorer-v1:${fields.map((item) => `${item.name}:${item.type}`).join('|')}`}
        />
        <DataExplorer
          id="science-records"
          data={data}
          columns={columns}
          rowKey="_quartile_row"
          select="_quartile_row"
          view={view}
          onViewChange={setView}
          exportFileName="quartile-observations.csv"
          onCellEdit={(edit) => {
            onData({
              ...data,
              rows: data.rows.map((row) =>
                row._quartile_row === edit.row._quartile_row
                  ? { ...row, [edit.field]: edit.value }
                  : row,
              ),
            });
            setMessage(
              `Updated ${data.schema[edit.field]?.label ?? edit.field}. Charts and profiles use the changed value.`,
            );
          }}
          onExport={({ rows, csv }) => {
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'quartile-observations.csv';
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            setMessage(`Exported ${rows.length} matching records with the visible columns.`);
          }}
          aria-label="Dataset records"
        />
        <p className="sc-note" role="status">
          {message}
        </p>
      </section>
    </>
  );
}

function DatasetExplorer() {
  const [data, setData] = useState<Dataset>(laboratory);
  const [label, setLabel] = useState('Materials experiment');
  const [revision, setRevision] = useState(0);
  return (
    <>
      <DatasetSource
        label={label}
        onLoad={(result) => {
          setData({
            kind: 'dataset',
            rows: result.rows,
            schema: inferSchema(result.rows, result.fields, result.rows.length),
          });
          setLabel(result.label);
          setRevision((value) => value + 1);
        }}
        onRestore={() => {
          setData(laboratory);
          setLabel('Materials experiment');
          setRevision((value) => value + 1);
        }}
      />
      <Selection key={revision} id="science-explore">
        <Explorer data={data} onData={setData} label={label} />
      </Selection>
    </>
  );
}

const usersData = dataset(cohortUsers, {
  id: { type: 'nominal', label: 'User' },
  cohortMonth: { type: 'nominal', label: 'Signup cohort', format: 'text' },
});
function CohortAnalysis() {
  const selection = useSelection();
  const [month, setMonth] = useState(1);
  const users = useMemo(() => selection.filter(cohortUsers), [selection]);
  const cells = useMemo(
    () => retentionByCohort(users, cohortEvents, SCIENCE_OBSERVED_THROUGH, 5),
    [users],
  );
  const curve = useMemo(() => overallRetention(cells), [cells]);
  const membership = useMemo(
    () => cohortMembership(users, cohortEvents, month, SCIENCE_OBSERVED_THROUGH),
    [users, month],
  );
  const eligible = membership.filter((row) => row.eligible).length;
  const returned = membership.filter((row) => row.retained).length;
  const observed = curve.find((row) => row.month === month);
  return (
    <>
      <div className="sc-source-bar">
        <div>
          <strong>Signup cohorts, April–September 2026</strong>
          <span>Fictional user activity. Observation ends October 1, 2026, exclusive.</span>
        </div>
        <label className="sc-field">
          Inspect interval
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                Month {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FilterBar
        data={usersData}
        fields={[
          { field: 'channel', pinned: true },
          { field: 'cohortMonth', pinned: true },
        ]}
        summary={(rows) => `${rows.length} users in selected cohorts`}
      />
      <Metrics
        items={[
          {
            label: `Month ${month} retention`,
            value: pct(observed?.retention),
            note: `${returned} returned / ${eligible} eligible users`,
          },
          {
            label: 'Selected users',
            value: number.format(users.length),
            note: 'Unique users, not event counts',
          },
          {
            label: 'Not yet observed',
            value: number.format(users.length - eligible),
            note: 'Excluded from this interval’s denominator',
          },
          {
            label: 'Cohorts in view',
            value: String(new Set(users.map((row) => row.cohortMonth)).size),
            note: 'Complete calendar-month intervals',
          },
        ]}
      />
      <div className="sc-analysis-grid sc-cohort-grid">
        <section className="sc-panel">
          <div className="sc-panel-heading">
            <div>
              <h2>Retention by signup cohort</h2>
              <p>Empty cells are not yet observed. Month 0 is the signup baseline.</p>
            </div>
          </div>
          <Heatmap
            data={dataset(cells, {
              cohortMonth: { type: 'nominal', format: 'text' },
              retention: 'percent',
            })}
            x="month"
            y="cohortMonth"
            value="retention"
            xOrder={[0, 1, 2, 3, 4, 5]}
            yOrder={['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']}
            xFormat={(value) => `Month ${value}`}
            xLabels={(value) => `M${value}`}
            domain={[0, 1]}
            cellHeight={40}
            format="percent"
            peak={false}
            selection={false}
            aria-label="Cohort retention matrix"
          />
        </section>
        <section className="sc-panel">
          <div className="sc-panel-heading">
            <div>
              <h2>Observed retention</h2>
              <p>Weighted by eligible users at each interval.</p>
            </div>
          </div>
          <LineChart
            data={curve}
            x="month"
            y="retention"
            format="percent"
            height={280}
            selection={false}
            points
            aria-label="Weighted retention curve"
          />
        </section>
      </div>
      <section className="sc-ledger">
        <div className="sc-ledger-intro">
          <div>
            <h2>Who is in the denominator?</h2>
            <p>
              Month {month} eligibility and return activity for every user in the selected cohorts.
              Table filters affect this detail view.
            </p>
          </div>
        </div>
        <DataExplorer
          data={membership}
          columns={[
            { field: 'id', label: 'User', width: 120 },
            { field: 'cohortMonth', label: 'Signup cohort', width: 140 },
            { field: 'channel', width: 120 },
            {
              field: 'outcome',
              label: `Month ${month} outcome`,
              cell: 'badge',
              width: 180,
              tones: {
                Returned: 'positive',
                'Did not return': 'neutral',
                'Not yet observed': 'warning',
              },
            },
          ]}
          rowKey="id"
          selection={false}
          defaultView={{ pageSize: 10 }}
          exportFileName={`quartile-cohort-month-${month}.csv`}
          aria-label="Cohort membership records"
        />
      </section>
      <details className="sc-method">
        <summary>Calculation and limitations</summary>
        <p>
          For each signup cohort, month N retention equals the unique users with activity in that
          exact calendar month divided by all unique eligible users in the cohort. Repeated events
          count once. The entire target month must be observable before it enters the denominator.
          The combined curve sums returned and eligible users; it does not average percentages.
          Month 0 is 100% by signup definition. This is classic interval retention, not rolling
          retention or a causal estimate.
        </p>
        <DataTable
          data={cells}
          selection={false}
          columns={[
            { field: 'cohortMonth' },
            { field: 'month' },
            { field: 'retained' },
            { field: 'eligible' },
            { field: 'retention', format: 'percent' },
          ]}
          pageSize={12}
          aria-label="Exact retention calculations"
        />
      </details>
    </>
  );
}

const outcomeNames = {
  TP: 'True positives',
  FP: 'False positives',
  FN: 'False negatives',
  TN: 'True negatives',
} as const;
function ModelAnalysis() {
  const selection = useSelection();
  const [threshold, setThreshold] = useState(0.5);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [modelView, setModelView] = useState(() =>
    createTableViewState({ pageSize: 10, sorts: [{ key: 'score', desc: true }] }),
  );
  const selected = useMemo(() => selection.filter(modelPredictions), [selection]);
  const stats = useMemo(() => evaluatePredictions(selected, threshold), [selected, threshold]);
  const details = useMemo(
    () => predictionRows(selected, threshold).filter((row) => !outcome || row.outcome === outcome),
    [selected, threshold, outcome],
  );
  const curve = useMemo(
    () =>
      Array.from({ length: 21 }, (_, index) => {
        const point = evaluatePredictions(selected, index / 20);
        return { threshold: index / 20, precision: point.precision, recall: point.recall };
      }),
    [selected],
  );
  return (
    <>
      <div className="sc-source-bar">
        <div>
          <strong>Binary outcome classifier</strong>
          <span>
            360 fictional scored observations. No training or inference service is running.
          </span>
        </div>
        <label className="sc-field sc-threshold">
          Decision threshold <output>{threshold.toFixed(2)}</output>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            aria-label="Decision threshold"
          />
        </label>
      </div>
      <FilterBar
        data={modelPredictions}
        fields={[{ field: 'segment', pinned: true }]}
        summary={(rows) => `${rows.length} scored observations`}
      />
      <Metrics
        items={[
          {
            label: 'Precision',
            value: pct(stats.precision),
            note: `${stats.tp} true positives / ${stats.predictedPositive} predicted positives`,
          },
          {
            label: 'Recall',
            value: pct(stats.recall),
            note: `${stats.tp} true positives / ${stats.actualPositive} actual positives`,
          },
          { label: 'F1', value: pct(stats.f1), note: 'Harmonic mean of precision and recall' },
          {
            label: 'Accuracy',
            value: pct(stats.accuracy),
            note: `${stats.tp + stats.tn} correct / ${stats.total} observations`,
          },
        ]}
      />
      <div className="sc-analysis-grid sc-model-grid">
        <section className="sc-panel">
          <div className="sc-panel-heading">
            <div>
              <h2>Confusion matrix</h2>
              <p>Choose an outcome to inspect its observations.</p>
            </div>
          </div>
          <div className="sc-confusion">
            {(['TP', 'FP', 'FN', 'TN'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={outcome === key}
                data-outcome={key}
                onClick={() => {
                  setOutcome(outcome === key ? null : key);
                  setModelView((value) => ({ ...value, page: 0 }));
                }}
              >
                <span>{outcomeNames[key]}</span>
                <strong>{stats[key.toLowerCase() as 'tp' | 'fp' | 'fn' | 'tn']}</strong>
                <small>
                  {key === 'TP' || key === 'FP' ? 'Predicted positive' : 'Predicted negative'} /{' '}
                  {key === 'TP' || key === 'FN' ? 'actual positive' : 'actual negative'}
                </small>
              </button>
            ))}
          </div>
        </section>
        <section className="sc-panel">
          <div className="sc-panel-heading">
            <div>
              <h2>Precision and recall across thresholds</h2>
              <p>Twenty-one exact evaluations of the current slice.</p>
            </div>
          </div>
          <Legend
            items={[
              { key: 'precision', label: 'Precision', color: 'var(--q-cat-1)' },
              { key: 'recall', label: 'Recall', color: 'var(--q-cat-2)' },
            ]}
          />
          <LineChart
            data={curve}
            x="threshold"
            y={['precision', 'recall']}
            legend={false}
            format="percent"
            xFormat="number"
            height={260}
            selection={false}
            aria-label="Threshold tradeoff curve"
          />
        </section>
      </div>
      <section className="sc-panel sc-score-distribution">
        <div className="sc-panel-heading">
          <div>
            <h2>Score distribution</h2>
            <p>
              Brush a score interval to evaluate that subset. Clear it to return to the full
              segment.
            </p>
          </div>
        </div>
        <Histogram
          id="model-score"
          data={modelPredictions}
          x="score"
          bins={20}
          brush
          height={170}
          aria-label="Prediction score distribution"
        />
        <SelectionStatus />
      </section>
      <section className="sc-ledger">
        <div className="sc-ledger-intro">
          <div>
            <h2>
              {outcome
                ? outcomeNames[outcome as keyof typeof outcomeNames]
                : 'Inspect every prediction'}
            </h2>
            <p>
              Outcome and table filters refine these records; evaluation metrics retain the full
              selected segment and score range.
            </p>
          </div>
          {outcome && <Button onClick={() => setOutcome(null)}>All outcomes</Button>}
        </div>
        <DataExplorer
          data={dataset(details, {
            label: { type: 'nominal', label: 'Actual label' },
            prediction: { type: 'nominal', label: 'Predicted label' },
            score: { type: 'quantitative', format: 'number' },
          })}
          rowKey="id"
          selection={false}
          view={modelView}
          onViewChange={setModelView}
          columns={[
            { field: 'id', label: 'Observation', width: 140 },
            { field: 'segment', width: 140 },
            { field: 'score', cell: 'bar', width: 180 },
            { field: 'label', label: 'Actual (0 / 1)', width: 130 },
            { field: 'prediction', label: 'Predicted (0 / 1)', width: 150 },
            {
              field: 'outcome',
              cell: 'badge',
              tones: { TP: 'positive', TN: 'positive', FP: 'negative', FN: 'negative' },
              width: 120,
            },
          ]}
          exportFileName="quartile-model-observations.csv"
          aria-label="Model prediction records"
        />
      </section>
      <details className="sc-method">
        <summary>Calculation and limitations</summary>
        <p>
          A score greater than or equal to the threshold predicts class 1. Precision is TP / (TP +
          FP); recall is TP / (TP + FN); F1 is 2TP / (2TP + FP + FN); accuracy is (TP + TN) / N. A
          zero denominator displays an em dash. Metrics describe this fixed fictional sample and the
          active slice, not generalization performance, calibration or causal fairness. No model is
          trained here.
        </p>
      </details>
    </>
  );
}

export function ScienceWorkbench({ kind }: { kind: ScienceKind }) {
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(true);
  const recipe = recipes[kind];
  return (
    <QuartileProvider
      theme={dark ? 'dark' : 'light'}
      density={compact ? 'compact' : 'comfortable'}
      className="sc-page"
    >
      <ScienceHeader current={kind} />
      <main className="sc-main">
        <div className="sc-intro">
          <div>
            <span>Quartile for data exploration</span>
            <h1>{recipe.title}</h1>
            <p>{recipe.lead}</p>
          </div>
          <div className="sc-mode-controls">
            <Button aria-pressed={dark} onClick={() => setDark(!dark)}>
              Dark theme
            </Button>
            <Button aria-pressed={compact} onClick={() => setCompact(!compact)}>
              Compact density
            </Button>
          </div>
        </div>
        {kind === 'explore' ? (
          <DatasetExplorer />
        ) : kind === 'cohorts' ? (
          <Selection id="science-cohorts">
            <CohortAnalysis />
          </Selection>
        ) : (
          <Selection id="science-model">
            <ModelAnalysis />
          </Selection>
        )}
        <footer className="sc-footer">
          <span>Open-source React components · preview API</span>
          <a href={`${links.github}/tree/main/apps/gallery/src/examples/science`}>
            Read the source and calculations
          </a>
          <a href={`${links.github}/tree/main/examples/python`}>Bring a dataframe</a>
          <a href={`${links.docs}/docs/data-science`}>Implementation guide</a>
        </footer>
      </main>
    </QuartileProvider>
  );
}
