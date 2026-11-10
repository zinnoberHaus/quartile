import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AreaChart } from './AreaChart';
import { BarChart } from './BarChart';
import { BarList } from './BarList';
import { BoxPlot } from './BoxPlot';
import { DonutChart } from './DonutChart';
import { Histogram } from './Histogram';
import { LineChart } from './LineChart';
import { ScatterPlot } from './ScatterPlot';
import { Sparkline } from './Sparkline';

// jsdom does no layout, so every chart draws at the provider's assumed width of 640px.
const WIDTH = 640;

const trend = [
  { month: '2026-01-01', users: 120 },
  { month: '2026-02-01', users: 180 },
  { month: '2026-03-01', users: 150 },
];
const plans = [
  { month: '2026-01-01', plan: 'Team', users: 120 },
  { month: '2026-02-01', plan: 'Team', users: 180 },
  { month: '2026-01-01', plan: 'Pro', users: 90 },
  { month: '2026-02-01', plan: 'Pro', users: 95 },
];
const year = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}-01`,
  users: 100 + i * 10,
}));
const regions = [
  { region: 'EMEA', year: '2025', users: 120 },
  { region: 'APAC', year: '2025', users: 90 },
  { region: 'EMEA', year: '2026', users: 150 },
  { region: 'APAC', year: '2026', users: 110 },
];
const flat = regions.filter((r) => r.year === '2025');
const points = [
  { weight: 10, score: 2, seg: 'A' },
  { weight: 20, score: 4, seg: 'B' },
  { weight: 30, score: 3, seg: 'A' },
  { weight: 40, score: 5, seg: 'B' },
];
const latencies = [10, 12, 30, 45, 46, 47, 80].map((latency, i) => ({
  latency,
  service: i % 2 ? 'api' : 'web',
}));

const texts = (root: ParentNode | null | undefined, selector: string) =>
  Array.from(root?.querySelectorAll(selector) ?? []).map((n) => n.textContent ?? '');
const num = (el: Element | null | undefined, attr: string) => Number(el?.getAttribute(attr));
const axes = (root: ParentNode) => Array.from(root.querySelectorAll('.q-chart-axis'));
const rows = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.q-chart-grid:not([data-axis]) line'));
const columns = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.q-chart-grid[data-axis="x"] line'));
const summary = (root: ParentNode) => root.querySelector('p.q-visually-hidden')?.textContent ?? '';
const draw = (el: ReactElement) => render(el).container;
const html = (el: ReactElement) => renderToStaticMarkup(el);

const REFUSED = ['red', 'rgb(47, 69, 232)', 'url(https://example.com/p.svg#a)', 'var(--x)', '#12'];

afterEach(() => vi.restoreAllMocks());

describe('LineChart presentation', () => {
  const line = (props: Record<string, unknown> = {}) => (
    <LineChart data={trend} x="month" y="users" {...props} />
  );

  it('keeps its computed margins, and moves only the sides a margin names', () => {
    const usual = rows(draw(line()))[0];
    expect([num(usual, 'x1'), num(usual, 'x2')]).toEqual([32, WIDTH - 10]);

    const left = rows(draw(line({ margin: { left: 64 } })))[0];
    expect([num(left, 'x1'), num(left, 'x2')]).toEqual([64, WIDTH - 10]);

    const all = rows(draw(line({ margin: [20, 30, 40, 50] })));
    expect([num(all[0], 'x1'), num(all[0], 'x2')]).toEqual([50, WIDTH - 30]);
    // Gridlines run from the value 0 at the bottom margin to 200 at the top margin.
    expect([num(all[0], 'y1'), num(all[all.length - 1], 'y1')]).toEqual([200.5, 20.5]);

    const none = rows(draw(line({ margin: 0 })))[0];
    expect([num(none, 'x1'), num(none, 'x2')]).toEqual([0, WIDTH]);
  });

  it('colors series from palette names, categorical indexes and hex colors', () => {
    const markup = html(
      <LineChart data={plans} x="month" y="users" color="plan" colors={['signal', '#f26b3a']} />,
    );
    expect(markup).toContain('stroke:var(--q-signal)');
    expect(markup).toContain('stroke:#f26b3a');
    expect(markup).not.toContain('--q-cat-1');

    const byKey = html(
      <LineChart data={plans} x="month" y="users" color="plan" colors={{ Pro: 5 }} />,
    );
    expect(byKey).toContain('stroke:var(--q-cat-1)');
    expect(byKey).toContain('stroke:var(--q-cat-5)');
  });

  it('never lets a refused color into the markup', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const markup = html(
      <LineChart data={plans} x="month" y="users" color="plan" colors={REFUSED} />,
    );
    expect(markup).toContain('stroke:var(--q-cat-1)');
    expect(markup).toContain('stroke:var(--q-cat-2)');
    for (const value of REFUSED) expect(markup).not.toContain(value);
    expect(markup).not.toContain('example.com');
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toMatch(/Ignored the color .*hex color such as #2f45e8/);
  });

  it('bounds the y axis and clips the line to the plot', () => {
    const usual = draw(line());
    expect(texts(axes(usual)[0], 'text')).toEqual(['0', '50', '100', '150', '200']);
    expect(usual.querySelector('clipPath')).toBeNull();

    const bounded = draw(line({ yMin: 100, yMax: 200 }));
    const labels = texts(axes(bounded)[0], 'text');
    expect([labels[0], labels[labels.length - 1]]).toEqual(['100', '200']);
    expect(bounded.querySelector('clipPath')).toBeNull();
    expect(summary(bounded)).toContain('The y axis runs from 100 to 200.');

    // A bound inside the data is honored on a line: the marks are clipped, not rescaled.
    const cut = draw(line({ yMin: 140 }));
    expect(texts(axes(cut)[0], 'text')[0]).toBe('140');
    const clip = cut.querySelector('clipPath rect');
    expect(clip).not.toBeNull();
    expect(cut.querySelector('g[clip-path] path')).not.toBeNull();
    expect(summary(cut)).toContain('The y axis starts at 140.');
  });

  it('bounds a numeric x axis and leaves a date axis alone', () => {
    const numeric = [
      { step: 0, loss: 9 },
      { step: 10, loss: 5 },
      { step: 20, loss: 3 },
    ];
    const usual = draw(<LineChart data={numeric} x="step" y="loss" points />);
    const bounded = draw(<LineChart data={numeric} x="step" y="loss" points xMin={10} />);
    const cx = (root: ParentNode) =>
      Array.from(root.querySelectorAll('.q-chart-dot')).map((d) => num(d, 'cx'));
    const left = num(rows(usual)[0], 'x1');
    expect(cx(usual)[0]).toBe(left);
    // 10 now sits at the left edge, and 0 falls outside the plot (and is clipped).
    expect(cx(bounded)[1]).toBe(left);
    expect(cx(bounded)[0]).toBeLessThan(left);
    expect(bounded.querySelector('clipPath')).not.toBeNull();

    const dates = draw(line({ xMin: 5, points: true }));
    expect(dates.querySelector('clipPath')).toBeNull();
    expect(cx(dates)[0]).toBe(32);
  });

  it('takes approximate tick counts for both axes', () => {
    const count = (props: Record<string, unknown>, axis: number) =>
      texts(axes(draw(<LineChart data={year} x="month" y="users" {...props} />))[axis], 'text')
        .length;
    expect(count({}, 0)).toBe(6);
    expect(count({ yTicks: 2 }, 0)).toBe(3);
    expect(count({ yTicks: 10 }, 0)).toBe(13);
    expect(count({ yTicks: 0 }, 0)).toBe(0);
    expect(count({}, 1)).toBe(6);
    expect(count({ xTicks: 3 }, 1)).toBe(3);
    expect(count({ xTicks: 12 }, 1)).toBe(12);
    expect(count({ xTicks: 0 }, 1)).toBe(0);
  });

  it('draws horizontal gridlines by default, and none, vertical or both on request', () => {
    const usual = draw(line());
    expect([rows(usual).length, columns(usual).length]).toEqual([5, 0]);
    const off = draw(line({ grid: false }));
    expect(off.querySelector('.q-chart-grid')).toBeNull();
    expect(draw(line({ grid: 'none' })).querySelector('.q-chart-grid')).toBeNull();
    const vertical = draw(line({ grid: 'x' }));
    expect([rows(vertical).length, columns(vertical).length]).toEqual([0, 3]);
    const both = draw(line({ grid: 'both' }));
    expect([rows(both).length, columns(both).length]).toEqual([5, 3]);
    expect([rows(draw(line({ grid: true }))).length]).toEqual([5]);
  });

  it('hides an axis and gives its room to the plot', () => {
    const noY = draw(line({ yAxis: false }));
    expect(axes(noY)).toHaveLength(1);
    expect(texts(axes(noY)[0], 'text')).toHaveLength(3);
    expect(num(rows(noY)[0], 'x1')).toBe(10);

    const noX = draw(line({ xAxis: false }));
    expect(axes(noX)).toHaveLength(1);
    expect(texts(axes(noX)[0], 'text')[0]).toBe('0');
    // The zero line moves down into the space the labels used.
    expect(num(rows(noX)[0], 'y1')).toBe(232.5);
    expect(num(rows(draw(line()))[0], 'y1')).toBe(216.5);
  });

  it('places the legend above by default and on any side on request', () => {
    const multi = (props: Record<string, unknown> = {}) => (
      <LineChart data={plans} x="month" y="users" color="plan" {...props} />
    );
    const usual = draw(multi()).querySelector('.q-chart')!;
    expect(usual.firstElementChild?.className).toContain('q-legend');
    expect(usual.querySelector('.q-legend')?.hasAttribute('data-position')).toBe(false);

    const below = draw(multi({ legend: 'bottom' })).querySelector('.q-chart')!;
    const legend = below.querySelector('.q-legend')!;
    expect(legend.getAttribute('data-position')).toBe('bottom');
    expect(below.firstElementChild?.querySelector('svg')).not.toBeNull();
    expect(legend.previousElementSibling?.querySelector('svg')).not.toBeNull();

    for (const side of ['left', 'right'] as const) {
      const root = draw(multi({ legend: side }));
      const layout = root.querySelector('.q-chart-side')!;
      expect(layout.getAttribute('data-legend')).toBe(side);
      const first = layout.firstElementChild!;
      expect(first.classList.contains('q-legend')).toBe(side === 'left');
      // The plot gives up the legend's width; its height is no longer shared.
      const svg = layout.querySelector('svg')!;
      expect(num(svg, 'width')).toBeLessThan(WIDTH - 56);
      expect(num(svg, 'height')).toBe(240);
    }

    expect(draw(multi({ legend: 'none' })).querySelector('.q-legend')).toBeNull();
    expect(draw(multi({ legend: false })).querySelector('.q-legend')).toBeNull();
    expect(draw(line({ legend: 'top' })).querySelector('.q-legend')).not.toBeNull();
  });

  it('labels each line end with its name and last value, in the field format', () => {
    // A field named "revenue" is inferred as currency; labels follow the field, like the axis.
    const money = plans.map((r) => ({ month: r.month, plan: r.plan, revenue: r.users }));
    const root = draw(<LineChart data={money} x="month" y="revenue" color="plan" labels />);
    expect(texts(root, '.q-chart-end-labels text')).toEqual(['Team $180', 'Pro $95']);
    expect(
      texts(
        draw(<LineChart data={money} x="month" y="revenue" color="plan" labels format="percent" />),
        '.q-chart-end-labels text',
      ),
    ).toEqual(['Team 18,000.0%', 'Pro 9,500.0%']);
    // The plot leaves room for the text on the right.
    expect(num(rows(root)[0], 'x2')).toBeLessThan(WIDTH - 60);

    const one = draw(line({ labels: true }));
    expect(texts(one, '.q-chart-end-labels text')).toEqual(['150']);
    expect(draw(line()).querySelector('.q-chart-end-labels')).toBeNull();
  });

  it('keeps line-end labels apart when the lines end together', () => {
    const tight = [
      { month: '2026-01-01', plan: 'A', users: 100 },
      { month: '2026-02-01', plan: 'A', users: 150 },
      { month: '2026-01-01', plan: 'B', users: 120 },
      { month: '2026-02-01', plan: 'B', users: 151 },
    ];
    const root = draw(<LineChart data={tight} x="month" y="users" color="plan" labels />);
    const ys = Array.from(root.querySelectorAll('.q-chart-end-labels text')).map((t) =>
      num(t, 'y'),
    );
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(13);
  });

  it('draws a reference line as text, in the summary too, and makes room for it', () => {
    const root = draw(line({ reference: { value: 400, label: 'Target' }, format: 'currency' }));
    const rule = root.querySelector('.q-chart-reference line')!;
    expect(root.querySelector('.q-chart-reference')?.getAttribute('data-orientation')).toBe(
      'horizontal',
    );
    expect(texts(root, '.q-chart-reference text')).toEqual(['Target']);
    expect(summary(root)).toContain('Reference line Target at $400.00.');
    // The axis grows to include the reference value (200 without it).
    expect(texts(axes(root)[0], 'text').at(-1)).toBe('$500.00');
    expect(num(rule, 'y1')).toBeGreaterThan(10);
    expect([num(rule, 'x1'), num(rule, 'x2')]).toEqual([
      num(rows(root)[0], 'x1'),
      num(rows(root)[0], 'x2'),
    ]);

    const several = draw(line({ reference: [{ value: 100 }, { value: 160, label: 'Plan' }] }));
    expect(texts(several, '.q-chart-reference text')).toEqual(['100', 'Plan']);
    expect(summary(several)).toContain('Reference line at 100. Reference line Plan at 160.');

    const markup = html(line({ reference: { value: 100, label: '<img src=x onerror=alert(1)>' } }));
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<img');
  });
});

describe('AreaChart presentation', () => {
  const area = (props: Record<string, unknown> = {}) => (
    <AreaChart data={plans} x="month" y="users" color="plan" {...props} />
  );

  it('applies margins, colors, ticks, gridlines and hidden axes like a line chart', () => {
    const root = draw(area({ margin: { left: 70, right: 40 }, yTicks: 2, grid: 'both' }));
    expect([num(rows(root)[0], 'x1'), num(rows(root)[0], 'x2')]).toEqual([70, WIDTH - 40]);
    expect(rows(root)).toHaveLength(3);
    expect(columns(root)).toHaveLength(2);
    expect(axes(draw(area({ xAxis: false, yAxis: false })))).toHaveLength(0);

    const markup = html(area({ colors: ['positive', '#0a0a0a80'] }));
    expect(markup).toContain('stroke:var(--q-positive)');
    expect(markup).toContain('stroke:#0a0a0a80');
    expect(html(area({ stack: true, colors: [3] }))).toContain('fill:var(--q-cat-3)');
  });

  it('moves its legend from under the plot to another side', () => {
    const usual = draw(area()).querySelector('.q-chart')!;
    expect(usual.firstElementChild?.querySelector('svg')).not.toBeNull();
    expect(
      usual.querySelector('.q-legend')?.previousElementSibling?.querySelector('svg'),
    ).not.toBeNull();
    expect(usual.querySelector('.q-legend')?.hasAttribute('data-position')).toBe(false);
    const top = draw(area({ legend: 'top' })).querySelector('.q-chart')!;
    expect(top.firstElementChild?.getAttribute('data-position')).toBe('top');
    expect(draw(area({ legend: 'right' })).querySelector('.q-chart-side')).not.toBeNull();
    expect(draw(area({ legend: 'none' })).querySelector('.q-legend')).toBeNull();
  });

  it('labels line ends, and stacked bands at their middle', () => {
    expect(texts(draw(area({ labels: true })), '.q-chart-end-labels text')).toEqual([
      'Team 180',
      'Pro 95',
    ]);
    const stacked = draw(area({ labels: true, stack: true }));
    const labels = Array.from(stacked.querySelectorAll('.q-chart-end-labels text'));
    expect(labels.map((l) => l.textContent)).toEqual(['Team 180', 'Pro 95']);
    // Team is the lower band, so its label sits below Pro's.
    expect(num(labels[0], 'y')).toBeGreaterThan(num(labels[1], 'y'));
  });

  it('honors a raised baseline for overlapping areas and refuses it for stacks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const overlap = draw(area({ yMin: 80 }));
    expect(texts(axes(overlap)[0], 'text')[0]).toBe('80');
    expect(warn).not.toHaveBeenCalled();

    const stacked = draw(area({ stack: true, yMin: 80 }));
    expect(texts(axes(stacked)[0], 'text')[0]).toBe('0');
    expect(String(warn.mock.calls[0][0])).toMatch(/stacked AreaChart ignored yMin 80/);
    expect(summary(stacked)).not.toContain('y axis');
  });

  it('draws a reference line and reads it out', () => {
    const root = draw(area({ reference: 250 }));
    expect(texts(root, '.q-chart-reference text')).toEqual(['250']);
    expect(summary(root)).toContain('Reference line at 250.');
  });
});

describe('BarChart presentation', () => {
  const bars = (props: Record<string, unknown> = {}) => (
    <BarChart data={flat} x="region" y="users" {...props} />
  );
  const grouped = (props: Record<string, unknown> = {}) => (
    <BarChart data={regions} x="region" y="users" group="year" {...props} />
  );

  it('applies margins on the sides named', () => {
    const usual = rows(draw(bars()))[0];
    expect([num(usual, 'x1'), num(usual, 'x2')]).toEqual([32, WIDTH - 4]);
    const custom = rows(draw(bars({ margin: { left: 80, right: 20, top: 30 } })));
    expect([num(custom[0], 'x1'), num(custom[0], 'x2')]).toEqual([80, WIDTH - 20]);
    expect(num(custom[custom.length - 1], 'y1')).toBe(30.5);
  });

  it('colors bars from the palette or hex, and refuses anything else', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const markup = html(grouped({ colors: ['muted', '#2f45e8'] }));
    expect(markup).toContain('fill:var(--q-series-muted)');
    expect(markup).toContain('fill:#2f45e8');
    const refused = html(grouped({ colors: REFUSED }));
    expect(refused).toContain('fill:var(--q-cat-1)');
    for (const value of REFUSED) expect(refused).not.toContain(value);
  });

  it('refuses axis bounds that would cut a bar, and accepts bounds that add room', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cut = draw(bars({ yMin: 50 }));
    expect(texts(axes(cut)[0], 'text')[0]).toBe('0');
    expect(String(warn.mock.calls[0][0])).toMatch(/BarChart ignored yMin 50.*measured from zero/);

    const low = draw(bars({ yMax: 100 }));
    expect(texts(axes(low)[0], 'text').at(-1)).toBe('150');
    expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/ignored yMax 100/);

    const roomy = draw(bars({ yMin: -100, yMax: 300 }));
    const labels = texts(axes(roomy)[0], 'text');
    expect([labels[0], labels.at(-1)]).toEqual(['−100', '300']);
  });

  it('takes tick counts, gridline and axis switches', () => {
    expect(texts(axes(draw(bars()))[0], 'text')).toHaveLength(4);
    expect(texts(axes(draw(bars({ yTicks: 2 })))[0], 'text')).toHaveLength(3);
    expect(draw(bars({ grid: false })).querySelectorAll('.q-chart-grid line')).toHaveLength(0);
    const noY = draw(bars({ yAxis: false }));
    expect(axes(noY)).toHaveLength(1);
    expect(texts(axes(noY)[0], 'text')).toEqual(['EMEA', 'APAC']);
    expect(axes(draw(bars({ xAxis: false })))).toHaveLength(1);
    const wide = Array.from({ length: 12 }, (_, i) => ({ k: `c${i}`, v: i + 1 }));
    const some = draw(<BarChart data={wide} x="k" y="v" xTicks={4} />);
    expect(texts(axes(some)[1], 'text')).toHaveLength(4);
  });

  it('writes values at the bar ends, in the field format', () => {
    const money = flat.map((r) => ({ region: r.region, revenue: r.users }));
    const root = draw(<BarChart data={money} x="region" y="revenue" labels />);
    expect(texts(root, '.q-chart-value-labels text')).toEqual(['$120', '$90']);
    expect(
      texts(draw(bars({ labels: true, format: 'percent' })), '.q-chart-value-labels text'),
    ).toEqual(['12,000.0%', '9,000.0%']);
    expect(draw(bars()).querySelector('.q-chart-value-labels')).toBeNull();
    // The label sits above the bar it names.
    const label = root.querySelector('.q-chart-value-labels text')!;
    expect(label.getAttribute('text-anchor')).toBe('middle');

    expect(texts(draw(grouped({ labels: true })), '.q-chart-value-labels text')).toEqual([
      '120',
      '90',
      '150',
      '110',
    ]);
    // A stack shows its total.
    expect(
      texts(draw(grouped({ labels: true, stack: true })), '.q-chart-value-labels text'),
    ).toEqual(['270', '200']);
  });

  it('shows or hides the direct labels of horizontal bars', () => {
    const usual = draw(bars({ orientation: 'horizontal' }));
    expect(texts(usual, '.q-bar-value')).toEqual(['120', '90']);
    const off = draw(bars({ orientation: 'horizontal', labels: false }));
    expect(off.querySelector('.q-bar-value')).toBeNull();
    expect(texts(off, '.q-bar-category')).toEqual(['EMEA', 'APAC']);
    const each = draw(grouped({ orientation: 'horizontal', labels: true }));
    expect(texts(each, '.q-chart-value-labels text')).toEqual(['120', '90', '150', '110']);
    const bare = draw(bars({ orientation: 'horizontal', xAxis: false }));
    expect(bare.querySelector('.q-bar-category')).toBeNull();
  });

  it('draws a reference rule across the bars and reads it out', () => {
    const root = draw(bars({ reference: { value: 200, label: 'Target' }, format: 'currency' }));
    const group = root.querySelector('.q-chart-reference')!;
    expect(group.getAttribute('data-orientation')).toBe('horizontal');
    expect(texts(group, 'text')).toEqual(['Target']);
    expect(summary(root)).toContain('Reference line Target at $200.00.');
    // 150 without the reference.
    expect(texts(axes(root)[0], 'text').at(-1)).toBe('$250.00');

    const flipped = draw(bars({ orientation: 'horizontal', reference: 100 }));
    const rule = flipped.querySelector('.q-chart-reference')!;
    expect(rule.getAttribute('data-orientation')).toBe('vertical');
    const mark = rule.querySelector('line')!;
    expect(num(mark, 'x1')).toBe(num(mark, 'x2'));
    expect(texts(rule, 'text')).toEqual(['100']);
  });

  it('moves the legend', () => {
    expect(
      draw(grouped({ legend: 'top' })).querySelector('.q-chart')?.firstElementChild?.className,
    ).toContain('q-legend');
    expect(
      draw(grouped({ legend: 'left' }))
        .querySelector('.q-chart-side')
        ?.getAttribute('data-legend'),
    ).toBe('left');
    expect(draw(grouped({ legend: 'none' })).querySelector('.q-legend')).toBeNull();
  });
});

describe('ScatterPlot presentation', () => {
  const scatter = (props: Record<string, unknown> = {}) => (
    <ScatterPlot data={points} x="weight" y="score" {...props} />
  );
  const circles = (root: ParentNode) => root.querySelectorAll('[data-renderer="svg"] circle');

  it('applies margins and hides axes', () => {
    const usual = rows(draw(scatter()))[0];
    expect([num(usual, 'x1'), num(usual, 'x2')]).toEqual([28, WIDTH - 4]);
    const custom = rows(draw(scatter({ margin: { left: 60, right: 30 } })))[0];
    expect([num(custom, 'x1'), num(custom, 'x2')]).toEqual([60, WIDTH - 30]);
    expect(axes(draw(scatter({ xAxis: false, yAxis: false })))).toHaveLength(0);
    expect(num(rows(draw(scatter({ yAxis: false })))[0], 'x1')).toBe(4);
  });

  it('colors groups in order, or every point without a color field', () => {
    const grouped = html(scatter({ color: 'seg', colors: ['#111111', 'warning'] }));
    expect(grouped).toContain('#111111');
    expect(grouped).toContain('var(--q-warning)');
    expect(html(scatter({ colors: ['negative'] }))).toContain('var(--q-negative)');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refused = html(scatter({ colors: REFUSED }));
    for (const value of REFUSED) expect(refused).not.toContain(value);
    expect(refused).toContain('var(--q-cat-1)');
  });

  it('bounds both axes, leaves out points beyond them and says so', () => {
    const usual = draw(scatter());
    expect(circles(usual)).toHaveLength(4);
    const bounded = draw(scatter({ xMin: 15, yMax: 4.5 }));
    expect(circles(bounded)).toHaveLength(2);
    expect(texts(axes(bounded)[1], 'text')[0]).toBe('15');
    expect(texts(axes(bounded)[0], 'text').at(-1)).toBe('4.5');
    expect(summary(bounded)).toContain('The x axis starts at 15.');
    expect(summary(bounded)).toContain('The y axis ends at 4.5.');
    expect(summary(bounded)).toContain('2 points fall outside the axis limits and are not shown.');
  });

  it('takes tick counts and gridline directions', () => {
    const root = draw(scatter({ xTicks: 2, yTicks: 2, grid: 'both' }));
    expect(texts(axes(root)[0], 'text')).toEqual(['2', '4', '6']);
    expect(texts(axes(root)[1], 'text')).toEqual(['0', '20', '40']);
    expect([rows(root).length, columns(root).length]).toEqual([3, 3]);
    expect(texts(axes(draw(scatter()))[0], 'text')).toEqual(['2', '3', '4', '5']);
    expect(draw(scatter({ grid: false })).querySelector('.q-chart-grid')).toBeNull();
    expect(columns(draw(scatter({ grid: 'x' }))).length).toBeGreaterThan(0);
  });

  it('moves the legend and draws a reference line', () => {
    const side = draw(scatter({ color: 'seg', legend: 'right' }));
    expect(side.querySelector('.q-chart-side')?.getAttribute('data-legend')).toBe('right');
    expect(
      draw(scatter({ color: 'seg', legend: 'bottom' }))
        .querySelector('.q-legend')
        ?.getAttribute('data-position'),
    ).toBe('bottom');
    expect(draw(scatter({ color: 'seg', legend: 'none' })).querySelector('.q-legend')).toBeNull();

    const root = draw(scatter({ reference: { value: 8, label: 'Goal' } }));
    expect(texts(root, '.q-chart-reference text')).toEqual(['Goal']);
    expect(summary(root)).toContain('Reference line Goal at 8.');
    expect(texts(axes(root)[0], 'text').at(-1)).toBe('8');
  });
});

describe('Histogram presentation', () => {
  const histogram = (props: Record<string, unknown> = {}) => (
    <Histogram data={latencies} x="latency" bins={4} {...props} />
  );

  it('applies margins to the plot', () => {
    const usual = draw(histogram()).querySelector('.q-chart-baseline')!;
    expect([num(usual, 'x1'), num(usual, 'x2'), num(usual, 'y1')]).toEqual([0, WIDTH, 158.5]);
    const custom = draw(histogram({ margin: [10, 20, 40, 30] })).querySelector(
      '.q-chart-baseline',
    )!;
    expect([num(custom, 'x1'), num(custom, 'x2'), num(custom, 'y1')]).toEqual([
      30,
      WIDTH - 20,
      140.5,
    ]);
  });

  it('takes one validated bar color', () => {
    expect(html(histogram({ color: 'positive' }))).toContain('fill:var(--q-positive)');
    expect(html(histogram({ color: '#2f45e8' }))).toContain('fill:#2f45e8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const value of REFUSED) {
      const markup = html(histogram({ color: value }));
      expect(markup).toContain('fill:var(--q-dist-fill)');
      expect(markup).not.toContain(value);
    }
  });

  it('labels bars, hides the axis and marks a reference value with a vertical rule', () => {
    expect(texts(draw(histogram({ labels: true })), '.q-chart-value-labels text')).toEqual([
      '2',
      '1',
      '3',
      '1',
    ]);
    expect(draw(histogram({ xAxis: false })).querySelector('.q-chart-axis')).toBeNull();

    const root = draw(histogram({ reference: { value: 50, label: 'SLO' } }));
    const group = root.querySelector('.q-chart-reference')!;
    expect(group.getAttribute('data-orientation')).toBe('vertical');
    expect(texts(group, 'text')).toEqual(['SLO']);
    // Bins span 10 … 80 across the full width, so 50 sits at 40/70 of it.
    expect(num(group.querySelector('line'), 'x1')).toBe(Math.round((40 / 70) * WIDTH) + 0.5);
    expect(summary(root)).toContain('Reference line SLO at 50.');
  });
});

describe('BoxPlot presentation', () => {
  const box = (props: Record<string, unknown> = {}) => (
    <BoxPlot data={latencies} category="service" value="latency" {...props} />
  );

  it('applies margins, ticks, bounds and gridlines to horizontal boxes', () => {
    const usual = draw(box());
    expect(texts(usual, '.q-chart-axis text')).toEqual(['0', '20', '40', '60', '80']);
    expect(usual.querySelector('.q-chart-grid')).toBeNull();
    expect(texts(usual, '.q-boxplot-label')).toEqual(['web', 'api']);

    const custom = draw(box({ xTicks: 2, xMin: 0, xMax: 100, grid: true, margin: { left: 90 } }));
    expect(texts(custom, '.q-chart-axis text')).toEqual(['0', '50', '100']);
    expect(columns(custom)).toHaveLength(3);
    expect(num(columns(custom)[0], 'x1')).toBe(90.5);

    const bare = draw(box({ yAxis: false, xAxis: false }));
    expect(bare.querySelector('.q-boxplot-label')).toBeNull();
    expect(bare.querySelector('.q-chart-axis')).toBeNull();
  });

  it('uses the y settings for vertical boxes', () => {
    const root = draw(box({ orientation: 'vertical', yTicks: 2, yMax: 100, grid: false }));
    expect(texts(axes(root)[0], 'text')).toEqual(['0', '50', '100']);
    expect(root.querySelector('.q-chart-grid')).toBeNull();
    expect(rows(draw(box({ orientation: 'vertical' }))).length).toBe(5);
  });
});

describe('DonutChart presentation', () => {
  const donut = (props: Record<string, unknown> = {}) => (
    <DonutChart data={flat} category="region" value="users" {...props} />
  );

  it('colors slices and refuses anything but tokens', () => {
    const markup = html(donut({ colors: ['signal', '#f26b3a'] }));
    expect(markup).toContain('stroke:var(--q-signal)');
    expect(markup).toContain('stroke:#f26b3a');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refused = html(donut({ colors: REFUSED }));
    expect(refused).toContain('stroke:var(--q-cat-1)');
    for (const value of REFUSED) expect(refused).not.toContain(value);
  });

  it('places the legend and adds values to it', () => {
    const usual = draw(donut()).querySelector('.q-donut')!;
    expect(usual.hasAttribute('data-legend')).toBe(false);
    expect(usual.querySelector('.q-donut-legend')).not.toBeNull();
    for (const side of ['left', 'top', 'bottom', 'right'] as const) {
      expect(
        draw(donut({ legend: side }))
          .querySelector('.q-donut')
          ?.getAttribute('data-legend'),
      ).toBe(side);
    }
    expect(draw(donut({ legend: 'none' })).querySelector('.q-donut-legend')).toBeNull();
    expect(draw(donut({ legend: false })).querySelector('.q-donut-legend')).toBeNull();

    expect(draw(donut()).querySelector('.q-donut-amount')).toBeNull();
    expect(texts(draw(donut({ labels: true, format: 'currency' })), '.q-donut-amount')).toEqual([
      '$120.00',
      '$90.00',
    ]);
  });
});

describe('single-color charts', () => {
  it('colors a sparkline line from a token and falls back when refused', () => {
    expect(html(<Sparkline data={[1, 3, 2]} color="signal" />)).toContain('stroke:var(--q-signal)');
    expect(html(<Sparkline data={[1, 3, 2]} color="#2f45e8" />)).toContain('stroke:#2f45e8');
    expect(html(<Sparkline data={[1, 3, 2]} />)).toContain('stroke:var(--q-text)');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const value of REFUSED) {
      const markup = html(<Sparkline data={[1, 3, 2]} color={value} />);
      expect(markup).toContain('stroke:var(--q-text)');
      expect(markup).not.toContain(value);
    }
  });

  it('colors bar list bars through variables, so dimmed rows keep their rule', () => {
    const list = (props: Record<string, unknown> = {}) => (
      <BarList data={flat} category="region" value="users" {...props} />
    );
    const markup = html(list({ color: 'positive' }));
    expect(markup).toContain('--q-bar-list-color:var(--q-positive)');
    expect(markup).toContain(
      '--q-bar-list-fill:color-mix(in srgb, var(--q-positive) 16%, transparent)',
    );
    expect(html(list())).not.toContain('--q-bar-list-color');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const value of REFUSED) {
      const refused = html(list({ color: value }));
      expect(refused).not.toContain('--q-bar-list-color');
      expect(refused).not.toContain(value);
    }
  });
});
