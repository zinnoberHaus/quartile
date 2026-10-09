import { fireEvent, render, screen, within } from '@testing-library/react';
import * as Charts from '../charts';
import * as DataDisplay from '../data-display';
import { Selection, useSelection } from '../selection/Selection';
import { SpecView } from './SpecView';
import { SPEC_COMPONENTS } from './schema';

const orders = [
  { date: '2026-09-01', region: 'Europe', product: 'A', amount: 10 },
  { date: '2026-09-01', region: 'Asia', product: 'B', amount: 5 },
  { date: '2026-09-02', region: 'Europe', product: 'A', amount: 30 },
];

describe('SpecView', () => {
  it('applies filters before aggregation once, including filters on the measure itself', () => {
    function Controls() {
      const selection = useSelection();
      return (
        <>
          <button type="button" onClick={() => selection.set('region', 'Europe')}>
            Europe
          </button>
          <button
            type="button"
            onClick={() => selection.set('amount', [15, null], { op: 'between' })}
          >
            Large orders
          </button>
          <button type="button" onClick={() => selection.clear()}>
            Clear
          </button>
        </>
      );
    }
    render(
      <Selection>
        <Controls />
        <SpecView
          data={{ orders }}
          spec={{
            component: 'LineChart',
            data: 'orders',
            x: 'date',
            y: { field: 'amount', aggregate: 'mean' },
            format: 'number',
          }}
        />
        <SpecView
          data={{ orders }}
          spec={{ component: 'KPI', data: 'orders', value: 'amount', label: 'Revenue' }}
        />
      </Selection>,
    );
    const values = () =>
      within(screen.getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.lastElementChild?.textContent);
    expect(values()).toEqual(['7.5', '30']);
    fireEvent.click(screen.getByRole('button', { name: 'Europe' }));
    expect(values()).toEqual(['10', '30']);
    expect(screen.getByRole('group', { name: 'Revenue' }).textContent).toContain('$40');
    fireEvent.click(screen.getByRole('button', { name: 'Large orders' }));
    expect(values()).toEqual(['30']);
    expect(screen.getByRole('group', { name: 'Revenue' }).textContent).toContain('$30');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(values()).toEqual(['7.5', '30']);
  });

  it('shows validation errors instead of rendering malformed dashboard text as React children', () => {
    render(
      <SpecView
        data={{ orders }}
        spec={{ title: { unexpected: true }, description: { bad: true }, layout: [] }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Expected a string, got an object.');
  });

  it('does not compare a post-aggregation sum against a raw-row measure filter', () => {
    function AmountFilter() {
      const selection = useSelection();
      return (
        <button type="button" onClick={() => selection.set('amount', [5, 10], { op: 'between' })}>
          Small orders
        </button>
      );
    }
    render(
      <Selection>
        <AmountFilter />
        <SpecView
          data={{ orders }}
          spec={{
            component: 'LineChart',
            data: 'orders',
            x: 'date',
            y: { field: 'amount', aggregate: 'sum' },
            format: 'number',
          }}
        />
      </Selection>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Small orders' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.lastElementChild?.textContent)).toEqual(['15']);
  });

  it('does not resolve dataset names through Object.prototype', () => {
    render(
      <SpecView
        data={{ orders }}
        spec={{ component: 'LineChart', data: 'toString', x: 'date', y: 'amount' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Dataset “toString” was not provided');
  });

  it('can resolve every component the schema describes', () => {
    const registry = { ...Charts, ...DataDisplay } as Record<string, unknown>;
    const missing = SPEC_COMPONENTS.filter((n) => {
      const c = registry[n];
      return !(typeof c === 'function' || (typeof c === 'object' && c !== null));
    });
    expect(missing).toEqual([]);
  });

  it('renders a valid component spec with the real component', () => {
    render(
      <SpecView
        data={{ orders }}
        spec={{
          component: 'KPI',
          data: 'orders',
          label: 'Revenue',
          value: { field: 'amount', aggregate: 'sum' },
          format: 'number',
        }}
      />,
    );
    expect(screen.getByRole('group', { name: 'Revenue' }).textContent).toContain('45');
  });

  it('maps encodings, groups and sorts in a dashboard', () => {
    render(
      <SpecView
        data={{ orders }}
        spec={{
          title: 'Orders',
          selection: 'spec-test',
          layout: [
            {
              component: 'DataTable',
              data: 'orders',
              groupBy: 'product',
              sort: '-revenue',
              columns: [
                { field: 'product' },
                { key: 'revenue', field: 'amount', aggregate: 'sum', format: 'number' },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Orders' })).toBeTruthy();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['A40', 'B5']);
  });

  it('renders an inline error card for invalid items and keeps the valid ones', () => {
    render(
      <SpecView
        data={{ orders }}
        spec={{
          layout: [
            {
              component: 'KPI',
              data: 'orders',
              label: 'Count',
              value: { field: 'amount', aggregate: 'count' },
            },
            { component: 'PieChart', data: 'orders' },
            { component: 'KPI', data: 'missing', label: 'Nope', value: 'amount' },
          ],
        }}
      />,
    );
    expect(screen.getByRole('group', { name: 'Count' }).textContent).toContain('3');
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0].textContent).toContain('Unknown component "PieChart"');
    expect(alerts[1].textContent).toContain('Dataset “missing” was not provided');
    expect(alerts[1].textContent).toContain('Available datasets: orders.');
  });

  it('reports top-level dashboard errors once', () => {
    render(<SpecView data={{}} spec={{ layout: [], theme: 'dark' }} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('This dashboard spec is not valid');
    expect(alert.textContent).toContain('Unknown property "theme"');
  });
});
