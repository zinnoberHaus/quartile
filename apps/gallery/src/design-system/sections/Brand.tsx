import { Section } from '../Section';
import '../foundations.css';

const DISC = 'M14.5 14.5L25.5 14.5A11 11 0 1 0 14.5 25.5Z';
const SLICE = 'M17 17L28 17A11 11 0 0 1 17 28Z';

function Mark({ size, disc, slice }: { size: number; disc: string; slice: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d={DISC} style={{ fill: disc }} />
      <path d={SLICE} style={{ fill: slice }} />
    </svg>
  );
}

function Construction() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="100%"
      height="210"
      aria-label="Construction of the mark"
      role="img"
      style={{ overflow: 'visible' }}
    >
      <g stroke="var(--q-signal-soft-2)" strokeWidth="0.12">
        <line x1="0" y1="14.5" x2="32" y2="14.5" />
        <line x1="0" y1="17" x2="32" y2="17" />
        <line x1="14.5" y1="0" x2="14.5" y2="32" />
        <line x1="17" y1="0" x2="17" y2="32" />
      </g>
      <path d={DISC} style={{ fill: 'var(--q-text)' }} />
      <path d={SLICE} style={{ fill: 'var(--q-signal)' }} />
      <circle
        cx="14.5"
        cy="14.5"
        r="11"
        fill="none"
        stroke="var(--q-signal-soft-2)"
        strokeWidth="0.12"
        strokeDasharray="0.6 0.5"
      />
      <path
        d="M14.5 14.5L17 17"
        stroke="var(--q-surface)"
        strokeWidth="0.15"
        strokeDasharray="0.3 0.3"
      />
      <circle cx="14.5" cy="14.5" r="0.35" style={{ fill: 'var(--q-surface)' }} />
    </svg>
  );
}

export function BrandSection() {
  return (
    <Section
      id="brand"
      eyebrow="02 · Brand"
      title="Logo & wordmark"
      lead="A quartile cuts ordered data into four equal parts. The mark is a pie with one quarter pulled out. The slice carries the signal color and doubles as the tail of a Q: neutral by default, color with intent."
    >
      <div className="f-brand-hero">
        <div className="f-brand-tile" data-tone="light">
          <span className="f-lockup" style={{ color: '#16150F' }}>
            <Mark size={68} disc="#16150F" slice="#2F45E8" />
            quartile
          </span>
        </div>
        <div className="f-brand-tile" data-tone="dark">
          <span className="f-lockup" style={{ color: '#F2F0E9' }}>
            <Mark size={68} disc="#F2F0E9" slice="#7383FF" />
            quartile
          </span>
        </div>
      </div>
      <div className="f-brand-cards">
        <div className="f-card">
          <div className="f-card-label">Construction</div>
          <div style={{ padding: '16px 24px 8px' }}>
            <Construction />
          </div>
          <div
            className="f-mono-note"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}
          >
            <span>disc r = 11u</span>
            <span>three quarters, one piece</span>
            <span>slice offset = 2.5u, 45°</span>
            <span>solid fills, no strokes</span>
          </div>
        </div>
        <div className="f-card">
          <div className="f-card-label">App icon &amp; favicon</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 14,
              flexWrap: 'wrap',
              marginTop: 16,
            }}
          >
            <span className="f-icon-tile" style={{ width: 84, height: 84, background: '#16150F' }}>
              <Mark size={54} disc="#F2F0E9" slice="#7383FF" />
            </span>
            <span className="f-icon-tile" style={{ width: 84, height: 84, background: '#2F45E8' }}>
              <Mark size={54} disc="#FFFFFF" slice="#16150F" />
            </span>
            <span
              className="f-icon-tile"
              style={{
                width: 40,
                height: 40,
                borderRadius: 9,
                background: '#F5F3EE',
                boxShadow: 'inset 0 0 0 1px #E5E1D8',
              }}
            >
              <Mark size={26} disc="#16150F" slice="#2F45E8" />
            </span>
            <span
              className="f-icon-tile"
              style={{ width: 20, height: 20, borderRadius: 5, background: '#16150F' }}
            >
              <Mark size={16} disc="#F2F0E9" slice="#7383FF" />
            </span>
          </div>
          <div className="f-mono-note" style={{ marginTop: 14, color: 'var(--q-text-3)' }}>
            app · 84 &nbsp; signal · 84 &nbsp; tab · 40 &nbsp; 16 px
          </div>
        </div>
        <div className="f-card">
          <div className="f-card-label">Why “Quartile”</div>
          <svg
            viewBox="0 0 300 44"
            width="100%"
            height="44"
            style={{ marginTop: 16 }}
            aria-hidden="true"
          >
            <line
              x1="6"
              x2="294"
              y1="16"
              y2="16"
              style={{ stroke: 'var(--q-text)' }}
              strokeWidth="1.5"
            />
            <line
              x1="6"
              x2="6"
              y1="9"
              y2="23"
              style={{ stroke: 'var(--q-text)' }}
              strokeWidth="1.5"
            />
            <line
              x1="294"
              x2="294"
              y1="9"
              y2="23"
              style={{ stroke: 'var(--q-text)' }}
              strokeWidth="1.5"
            />
            <rect
              x="80"
              y="7"
              width="68"
              height="18"
              rx="3"
              style={{ fill: 'var(--q-surface)', stroke: 'var(--q-text)' }}
              strokeWidth="1.5"
            />
            <rect x="150" y="7" width="60" height="18" rx="3" style={{ fill: 'var(--q-signal)' }} />
            {[
              ['min', 6],
              ['Q1', 80],
              ['med', 149],
              ['Q3', 210],
              ['max', 294],
            ].map(([l, x]) => (
              <text
                key={l}
                x={x}
                y="40"
                textAnchor={x === 6 ? 'start' : x === 294 ? 'end' : 'middle'}
                style={{
                  font: '400 10px var(--q-font-mono)',
                  fill: l === 'Q3' ? 'var(--q-signal)' : 'var(--q-text-3)',
                }}
              >
                {l}
              </text>
            ))}
          </svg>
          <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.55 }}>
            The statistic on every dashboard and a word every analyst already knows. Short,
            typeable, number-native, and the intended package scope is{' '}
            <span className="q-num">@quartile/*</span>.
          </p>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: 'var(--q-text-3)',
            }}
          >
            Before a public release: clear the trademark, npm scope and domain. Mark directions
            considered: a donut + bar “q”, a literal box plot, a quarter in a ring.
          </p>
        </div>
      </div>
    </Section>
  );
}
