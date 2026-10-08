import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineChart } from './charts/LineChart';
import { DataTable } from './data-display/DataTable';

describe('regressions', () => {
  it('LineChart sums rows that share an x value', () => {
    const rows = [
      { date: '2026-09-07', region: 'Europe', revenue: 100 },
      { date: '2026-09-07', region: 'Asia', revenue: 50 },
      { date: '2026-09-08', region: 'Europe', revenue: 70 },
    ];
    render(<LineChart data={rows} x="date" y="revenue" />);
    const table = screen.getByRole('table');
    expect(table.textContent).toContain('$150');
    expect(table.textContent).toContain('$70');
  });

  it('DataTable reads a column field into a different key without groupBy', () => {
    const rows = [
      { product: 'Field Jacket', revenue: 120 },
      { product: 'Wool Throw', revenue: 80 },
    ];
    const { container } = render(
      <DataTable
        data={rows}
        columns={[
          { field: 'product' },
          { key: 'revenue_label', field: 'revenue', label: 'Revenue' },
        ]}
      />,
    );
    expect(container.textContent).toContain('$120');
    expect(container.textContent).not.toContain('NaN');
  });
});
