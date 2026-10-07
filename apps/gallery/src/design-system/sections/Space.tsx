import { Button, QuartileProvider } from '@quartile/react';
import { Section } from '../Section';
import '../foundations.css';

const SPACES: [string, number][] = [
  ['1', 4],
  ['2', 8],
  ['3', 12],
  ['4', 16],
  ['5', 20],
  ['6', 24],
  ['8', 32],
  ['10', 40],
  ['14', 56],
  ['20', 80],
];
const RADII: [string, string][] = [
  ['xs · 4', 'var(--q-radius-xs)'],
  ['sm · 6', 'var(--q-radius-sm)'],
  ['md · 8', 'var(--q-radius-md)'],
  ['lg · 12', 'var(--q-radius-lg)'],
  ['xl · 16', 'var(--q-radius-xl)'],
  ['pill', 'var(--q-radius-pill)'],
];

function DensityRow({ density, label }: { density: 'comfortable' | 'compact'; label: string }) {
  return (
    <QuartileProvider
      density={density}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <span className="f-card-label">{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary">Apply</Button>
        <input className="f-density-input" placeholder="Search orders" aria-label="Search orders" />
      </div>
    </QuartileProvider>
  );
}

export function SpaceSection() {
  return (
    <Section
      id="space"
      eyebrow="05 · Foundations"
      title="Space & shape"
      lead="A 4px grid, hairline borders before shadows, and two densities. Shadows are reserved for things that float: menus, popovers, dialogs, toasts."
    >
      <div className="g-grid-2">
        <div className="f-card">
          <div className="f-panel-head">
            <span className="f-panel-title">Spacing · --q-space-*</span>
          </div>
          {SPACES.map(([k, v]) => (
            <div key={k} className="f-space-row">
              <span className="q-num" style={{ fontSize: 11.5, color: 'var(--q-text-2)' }}>
                {k}
              </span>
              <span className="f-space-bar">
                <span style={{ width: v }} />
                <span className="q-num" style={{ fontSize: 11.5, color: 'var(--q-text-3)' }}>
                  {v}px
                </span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="f-card">
            <div className="f-panel-head">
              <span className="f-panel-title">Radius · --q-radius-*</span>
            </div>
            <div className="f-radius">
              {RADII.map(([l, r]) => (
                <div
                  key={l}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                >
                  <span
                    className="f-radius-box"
                    style={{
                      borderRadius: r,
                      width: l === 'pill' ? 76 : 52,
                      height: l === 'pill' ? 32 : 52,
                      marginTop: l === 'pill' ? 20 : 0,
                    }}
                  />
                  <span className="q-num" style={{ fontSize: 11, color: 'var(--q-text-3)' }}>
                    {l}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="f-card" style={{ background: 'var(--q-subtle)' }}>
            <div className="f-panel-head">
              <span className="f-panel-title">Elevation · --q-shadow-*</span>
            </div>
            <div className="f-elev">
              {['0 · card', '1 · popover', '2 · dialog'].map((l, i) => (
                <div key={l}>
                  <div className="f-elev-box" style={{ boxShadow: `var(--q-shadow-${i})` }} />
                  <div
                    className="q-num"
                    style={{ marginTop: 8, fontSize: 11, color: 'var(--q-text-3)' }}
                  >
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="f-card" style={{ marginTop: 16 }}>
        <div className="f-panel-head">
          <span className="f-panel-title">Density</span>
          <span className="f-panel-meta">&lt;QuartileProvider density="compact"&gt;</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
          <DensityRow density="comfortable" label="Comfortable · 36 / 14px" />
          <DensityRow density="compact" label="Compact · 28 / 13px" />
        </div>
      </div>
    </Section>
  );
}
