import { act, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureEmbed, defineQuartileElements, setEmbedStyles } from '../embed/element';
import { compileBlock } from '../lang/compile';
import type { Diagnostic } from '../lang/diagnostics';
import { renderBlockToHTML } from '../server';
import { QuartileBlock } from './QuartileBlock';
import { QuartileDocument } from './QuartileDocument';

/** The examples the documentation shows: each must compile cleanly and draw what it says. */
const EXAMPLES = {
  margin: `line revenue by month
title: Monthly revenue
margin: 16 24 32 48
margin.left: 72
---
month,revenue
2026-01,120000
2026-02,180000
2026-03,150000
`,
  colors: `bar revenue by region and year
title: Revenue by region
colors: signal, #f26b3a
---
region,year,revenue
EMEA,2025,1200000
EMEA,2026,1500000
APAC,2025,860000
APAC,2026,910000
`,
  axes: `line conversion by week
title: Checkout conversion
y.min: 2%
y.max: 5%
y.ticks: 3
x.ticks: 4
gridlines: no
---
week,conversion
2026-01-05,3.1%
2026-01-12,3.4%
2026-01-19,3.9%
2026-01-26,4.2%
`,
  legend: `line mrr by month and plan
title: MRR by plan
legend: bottom
labels: yes
---
month,plan,mrr
2026-01,Team,176000
2026-02,Team,181000
2026-03,Team,189000
2026-01,Pro,90000
2026-02,Pro,97000
2026-03,Pro,104000
`,
  reference: `bar sum(revenue) by region
title: Revenue against target
reference: 1000000
reference.label: Target
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
`,
};

const texts = (root: ParentNode, selector: string) =>
  Array.from(root.querySelectorAll(selector)).map((n) => n.textContent ?? '');
const num = (el: Element | null | undefined, attr: string) => Number(el?.getAttribute(attr));
const gridRows = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.q-chart-grid:not([data-axis]) line'));
const block = (source: string) => render(<QuartileBlock source={source} />).container;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('documented examples', () => {
  it('compile without errors or warnings', () => {
    for (const [name, source] of Object.entries(EXAMPLES)) {
      const problems = compileBlock(source).diagnostics.filter((d) => d.severity !== 'info');
      expect([name, problems]).toEqual([name, []]);
    }
  });

  it('margin: explicit sides replace the computed ones', () => {
    expect(compileBlock(EXAMPLES.margin).spec).toMatchObject({
      margin: { top: 16, right: 24, bottom: 32, left: 72 },
    });
    const rows = gridRows(block(EXAMPLES.margin));
    expect([num(rows[0], 'x1'), num(rows[0], 'x2')]).toEqual([72, 640 - 24]);
    expect([num(rows[0], 'y1'), num(rows.at(-1), 'y1')]).toEqual([240 - 32 + 0.5, 16.5]);
  });

  it('colors: series take the block colors in order', () => {
    const html = renderBlockToHTML(EXAMPLES.colors);
    expect(html).toContain('fill:var(--q-signal)');
    expect(html).toContain('fill:#f26b3a');
    expect(html).not.toContain('fill:var(--q-cat-1)');
  });

  it('axes: bounds, tick counts and no gridlines', () => {
    expect(compileBlock(EXAMPLES.axes).spec).toMatchObject({
      yMin: 0.02,
      yMax: 0.05,
      yTicks: 3,
      xTicks: 4,
      grid: false,
    });
    const root = block(EXAMPLES.axes);
    const [y, x] = Array.from(root.querySelectorAll('.q-chart-axis'));
    expect(texts(y, 'text')).toEqual(['2%', '3%', '4%', '5%']);
    expect(texts(x, 'text')).toHaveLength(4);
    expect(root.querySelector('.q-chart-grid')).toBeNull();
  });

  it('legend and labels: legend under the plot, names and last values at the line ends', () => {
    const root = block(EXAMPLES.legend);
    const legend = root.querySelector('.q-legend')!;
    expect(legend.getAttribute('data-position')).toBe('bottom');
    expect(legend.previousElementSibling?.querySelector('svg')).not.toBeNull();
    expect(texts(root, '.q-chart-end-labels text')).toEqual(['Team $189.0K', 'Pro $104.0K']);
  });

  it('reference: a labelled rule that is also in the accessible summary', () => {
    expect(compileBlock(EXAMPLES.reference).spec).toMatchObject({
      reference: { value: 1000000, label: 'Target' },
    });
    const root = block(EXAMPLES.reference);
    expect(texts(root, '.q-chart-reference text')).toEqual(['Target']);
    expect(root.querySelector('p.q-visually-hidden')?.textContent).toContain(
      'Reference line Target at $1,000,000.',
    );
    expect(renderBlockToHTML(EXAMPLES.reference)).toContain('q-chart-reference');
  });
});

describe('blockColors', () => {
  const fills = (root: ParentNode) =>
    Array.from(root.querySelectorAll<SVGPathElement>('.q-bar-marks path')).map((p) => p.style.fill);

  it('lets a block color its chart by default', () => {
    expect(new Set(fills(block(EXAMPLES.colors)))).toEqual(
      new Set(['var(--q-signal)', 'rgb(242, 107, 58)']),
    );
  });

  it('drops block colors on a block, and reports a note', () => {
    let seen: Diagnostic[] = [];
    const { container } = render(
      <QuartileBlock
        source={EXAMPLES.colors}
        blockColors={false}
        onDiagnostics={(d) => {
          seen = d;
        }}
      />,
    );
    expect(new Set(fills(container))).toEqual(new Set(['var(--q-cat-1)', 'var(--q-cat-2)']));
    expect(seen.map((d) => `${d.severity}: ${d.message}`)).toContain(
      'info: This page keeps its own chart colors, so “colors” was ignored.',
    );
  });

  it('applies to every block of a document, unless a block opts back in', () => {
    const { container } = render(
      <QuartileDocument blockColors={false}>
        <QuartileBlock source={EXAMPLES.colors} />
        <QuartileBlock source={EXAMPLES.colors} blockColors />
      </QuartileDocument>,
    );
    const [strict, open] = Array.from(container.querySelectorAll('.q-block'));
    expect(new Set(fills(strict))).toEqual(new Set(['var(--q-cat-1)', 'var(--q-cat-2)']));
    expect(new Set(fills(open))).toEqual(new Set(['var(--q-signal)', 'rgb(242, 107, 58)']));
  });

  it('applies to static rendering', () => {
    const strict = renderBlockToHTML(EXAMPLES.colors, { blockColors: false });
    expect(strict).toContain('fill:var(--q-cat-1)');
    expect(strict).not.toContain('fill:#f26b3a');
    expect(strict).not.toContain('fill:var(--q-signal)');
  });
});

describe('blockColors in the embed', () => {
  beforeAll(() => {
    setEmbedStyles(':root,\n[data-theme="light"] { --q-bg: #fff; }');
    defineQuartileElements();
  });
  afterEach(() => configureEmbed({ blockColors: true }));

  const embed = async () => {
    const el = document.createElement('quartile-chart');
    el.setAttribute('theme', 'light');
    el.textContent = EXAMPLES.colors;
    document.body.appendChild(el);
    await act(async () => {});
    return Array.from(el.shadowRoot!.querySelectorAll<SVGPathElement>('.q-bar-marks path')).map(
      (p) => p.style.fill,
    );
  };

  it('colors charts from blocks unless the page turns that off', async () => {
    expect(new Set(await embed())).toEqual(new Set(['var(--q-signal)', 'rgb(242, 107, 58)']));
    document.body.innerHTML = '';
    configureEmbed({ blockColors: false });
    expect(new Set(await embed())).toEqual(new Set(['var(--q-cat-1)', 'var(--q-cat-2)']));
  });
});
