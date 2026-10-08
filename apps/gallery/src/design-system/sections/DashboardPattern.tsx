import type { CSSProperties, ReactNode } from 'react';
import { Link } from '../../router';
import { Section } from '../Section';

const zone: CSSProperties = {
  minWidth: 0,
  padding: 10,
  border: '1.5px dashed var(--q-seq-2)',
  borderRadius: 8,
  background: 'color-mix(in srgb, var(--q-signal-soft) 70%, var(--q-surface))',
};

function Zone({ label, height, style }: { label?: string; height: number; style?: CSSProperties }) {
  return (
    <div style={{ ...zone, height, ...style }} aria-hidden={label ? undefined : true}>
      {label}
    </div>
  );
}

const NOTES: [string, ReactNode][] = [
  ['1 · Header.', 'Title, period, compare toggle, one primary action.'],
  ['2 · Filter bar.', 'Chips mirror the selection, including selections made inside charts.'],
  ['3 · KPI row.', 'Four at most. Each states its comparison.'],
  ['4–5 · Trend + ranked list.', '2:1 split. The list is the fastest filter on the page.'],
  ['6 · Breakdowns.', 'Mix, time-of-day, funnel. All clickable.'],
  ['7 · Detail.', 'The rows behind the numbers, sorted by impact.'],
];

const card: CSSProperties = {
  minWidth: 0,
  border: '1px solid var(--q-line)',
  borderRadius: 14,
  background: 'var(--q-surface)',
};

export function DashboardPatternSection() {
  return (
    <Section
      id="dashboard-layout"
      eyebrow="13 · Patterns"
      title="Dashboard layout"
      lead={
        <>
          A reading order that works for most analytics screens: context, filters, headline numbers,
          the main trend, then detail. The <Link to="/examples/storefront">example app</Link>{' '}
          follows it exactly.
        </>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <figure
          aria-label="Wireframe: header, filter bar, four KPIs, trend and ranked list, three breakdowns, detail table"
          style={{
            ...card,
            flex: '1.6 1 480px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            margin: 0,
            padding: 16,
            font: '500 11px var(--q-font-mono)',
            color: 'var(--q-signal-ink)',
          }}
        >
          <div
            style={{
              ...zone,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 40,
              padding: '0 12px',
            }}
          >
            <span>1 · Header</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <span
                style={{
                  width: 52,
                  height: 18,
                  borderRadius: 4,
                  background: 'var(--q-signal-soft-2)',
                }}
              />
              <span
                style={{ width: 34, height: 18, borderRadius: 4, background: 'var(--q-signal)' }}
              />
            </span>
          </div>
          <Zone
            label="2 · Filter bar"
            height={32}
            style={{ display: 'flex', alignItems: 'center', padding: '0 12px' }}
          />
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}
          >
            <Zone label="3 · KPI" height={62} />
            <Zone height={62} />
            <Zone height={62} />
            <Zone height={62} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <Zone label="4 · Primary trend" height={120} />
            <Zone label="5 · Ranked list" height={120} />
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}
          >
            <Zone label="6 · Breakdowns" height={70} />
            <Zone height={70} />
            <Zone height={70} />
          </div>
          <Zone label="7 · Detail table" height={56} />
        </figure>
        <div
          style={{
            ...card,
            flex: '1 1 300px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: 20,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {NOTES.map(([head, body]) => (
            <div key={head}>
              <b style={{ fontWeight: 600 }}>{head}</b>{' '}
              <span style={{ color: 'var(--q-text-2)' }}>{body}</span>
            </div>
          ))}
          <span style={{ font: '400 12px var(--q-font-mono)', color: 'var(--q-text-3)' }}>
            12-col grid · 12px gutters · cards min 280px
          </span>
        </div>
      </div>
    </Section>
  );
}
