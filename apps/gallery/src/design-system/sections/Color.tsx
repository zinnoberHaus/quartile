import { useLayoutEffect, useRef, useState } from 'react';
import { Section } from '../Section';
import '../foundations.css';

const NEUTRALS = [
  'bg',
  'surface',
  'subtle',
  'line',
  'line-strong',
  'text-4',
  'text-3',
  'text-2',
  'text',
];
const CAT_NAMES = ['Ultramarine', 'Coral', 'Teal', 'Saffron', 'Plum', 'Sky', 'Rose', 'Moss'];
const SEMANTIC = [
  {
    name: 'Signal',
    key: 'signal',
    sample: 'Selected',
    tokens: 'signal · signal-soft · signal-ink',
  },
  {
    name: 'Positive',
    key: 'positive',
    sample: '+12.4%',
    tokens: 'positive · positive-soft · positive-ink',
  },
  {
    name: 'Negative',
    key: 'negative',
    sample: '−3.1%',
    tokens: 'negative · negative-soft · negative-ink',
  },
  {
    name: 'Warning',
    key: 'warning',
    sample: 'Stale · 2h',
    tokens: 'warning · warning-soft · warning-ink',
  },
];
const DIV = ['n3', 'n2', 'n1', '0', 'p1', 'p2', 'p3'];
const DO_BARS = [0.42, 0.53, 0.48, 0.64, 0.58, 0.84, 0.56, 0.5, 0.46, 0.4];

function toHex(rgb: string) {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return rgb;
  return `#${m
    .slice(0, 3)
    .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** A swatch that reports the token's live computed value, so the page never drifts from tokens.css. */
function Swatch({ token }: { token: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState('');
  useLayoutEffect(() => {
    if (ref.current) setHex(toHex(getComputedStyle(ref.current).backgroundColor));
  }, []);
  return (
    <div>
      <div ref={ref} className="f-swatch-chip" style={{ background: `var(--q-${token})` }} />
      <div className="f-swatch-name">{token}</div>
      <div className="f-swatch-hex">{hex}</div>
    </div>
  );
}

export function ColorSection() {
  return (
    <Section
      id="color"
      eyebrow="03 · Foundations"
      title="Color"
      lead="Warm paper neutrals carry structure. Ultramarine is the one signal color. Categorical colors are assigned in order; sequential and diverging ramps encode magnitude and direction."
    >
      <div className="f-panel-head">
        <span className="f-panel-title">Neutrals · light</span>
        <span className="f-panel-meta">--q-bg … --q-text</span>
      </div>
      <div className="f-swatches">
        {NEUTRALS.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>

      <div className="f-dark-panel" data-theme="dark" style={{ marginTop: 24 }}>
        <div className="f-panel-head">
          <span className="f-panel-title">Neutrals · dark</span>
          <span className="f-panel-meta">same tokens, [data-theme=dark]</span>
        </div>
        <div className="f-swatches">
          {NEUTRALS.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </div>
      </div>

      <div className="f-panel-head" style={{ marginTop: 32 }}>
        <span className="f-panel-title">Signal &amp; semantic</span>
        <span className="f-panel-meta">ink text passes 4.5:1 on its soft fill</span>
      </div>
      <div className="f-semantic">
        {SEMANTIC.map((s) => (
          <div key={s.key} style={{ background: `var(--q-${s.key}-soft)` }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <span
                style={{ width: 28, height: 28, borderRadius: 7, background: `var(--q-${s.key})` }}
              />
              <span
                className="q-num"
                style={{
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: 'var(--q-surface)',
                  color: `var(--q-${s.key}-ink)`,
                  fontSize: 11.5,
                  fontWeight: 500,
                }}
              >
                {s.sample}
              </span>
            </div>
            <span style={{ marginTop: 8, fontWeight: 600, color: `var(--q-${s.key}-ink)` }}>
              {s.name}
            </span>
            <span className="q-num" style={{ fontSize: 11.5, color: `var(--q-${s.key}-ink)` }}>
              {s.tokens}
            </span>
          </div>
        ))}
      </div>

      <div className="g-grid-2" style={{ marginTop: 24 }}>
        <div className="f-card">
          <div className="f-panel-head">
            <span className="f-panel-title">Categorical · 8</span>
            <span className="f-panel-meta">--q-cat-1 … 8</span>
          </div>
          <div className="f-cat">
            {CAT_NAMES.map((n, i) => (
              <div key={n}>
                <div className="f-cat-chip" style={{ background: `var(--q-cat-${i + 1})` }} />
                <div className="f-swatch-hex" style={{ marginTop: 6, textTransform: 'none' }}>
                  {n}
                </div>
              </div>
            ))}
          </div>
          <div
            className="f-cat f-dark-panel"
            data-theme="dark"
            style={{ marginTop: 12, padding: 8, borderRadius: 8 }}
          >
            {CAT_NAMES.map((n, i) => (
              <div
                key={n}
                className="f-cat-chip"
                style={{ height: 28, background: `var(--q-cat-${i + 1})` }}
              />
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--q-text-2)' }}>
            Order matters: assign in sequence, never skip. Past eight series, group the tail as
            “Other”.
          </p>
        </div>
        <div className="f-card">
          <div className="f-panel-head">
            <span className="f-panel-title">Sequential</span>
            <span className="f-panel-meta">--q-seq-0 … 7</span>
          </div>
          <div className="f-ramp">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ background: `var(--q-seq-${i})` }} />
            ))}
          </div>
          <div className="f-panel-head" style={{ marginTop: 22 }}>
            <span className="f-panel-title">Diverging</span>
            <span className="f-panel-meta">--q-div-n3 … p3</span>
          </div>
          <div className="f-ramp">
            {DIV.map((k) => (
              <span key={k} style={{ background: `var(--q-div-${k})` }} />
            ))}
          </div>
          <div
            className="f-swatch-hex"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
              textTransform: 'none',
            }}
          >
            <span>below target</span>
            <span>neutral</span>
            <span>above target</span>
          </div>
        </div>
      </div>

      <div className="g-grid-2" style={{ marginTop: 16 }}>
        <div className="f-card">
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontWeight: 600,
              color: 'var(--q-positive-ink)',
              fontSize: 14,
            }}
          >
            ✓ Do: one series in signal, context in gray
          </div>
          <div className="f-do-bars" style={{ marginTop: 16 }}>
            {DO_BARS.map((h, i) => (
              <span
                key={i}
                style={{
                  height: `${h * 100}%`,
                  background: i === 5 ? 'var(--q-signal)' : 'var(--q-line-strong)',
                }}
              />
            ))}
          </div>
        </div>
        <div className="f-card">
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontWeight: 600,
              color: 'var(--q-negative-ink)',
              fontSize: 14,
            }}
          >
            × Avoid: categorical color on a single measure
          </div>
          <div className="f-do-bars" style={{ marginTop: 16 }}>
            {DO_BARS.map((h, i) => (
              <span
                key={i}
                style={{ height: `${h * 100}%`, background: `var(--q-cat-${(i % 8) + 1})` }}
              />
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
