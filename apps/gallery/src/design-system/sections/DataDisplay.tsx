import {
  DataTable,
  type DataTableColumn,
  FilterBar,
  KPI,
  Selection,
  useSelectionStore,
} from '@quartile/react';
import { type CSSProperties, useEffect } from 'react';
import { orderData, ordersSummary, STOCK_TONES } from '../../data/data-display';
import { Section } from '../Section';

/** Top products, aggregated per product from raw orders so every filter applies. */
const topProductColumns: DataTableColumn[] = [
  { field: 'product', label: 'Product', secondary: 'sku' },
  { field: 'category', label: 'Category', cell: 'badge' },
  {
    key: 'revenue',
    field: 'amount',
    label: 'Revenue',
    aggregate: 'sum',
    format: 'currency-compact',
  },
  { key: 'share', field: 'amount', label: 'Share', aggregate: 'sum', cell: 'bar', share: true },
  { key: 'trend', field: 'amount', label: 'Trend', cell: 'sparkline', over: 'date' },
  { key: 'change', field: 'amount', label: 'Change', cell: 'delta', over: 'date' },
  { field: 'stock', label: 'Status', cell: 'status', tones: STOCK_TONES },
];

const kpiRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
  gap: 16,
};

/** Starts the demo with a region chip and a date range another view could have brushed. */
function StartingSelection() {
  const store = useSelectionStore();
  useEffect(() => {
    if (!store || store.getSnapshot().length > 0) return;
    store.set('region', ['Europe'], { op: 'in', source: 'dd-filters' });
    store.set('date', ['2026-09-21', '2026-10-04'], { op: 'between', source: 'dd-brush' });
  }, [store]);
  return null;
}

export function DataDisplaySection() {
  return (
    <Section
      id="data-display"
      eyebrow="10 · Components"
      title="Data display"
      lead="The layer between charts and UI. A KPI always states its comparison. A table cell can hold a bar, a sparkline or a delta, and every row can be selected into the shared state."
    >
      <Selection id="orders">
        <StartingSelection />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={kpiRow}>
            <KPI
              label="Net revenue"
              data={orderData}
              value="amount"
              compareValue="previous_amount"
              trendBy="date"
              format="currency-compact"
              unit="USD"
              comparison="vs. previous period"
            />
            <KPI
              label="Revenue vs. target"
              data={orderData}
              value="amount"
              format="currency-compact"
              unit="USD"
              target={{ value: 450_000, expected: 0.93 }}
            />
            <KPI
              label="Conversion rate"
              format="percent"
              unit="RATE"
              compare={{ current: 0.0312, previous: 0.0314 }}
            />
          </div>
          <FilterBar
            id="dd-filters"
            data={orderData}
            fields={[
              { field: 'region', label: 'Region' },
              { field: 'channel', label: 'Channel' },
              { field: 'category', label: 'Category', pinned: false },
              { field: 'status', label: 'Payment', pinned: false },
            ]}
            summary={ordersSummary}
          />
          <DataTable
            id="dd-products"
            data={orderData}
            groupBy="product"
            select="product"
            rank
            defaultSort="-revenue"
            pageSize={5}
            noun="products"
            title="Top products"
            caption="Ranked by revenue in the selection. Change compares the later half of the period with the earlier half."
            columns={topProductColumns}
            footer="Virtualizes past 200 rows"
          />
        </div>
      </Selection>
    </Section>
  );
}
