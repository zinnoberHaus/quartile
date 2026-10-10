'use client';
// The cards of the storefront overview. Every view reads the shared <Selection>.
import {
  BarChart,
  BarList,
  Button,
  Card,
  Checkbox,
  type Dataset,
  DataTable,
  type DataTableColumn,
  DonutChart,
  dataset,
  Funnel,
  Heatmap,
  IconChevronDown,
  Legend,
  LineChart,
  Popover,
  type Predicate,
  type Row,
  SegmentedControl,
  Selection,
  type SelectionApi,
  useSelection,
  useSelectionStore,
} from '@quartile/react';
import { type ReactNode, useEffect, useMemo } from 'react';
import { ordersByHour, type PeriodWindow, WEEKDAYS } from '../../data/storefront';
import {
  CHANNEL_COLORS,
  CHART_STYLES,
  type ChartStyle,
  type Fact,
  fmt,
  perBucket,
  productRows,
  SOURCE,
  totals,
} from './model';

const pad2 = (h: unknown) => String(h).padStart(2, '0');

function Hint({ children }: { children: ReactNode }) {
  return <span className="sf-hint">{children}</span>;
}

// ── Net revenue ────────────────────────────────────────────────────────────────

/** Keeps a restored URL selection and chip resets reflected in the chart's local brush. */
function SyncTrendSelection({ predicate }: { predicate: Predicate | undefined }) {
  const local = useSelectionStore();
  useEffect(() => {
    if (!local) return;
    const current = local.get('date');
    if (!predicate) {
      if (current) local.clear('date');
    } else if (
      current?.op !== predicate.op ||
      JSON.stringify(current.value) !== JSON.stringify(predicate.value)
    ) {
      local.set('date', predicate.value, { op: predicate.op, source: SOURCE.trend });
    }
  }, [predicate, local]);
  return null;
}

/**
 * The trend aggregates the linked rows per day (or week), so its brush lives in a local Selection
 * (per-day rows carry no region or product to filter on) and is re-published to the shared one as
 * a `date` predicate.
 */
function TrendPlot({
  facts,
  outer,
  chart,
  compare,
}: {
  facts: Dataset<Fact>;
  outer: SelectionApi;
  chart: ChartStyle;
  compare: boolean;
}) {
  const data = useMemo(
    () =>
      dataset(perBucket(outer.filter(facts.rows, SOURCE.trend)), {
        date: { label: 'Date', format: 'date-short' },
        revenue: { label: 'This period', format: 'currency', currency: 'USD' },
        previous: { label: 'Previous', format: 'currency', currency: 'USD' },
      }),
    [outer, facts],
  );
  const relay = (preds: Predicate[]) => {
    const p = preds.find((q) => q.field === 'date');
    if (p && p.op !== 'eq') outer.set('date', p.value, { op: p.op, source: SOURCE.trend });
    else outer.clear('date');
  };
  const datePredicate = outer.predicates.find((p) => p.field === 'date');
  const label = 'Net revenue per day, this period and previous';
  return (
    <Selection key={chart} onChange={relay}>
      <SyncTrendSelection predicate={datePredicate} />
      {chart === 'Bars' ? (
        <BarChart
          id={SOURCE.trend}
          data={data}
          x="date"
          y={compare ? ['revenue', 'previous'] : 'revenue'}
          colors={['var(--q-signal)', 'var(--q-series-muted)']}
          legend={false}
          select
          height={260}
          aria-label={label}
        />
      ) : (
        <LineChart
          id={SOURCE.trend}
          data={data}
          x="date"
          y="revenue"
          compare={compare ? 'previous' : undefined}
          compareLabel="Previous"
          area={chart === 'Area'}
          brush
          legend={false}
          height={260}
          aria-label={label}
        />
      )}
    </Selection>
  );
}

export function TrendCard({
  facts,
  win,
  chart,
  onChart,
  compare,
  filtersText,
}: {
  facts: Dataset<Fact>;
  win: PeriodWindow;
  chart: ChartStyle;
  onChart: (c: ChartStyle) => void;
  compare: boolean;
  filtersText: string;
}) {
  const outer = useSelection();
  const range = `${fmtDay(win.start)} – ${fmtDay(win.end, true)}`;
  return (
    <Card
      className="sf-trend"
      title="Net revenue"
      subtitle={`${range} · ${win.grain} · ${filtersText}`}
      actions={
        <>
          <Legend
            className="sf-legend"
            items={[
              { key: 'cur', label: 'This period', color: 'var(--q-signal)' },
              ...(compare
                ? [{ key: 'prev', label: 'Previous', color: 'var(--q-series-muted)', dashed: true }]
                : []),
            ]}
          />
          <SegmentedControl
            size="sm"
            options={CHART_STYLES}
            value={chart}
            onChange={(v) => {
              outer.clear('date');
              onChart(v as ChartStyle);
            }}
            aria-label="Chart style"
          />
        </>
      }
    >
      <TrendPlot facts={facts} outer={outer} chart={chart} compare={compare} />
      <div className="sf-card-foot">
        <Hint>
          {chart === 'Bars' ? 'click bars to select days' : 'drag across the chart to select days'}
        </Hint>
      </div>
    </Card>
  );
}

export function fmtDay(d: Date, year = false) {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
  });
}

// ── Revenue by region ──────────────────────────────────────────────────────────

export function RegionCard({ facts, compare }: { facts: Dataset<Fact>; compare: boolean }) {
  return (
    <Card className="sf-region" title="Revenue by region" actions={<Hint>click to filter</Hint>}>
      <BarList
        id={SOURCE.region}
        data={facts}
        category="region"
        value="revenue"
        delta={compare ? 'revenue_change' : undefined}
        format="currency-compact"
        select
        aria-label="Net revenue by region"
      />
    </Card>
  );
}

// ── Channel mix ────────────────────────────────────────────────────────────────

export function ChannelCard({ facts }: { facts: Dataset<Fact> }) {
  return (
    <Card className="sf-channel" title="Channel mix" actions={<Hint>share of revenue</Hint>}>
      <DonutChart
        id={SOURCE.channel}
        data={facts}
        category="channel"
        value="revenue"
        format="currency-compact"
        colors={CHANNEL_COLORS}
        centerLabel="All channels"
        size={132}
        select
        aria-label="Net revenue by channel"
      />
    </Card>
  );
}

// ── Orders by hour ─────────────────────────────────────────────────────────────

export function HoursCard({ facts }: { facts: Dataset<Fact> }) {
  const sel = useSelection();
  const { rows, peak } = useMemo(() => {
    const byChannel: Record<string, number> = {};
    for (const r of sel.filter(facts.rows))
      byChannel[r.channel] = (byChannel[r.channel] ?? 0) + r.orders;
    const grid = ordersByHour(byChannel);
    let best = grid[0];
    for (const c of grid) if (c.orders > best.orders) best = c;
    return { rows: grid, peak: best.orders > 0 ? `${best.weekday} ${pad2(best.hour)}:00` : '—' };
  }, [sel, facts]);
  const data = useMemo(
    () =>
      dataset(rows, {
        weekday: { label: 'Day' },
        hour: { label: 'Hour', format: (h) => `${pad2(h)}:00` },
        orders: { label: 'Orders', format: 'integer' },
      }),
    [rows],
  );
  return (
    <Card className="sf-hours" title="Modeled order timing" actions={<Hint>peak {peak}</Hint>}>
      <Heatmap
        data={data}
        x="hour"
        y="weekday"
        value="orders"
        xOrder={HOURS}
        yOrder={WEEKDAYS}
        xLabels={(h) => pad2(h)}
        cellHeight={15}
        legend
        peak={false}
        selection={false}
        aria-label="Selected orders distributed by modeled weekday and hour"
      />
      <div className="sf-card-foot">
        <Hint>
          Selected-period orders distributed using a fixed weekly profile; not observed timestamps.
        </Hint>
      </div>
    </Card>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

// ── Checkout funnel ────────────────────────────────────────────────────────────

export function FunnelCard({ facts }: { facts: Dataset<Fact> }) {
  const sel = useSelection();
  const t = useMemo(() => totals(sel.filter(facts.rows)), [sel, facts]);
  const steps = useMemo(
    () => [
      { step: 'Sessions', value: Math.round(t.sessions) },
      { step: 'Product views', value: Math.round(t.views) },
      { step: 'Added to cart', value: Math.round(t.carts) },
      { step: 'Checkout', value: Math.round(t.checkouts) },
      { step: 'Purchased', value: Math.round(t.orders) },
    ],
    [t],
  );
  return (
    <Card
      className="sf-funnel"
      title="Checkout funnel"
      actions={<Hint>{Number.isFinite(t.conversion) ? fmt.pct2(t.conversion) : '—'} overall</Hint>}
    >
      <Funnel
        data={steps}
        step="step"
        value="value"
        format="integer"
        overall={false}
        selection={false}
        aria-label="Checkout funnel"
      />
    </Card>
  );
}

// ── Top products ───────────────────────────────────────────────────────────────

export const TOGGLEABLE_COLUMNS = ['category', 'share', 'trend', 'change', 'status'] as const;
export type ToggleColumn = (typeof TOGGLEABLE_COLUMNS)[number];
const COLUMN_LABEL: Record<ToggleColumn, string> = {
  category: 'Category',
  share: 'Share',
  trend: 'Trend',
  change: 'Change',
  status: 'Status',
};

function ColumnsMenu({
  hidden,
  onToggle,
  compare,
}: {
  hidden: ReadonlySet<ToggleColumn>;
  onToggle: (c: ToggleColumn) => void;
  compare: boolean;
}) {
  return (
    <Popover
      label="Columns"
      placement="bottom-end"
      width={200}
      trigger={
        <Button variant="secondary" size="sm" iconEnd={<IconChevronDown size={12} />}>
          Columns
        </Button>
      }
    >
      <div className="sf-columns">
        {TOGGLEABLE_COLUMNS.map((c) => (
          <Checkbox
            key={c}
            label={COLUMN_LABEL[c]}
            checked={!hidden.has(c) && (c !== 'change' || compare)}
            disabled={c === 'change' && !compare}
            description={c === 'change' && !compare ? 'Turn on Compare' : undefined}
            onChange={() => onToggle(c)}
          />
        ))}
      </div>
    </Popover>
  );
}

export function ProductsCard({
  facts,
  compare,
  hidden,
  onToggleColumn,
}: {
  facts: Dataset<Fact>;
  compare: boolean;
  hidden: ReadonlySet<ToggleColumn>;
  onToggleColumn: (c: ToggleColumn) => void;
}) {
  const columns = useMemo(() => {
    const all: (DataTableColumn<Row> & { toggle?: ToggleColumn })[] = [
      {
        field: 'rank',
        label: '#',
        width: 28,
        sortable: false,
        cell: (r) => <span className="sf-rank">{String(r.rank)}</span>,
      },
      { field: 'product', label: 'Product', secondary: 'sku', width: 'minmax(128px, 2fr)' },
      { field: 'category', label: 'Category', cell: 'badge', width: 104, toggle: 'category' },
      {
        field: 'revenue',
        label: 'Revenue',
        cell: 'number',
        format: 'currency-compact',
        width: 88,
      },
      {
        field: 'share',
        label: 'Share',
        cell: 'bar',
        share: true,
        width: 'minmax(100px, 1.2fr)',
        toggle: 'share',
      },
      {
        field: 'trend',
        label: 'Trend',
        cell: 'sparkline',
        width: 'minmax(80px, 96px)',
        toggle: 'trend',
      },
      { field: 'change', label: 'Change', cell: 'delta', toggle: 'change' },
      {
        field: 'status',
        label: 'Status',
        cell: 'status',
        toggle: 'status',
        tones: { 'In stock': 'positive', 'Low stock': 'warning', Backorder: 'negative' },
      },
    ];
    return all
      .filter((c) => !c.toggle || (!hidden.has(c.toggle) && (c.toggle !== 'change' || compare)))
      .map(({ toggle: _, ...c }) => c);
  }, [hidden, compare]);
  return (
    <DataTable
      id={SOURCE.products}
      className="sf-products"
      data={facts}
      transform={productTransform}
      columns={columns}
      rowKey="product"
      select="product"
      defaultSort="-revenue"
      pageSize={8}
      noun="products"
      title="Top products"
      caption="Ranked by net revenue in the selected period · click a row to filter"
      toolbar={<ColumnsMenu hidden={hidden} onToggle={onToggleColumn} compare={compare} />}
      aria-label="Top products"
    />
  );
}

const productTransform = (rows: Fact[]) => productRows(rows);
