import { render, screen, within } from '@testing-library/react';
import * as Charts from '../charts';
import * as DataDisplay from '../data-display';
import { SpecView } from './SpecView';
import { SPEC_COMPONENTS } from './schema';

const orders = [
  { date: '2026-09-01', region: 'Europe', product: 'A', amount: 10 },
  { date: '2026-09-01', region: 'Asia', product: 'B', amount: 5 },
  { date: '2026-09-02', region: 'Europe', product: 'A', amount: 30 },
];

describe('SpecView', () => {
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
