import { Section } from '../Section';
import '../foundations.css';

const ROWS: { token: string; spec: string; cls: string; sample: string }[] = [
  {
    token: 'display',
    spec: '72 / 0.95 · 650 · −4.5%',
    cls: 'q-text-display',
    sample: 'Revenue, explained',
  },
  { token: 'h1', spec: '40 / 1.05 · 650 · −3%', cls: 'q-text-h1', sample: 'Quarterly performance' },
  { token: 'h2', spec: '28 / 1.15 · 650 · −2%', cls: 'q-text-h2', sample: 'Orders by channel' },
  { token: 'h3', spec: '20 / 1.25 · 600 · −1%', cls: 'q-text-h3', sample: 'Checkout funnel' },
  {
    token: 'body',
    spec: '16 / 1.55 · 400',
    cls: 'q-text-body',
    sample: 'Conversion fell after the pricing change, mostly on mobile.',
  },
  {
    token: 'ui',
    spec: '14 / 1.4 · 400–500',
    cls: 'q-text-ui',
    sample: 'Add filter · Export · Share',
  },
  {
    token: 'caption',
    spec: '12 / 1.4 · 400',
    cls: 'q-text-caption',
    sample: 'vs. previous 30 days · updated 2 min ago',
  },
  {
    token: 'data-xl',
    spec: 'Mono 28 / 1 · 500 · −3%',
    cls: 'q-text-data-xl',
    sample: '$1,284,310.42',
  },
  {
    token: 'data',
    spec: 'Mono 13 / 1.4 · 400 · tnum',
    cls: 'q-text-data',
    sample: '18,259   3.12%   +0.21 pt',
  },
  {
    token: 'axis',
    spec: 'Mono 11 / 1 · 400',
    cls: 'q-text-axis',
    sample: '$0   $20K   $40K   $60K',
  },
  {
    token: 'label',
    spec: 'Mono 11 · 500 · +8% · caps',
    cls: 'q-text-label',
    sample: 'Net revenue · USD',
  },
];

export function TypographySection() {
  return (
    <Section
      id="typography"
      eyebrow="04 · Foundations"
      title="Typography"
      lead="Two families. Schibsted Grotesk for interface and display: compact, sturdy at small sizes, with character at large ones. IBM Plex Mono for every number, label and line of code."
    >
      <div className="f-type-hero">
        <div className="f-type-specimen" style={{ background: 'var(--q-surface)' }}>
          <div className="f-panel-head" style={{ margin: 0 }}>
            <span className="f-panel-meta">Schibsted Grotesk</span>
            <span className="f-panel-meta">400–900</span>
          </div>
          <span
            style={{ fontSize: 112, lineHeight: 0.9, fontWeight: 700, letterSpacing: '-0.05em' }}
          >
            Aa
          </span>
          <span style={{ fontSize: 14.5, color: 'var(--q-text-2)' }}>
            Interface, headings, body. Tight tracking above 28px, default below.
          </span>
        </div>
        <div
          className="f-type-specimen"
          data-theme="dark"
          style={{ background: 'var(--q-bg)', borderColor: 'var(--q-bg)', color: 'var(--q-text)' }}
        >
          <div className="f-panel-head" style={{ margin: 0 }}>
            <span className="f-panel-meta">IBM Plex Mono</span>
            <span className="f-panel-meta">400–600 · tnum</span>
          </div>
          <span
            className="q-num"
            style={{ fontSize: 96, lineHeight: 1, fontWeight: 500, letterSpacing: '-0.04em' }}
          >
            0123
          </span>
          <span style={{ fontSize: 14.5, color: 'var(--q-text-2)' }}>
            Values, deltas, axes, table numerals, labels and code.
          </span>
        </div>
      </div>
      <div className="f-type-table">
        {ROWS.map((r) => (
          <div key={r.token} className="f-type-row">
            <span className="q-num" style={{ fontSize: 12.5, fontWeight: 500 }}>
              {r.token}
            </span>
            <span className="q-num" style={{ fontSize: 11.5, color: 'var(--q-text-3)' }}>
              {r.spec}
            </span>
            <span
              className={`f-type-sample ${r.cls}`}
              style={r.token === 'display' ? { fontSize: 56 } : undefined}
            >
              {r.sample}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
