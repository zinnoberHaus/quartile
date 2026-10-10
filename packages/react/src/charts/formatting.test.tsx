import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataset } from '../data/schema';
import type { FieldDef } from '../data/types';
import { QuartileProvider } from '../provider/QuartileProvider';
import { AreaChart } from './AreaChart';
import { BarChart } from './BarChart';
import { BarList } from './BarList';
import { BoxPlot } from './BoxPlot';
import { CalendarHeatmap } from './CalendarHeatmap';
import { tickFormatter } from './core/scales';
import { DonutChart } from './DonutChart';
import { Funnel } from './Funnel';
import { Heatmap } from './Heatmap';
import { Histogram } from './Histogram';
import { LineChart } from './LineChart';
import { Sankey } from './Sankey';
import { ScatterPlot } from './ScatterPlot';
import { Sparkline } from './Sparkline';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 640,
    bottom: 240,
    width: 640,
    height: 240,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rows = [
  { time: '2026-10-09T21:00:00Z', amount: 1234.56, rate: 0.1234, count: 12 },
  { time: '2026-10-09T22:00:00Z', amount: 2469.12, rate: 0.5678, count: 24 },
];
const measures = {
  time: {
    type: 'temporal',
    format: { type: 'date', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    axisFormat: { type: 'date', hour: '2-digit', hourCycle: 'h23' },
    tooltipFormat: {
      type: 'date',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    },
  },
  amount: {
    type: 'quantitative',
    format: 'currency',
    currency: 'EUR',
    axisFormat: (v: unknown) => `axis ${v}`,
    tooltipFormat: {
      type: 'number',
      style: 'currency',
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
    },
    description: '<b>Net revenue</b> after returns.',
  },
  rate: {
    type: 'quantitative',
    format: { type: 'number', style: 'percent', minimumFractionDigits: 2 },
    tooltipFormat: { type: 'number', style: 'percent', minimumFractionDigits: 3 },
    description: 'Converted sessions / all sessions.',
  },
  count: { type: 'quantitative', format: 'integer' },
} satisfies Record<string, Partial<FieldDef>>;
const data = dataset(rows, measures);

function cells() {
  return within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.children, (child) => child.textContent));
}
function focusFirst(container: HTMLElement) {
  const plot = container.querySelector<HTMLElement>('[role="application"], .q-funnel')!;
  fireEvent.keyDown(plot, { key: 'Home' });
  return container.querySelector('.q-chart-tooltip')!;
}

describe.each([
  ['LineChart', LineChart],
  ['AreaChart', AreaChart],
  ['BarChart', BarChart],
] as const)('%s field formatting', (_name, Chart) => {
  it('keeps mixed units and hourly identity exact while using independent axis/tooltip formats', () => {
    const { container } = render(
      <QuartileProvider locale="en-US" timeZone="UTC">
        <Chart
          data={data}
          x="time"
          y={['amount', 'rate', 'count']}
          tooltipNote="<script>sample only</script>"
        />
      </QuartileProvider>,
    );
    expect(cells()).toEqual([
      ['21:00', '€1,234.56', '12.34%', '12'],
      ['22:00', '€2,469.12', '56.78%', '24'],
    ]);
    expect(container.querySelector('.q-chart-axis')?.textContent).toContain('axis ');
    const tooltip = focusFirst(container);
    expect(tooltip.textContent).toContain('21:00 UTC');
    expect(tooltip.textContent).toContain('EUR');
    expect(tooltip.textContent).toContain('1,234.56');
    expect(tooltip.textContent).toContain('12.340%');
    expect(tooltip.textContent).toContain('<b>Net revenue</b> after returns.');
    expect(tooltip.textContent).toContain('<script>sample only</script>');
    expect(tooltip.querySelector('script,b')).toBeNull();
    expect(container.querySelector('[aria-live]')?.textContent).toContain(
      'Converted sessions / all sessions.',
    );
    expect(cells()[0]).toEqual(['21:00', '€1,234.56', '12.34%', '12']);
  });
  it('moves the visible tooltip and spoken value together after pointer hover then keyboard navigation', () => {
    const { container } = render(
      <QuartileProvider timeZone="UTC">
        <Chart data={data} x="time" y="amount" />
      </QuartileProvider>,
    );
    const plot = screen.getByRole('application');
    fireEvent(plot, new MouseEvent('pointermove', { bubbles: true, clientX: 150, clientY: 50 }));
    expect(container.querySelector('.q-chart-tooltip')?.textContent).toContain('21:00 UTC');
    expect(container.querySelector('.q-chart-tooltip')?.textContent).toContain('1,234.56');
    fireEvent.keyDown(plot, { key: 'End' });
    const tip = container.querySelector('.q-chart-tooltip')!;
    expect(tip.textContent).toContain('22:00 UTC');
    expect(tip.textContent).toContain('2,469.12');
    expect(container.querySelector('[aria-live]')?.textContent).toContain('2,469.12');
  });
  it('lets chart-level overrides win and preserves notes in table view', () => {
    const { container } = render(
      <Chart
        data={data}
        x="time"
        y="amount"
        xFormat={() => 'instant'}
        format={(v) => `value ${v}`}
        tooltipNote="Sample only"
        view="table"
      />,
    );
    expect(cells()[0]).toEqual(['instant', 'value 1234.56']);
    expect(container.textContent).toContain('Sample only');
  });
});

it('formats comparison values with their own measure, and summaries respect provider locale', () => {
  const { container } = render(
    <QuartileProvider locale="de-DE" timeZone="UTC">
      <LineChart data={data} x="time" y="amount" compare="count" />
    </QuartileProvider>,
  );
  expect(cells()[0]?.[1]).toContain('1.234,56');
  expect(cells()[0]?.[2]).toBe('12');
  expect(focusFirst(container).textContent).toContain('Previous12');
});

it('honors field axis overrides and explicit axis overrides without changing exact format', () => {
  const field = data.schema.amount;
  expect(tickFormatter(field, 'en-US')(1000)).toBe('axis 1000');
  expect(tickFormatter(field, 'en-US', 'UTC', (v) => `explicit ${v}`)(1000)).toBe('explicit 1000');
});

describe.each([
  ['BarList', BarList],
  ['DonutChart', DonutChart],
] as const)('%s exact table', (_name, Chart) => {
  it('preserves cents and formats currency-valued categories separately from compact marks', () => {
    render(
      <Chart
        data={dataset([{ category: 12, amount: 1234.56 }], {
          category: { format: 'currency', currency: 'JPY' },
          amount: { format: 'currency', currency: 'EUR' },
        })}
        category="category"
        value="amount"
      />,
    );
    expect(cells()[0]?.slice(0, 2)).toEqual(['¥12', '€1,234.56']);
  });
});

it('formats Heatmap axes, tooltip values and exact table independently', () => {
  const { container } = render(
    <Heatmap
      data={dataset([{ x: 12, y: 4, amount: 1234.56 }], {
        x: {
          format: 'currency',
          currency: 'EUR',
          axisFormat: () => 'X-axis',
          tooltipFormat: () => 'X-detail',
        },
        y: { format: 'integer', axisFormat: () => 'Y-axis', tooltipFormat: () => 'Y-detail' },
        amount: measures.amount,
      })}
      x="x"
      y="y"
      value="amount"
      tooltipNote="Matrix sample"
    />,
  );
  expect(cells()[0]).toEqual(['4', '€1,234.56']);
  expect(screen.getByRole('columnheader', { name: '€12.00' })).toBeTruthy();
  expect(container.querySelector('svg')?.textContent).toContain('Y-axisX-axis');
  const tooltip = focusFirst(container);
  expect(tooltip.textContent).toContain('Y-detail X-detail');
  expect(tooltip.textContent).toContain('EUR');
  expect(tooltip.textContent).toContain('Matrix sample');
});

it('formats BoxPlot categories in labels, exact data and keyboard tooltip without changing selection identity', () => {
  const onSelect = vi.fn();
  const { container } = render(
    <BoxPlot
      data={dataset(
        [
          { group: 'code_a', amount: 1234.56 },
          { group: 'code_a', amount: 2469.12 },
        ],
        {
          group: {
            format: (v) => `GROUP-${v}`,
            axisFormat: (v) => `AXIS-${v}`,
            tooltipFormat: (v) => `TIP-${v}`,
          },
          amount: measures.amount,
        },
      )}
      category="group"
      value="amount"
      select
      onSelect={onSelect}
    />,
  );
  expect(cells()[0]?.[0]).toBe('GROUP-code_a');
  expect(cells()[0]?.[1]).toBe('€1,234.56');
  expect(container.querySelector('svg')?.textContent).toContain('AXIS-code_a');
  expect(focusFirst(container).textContent).toContain('TIP-code_a');
  expect(container.querySelector('.q-chart-tooltip')?.textContent).toContain('EUR');
  fireEvent.keyDown(screen.getByRole('application'), { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ value: ['code_a'] }));
});

it('formats ScatterPlot label, group, ancillary measures and lazy exact table in their own units', () => {
  const points = Array.from({ length: 201 }, (_, i) => ({
    label: 'A',
    category: 'North',
    x: i + 1,
    amount: 1234.56,
    bytes: 2048,
  }));
  const { container } = render(
    <ScatterPlot
      data={dataset(points, {
        label: { format: (v) => `Item ${v}`, tooltipFormat: (v) => `Detail ${v}` },
        category: { format: (v) => `Region ${v}` },
        x: { format: 'integer' },
        amount: measures.amount,
        bytes: { format: 'bytes-binary', description: 'Transfer size' },
      })}
      x="x"
      y="amount"
      label="label"
      color="category"
      size="bytes"
      tooltipNote="Bounded sample"
    />,
  );
  expect(container.querySelector('.q-legend')?.textContent).toContain('Region North');
  const tooltip = focusFirst(container);
  expect(tooltip.textContent).toContain('Detail A');
  expect(tooltip.textContent).toContain('EUR');
  expect(tooltip.textContent).toContain('2 KiB');
  expect(tooltip.textContent).toContain('Transfer size');
  fireEvent.click(screen.getByRole('button', { name: 'View data table (201 rows)' }));
  expect(cells()[0]).toEqual(['Item A', 'Region North', '1', '€1,234.56', '2 KiB']);
});

it('formats Funnel and Sankey categories and tooltip measures without changing flow values', () => {
  const flow = dataset([{ from: 'A', to: 'B', amount: 1234.56 }], {
    from: { format: (v) => `From ${v}`, tooltipFormat: (v) => `Source ${v}` },
    to: { format: (v) => `To ${v}`, tooltipFormat: (v) => `Destination ${v}` },
    amount: measures.amount,
  });
  const { container, unmount } = render(
    <Sankey data={flow} from="from" to="to" value="amount" tooltipNote="Modeled flow" />,
  );
  expect(cells()[0]).toEqual(['From A', 'To B', '€1,234.56']);
  expect(container.querySelector('svg')?.textContent).toContain('From A');
  expect(focusFirst(container).textContent).toContain('Source A');
  expect(container.querySelector('.q-chart-tooltip')?.textContent).toContain('EUR');
  unmount();
  const funnel = render(
    <Funnel data={flow} step="from" value="amount" tooltipNote="Modeled funnel" />,
  );
  expect(cells()[0]?.slice(0, 2)).toEqual(['From A', '€1,234.56']);
  const tooltip = focusFirst(funnel.container);
  expect(tooltip.textContent).toContain('Source A');
  expect(tooltip.textContent).toContain('EUR');
  expect(tooltip.textContent).toContain('Modeled funnel');
});

it('keeps temporal histogram and calendar bucket identities under a remote display zone', () => {
  const data = dataset([{ date: '2026-10-09', amount: 1234.56 }], {
    date: {
      type: 'temporal',
      format: { type: 'date', year: 'numeric', month: '2-digit', day: '2-digit' },
      tooltipFormat: (v) => `Bucket ${v}`,
    },
    amount: measures.amount,
  });
  const { container, unmount } = render(
    <QuartileProvider timeZone="Pacific/Honolulu">
      <Histogram data={data} x="date" value="amount" />
    </QuartileProvider>,
  );
  expect(cells()[0]).toEqual(['10/09/2026', '€1,234.56']);
  expect(focusFirst(container).textContent).toContain('Bucket 2026-10-09');
  unmount();
  const calendar = render(
    <QuartileProvider timeZone="Pacific/Honolulu">
      <CalendarHeatmap data={data} date="date" value="amount" weeks={1} />
    </QuartileProvider>,
  );
  expect(cells()[0]).toEqual(['10/09/2026', '€1,234.56']);
  fireEvent.keyDown(screen.getByRole('application'), { key: 'End' });
  expect(calendar.container.querySelector('.q-chart-tooltip')?.textContent).toContain(
    'Bucket 2026-10-09',
  );
});

it('formats Sparkline instant summaries in the declared field zone with exact values', () => {
  render(
    <QuartileProvider timeZone="Pacific/Honolulu">
      <Sparkline data={data} x="time" y="amount" />
    </QuartileProvider>,
  );
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('11:00 to 12:00');
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('€1,234.56');
});

it('writes direction summaries without retaining an Arabic sign or slicing a bidi marker', () => {
  const { container } = render(
    <QuartileProvider locale="ar-EG">
      <LineChart
        data={[
          { x: 1, count: 100 },
          { x: 2, count: 80 },
        ]}
        x="x"
        y="count"
      />
    </QuartileProvider>,
  );
  const summary = container.querySelector('p.q-visually-hidden')!.textContent!;
  expect(summary).toContain('down ٢٠٫٠');
  expect(summary).not.toContain('−');
});
