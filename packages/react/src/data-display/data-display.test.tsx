import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Selection, type SelectionApi, useSelection } from '../selection/Selection';
import { DataTable } from './DataTable';
import { FilterBar } from './FilterBar';
import { KPI } from './KPI';
import { aggregateRows, seriesBy, sparkPaths } from './shared';
import { groupRows, halfChange, parseSort, sortRows } from './table-model';

const rows = [
  { date: '2026-09-01', region: 'Europe', product: 'A', amount: 10, previous: 8 },
  { date: '2026-09-01', region: 'Asia', product: 'B', amount: 5, previous: 5 },
  { date: '2026-09-02', region: 'Europe', product: 'A', amount: 30, previous: 20 },
  { date: '2026-09-03', region: 'Europe', product: 'B', amount: 20, previous: 25 },
  { date: '2026-09-04', region: 'Asia', product: 'A', amount: 40, previous: 30 },
];

describe('aggregates', () => {
  it('sums, counts, averages and handles empty input', () => {
    expect(aggregateRows(rows, 'amount', 'sum')).toBe(105);
    expect(aggregateRows(rows, undefined, 'count')).toBe(5);
    expect(aggregateRows(rows, 'amount', 'mean')).toBe(21);
    expect(aggregateRows(rows, 'amount', 'min')).toBe(5);
    expect(aggregateRows(rows, 'amount', 'max')).toBe(40);
    expect(aggregateRows([], 'amount', 'sum')).toBe(0);
    expect(aggregateRows([], 'amount', 'mean')).toBeNaN();
  });

  it('builds a zero-filled series per distinct value, in order', () => {
    expect(seriesBy(rows, 'date', 'amount')).toEqual([15, 30, 20, 40]);
    const a = rows.filter((r) => r.product === 'A');
    const domain = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
    expect(seriesBy(a, 'date', 'amount', 'sum', domain)).toEqual([10, 30, 0, 40]);
  });

  it('draws nothing for an empty series and a flat line for constant values', () => {
    expect(sparkPaths([], 100, 28)).toEqual({ line: '', area: '' });
    expect(sparkPaths([3, 3, 3], 100, 28).line).toContain('14');
  });
});

describe('table model', () => {
  it('parses sort strings', () => {
    expect(parseSort('-revenue')).toEqual({ key: 'revenue', desc: true });
    expect(parseSort('name')).toEqual({ key: 'name', desc: false });
    expect(parseSort('')).toBeNull();
  });

  it('sorts stably with empty values last in both directions', () => {
    const data = [{ v: 2 }, { v: null }, { v: 1 }, { v: 2, tag: 'second' }, { v: Number.NaN }];
    expect(sortRows(data, { key: 'v', desc: false }).map((r) => r.v)).toEqual([
      1,
      2,
      2,
      null,
      Number.NaN,
    ]);
    const desc = sortRows(data, { key: 'v', desc: true });
    expect(desc.map((r) => r.v)).toEqual([2, 2, 1, null, Number.NaN]);
    expect(desc[1]).toHaveProperty('tag', 'second');
    expect(
      sortRows([{ d: '2026-09-10' }, { d: '2026-09-02' }], { key: 'd', desc: false }).map(
        (r) => r.d,
      ),
    ).toEqual(['2026-09-02', '2026-09-10']);
  });

  it('compares the later half of a series with the earlier half', () => {
    expect(halfChange([10, 10, 15, 15])).toBeCloseTo(0.5);
    expect(halfChange([10, 999, 20])).toBeCloseTo(1);
    expect(halfChange([5])).toBeNaN();
    expect(halfChange([0, 0, 1, 1])).toBeNaN();
  });

  it('groups rows and writes one value per column key', () => {
    const out = groupRows(rows, 'product', [
      { field: 'product' },
      { key: 'revenue', field: 'amount', aggregate: 'sum' },
      { key: 'orders', field: 'amount', aggregate: 'count' },
      { key: 'trend', field: 'amount', cell: 'sparkline', over: 'date' },
      { key: 'change', field: 'amount', cell: 'delta', over: 'date' },
    ]);
    expect(out.map((r) => r.product)).toEqual(['A', 'B']);
    expect(out[0]).toMatchObject({ revenue: 80, orders: 3, trend: [10, 30, 0, 40] });
    expect(out[1]).toMatchObject({ revenue: 25, orders: 2, trend: [5, 0, 20, 0] });
    expect(out[0].change).toBeCloseTo(40 / 40 - 1);
    expect(out[1].change).toBeCloseTo(20 / 5 - 1);
    // Fields no column writes keep the group's first value.
    expect(out[0].region).toBe('Europe');
  });
});

function Probe({ onApi }: { onApi: (api: SelectionApi) => void }) {
  const api = useSelection();
  useEffect(() => {
    onApi(api);
  });
  return null;
}

describe('KPI', () => {
  it('formats a static value with its delta and comparison', () => {
    render(
      <KPI
        label="Net revenue"
        value={1_320_000}
        format="currency"
        delta={0.046}
        comparison="vs. previous 30 days"
        unit="USD"
      />,
    );
    const card = screen.getByRole('group', { name: 'Net revenue' });
    expect(card.textContent).toContain('$1.32M');
    expect(card.textContent).toContain('+4.6%');
    expect(card.textContent).toContain('vs. previous 30 days');
    expect(card.textContent).toContain('USD');
  });

  it('shows target progress and pace', () => {
    render(
      <KPI
        label="Q3 revenue"
        value={1_320_000}
        format="currency"
        target={{ value: 1_500_000, expected: 0.93 }}
      />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('88');
    expect(screen.getByText('88% of target')).toBeTruthy();
    expect(screen.getByText('on pace · 93% expected')).toBeTruthy();
  });

  it('computes a percentage-point delta for rates in compare mode', () => {
    render(
      <KPI
        label="Conversion rate"
        format="percent"
        compare={{ current: 0.0312, previous: 0.0314 }}
      />,
    );
    const card = screen.getByRole('group', { name: 'Conversion rate' });
    expect(card.textContent).toContain('3.12%');
    expect(card.textContent).toContain('3.14%');
    expect(card.textContent).toContain('−0.02 pt');
  });

  it('aggregates linked rows and follows the selection', () => {
    let api: SelectionApi | undefined;
    render(
      <Selection id="kpi-test">
        <Probe onApi={(a) => (api = a)} />
        <KPI label="Revenue" data={rows} value="amount" compareValue="previous" format="number" />
      </Selection>,
    );
    const card = screen.getByRole('group', { name: 'Revenue' });
    expect(card.textContent).toContain('105');
    expect(card.textContent).toContain('+19.3%');
    act(() => api?.set('region', 'Asia'));
    expect(card.textContent).toContain('45');
    expect(card.textContent).toContain('+28.6%');
  });
});

describe('DataTable', () => {
  it('sorts by the header and publishes the selected row', () => {
    let api: SelectionApi | undefined;
    render(
      <Selection id="orders-test">
        <Probe onApi={(a) => (api = a)} />
        <DataTable
          data={rows}
          groupBy="product"
          select="product"
          defaultSort="-revenue"
          columns={[
            { field: 'product', label: 'Product' },
            {
              key: 'revenue',
              field: 'amount',
              label: 'Revenue',
              aggregate: 'sum',
              format: 'number',
            },
          ]}
        />
        <KPI label="Total" data={rows} value="amount" format="number" />
      </Selection>,
    );
    const grid = screen.getByRole('grid');
    const bodyRows = () => within(grid).getAllByRole('row').slice(1);
    expect(bodyRows().map((r) => r.textContent)).toEqual(['A80', 'B25']);

    fireEvent.click(screen.getByRole('button', { name: /Revenue/ }));
    expect(bodyRows().map((r) => r.textContent)).toEqual(['B25', 'A80']);
    expect(screen.getByRole('columnheader', { name: /Revenue/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );

    fireEvent.click(bodyRows()[0]);
    expect(api?.get('product')).toMatchObject({ op: 'in', value: ['B'] });
    expect(bodyRows()[0].getAttribute('aria-selected')).toBe('true');
    // The table does not filter itself; the KPI does.
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Total' }).textContent).toContain('25');
    expect(screen.getByText(/1 selected · published to “orders-test”/)).toBeTruthy();

    fireEvent.keyDown(bodyRows()[0], { key: 'ArrowDown' });
    fireEvent.keyDown(bodyRows()[1], { key: 'Enter' });
    expect(api?.get('product')).toMatchObject({ value: ['B', 'A'] });
  });

  it('paginates', () => {
    render(<DataTable data={rows} pageSize={2} noun="orders" columns={[{ field: 'product' }]} />);
    expect(screen.getByText('1–2 of 5 orders')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('3–4 of 5 orders')).toBeTruthy();
  });

  it('renders only a window of rows past the virtualization threshold', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: i * 2 }));
    render(<DataTable data={many} columns={[{ field: 'id' }, { field: 'value' }]} height={300} />);
    const table = screen.getByRole('table');
    expect(table.getAttribute('aria-rowcount')).toBe('1001');
    const rendered = within(table).getAllByRole('row').length - 1;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
  });

  it('shows an empty state with a way out when the selection hides every row', () => {
    let api: SelectionApi | undefined;
    render(
      <Selection>
        <Probe onApi={(a) => (api = a)} />
        <DataTable data={rows} columns={[{ field: 'product' }]} />
      </Selection>,
    );
    act(() => api?.set('region', 'Nowhere'));
    expect(screen.getByText('No rows match')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(api?.predicates).toEqual([]);
  });
});

describe('FilterBar', () => {
  it('mirrors predicates from other publishers and clears them', () => {
    let api: SelectionApi | undefined;
    render(
      <Selection id="fb-test">
        <Probe onApi={(a) => (api = a)} />
        <FilterBar
          data={rows}
          fields={[{ field: 'region', label: 'Region' }]}
          summary={(r) => `${r.length} orders`}
        />
      </Selection>,
    );
    expect(screen.getByText('5 orders')).toBeTruthy();
    act(() => api?.set('date', ['2026-09-01', '2026-09-02'], { op: 'between', source: 'chart' }));
    expect(screen.getByText('Sep 1 – Sep 2')).toBeTruthy();
    expect(screen.getByText('3 orders')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Date filter' }));
    expect(api?.predicates).toEqual([]);
  });

  it('sets values from the chip menu', () => {
    let api: SelectionApi | undefined;
    render(
      <Selection>
        <Probe onApi={(a) => (api = a)} />
        <FilterBar data={rows} fields={[{ field: 'region', label: 'Region' }]} />
      </Selection>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Region/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Europe/ }));
    expect(api?.get('region')).toMatchObject({ op: 'in', value: ['Europe'] });
    expect(screen.getByRole('button', { name: 'Clear Region filter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(api?.predicates).toEqual([]);
  });
});
