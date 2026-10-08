import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LineChart } from './LineChart';

const rows = [
  { date: '2026-09-07', users: 12400, users_previous: 11600 },
  { date: '2026-09-08', users: 12900, users_previous: 11700 },
  { date: '2026-09-09', users: 13300, users_previous: 11900 },
];

describe('LineChart', () => {
  it('renders on the server without measuring', () => {
    const html = renderToString(<LineChart data={rows} x="date" y="users" />);
    expect(html).toContain('role="figure"');
  });

  it('always provides a formatted table and a summary for assistive tech', () => {
    render(<LineChart data={rows} x="date" y="users" compare="users_previous" />);
    const table = screen.getByRole('table');
    expect(table.textContent).toContain('Users');
    expect(table.textContent).toContain('12,400');
    expect(table.textContent).toContain('Previous');
    expect(document.body.textContent).toContain('Users from Sep 7 to Sep 9: up 7.3%');
  });

  it('shows the table instead of the chart with view="table"', () => {
    const { container } = render(<LineChart data={rows} x="date" y="users" view="table" />);
    expect(container.querySelector('.q-chart-table')).not.toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders loading, empty and error states at the same size', () => {
    const { container, rerender } = render(
      <LineChart data={rows} x="date" y="users" loading height={200} />,
    );
    expect(container.querySelector('[data-status="loading"]')).not.toBeNull();
    rerender(<LineChart data={[]} x="date" y="users" height={200} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
    rerender(
      <LineChart
        data={rows}
        x="date"
        y="users"
        error="timeout after 30s"
        errorCode="q_8f2c"
        height={200}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('q_8f2c');
    expect((container.firstChild as HTMLElement).style.height).toBe('200px');
  });
});
