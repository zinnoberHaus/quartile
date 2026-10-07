import { links } from '../../shell/links';
import { Section } from '../Section';
import '../foundations.css';

/** Verified 2026-10-07; sources in docs/research/landscape-2026-10.md. */
const LIBS: { name: string; what: string; take: string }[] = [
  {
    name: 'Recharts',
    what: 'Declarative React SVG charts composed as JSX. The engine under shadcn/ui charts and Tremor. syncId syncs tooltips and brushes, not data.',
    take: 'Composable JSX. Keyboard navigation on by default.',
  },
  {
    name: 'Apache ECharts',
    what: 'A very large catalog configured through one option object. Canvas by default, SVG optional. No official React wrapper.',
    take: 'Choosing the renderer by data size. Generated descriptions.',
  },
  {
    name: 'Observable Plot',
    what: 'A concise grammar of marks and scales for exploration. No React package; the docs show useRef and SSR patterns.',
    take: 'Marks and scales as the chart grammar.',
  },
  {
    name: 'Unovis',
    what: 'A framework-agnostic core with React, Vue, Svelte, Angular and Solid wrappers, themed with CSS variables.',
    take: 'A core with thin adapters. CSS-variable theming.',
  },
  {
    name: 'shadcn/ui charts',
    what: 'Copy-paste Recharts v3 composition plus a container, tooltip, legend and five chart color tokens.',
    take: 'Chart colors as CSS tokens.',
  },
  {
    name: 'Tremor',
    what: 'Dashboard components on Tailwind, Radix and Recharts. Acquired by Vercel in January 2025; no npm release since.',
    take: 'Dashboard ergonomics: KPI cards, bar lists.',
  },
  {
    name: 'MUI X',
    what: 'Charts, Data Grid and date pickers in one family. Linking charts to the grid is in the paid Premium plan.',
    take: 'One family of components for data screens.',
  },
  {
    name: 'Mosaic (UW IDL)',
    what: 'Linked views, tables and inputs over DuckDB with crossfilter selections, and JSON specs with a JSON Schema.',
    take: 'Crossfilter selections. Schema-described specs.',
  },
  {
    name: 'Streamlit · Evidence · Observable Framework',
    what: 'Data-app frameworks: Python scripts, SQL + Markdown reports, static data sites.',
    take: 'App-level thinking. Not their lock-in.',
  },
];

/** [name, scope 0–100 (charts only → full app UI), linking 0–100 (static → linked)] */
const POS: [string, number, number][] = [
  ['Recharts', 12, 18],
  ['Observable Plot', 16, 30],
  ['Unovis', 26, 22],
  ['ECharts', 30, 40],
  ['shadcn/ui', 70, 12],
  ['Tremor', 58, 22],
  ['MUI X', 74, 40],
  ['Evidence', 56, 48],
  ['Streamlit', 72, 58],
  ['Obs. Framework', 44, 64],
  ['Mosaic', 32, 86],
  ['Quartile', 84, 86],
];

const VS_SHADCN: [string, string][] = [
  [
    'A package, not copied source',
    'Fixes and accessibility work arrive with an upgrade. Customize through tokens, props and composition.',
  ],
  [
    'No Tailwind required',
    'Plain CSS custom properties. It also sits inside a Tailwind or shadcn/ui app.',
  ],
  [
    'Charts share state with the table',
    'One <Selection> links charts, tables and filters with crossfilter semantics. shadcn/ui has no shared state between components.',
  ],
  [
    'Typed data, formats attached once',
    'Schema inference gives axes, tooltips, tables and KPIs the same labels and formats.',
  ],
];

export function LandscapeSection() {
  return (
    <Section
      id="landscape"
      eyebrow="01 · Landscape"
      title="Where Quartile fits"
      lead="Chart libraries stop at the chart. UI kits stop at the form. Data-app frameworks own your whole stack. Quartile takes one idea from each and lives inside your existing React app. Checked against each project's docs and releases on October 7, 2026."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
          gap: 16,
        }}
      >
        <div className="f-card" style={{ padding: 0, overflow: 'auto', gridColumn: '1 / -1' }}>
          <table className="f-landscape">
            <thead>
              <tr>
                <th>Library</th>
                <th>What it is</th>
                <th>What we borrow</th>
              </tr>
            </thead>
            <tbody>
              {LIBS.map((l) => (
                <tr key={l.name}>
                  <th scope="row">{l.name}</th>
                  <td style={{ color: 'var(--q-text-2)' }}>{l.what}</td>
                  <td>{l.take}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="f-card">
          <div className="f-panel-head">
            <span className="f-panel-title">Positioning</span>
            <span className="f-panel-meta">scatter · opinion</span>
          </div>
          <div
            className="f-pos"
            role="img"
            aria-label="Opinion: Quartile aims to combine linked views with full application UI"
          >
            {[25, 50, 75].map((v) => (
              <span
                key={`v${v}`}
                className="f-pos-grid"
                style={{ left: `${v}%`, top: 0, bottom: 0, width: 1 }}
              />
            ))}
            {[25, 50, 75].map((v) => (
              <span
                key={`h${v}`}
                className="f-pos-grid"
                style={{ top: `${v}%`, left: 0, right: 0, height: 1 }}
              />
            ))}
            {POS.map(([name, x, y]) => (
              <span
                key={name}
                className="f-pos-dot"
                data-us={name === 'Quartile' || undefined}
                style={{ left: `${x}%`, top: `${100 - y}%` }}
              >
                <span />
                {name}
              </span>
            ))}
            <span className="f-pos-axis-y">static ← views → linked</span>
          </div>
          <div className="f-panel-meta" style={{ textAlign: 'center', marginTop: 10 }}>
            charts only ← scope → full app UI
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="f-panel-head" style={{ margin: '4px 0 0' }}>
            <span className="f-panel-title">Compared with shadcn/ui</span>
            <span className="f-panel-meta">
              use both: shadcn/ui for forms, Quartile for the analytic surface
            </span>
          </div>
          {VS_SHADCN.map(([t, d]) => (
            <div key={t} className="f-card" style={{ padding: '14px 16px' }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t}</div>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: 'var(--q-text-2)',
                }}
              >
                {d}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="f-panel-meta" style={{ marginTop: 14 }}>
        shadcn/ui is better at ownership of source, breadth (about sixty components) and choice of
        primitives. Full comparison with sources:{' '}
        <a href={`${links.github}/blob/main/docs/research/landscape-2026-10.md`}>
          docs/research/landscape-2026-10.md
        </a>
      </p>
    </Section>
  );
}
