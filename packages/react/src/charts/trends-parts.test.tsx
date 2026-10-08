import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Predicate } from '../data/predicates';
import { Selection, useSelection } from '../selection/Selection';
import { AreaChart } from './AreaChart';
import { BarChart } from './BarChart';
import { BarList } from './BarList';
import { DonutChart } from './DonutChart';
import { Funnel } from './Funnel';
import { Sparkline } from './Sparkline';

// jsdom has no layout: give every element a width so ChartFrame renders its children.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 240,
    width: 400,
    height: 240,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const orders = [
  { region: 'Europe', channel: 'Email', amount: 30 },
  { region: 'Asia', channel: 'Email', amount: 50 },
  { region: 'Europe', channel: 'Paid', amount: 40 },
  { region: 'Africa', channel: 'Paid', amount: 10 },
];

function Probe({ onPredicates }: { onPredicates: (p: Predicate[]) => void }) {
  onPredicates(useSelection().predicates);
  return null;
}

describe('BarList', () => {
  it('aggregates, ranks and formats rows', () => {
    render(<BarList data={orders} category="region" value="amount" />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Europe$70', 'Asia$50', 'Africa$10']);
  });

  it('counts rows without a value and honours limit', () => {
    render(<BarList data={orders} category="channel" limit={1} sort="asc" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('+1 more · 2')).toBeTruthy();
  });

  it('shows the combined delta with a sign', () => {
    render(
      <BarList
        data={[
          { r: 'A', v: 110, d: 0.1 },
          { r: 'B', v: 90, d: -0.1 },
        ]}
        category="r"
        value="v"
        delta="d"
        format="integer"
      />,
    );
    const list = screen.getAllByRole('list')[0];
    expect(within(list).getByText('+10.0%').getAttribute('data-tone')).toBe('positive');
    expect(within(list).getByText('−10.0%').getAttribute('data-tone')).toBe('negative');
  });

  it('provides the same data as a formatted table, visible with view="table"', () => {
    render(
      <BarList
        data={[
          { r: 'A', v: 110, d: 0.1 },
          { r: 'B', v: 90 },
        ]}
        category="r"
        value="v"
        delta="d"
        format="integer"
        view="table"
      />,
    );
    const table = screen.getByRole('table');
    expect(table.parentElement?.className).toBe('q-chart-table');
    expect(screen.queryAllByRole('list')).toHaveLength(0);
    const cells = within(table)
      .getAllByRole('row')
      .map((r) => Array.from(r.children).map((c) => c.textContent));
    expect(cells).toEqual([
      ['R', 'V', 'Change'],
      ['A', '110', '+10.0%'],
      ['B', '90', '—'],
    ]);
  });

  it('toggles the category in the selection and mutes the others', () => {
    let preds: Predicate[] = [];
    render(
      <Selection>
        <BarList data={orders} category="region" value="amount" select id="list" />
        <Probe onPredicates={(p) => (preds = p)} />
      </Selection>,
    );
    const asia = screen.getByRole('button', { name: /Asia/ });
    fireEvent.click(asia);
    expect(preds).toEqual([
      { field: 'region', op: 'in', value: ['Asia'], source: 'list', label: undefined },
    ]);
    expect(asia.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Europe/ }).hasAttribute('data-dim')).toBe(true);
    fireEvent.click(asia);
    expect(preds).toEqual([]);
  });

  it('keeps a local selection and calls onSelect without a Selection', () => {
    const onSelect = vi.fn();
    render(<BarList data={orders} category="region" value="amount" select onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Africa/ }));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: 'region', op: 'in', value: ['Africa'] }),
    );
    expect(screen.getByRole('button', { name: /Africa/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('renders the empty state when filtering leaves nothing', () => {
    render(<BarList data={[]} category="region" empty={{ title: 'Nothing here' }} />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});

describe('DonutChart', () => {
  it('shows the total, the slice count and shares', () => {
    render(<DonutChart data={orders} category="channel" value="amount" />);
    expect(screen.getByText('$130')).toBeTruthy();
    expect(screen.getByText('2 channels')).toBeTruthy();
    const legend = screen.getAllByRole('list')[0];
    expect(within(legend).getByText('61.5%')).toBeTruthy();
    expect(within(legend).getByText('38.5%')).toBeTruthy();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(Array.from(rows[1].children).map((c) => c.textContent)).toEqual([
      'Email',
      '$80',
      '61.5%',
    ]);
  });

  it('announces the focused slice from the keyboard and toggles it with Enter', () => {
    let preds: Predicate[] = [];
    render(
      <Selection>
        <DonutChart data={orders} category="channel" value="amount" select id="donut" />
        <Probe onPredicates={(p) => (preds = p)} />
      </Selection>,
    );
    const plot = screen.getByRole('application');
    act(() => plot.focus());
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(screen.getByText(/^Email: \$80, 61\.5% of total$/)).toBeTruthy();
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(preds[0]).toMatchObject({ field: 'channel', op: 'in', value: ['Email'] });
  });
});

describe('Funnel', () => {
  const steps = [
    { step: 'Sessions', value: 1000 },
    { step: 'Cart', value: 250 },
    { step: 'Purchased', value: 50 },
  ];

  it('shows counts as integers, conversion from the previous step and overall', () => {
    render(<Funnel data={steps} step="step" value="value" />);
    const list = screen.getAllByRole('list')[0];
    expect(within(list).getByText('1,000')).toBeTruthy();
    expect(within(list).getByText('· 25.0%')).toBeTruthy();
    expect(within(list).getByText('· 20.0%')).toBeTruthy();
    expect(screen.getByText('5.00%')).toBeTruthy();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(Array.from(rows[3].children).map((c) => c.textContent)).toEqual([
      'Purchased',
      '50',
      '20.0%',
      '5.0%',
    ]);
  });

  it('describes drop-off for the focused step', () => {
    render(<Funnel data={steps} step="step" value="value" />);
    const list = screen.getAllByRole('list')[0];
    fireEvent.keyDown(list, { key: 'End' });
    expect(
      screen.getByText('Purchased: 50, 20.0% of Cart, 5.0% of Sessions, 200 dropped off'),
    ).toBeTruthy();
  });
});

describe('BarChart', () => {
  it('sums rows per category and summarizes the extremes', () => {
    render(<BarChart data={orders} x="region" y="amount" />);
    expect(
      screen.getByText(/3 bars\. Highest Europe at \$70\.00; lowest Africa at \$10\.00\./),
    ).toBeTruthy();
  });

  it('tables the summed values per category and group', () => {
    render(<BarChart data={orders} x="region" y="amount" group="channel" />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((r) => Array.from(r.children).map((c) => c.textContent))).toEqual([
      ['Region', 'Email', 'Paid'],
      ['Europe', '$30.00', '$40.00'],
      ['Asia', '$50.00', '—'],
      ['Africa', '—', '$10.00'],
    ]);
  });

  it('toggles the x value from the keyboard', () => {
    let preds: Predicate[] = [];
    render(
      <Selection>
        <BarChart data={orders} x="region" y="amount" select id="bars" />
        <Probe onPredicates={(p) => (preds = p)} />
      </Selection>,
    );
    const plot = screen.getByRole('application');
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: 'Enter' });
    expect(preds[0]).toMatchObject({
      field: 'region',
      op: 'in',
      value: ['Europe'],
      source: 'bars',
    });
  });

  it('shows the error state with code and retry', () => {
    const onRetry = vi.fn();
    render(
      <BarChart
        data={orders}
        x="region"
        y="amount"
        error="timeout"
        errorCode="q_1"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('timeout · q_1');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('AreaChart', () => {
  it('adds a total to the summary when stacked', () => {
    render(
      <AreaChart
        data={[
          { d: '2026-01-01', c: 'A', v: 1 },
          { d: '2026-01-02', c: 'A', v: 2 },
          { d: '2026-01-01', c: 'B', v: 3 },
          { d: '2026-01-02', c: 'B', v: 4 },
        ]}
        x="d"
        y="v"
        color="c"
        stack
      />,
    );
    expect(screen.getByText(/Total from Jan 1 to Jan 2: up 50\.0%, from 4 to 6\./)).toBeTruthy();
  });

  it('tables every series plus the stack total', () => {
    render(
      <AreaChart
        data={[
          { d: '2026-01-01', c: 'A', v: 1 },
          { d: '2026-01-01', c: 'B', v: 3 },
        ]}
        x="d"
        y="v"
        color="c"
        stack
      />,
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((r) => Array.from(r.children).map((c) => c.textContent))).toEqual([
      ['D', 'A', 'B', 'Total'],
      ['Thu, Jan 1', '1', '3', '4'],
    ]);
  });
});

describe('Sparkline', () => {
  it('accepts plain numbers and labels itself with a summary', () => {
    render(<Sparkline data={[1, 3, 2, 4]} aria-label="Orders" />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toMatch(
      /^Orders\. Y from point 1 to point 4: up 300\.0%/,
    );
  });

  it('has compact states', () => {
    render(<Sparkline data={[]} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Sparkline: No data');
  });
});
