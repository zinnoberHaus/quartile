import {
  BarList,
  BoxPlot,
  Button,
  DataTable,
  FilterBar,
  Heatmap,
  Histogram,
  KPI,
  QuartileProvider,
  type QuartileSpec,
  ScatterPlot,
  Selection,
  SpecView,
  useSelection,
  validateSpec,
} from '@quartile/react';
import { useState } from 'react';
import { Link } from '../../router';
import { Wordmark } from '../../shell/Logo';
import { links } from '../../shell/links';
import { accounts, initialSpec, requests } from './data';
import { referenceErrors } from './references';
import './workbench.css';

export type WorkbenchKind = 'saas' | 'operations' | 'ai-dashboard';
const recipes = {
  saas: {
    title: 'Subscription portfolio',
    lead: 'Find the accounts behind your recurring revenue. Select a plan, brush a revenue range, or inspect an individual workspace.',
    guide: 'use-cases',
  },
  operations: {
    title: 'Service health',
    lead: 'Follow an incident from its distribution to the requests behind it. Select a service and compare latency, failures, and regions.',
    guide: 'use-cases',
  },
  'ai-dashboard': {
    title: 'A dashboard from JSON',
    lead: 'Edit a component spec, validate it, and render a linked dashboard. This playground uses local sample data; it does not call a model.',
    guide: 'generated-dashboards',
  },
};

function SelectionInspector() {
  const selection = useSelection();
  return (
    <details className="w-inspector">
      <summary>Selection state · {selection.predicates.length} active predicates</summary>
      <p>
        Views ignore predicates they publish themselves, so you can still see and change the
        alternatives.
      </p>
      <pre>{JSON.stringify(selection.predicates, null, 2)}</pre>
      <Button onClick={() => selection.clear()} disabled={!selection.predicates.length}>
        Clear selection
      </Button>
    </details>
  );
}

function SaaS({ table }: { table: boolean }) {
  const view = table ? 'table' : 'chart';
  return (
    <Selection id="portfolio">
      <FilterBar
        data={accounts}
        fields={[
          { field: 'region', pinned: true },
          { field: 'plan', pinned: true },
          { field: 'status' },
        ]}
        summary={(rows) => `${rows.length} accounts`}
      />
      <div className="w-kpis">
        <KPI
          data={accounts}
          value="mrr"
          label="Monthly recurring revenue"
          format="currency"
          unit="USD / month"
        />
        <KPI data={accounts} aggregate="count" label="Accounts in view" format="integer" />
        <KPI
          data={accounts}
          value="adoption"
          aggregate="mean"
          label="Mean seat adoption"
          format="percent"
        />
      </div>
      <div className="w-grid">
        <section className="w-panel">
          <h2>Revenue by plan</h2>
          <p>Click a plan to filter the other views.</p>
          <BarList
            id="portfolio-plan"
            data={accounts}
            category="plan"
            value="mrr"
            select
            view={view}
          />
        </section>
        <section className="w-panel">
          <h2>Seats and monthly revenue</h2>
          <p>Every point is one account; color identifies its plan.</p>
          <ScatterPlot
            data={accounts}
            x="seats"
            y="mrr"
            color="plan"
            label="account"
            select="account"
            view={view}
            height={260}
          />
        </section>
        <section className="w-panel w-wide">
          <h2>Revenue distribution</h2>
          <p>Brush a range to investigate an account segment.</p>
          <Histogram data={accounts} x="mrr" bins={20} brush view={view} height={220} />
        </section>
        <section className="w-panel w-wide">
          <h2>The accounts behind the numbers</h2>
          <DataTable
            data={accounts}
            columns={[
              { field: 'account' },
              { field: 'plan' },
              { field: 'region' },
              { field: 'mrr', format: 'currency', cell: 'bar' },
              { field: 'adoption', format: 'percent' },
              { field: 'status', cell: 'badge' },
            ]}
            sort="-mrr"
            pageSize={8}
            select="account"
            caption="Fictional subscription accounts; MRR is a point-in-time snapshot, not cumulative revenue."
          />
        </section>
      </div>
      <SelectionInspector />
    </Selection>
  );
}

function Operations({ table }: { table: boolean }) {
  const view = table ? 'table' : 'chart';
  return (
    <Selection id="operations">
      <FilterBar
        data={requests}
        fields={[
          { field: 'service', pinned: true },
          { field: 'region', pinned: true },
          { field: 'status', pinned: true },
        ]}
        summary={(rows) => `${rows.length} requests`}
      />
      <div className="w-kpis">
        <KPI data={requests} aggregate="count" label="Requests in view" format="integer" />
        <KPI
          data={requests}
          value="error"
          aggregate="mean"
          label="Error rate"
          format="percent"
          invert
        />
        <KPI
          data={requests}
          value="latency"
          aggregate="mean"
          label="Mean latency"
          format="integer"
          unit="ms"
          invert
        />
      </div>
      <div className="w-grid">
        <section className="w-panel">
          <h2>Latency by service</h2>
          <p>Quartiles, median, and Tukey whiskers. Click a service.</p>
          <BoxPlot
            data={requests}
            category="service"
            value="latency"
            select
            view={view}
            height={260}
          />
        </section>
        <section className="w-panel">
          <h2>Latency distribution</h2>
          <p>Brush the slow tail to inspect the affected requests.</p>
          <Histogram data={requests} x="latency" bins={24} median brush view={view} height={260} />
        </section>
        <section className="w-panel w-wide">
          <h2>Request volume by service and region</h2>
          <Heatmap data={requests} x="region" y="service" view={view} height={220} />
        </section>
        <section className="w-panel w-wide">
          <h2>Slowest matching requests</h2>
          <DataTable
            data={requests}
            columns={[
              { field: 'request' },
              { field: 'service' },
              { field: 'region' },
              { field: 'latency', cell: 'bar' },
              { field: 'status', cell: 'badge', tones: { Error: 'negative', Success: 'positive' } },
            ]}
            sort="-latency"
            pageSize={8}
            caption="360 deterministic sample requests. Error rate is errors divided by requests in the current selection."
          />
        </section>
      </div>
      <SelectionInspector />
    </Selection>
  );
}

function SpecPlayground() {
  const [text, setText] = useState(() => JSON.stringify(initialSpec, null, 2));
  const [spec, setSpec] = useState<unknown>(initialSpec);
  const [message, setMessage] = useState('Valid spec. The dashboard below is ready to explore.');
  const [revision, setRevision] = useState(0);
  function render() {
    try {
      const parsed: unknown = JSON.parse(text);
      const result = validateSpec(parsed);
      if (!result.valid) {
        setMessage(
          result.errors.map((error) => `${error.path || '/'}: ${error.message}`).join('\n'),
        );
        return;
      }
      const errors = referenceErrors(parsed as QuartileSpec);
      if (errors.length) {
        setMessage(errors.join('\n'));
        return;
      }
      setSpec(parsed);
      setRevision((value) => value + 1);
      setMessage('Valid spec. Dashboard updated; selection reset.');
    } catch (error) {
      setMessage(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return (
    <>
      <div className="w-spec-editor">
        <div>
          <h2>Describe the view</h2>
          <p>
            Only the named <code>accounts</code> dataset is registered. Change chart types or
            fields, then validate. Invalid edits leave the last valid dashboard visible.
          </p>
          <p>
            Try changing a component to <code>PieChart</code> to see the unknown-component error.
          </p>
          <Button variant="signal" onClick={render}>
            Validate and render
          </Button>
          <p className="w-validation" role="status">
            {message}
          </p>
        </div>
        <label>
          Dashboard JSON
          <textarea
            spellCheck={false}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
      </div>
      <SpecView key={revision} spec={spec} data={{ accounts }} />
    </>
  );
}

export function Workbench({ kind }: { kind: WorkbenchKind }) {
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  const [table, setTable] = useState(false);
  const recipe = recipes[kind];
  return (
    <QuartileProvider
      theme={dark ? 'dark' : 'light'}
      density={compact ? 'compact' : 'comfortable'}
      className="w-page"
    >
      <header className="w-header">
        <Link to="/">
          <Wordmark />
        </Link>
        <nav aria-label="Examples">
          <Link to="/examples/storefront">Storefront</Link>
          <Link to="/examples/saas">SaaS</Link>
          <Link to="/examples/operations">Operations</Link>
          <Link to="/examples/ai-dashboard">JSON dashboard</Link>
          <Link to="/examples/scale">Worker queries</Link>
          <Link to="/studio">App Studio</Link>
        </nav>
        <a href={links.docs}>Docs</a>
      </header>
      <main className="w-main">
        <div className="w-intro">
          <div>
            <span className="w-preview">Quartile preview · fictional sample data</span>
            <h1>{recipe.title}</h1>
            <p>{recipe.lead}</p>
          </div>
          <a href={`${links.github}/tree/main/apps/gallery/src/examples/workbench`}>View source</a>
        </div>
        <div className="w-toolbar">
          <Button aria-pressed={dark} onClick={() => setDark(!dark)}>
            Dark theme
          </Button>
          <Button aria-pressed={compact} onClick={() => setCompact(!compact)}>
            Compact density
          </Button>
          {kind !== 'ai-dashboard' && (
            <Button aria-pressed={table} onClick={() => setTable(!table)}>
              View charts as tables
            </Button>
          )}
          <a href={`${links.github}/blob/main/docs/guides/${recipe.guide}.md`}>
            Implementation guide
          </a>
        </div>
        {kind === 'saas' ? (
          <SaaS key={kind} table={table} />
        ) : kind === 'operations' ? (
          <Operations key={kind} table={table} />
        ) : (
          <SpecPlayground />
        )}
        <footer className="w-footer">
          Built with the public @quartile/react API. In-memory rows and SVG charts. No backend or
          real customer data.
        </footer>
      </main>
    </QuartileProvider>
  );
}
