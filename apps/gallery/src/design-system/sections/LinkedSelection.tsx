import {
  DataTable,
  dataset,
  describePredicate,
  FilterBar,
  KPI,
  type KPIProps,
  LineChart,
  makeFormatter,
  type Predicate,
  Selection,
  type SelectionApi,
  type SelectionEvent,
  useSelection,
  useSelectionStore,
} from '@quartile/react';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { type OrderLine, orderData, orderLines, ordersSummary } from '../../data/data-display';
import { Section } from '../Section';

const TREND = 'ls-trend';
const SOURCES: Record<string, string> = {
  [TREND]: 'LineChart',
  'ls-table': 'DataTable',
  'ls-filters': 'FilterBar',
};
const PUBLISHERS: [string, string][] = [
  [TREND, 'brush'],
  ['ls-table', 'click'],
  ['ls-filters', 'chip'],
];
const SUBSCRIBERS = ['KPI.Group', 'LineChart', 'DataTable'];
const DESCRIBE_SCHEMA = { date: orderData.schema.date };
const int = makeFormatter('integer');

const mono = (size: number, color = 'var(--q-text-3)'): CSSProperties => ({
  font: `500 ${size}px var(--q-font-mono)`,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color,
});

const card: CSSProperties = {
  minWidth: 0,
  border: '1px solid var(--q-line)',
  borderRadius: 14,
  background: 'var(--q-surface)',
};

/** Side by side when there is room; stacked, with the arrows turned down, when there is not. */
const FLOW_CSS = `
.ls-flow > * { min-width: 0; }
@container (max-width: 720px) {
  .ls-flow { flex-direction: column; }
  .ls-flow > * { flex: none !important; }
  .ls-flow > .ls-arrow { height: 24px; transform: rotate(90deg); }
}`;

function Diagram({ last }: { last: string | null }) {
  const sel = useSelection();
  const count = useMemo(() => sel.filter(orderLines).length, [sel]);
  const lines = sel.predicates.map((p) => describePredicate(p, DESCRIBE_SCHEMA));
  const box = (active: boolean, sub = false): CSSProperties => ({
    padding: '10px 12px',
    border: `1px solid ${active ? 'var(--q-signal)' : sub ? 'var(--q-signal-soft-2)' : 'var(--q-line)'}`,
    borderRadius: 10,
    background: sub ? 'var(--q-signal-soft)' : 'var(--q-surface)',
    fontSize: 13,
    transition: 'border-color 180ms',
  });
  const arrow = (
    <div
      aria-hidden="true"
      className="ls-arrow"
      style={{
        flex: '0 0 28px',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--q-signal)',
        fontSize: 20,
      }}
    >
      →
    </div>
  );
  return (
    <div style={{ ...card, padding: 20, containerType: 'inline-size' }}>
      <style>{FLOW_CSS}</style>
      <div className="ls-flow" style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={mono(10.5)}>Publishers</span>
          {PUBLISHERS.map(([id, how]) => (
            <span key={id} style={box(last === id)}>
              {SOURCES[id]} <span style={{ color: 'var(--q-text-3)' }}>· {how}</span>
            </span>
          ))}
        </div>
        {arrow}
        <div
          style={{
            flex: '1.4 1 260px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 10,
            padding: 16,
            borderRadius: 12,
            background: 'var(--q-inverse)',
            color: 'var(--q-inverse-text)',
          }}
        >
          <span style={mono(10.5, '#9da9ff')}>Selection · {sel.id}</span>
          <span
            aria-live="polite"
            style={{ font: '400 12.5px/1.6 var(--q-font-mono)', overflowWrap: 'anywhere' }}
          >
            {lines.length === 0 ? (
              <span style={{ color: 'var(--q-inverse-text-2)' }}>
                No predicates: every view shows every row.
              </span>
            ) : (
              lines.map((l, i) => (
                <span key={i} style={{ display: 'block' }}>
                  {i > 0 ? '∧ ' : ''}
                  {l}
                </span>
              ))
            )}
          </span>
          <span style={{ font: '400 11px var(--q-font-mono)', color: 'var(--q-inverse-text-2)' }}>
            {lines.length} predicate{lines.length === 1 ? '' : 's'} · {int(count)} rows
          </span>
        </div>
        {arrow}
        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={mono(10.5)}>Subscribers</span>
          {SUBSCRIBERS.map((s) => (
            <span key={s} style={box(false, true)}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Syntax colors from the design's code blocks (dark surface in both themes).
const C = { kw: '#b07ef2', fn: '#9da9ff', str: '#2dc8b9', cm: '#6f6b61' };

function Code() {
  const s = (t: string) => <span style={{ color: C.str }}>{t}</span>;
  const cm = (t: string) => <span style={{ color: C.cm }}>{t}</span>;
  return (
    <pre
      style={{
        margin: 0,
        padding: '16px 18px',
        overflow: 'auto',
        font: '400 13px/1.7 var(--q-font-mono)',
        color: 'var(--q-inverse-text-2)',
        background: 'var(--q-code-bg)',
        borderRadius: 14,
      }}
    >
      <code>
        <span style={{ color: C.kw }}>const</span> sel ={' '}
        <span style={{ color: C.fn }}>useSelection</span>({s("'orders'")});{'\n'}
        sel.predicates;{'          '}
        {cm("// [{ field: 'date', op: 'between', … }, …]")}
        {'\n'}
        sel.set({s("'region'")}, {s("'Europe'")});{'  '}
        {cm('// publish from anywhere')}
        {'\n'}
        sel.clear({s("'date'")});{'             '}
        {cm('// FilterBar chip × does this')}
      </code>
    </pre>
  );
}

/**
 * The trend reads orders filtered by everything except its own brush, aggregated per day. Its
 * brush lives in a local Selection (the per-day rows have no region or category to filter on)
 * and is re-published to the shared one as a `date` range.
 */
function Trend({ outer }: { outer: SelectionApi }) {
  const perDay = useMemo(() => {
    const byDay = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const o of outer.filter(orderLines, TREND)) {
      const d = byDay.get(o.date) ?? { date: o.date, revenue: 0, orders: 0 };
      d.revenue += o.amount;
      d.orders += 1;
      byDay.set(o.date, d);
    }
    return dataset(
      [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      {
        revenue: 'currency',
      },
    );
  }, [outer]);
  const relay = (preds: Predicate[]) => {
    const p = preds.find((q) => q.field === 'date');
    if (p?.op === 'between') outer.set('date', p.value, { op: 'between', source: TREND });
    else outer.clear('date');
  };
  return (
    <Selection onChange={relay}>
      <ClearWhenOuterClears outerHasBrush={outer.predicates.some((p) => p.source === TREND)} />
      <LineChart
        data={perDay}
        x="date"
        y="revenue"
        area
        brush
        height={200}
        aria-label="Revenue per day"
      />
    </Selection>
  );
}

function ClearWhenOuterClears({ outerHasBrush }: { outerHasBrush: boolean }) {
  const local = useSelectionStore();
  useEffect(() => {
    if (!outerHasBrush && local?.get('date')) local.clear('date');
  }, [outerHasBrush, local]);
  return null;
}

const kpis: KPIProps<OrderLine>[] = [
  { label: 'Orders', aggregate: 'count', format: 'integer', comparison: 'in the selection' },
  { label: 'Revenue', value: 'amount', format: 'currency-compact', comparison: 'gross' },
  {
    label: 'Avg. order',
    value: 'amount',
    aggregate: 'mean',
    format: 'currency',
    comparison: 'per order',
  },
  {
    label: 'Refund rate',
    aggregate: (rows) => rows.filter((r) => r.status === 'Refunded').length / rows.length,
    format: 'percent',
    comparison: 'of orders',
  },
];

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 8,
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        {hint && (
          <span style={{ font: '400 11.5px var(--q-font-mono)', color: 'var(--q-text-3)' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Demo() {
  const outer = useSelection();
  return (
    <div
      style={{
        ...card,
        flex: '2 1 560px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        padding: 20,
      }}
    >
      <FilterBar
        id="ls-filters"
        data={orderData}
        fields={[
          { field: 'region', label: 'Region' },
          { field: 'channel', label: 'Channel' },
        ]}
        summary={ordersSummary}
      />
      <KPI.Group data={orderData} items={kpis} variant="strip" />
      <Panel title="Revenue per day" hint="drag to brush · click to clear">
        <Trend outer={outer} />
      </Panel>
      <DataTable
        id="ls-table"
        data={orderData}
        groupBy="category"
        select="category"
        defaultSort="-revenue"
        title="Revenue by category"
        caption="Click rows to select categories"
        columns={[
          { field: 'category', label: 'Category' },
          { key: 'orders', field: 'id', label: 'Orders', aggregate: 'count' },
          {
            key: 'revenue',
            field: 'amount',
            label: 'Revenue',
            aggregate: 'sum',
            format: 'currency-compact',
          },
          {
            key: 'share',
            field: 'amount',
            label: 'Share',
            aggregate: 'sum',
            cell: 'bar',
            share: true,
          },
        ]}
      />
    </div>
  );
}

interface LogEntry {
  id: number;
  time: string;
  verb: string;
  text: string;
  by?: string;
}

let logId = 0;

function entryOf(e: SelectionEvent): LogEntry {
  const time = new Date(e.at).toLocaleTimeString('en-US', { hour12: false });
  if (e.type === 'set' && e.predicate) {
    return {
      id: ++logId,
      time,
      verb: 'set',
      text: describePredicate(e.predicate, DESCRIBE_SCHEMA),
      by: e.source ? SOURCES[e.source] : undefined,
    };
  }
  return { id: ++logId, time, verb: 'clear', text: e.field ?? 'all' };
}

function Log({ entries }: { entries: LogEntry[] }) {
  return (
    <div
      style={{
        ...card,
        flex: '1 1 280px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 20,
        minHeight: 280,
        position: 'sticky',
        top: 72,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={mono(10.5)}>Selection log</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            font: '400 11px var(--q-font-mono)',
            color: 'var(--q-positive-ink)',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--q-positive)' }} />
          live
        </span>
      </div>
      <ol
        aria-live="polite"
        aria-label="Selection events, newest first"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          font: '400 12px/1.5 var(--q-font-mono)',
          color: 'var(--q-text-2)',
        }}
      >
        {entries.map((e) => (
          <li key={e.id} style={{ display: 'flex', gap: 10, minWidth: 0 }}>
            <span style={{ flex: 'none', color: 'var(--q-text-4)' }}>{e.time}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <span
                style={{
                  color: e.verb === 'set' ? 'var(--q-signal-ink)' : 'var(--q-negative-ink)',
                }}
              >
                {e.verb}
              </span>{' '}
              <span style={{ color: 'var(--q-text)' }}>{e.text}</span>
              {e.by && <span style={{ color: 'var(--q-text-3)' }}> · {e.by}</span>}
            </span>
          </li>
        ))}
        <li style={{ display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--q-text-4)' }}>ready</span>
          <span>selection “orders” · {int(orderLines.length)} rows</span>
        </li>
      </ol>
    </div>
  );
}

export function LinkedSelectionSection() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const onChange = (_: Predicate[], e: SelectionEvent) => {
    setEntries((l) => [entryOf(e), ...l].slice(0, 12));
    if (e.type === 'set') setLast(e.source ?? null);
  };
  return (
    <Section
      id="linked-selection"
      eyebrow="14 · Patterns"
      title="Linked selection"
      lead="Publishers write predicates, the store combines them, subscribers re-query. A view never filters itself by its own selection, so you can always see what you left out."
    >
      <Selection id="orders" onChange={onChange}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Diagram last={last} />
          <Code />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            <Demo />
            <Log entries={entries} />
          </div>
        </div>
      </Selection>
    </Section>
  );
}
