import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Predicate } from '../data/predicates';
import { Selection } from '../selection/Selection';
import { BoxPlot } from './BoxPlot';
import { CalendarHeatmap } from './CalendarHeatmap';
import { Heatmap } from './Heatmap';
import { Histogram } from './Histogram';
import { Sankey } from './Sankey';
import { ScatterPlot } from './ScatterPlot';

// jsdom has no layout: give every element a width so charts render their plots.
let restore: () => void;
beforeAll(() => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 200,
      width: 400,
      height: 200,
      toJSON() {},
    }) as DOMRect;
  restore = () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
});
afterAll(() => restore());

const lengths = [1, 1.5, 2, 2.2, 2.4, 3, 3.1, 4, 6, 9].map((minutes) => ({ minutes }));
const days = [
  { date: '2026-09-07', orders: 4 },
  { date: '2026-09-07', orders: 2 },
  { date: '2026-09-08', orders: 9 },
  { date: '2026-09-10', orders: 1 },
];
const points = [
  { campaign: 'A', channel: 'Email', sessions: 100, conversion_rate: 0.02, revenue: 50 },
  { campaign: 'B', channel: 'Direct', sessions: 300, conversion_rate: 0.03, revenue: 90 },
  { campaign: 'C', channel: 'Email', sessions: 500, conversion_rate: 0.05, revenue: 20 },
];
const amounts = [
  ...[10, 20, 30, 40, 50].map((amount) => ({ region: 'Europe', amount })),
  ...[5, 6, 7, 8, 90].map((amount) => ({ region: 'Asia', amount })),
];
const flows = [
  { channel: 'Email', outcome: 'Purchased', sessions: 40 },
  { channel: 'Email', outcome: 'Bounced', sessions: 60 },
  { channel: 'Direct', outcome: 'Purchased', sessions: 25 },
];
const hours = [
  { weekday: 'Mon', hour: 9 },
  { weekday: 'Mon', hour: 9 },
  { weekday: 'Tue', hour: 19 },
  { weekday: 'Tue', hour: 19 },
  { weekday: 'Tue', hour: 19 },
];

function lastPredicate(spy: ReturnType<typeof vi.fn>): Predicate[] {
  const calls = spy.mock.calls;
  return calls.length ? (calls[calls.length - 1][0] as Predicate[]) : [];
}

describe('distribution and flow charts', () => {
  it('render on the server without measuring', () => {
    const html = renderToString(
      <>
        <Histogram data={lengths} x="minutes" />
        <ScatterPlot data={points} x="sessions" y="conversion_rate" />
        <BoxPlot data={amounts} category="region" value="amount" />
        <CalendarHeatmap data={days} date="date" value="orders" />
        <Heatmap data={hours} x="hour" y="weekday" />
        <Sankey data={flows} from="channel" to="outcome" value="sessions" />
      </>,
    );
    expect(html.match(/role="figure"/g)).toHaveLength(6);
  });

  it('render loading, empty and error states at a fixed size', () => {
    const { container, rerender } = render(
      <Histogram data={lengths} x="minutes" loading height={150} />,
    );
    expect(container.querySelector('[data-status="loading"]')).not.toBeNull();
    rerender(<Sankey data={[]} from="channel" to="outcome" height={150} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
    rerender(
      <BoxPlot
        data={amounts}
        category="region"
        value="amount"
        error="timeout"
        errorCode="q_1"
        height={150}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('q_1');
    expect((container.firstChild as HTMLElement).style.height).toBe('150px');
  });

  it('Histogram writes a summary and a table, and marks the median', () => {
    const { container } = render(<Histogram data={lengths} x="minutes" bins={4} median />);
    expect(document.body.textContent).toContain('Distribution of Minutes');
    expect(document.body.textContent).toContain('Median 2.7');
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(4);
    expect(container.querySelector('.q-histogram-median text')?.textContent).toBe('median 2.7');
  });

  it('Histogram brush publishes a between range from the keyboard and clears it', () => {
    const onChange = vi.fn();
    render(
      <Selection onChange={onChange}>
        <Histogram data={lengths} x="minutes" bins={4} brush />
      </Selection>,
    );
    const plot = screen.getByRole('application');
    act(() => plot.focus());
    fireEvent.keyDown(plot, { key: 'Enter' });
    let p = lastPredicate(onChange);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ field: 'minutes', op: 'between', value: [1, 3] });
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: 'Enter', shiftKey: true });
    p = lastPredicate(onChange);
    expect(p[0].value).toEqual([1, 5]);
    fireEvent.keyDown(plot, { key: 'Enter' });
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(lastPredicate(onChange)).toHaveLength(0);
  });

  it('Histogram bins dates per day', () => {
    render(<Histogram data={days} x="date" />);
    const rows = screen.getByRole('table').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('2');
    expect(rows[2].textContent).toContain('0');
  });

  it('ScatterPlot summarizes correlation and toggles the color field on Enter', () => {
    const onChange = vi.fn();
    render(
      <Selection onChange={onChange}>
        <ScatterPlot
          data={points}
          x="sessions"
          y="conversion_rate"
          size="revenue"
          color="channel"
          label="campaign"
          select
        />
      </Selection>,
    );
    expect(document.body.textContent).toContain('3 points in 2 groups');
    expect(document.body.textContent).toMatch(/positive correlation \(r = 0\.9\d\)/);
    const plot = screen.getByRole('application');
    act(() => plot.focus());
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(lastPredicate(onChange)[0]).toMatchObject({
      field: 'channel',
      op: 'in',
      value: ['Direct'],
    });
  });

  it('BoxPlot tabulates five-number summaries in the given order', () => {
    render(<BoxPlot data={amounts} category="region" value="amount" order={['Asia', 'Europe']} />);
    const rows = screen.getByRole('table').querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Asia');
    expect(rows[1].textContent).toContain('Europe');
    expect(rows[1].textContent).toContain('30');
    expect(document.body.textContent).toContain('Highest median: Europe');
  });

  it('CalendarHeatmap sums per day and lists days with data', () => {
    render(<CalendarHeatmap data={days} date="date" value="orders" />);
    const rows = screen.getByRole('table').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('6');
    expect(document.body.textContent).toContain('total 16');
  });

  it('Heatmap counts rows per cell and labels the peak', () => {
    const { container } = render(
      <Heatmap data={hours} x="hour" y="weekday" xFormat={(h) => `${h}:00`} />,
    );
    expect(container.querySelector('.q-heatmap-peak')?.textContent).toBe('peak Tue 19:00');
    expect(document.body.textContent).toContain('Highest Tue 19:00 (3)');
  });

  it('Sankey tabulates flows and reports circular input as an error', () => {
    const { rerender } = render(
      <Sankey data={flows} from="channel" to="outcome" value="sessions" />,
    );
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(3);
    expect(document.body.textContent).toContain('total 125');
    rerender(
      <Sankey
        data={[
          { a: 'x', b: 'y', v: 1 },
          { a: 'y', b: 'x', v: 1 },
        ]}
        from="a"
        to="b"
        value="v"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('circular');
  });
});
