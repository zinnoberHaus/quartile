import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileBlock } from '../lang/compile';
import { QuartileBlock } from '../markdown/QuartileBlock';
import type { ComponentSpec } from '../spec/schema';
import { validateSpec } from '../spec/validate';
import { AreaChart } from './AreaChart';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { ScatterPlot } from './ScatterPlot';
import { Sparkline } from './Sparkline';

const growth = [
  { month: '2026-01-01', users: 12 },
  { month: '2026-02-01', users: 160 },
  { month: '2026-03-01', users: 900 },
  { month: '2026-04-01', users: 21000 },
];
const withZero = [{ month: '2025-12-01', users: 0 }, ...growth];
const plans = growth.flatMap((r) => [
  { ...r, plan: 'Team' },
  { month: r.month, plan: 'Pro', users: r.users * 3 },
]);
const regions = [
  { region: 'EMEA', users: 120 },
  { region: 'APAC', users: 90 },
  { region: 'LATAM', users: 40 },
];

const texts = (root: ParentNode | null | undefined, selector: string) =>
  Array.from(root?.querySelectorAll(selector) ?? []).map((n) => n.textContent ?? '');
const yLabels = (root: ParentNode) => texts(root.querySelectorAll('.q-chart-axis')[0], 'text');
const summary = (root: ParentNode) => root.querySelector('p.q-visually-hidden')?.textContent ?? '';
const note = (root: ParentNode) => root.querySelector('.q-chart-note')?.textContent ?? null;
const draw = (el: ReactElement) => render(el).container;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const compile = (source: string) => {
  const compiled = compileBlock(source);
  return {
    spec: compiled.spec as ComponentSpec,
    warnings: compiled.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message),
    errors: compiled.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
  };
};
const FALLBACK = 'A log scale needs values above zero, so this chart uses a linear scale.';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('yScale: log', () => {
  it('spaces a line chart by ratio and says so', () => {
    const linear = draw(<LineChart data={growth} x="month" y="users" />);
    expect(yLabels(linear)).toEqual(['0', '5K', '10K', '15K', '20K', '25K']);
    expect(summary(linear)).not.toContain('logarithmic');

    const log = draw(<LineChart data={growth} x="month" y="users" yScale="log" points />);
    expect(yLabels(log)).toEqual(['10', '100', '1K', '10K', '100K']);
    expect(note(log)).toBeNull();
    expect(summary(log)).toContain('The y axis is logarithmic.');
    // 12 → 160 → 900 are similar ratios, so the first three points are similar steps apart;
    // on a linear axis they would sit almost on top of each other.
    const cy = Array.from(log.querySelectorAll('.q-chart-dot')).map((d) =>
      Number(d.getAttribute('cy')),
    );
    expect(cy[0] - cy[1]).toBeGreaterThan(40);
    expect(cy[1] - cy[2]).toBeGreaterThan(25);
  });

  it('falls back to linear with a visible note when a value is zero or negative', () => {
    const root = draw(<LineChart data={withZero} x="month" y="users" yScale="log" />);
    expect(yLabels(root)).toEqual(['0', '5K', '10K', '15K', '20K', '25K']);
    expect(note(root)).toBe(FALLBACK);
    expect(summary(root)).toContain(FALLBACK);
    expect(summary(root)).not.toContain('logarithmic.');
    const negative = [{ month: '2025-12-01', users: -5 }, ...growth];
    expect(note(draw(<LineChart data={negative} x="month" y="users" yScale="log" />))).toBe(
      FALLBACK,
    );
    expect(note(draw(<LineChart data={growth} x="month" y="users" yScale="linear" />))).toBeNull();
  });

  it('applies to overlapping areas and refuses stacked ones', () => {
    const area = (props: Record<string, unknown>) => (
      <AreaChart data={plans} x="month" y="users" color="plan" {...props} />
    );
    const log = draw(area({ yScale: 'log' }));
    expect(yLabels(log)).toEqual(['10', '100', '1K', '10K', '100K']);
    expect(note(log)).toBeNull();
    expect(summary(log)).toContain('The y axis is logarithmic.');

    const stacked = draw(area({ yScale: 'log', stack: true }));
    expect(yLabels(stacked)[0]).toBe('0');
    expect(note(stacked)).toBe(
      'Stacked areas are measured from zero, so this chart uses a linear scale.',
    );
    expect(summary(stacked)).toContain('Stacked areas are measured from zero');

    const zero = withZero.map((r) => ({ ...r, plan: 'Team' }));
    expect(note(draw(<AreaChart data={zero} x="month" y="users" yScale="log" />))).toBe(FALLBACK);
  });

  it('applies to the y axis of a scatter plot', () => {
    const points = growth.map((r, i) => ({ step: i + 1, loss: r.users }));
    const log = draw(<ScatterPlot data={points} x="step" y="loss" yScale="log" />);
    expect(yLabels(log)).toEqual(['10', '100', '1K', '10K', '100K']);
    expect(note(log)).toBeNull();
    expect(summary(log)).toContain('The y axis is logarithmic.');
    const cy = Array.from(log.querySelectorAll('[data-renderer="svg"] circle')).map((c) =>
      Number(c.getAttribute('cy')),
    );
    expect(Math.max(...cy) - Math.min(...cy)).toBeGreaterThan(100);
    expect(new Set(cy.map((v) => Math.round(v / 20))).size).toBe(4);

    const fallback = draw(
      <ScatterPlot data={[{ step: 0, loss: 0 }, ...points]} x="step" y="loss" yScale="log" />,
    );
    expect(note(fallback)).toBe(FALLBACK);
    expect(summary(fallback)).toContain(FALLBACK);
    expect(yLabels(fallback)[0]).toBe('0');
  });

  it('is a block setting, in several spellings', () => {
    const rows = '---\nmonth,users\n2026-01,12\n2026-02,160\n2026-03,900\n';
    expect(compile(`line users by month\nyScale: log\n${rows}`).spec.yScale).toBe('log');
    expect(compile(`line users by month\ny.scale: Log\n${rows}`).spec.yScale).toBe('log');
    expect(compile(`line users by month\nscale: logarithmic\n${rows}`).spec.yScale).toBe('log');
    expect(compile(`line users by month\nlog: yes\n${rows}`).spec.yScale).toBe('log');
    expect(compile(`area users by month\nlog scale: no\n${rows}`).spec.yScale).toBe('linear');
    expect(compile(`scatter users vs users\ny scale: log\n${rows}`).spec.yScale).toBe('log');
    const bad = compile(`line users by month\nyScale: sqrt\n${rows}`);
    expect(bad.spec.yScale).toBeUndefined();
    expect(bad.warnings[0]).toContain('is not one of linear, log');
    // Bars are measured from zero and have no log scale.
    expect(compile(`bar users by month\nyScale: log\n${rows}`).warnings[0]).toContain(
      'is not a bar setting',
    );
  });

  it('shows the fallback note in a rendered block', () => {
    const { container } = render(
      <QuartileBlock
        source={'line users by month\nlog: yes\n---\nmonth,users\n2026-01,0\n2026-02,9\n'}
      />,
    );
    expect(note(container)).toBe(FALLBACK);
  });
});

describe('strokeWidth', () => {
  it('sets the line width and otherwise leaves it to the token', () => {
    const usual = html(<LineChart data={growth} x="month" y="users" />);
    expect(usual).toContain('class="q-chart-line"');
    // The attribute is the width without the stylesheet; the token rule overrides it with it.
    expect(usual).toContain('stroke-width="2"');
    expect(usual).not.toMatch(/style="stroke:[^"]*stroke-width/);
    expect(html(<LineChart data={growth} x="month" y="users" strokeWidth={4} />)).toContain(
      'style="stroke:var(--q-cat-1);stroke-width:4"',
    );
    expect(html(<AreaChart data={growth} x="month" y="users" strokeWidth={0.5} />)).toContain(
      'style="stroke:var(--q-cat-1);stroke-width:0.5"',
    );
    // Out-of-range and non-numeric values are bounded or ignored.
    expect(html(<LineChart data={growth} x="month" y="users" strokeWidth={900} />)).toContain(
      'stroke-width:16"',
    );
    expect(
      html(<LineChart data={growth} x="month" y="users" strokeWidth={'4px;x' as never} />),
    ).not.toMatch(/style="stroke:[^"]*stroke-width/);
  });

  it('sets a sparkline width', () => {
    expect(html(<Sparkline data={[1, 3, 2]} />)).toContain('style="stroke:var(--q-text)"');
    expect(html(<Sparkline data={[1, 3, 2]} strokeWidth={2.5} />)).toContain(
      'style="stroke:var(--q-text);stroke-width:2.5"',
    );
  });

  it('is a block setting', () => {
    const rows = '---\nmonth,users\n2026-01,12\n2026-02,160\n';
    expect(compile(`line users by month\nstrokeWidth: 3\n${rows}`).spec.strokeWidth).toBe(3);
    expect(compile(`line users by month\nstroke width: 1.5px\n${rows}`).spec.strokeWidth).toBe(1.5);
    expect(compile(`area users by month\nline width: 4\n${rows}`).spec.strokeWidth).toBe(4);
    expect(compile(`sparkline users by month\nstroke: 2\n${rows}`).spec.strokeWidth).toBe(2);
    const bad = compile(`line users by month\nstrokeWidth: 40\n${rows}`);
    expect(bad.spec).toBeUndefined();
    expect(bad.errors[0]).toContain('“strokeWidth”: Expected a value ≤ 16');
  });
});

describe('bar radius and padding', () => {
  const bars = (props: Record<string, unknown> = {}) => (
    <BarChart data={regions} x="region" y="users" {...props} />
  );
  const paths = (root: ParentNode) =>
    Array.from(root.querySelectorAll('.q-bar-marks path')).map((p) => p.getAttribute('d') ?? '');
  /** Width of a vertical bar from its path: `M x,y v… q… h<w - 2r> …`. */
  const widthOf = (d: string, r: number) => Number(/h(-?[\d.]+)/.exec(d)?.[1]) + 2 * r;

  it('rounds the bar ends by the radius, square at 0', () => {
    expect(paths(draw(bars()))[0]).toContain('q0,-2 2,-2');
    expect(paths(draw(bars({ radius: 8 })))[0]).toContain('q0,-8 8,-8');
    expect(paths(draw(bars({ radius: 0 })))[0]).toContain('q0,0 0,0');
    // Never more than half the bar.
    const capped = paths(draw(bars({ radius: 4000 })))[0];
    expect(capped).toContain('q0,-40 40,-40');
  });

  it('reads the default radius from the --q-chart-bar-radius token after mount', () => {
    const real = globalThis.getComputedStyle;
    vi.stubGlobal('getComputedStyle', (el: Element) => {
      const style = real(el);
      return {
        ...style,
        getPropertyValue: (name: string) =>
          name === '--q-chart-bar-radius' ? ' 6px' : style.getPropertyValue(name),
      };
    });
    expect(paths(draw(bars()))[0]).toContain('q0,-6 6,-6');
    // An explicit radius wins over the token.
    expect(paths(draw(bars({ radius: 1 })))[0]).toContain('q0,-1 1,-1');
    // Server rendering has no computed style and draws the default.
    expect(html(bars())).toContain('q0,-2 2,-2');
  });

  it('sets the gap between bars', () => {
    const usual = widthOf(paths(draw(bars()))[0], 2);
    const tight = widthOf(paths(draw(bars({ padding: 0 })))[0], 2);
    const loose = widthOf(paths(draw(bars({ padding: 0.8 })))[0], 2);
    expect(tight).toBeGreaterThan(usual);
    expect(loose).toBeLessThan(usual);
    // With no padding the three bars share the plot width exactly.
    expect(tight * 3).toBeCloseTo(640 - 32 - 4, 5);
    expect(widthOf(paths(draw(bars({ padding: 5 })))[0], 2)).toBeCloseTo(
      widthOf(paths(draw(bars({ padding: 0.9 })))[0], 2),
      5,
    );
  });

  it('are block settings', () => {
    const rows = '---\nregion,users\nEMEA,120\nAPAC,90\n';
    const { spec } = compile(`bar users by region\nradius: 0\npadding: 0.5\n${rows}`);
    expect([spec.radius, spec.padding]).toEqual([0, 0.5]);
    const words = compile(`bar users by region\ncorner radius: 6px\nbar padding: 0.1\n${rows}`);
    expect([words.spec.radius, words.spec.padding]).toEqual([6, 0.1]);
    expect(compile(`bar users by region\npadding: 2\n${rows}`).errors[0]).toContain(
      '“padding”: Expected a value ≤ 0.9',
    );
    expect(compile(`line users by region\nradius: 4\n${rows}`).warnings[0]).toContain(
      'is not a line setting',
    );
  });
});

describe('annotations', () => {
  const rows = '---\nmonth,users\n2026-01,12\n2026-02,160\n2026-03,900\n';

  it('is a JSON value in a block, drawn as text', () => {
    const source = `line users by month\nannotations: [{"x": "2026-02-01", "label": "Launch <b>"}]\n${rows}`;
    const { spec, errors } = compile(source);
    expect(errors).toEqual([]);
    expect(spec.annotations).toEqual([{ x: '2026-02-01', label: 'Launch <b>' }]);
    const { container } = render(<QuartileBlock source={source} />);
    expect(texts(container, '.q-chart-annotation text')).toEqual(['Launch <b>']);
    expect(container.querySelector('.q-chart-annotation b')).toBeNull();
    const area = compile(
      `area users by month\nannotation: [{"x": "2026-02-01", "label": "A"}]\n${rows}`,
    );
    expect(area.spec.annotations).toEqual([{ x: '2026-02-01', label: 'A' }]);
  });

  it('follows categories that the compiler put in order', () => {
    const source =
      'line users by quarter\nannotations: [{"x": "Q2", "label": "Launch"}]\n---\nquarter,users\nQ1,10\nQ2,14\nQ3,12\n';
    expect(compile(source).spec.annotations).toEqual([{ x: 1, label: 'Launch' }]);
    const { container } = render(<QuartileBlock source={source} />);
    expect(texts(container, '.q-chart-annotation text')).toEqual(['Launch']);
  });

  it('is validated by the schema', () => {
    const line = { component: 'LineChart', data: 'd', x: 'date', y: 'users' };
    const ok = (extra: object) => validateSpec({ ...line, ...extra }).errors;
    expect(
      ok({
        annotations: [
          { x: '2026-03-01', label: 'Launch' },
          { x: 4, label: 'B' },
        ],
      }),
    ).toEqual([]);
    expect(ok({ annotations: [{ x: '2026-03-01' }] })[0].message).toContain(
      'Missing required property "label"',
    );
    expect(ok({ annotations: [{ x: { at: 1 }, label: 'A' }] })[0].path).toBe('/annotations/0/x');
    expect(ok({ annotations: [{ x: 1, label: 'A', color: 'red' }] })[0].message).toContain(
      'Unknown property "color"',
    );
    expect(ok({ annotations: 'Launch' })[0].path).toBe('/annotations');
  });
});

describe('P1 settings in the schema and the tokens', () => {
  it('accepts and bounds the new properties', () => {
    const line = { component: 'LineChart', data: 'd', x: 'date', y: 'users' };
    const bar = { component: 'BarChart', data: 'd', x: 'region', y: 'users' };
    const errors = (spec: object) => validateSpec(spec).errors.map((e) => `${e.path} ${e.message}`);
    expect(errors({ ...line, yScale: 'log', strokeWidth: 3 })).toEqual([]);
    expect(errors({ ...line, yScale: 'linear' })).toEqual([]);
    expect(
      errors({ component: 'AreaChart', data: 'd', x: 'a', y: 'b', yScale: 'log', strokeWidth: 1 }),
    ).toEqual([]);
    expect(errors({ component: 'ScatterPlot', data: 'd', x: 'a', y: 'b', yScale: 'log' })).toEqual(
      [],
    );
    expect(errors({ component: 'Sparkline', data: 'd', y: 'b', strokeWidth: 2 })).toEqual([]);
    expect(errors({ ...bar, radius: 0, padding: 0.5 })).toEqual([]);
    expect(errors({ ...line, yScale: 'sqrt' })[0]).toContain('/yScale');
    expect(errors({ ...line, strokeWidth: 0 })[0]).toContain(
      '/strokeWidth Expected a value ≥ 0.25',
    );
    expect(errors({ ...line, strokeWidth: '2px' })[0]).toContain('/strokeWidth Expected a number');
    expect(errors({ ...bar, radius: -1 })[0]).toContain('/radius');
    expect(errors({ ...bar, padding: 1 })[0]).toContain('/padding Expected a value ≤ 0.9');
    expect(errors({ ...bar, yScale: 'log' })[0]).toContain('Unknown property "yScale"');
    expect(errors({ ...bar, strokeWidth: 2 })[0]).toContain('Unknown property "strokeWidth"');
    expect(errors({ ...line, radius: 2 })[0]).toContain('Unknown property "radius"');
  });

  it('defines the chart tokens once and reads them in the chart stylesheet', () => {
    const tokens = readFileSync(join(__dirname, '../styles/tokens.css'), 'utf8');
    expect(tokens).toContain('--q-chart-stroke-width: 2px;');
    expect(tokens).toContain('--q-chart-bar-radius: 2px;');
    expect(tokens).toContain('--q-chart-axis-font-size: 11px;');
    const css = readFileSync(join(__dirname, 'core/chart.css'), 'utf8');
    expect(css).toMatch(/\.q-chart-line \{\s*stroke-width: var\(--q-chart-stroke-width, 2px\);/);
    expect(css).toMatch(
      /\.q-chart-axis text \{[^}]*font-size: var\(--q-chart-axis-font-size, 11px\);/,
    );
  });
});
