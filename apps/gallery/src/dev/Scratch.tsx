import { LineChart, QuartileProvider, Selection } from '@quartile/react';
import { daily, monthlyByChannel } from '../data/kestrel';

/** Dev-only scratch page at /_dev for checking components in isolation. Not linked anywhere. */
export function Scratch() {
  return (
    <QuartileProvider style={{ padding: 40, background: 'var(--q-bg)', minHeight: '100vh' }}>
      <Selection id="dev">
        <div style={{ display: 'grid', gap: 24, maxWidth: 900 }}>
          <div
            style={{
              background: 'var(--q-surface)',
              border: '1px solid var(--q-line)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <LineChart
              data={daily}
              x="date"
              y="users"
              compare="users_previous"
              area
              brush
              height={260}
            />
          </div>
          <div
            style={{
              background: 'var(--q-surface)',
              border: '1px solid var(--q-line)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <LineChart
              data={monthlyByChannel}
              x="month"
              y="revenue"
              color="channel"
              xFormat="month"
              annotations={[{ x: '2026-03-01', label: 'Mar ’26 · pricing change' }]}
              height={280}
            />
          </div>
          <div
            style={{
              background: 'var(--q-surface)',
              border: '1px solid var(--q-line)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <LineChart data={daily} x="date" y="revenue" loading="Querying 2.4M rows…" />
          </div>
        </div>
      </Selection>
    </QuartileProvider>
  );
}
