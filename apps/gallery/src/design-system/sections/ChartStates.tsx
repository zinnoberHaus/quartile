// Owner: charts-trends. The loading, empty and error states every chart has built in.
import { BarChart, Button } from '@quartile/react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { paidOrders as orders } from '../../data/charts-trends';
import { Demo, Section } from '../Section';

const footnote: CSSProperties = {
  marginTop: 12,
  font: '400 11px var(--q-font-mono)',
  color: 'var(--q-text-3)',
};

const linkButton: CSSProperties = {
  padding: 0,
  border: 0,
  background: 'none',
  font: 'inherit',
  color: 'var(--q-signal)',
  cursor: 'pointer',
};

const CHART_H = 150;

/** Example filters that match nothing: the sample data starts on Sep 7. */
const EMPTY_FILTERS = { region: 'Europe', category: 'Kids', from: '2026-09-01', to: '2026-09-03' };

function EmptyDemo() {
  const [filtered, setFiltered] = useState(true);
  const rows = useMemo(
    () =>
      filtered
        ? orders.filter(
            (o) =>
              o.region === EMPTY_FILTERS.region &&
              o.category === EMPTY_FILTERS.category &&
              o.date >= EMPTY_FILTERS.from &&
              o.date <= EMPTY_FILTERS.to,
          )
        : orders,
    [filtered],
  );
  return (
    <Demo title="Net revenue" aside={rows.length ? 'ready' : 'empty'}>
      <BarChart
        data={rows}
        x="date"
        y="amount"
        height={CHART_H}
        aria-label="Net revenue by day"
        empty={{
          title: 'No orders match these filters',
          description: `${EMPTY_FILTERS.region} · ${EMPTY_FILTERS.category} · Sep 1–3 returned 0 rows.`,
          action: (
            <Button size="sm" onClick={() => setFiltered(false)}>
              Clear filters
            </Button>
          ),
        }}
      />
      <div style={footnote}>
        {filtered ? (
          'Keeps axes off; never shows a flat zero line.'
        ) : (
          <button type="button" style={linkButton} onClick={() => setFiltered(true)}>
            Restore the filters
          </button>
        )}
      </div>
    </Demo>
  );
}

function ErrorDemo() {
  const [state, setState] = useState<'error' | 'loading' | 'ready'>('error');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const retry = () => {
    setState('loading');
    timer.current = setTimeout(() => setState('ready'), 1200);
  };
  return (
    <Demo
      title="Net revenue"
      aside={
        <span style={{ color: state === 'error' ? 'var(--q-negative-ink)' : undefined }}>
          {state}
        </span>
      }
    >
      <BarChart
        data={orders}
        x="date"
        y="amount"
        height={CHART_H}
        aria-label="Net revenue by day"
        loading={state === 'loading' ? 'Retrying…' : false}
        error={state === 'error' ? 'timeout after 30s' : null}
        errorCode="q_8f2c"
        onRetry={retry}
      />
      <div style={footnote}>
        {state === 'ready' ? (
          <button type="button" style={linkButton} onClick={() => setState('error')}>
            Simulate the timeout again
          </button>
        ) : (
          'Query id is copyable for support.'
        )}
      </div>
    </Demo>
  );
}

export function ChartStatesSection() {
  return (
    <Section
      id="chart-states"
      eyebrow="12 · Visualization"
      title="Chart states"
      lead="Every chart has a loading, empty and error state built in. They keep the card's size so the layout never jumps, and they always offer the next action."
    >
      <div className="g-grid-3">
        <Demo title="Net revenue" aside="loading">
          {/* The caption is the chart's `loading` prop; the row count is example copy. */}
          <BarChart
            data={orders}
            x="date"
            y="amount"
            height={CHART_H + 26}
            loading="Querying 2.4M rows…"
            aria-label="Net revenue by day"
          />
        </Demo>
        <EmptyDemo />
        <ErrorDemo />
      </div>
    </Section>
  );
}
