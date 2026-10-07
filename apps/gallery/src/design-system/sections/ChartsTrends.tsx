// Owner: charts-trends. Line, stacked area, grouped bars, bar list, donut, sparklines, funnel.
import {
  AreaChart,
  BarChart,
  BarList,
  DonutChart,
  deltaTone,
  Funnel,
  formatDelta,
  LineChart,
  makeFormatter,
  Selection,
  Sparkline,
} from '@quartile/react';
import type { CSSProperties } from 'react';
import { monthsByYear, paidOrders, regionRevenue, sparkRows } from '../../data/charts-trends';
import { daily, funnel, monthlyByChannel } from '../../data/kestrel';
import { Demo } from '../Section';

const note: CSSProperties = {
  marginTop: 10,
  font: '400 11px var(--q-font-mono)',
  color: 'var(--q-text-3)',
};

function DeltaBadge({ value, kind }: { value: number; kind: 'percent' | 'pt' }) {
  const tone = deltaTone(value);
  return (
    <span
      style={{
        justifySelf: 'end',
        padding: '2px 6px',
        borderRadius: 6,
        font: '500 11px var(--q-font-mono)',
        whiteSpace: 'nowrap',
        background:
          tone === 'positive'
            ? 'var(--q-positive-soft)'
            : tone === 'negative'
              ? 'var(--q-negative-soft)'
              : 'var(--q-subtle)',
        color:
          tone === 'positive'
            ? 'var(--q-positive-ink)'
            : tone === 'negative'
              ? 'var(--q-negative-ink)'
              : 'var(--q-text-2)',
      }}
    >
      {formatDelta(value, kind)}
    </span>
  );
}

function SparklineList() {
  return (
    <div>
      {sparkRows.map((r) => (
        <div
          key={r.key}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(48px, 120px) auto auto',
            alignItems: 'center',
            gap: 10,
            height: 40,
            borderBottom: '1px solid var(--q-grid)',
            fontSize: 13,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.label}
          </span>
          <Sparkline data={daily} x="date" y={r.key} area height={28} aria-label={r.label} />
          <span
            style={{
              textAlign: 'right',
              font: '500 13px var(--q-font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {makeFormatter(r.format)(r.value)}
          </span>
          <DeltaBadge value={r.change} kind={r.kind} />
        </div>
      ))}
      <div style={note}>30 days · change is the last 7 days vs the first 7</div>
    </div>
  );
}

export function ChartsTrends() {
  return (
    <>
      <Demo
        className="g-wide"
        title="Revenue by channel"
        code={'<LineChart x="month" y="revenue" color="channel" />'}
      >
        <LineChart
          data={monthlyByChannel}
          x="month"
          y="revenue"
          color="channel"
          xFormat="month"
          format="currency-compact"
          annotations={[{ x: '2026-03-01', label: 'Mar ’26 · pricing change' }]}
          height={290}
          aria-label="Monthly revenue by channel"
        />
      </Demo>

      <Demo title="Stacked area" aside="<AreaChart stack />">
        <AreaChart
          data={monthlyByChannel}
          x="month"
          y="revenue"
          color="channel"
          stack
          xFormat="month"
          format="currency-compact"
          height={210}
          aria-label="Monthly revenue by channel, stacked"
        />
      </Demo>

      <Demo title="Grouped bars" aside={'<BarChart group="year" select />'}>
        <Selection>
          <BarChart
            data={monthsByYear}
            x="month"
            y="revenue"
            group="year"
            colors={['var(--q-line-strong)', 'var(--q-signal)']}
            format="currency-compact"
            select
            height={210}
            aria-label="Revenue by month, 2025 against 2026"
          />
        </Selection>
      </Demo>

      <Demo title="Bar list" aside={'<BarList variant="fill" delta="change" select />'}>
        <Selection>
          <BarList
            data={regionRevenue}
            category="region"
            value="revenue"
            delta="change"
            variant="fill"
            select
            aria-label="Revenue by region"
          />
        </Selection>
        <div style={note}>Last 15 days · change vs the 15 days before</div>
      </Demo>

      <Demo title="Donut" aside={'<DonutChart category="channel" select />'}>
        <Selection>
          <DonutChart
            data={paidOrders}
            category="channel"
            value="amount"
            select
            size={140}
            aria-label="Order revenue by channel"
          />
        </Selection>
      </Demo>

      <Demo title="Sparklines" aside="<Sparkline area />">
        <SparklineList />
      </Demo>

      <Demo title="Funnel" aside={'<Funnel align="center" />'}>
        <Funnel
          data={funnel}
          step="step"
          value="value"
          align="center"
          aria-label="Checkout funnel"
        />
      </Demo>
    </>
  );
}
