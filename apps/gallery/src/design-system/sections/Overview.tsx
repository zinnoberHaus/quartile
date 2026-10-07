import { Section } from '../Section';
import '../foundations.css';

export function OverviewSection() {
  return (
    <Section
      id="overview"
      eyebrow="00 · Overview"
      title={
        <>
          One system for the whole
          <br />
          data app.
        </>
      }
      lead="Foundations, interface components, data components, charts and the patterns that connect them. Everything on this page is rendered by @quartile/react from the same tokens the library ships."
    >
      <div className="f-overview">
        <div>
          <div className="f-glyph" aria-hidden="true">
            {[16, 24, 40, 22].map((h, i) => (
              <span
                key={i}
                style={{
                  width: 12,
                  height: h,
                  borderRadius: 2,
                  background: i === 2 ? 'var(--q-signal)' : 'var(--q-line-strong)',
                }}
              />
            ))}
          </div>
          <h3>Gray by default, color with intent</h3>
          <p>Context is neutral. The signal color marks what the reader should look at first.</p>
        </div>
        <div>
          <div className="f-big-num">1,284</div>
          <h3>Numbers are typography</h3>
          <p>
            Values, axes and deltas use IBM Plex Mono with tabular figures, so columns align and
            digits never jitter.
          </p>
        </div>
        <div>
          <div className="f-glyph" style={{ alignItems: 'center' }} aria-hidden="true">
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: '1.5px solid var(--q-signal)',
              }}
            />
            <span style={{ width: 18, height: 1.5, background: 'var(--q-signal)' }} />
            <span
              style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--q-signal)' }}
            />
            <span style={{ width: 18, height: 1.5, background: 'var(--q-signal)' }} />
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: '1.5px solid var(--q-signal)',
              }}
            />
          </div>
          <h3>Every view is linkable</h3>
          <p>Charts, tables and controls read from and write to one selection store.</p>
        </div>
        <div>
          <div className="f-glyph" style={{ alignItems: 'center', gap: 8 }} aria-hidden="true">
            <span
              style={{
                width: 56,
                height: 36,
                borderRadius: 8,
                border: '1px solid var(--q-line-strong)',
              }}
            />
            <span
              style={{
                width: 48,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--q-line-strong)',
              }}
            />
            <span className="q-num" style={{ fontSize: 11, color: 'var(--q-text-3)' }}>
              36 / 28
            </span>
          </div>
          <h3>Density is a setting</h3>
          <p>Comfortable for products, compact for analysts. Same components, one prop.</p>
        </div>
      </div>
    </Section>
  );
}
