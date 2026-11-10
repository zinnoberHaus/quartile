import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DonutChart } from '../charts/DonutChart';
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
y.ticks: 4
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
      yTicks: 4,
      xTicks: 4,
      grid: false,
    });
    const root = block(EXAMPLES.axes);
    const [y, x] = Array.from(root.querySelectorAll('.q-chart-axis'));
    expect(texts(y, 'text')).toEqual(['2%', '3%', '4%', '5%']);
    expect(texts(x, 'text')).toHaveLength(4);
    expect(root.querySelector('.q-chart-grid')).toBeNull();
    // Asking for three between the same bounds keeps these four: 2%, 4% is as near in size,
    // but stops short of the upper bound.
    const three = block(EXAMPLES.axes.replace('y.ticks: 4', 'y.ticks: 3'));
    expect(texts(three.querySelector('.q-chart-axis')!, 'text')).toEqual(['2%', '3%', '4%', '5%']);
  });

  it('legend and labels: legend under the plot, names and last values at the line ends', () => {
    const root = block(EXAMPLES.legend);
    const legend = root.querySelector('.q-legend')!;
    expect(legend.getAttribute('data-position')).toBe('bottom');
    expect(legend.previousElementSibling?.querySelector('svg')).not.toBeNull();
    expect(texts(root, '.q-chart-end-labels text')).toEqual(['Team $189K', 'Pro $104K']);
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

describe('labels beside a reference rule, from a block', () => {
  const source = `bar sum(revenue) by region
labels: yes
reference: 1000000
reference.label: Target
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
`;

  it('draws the rule text beside the plot and keeps the rule off the value labels', () => {
    expect(compileBlock(source).diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    const root = block(source);
    // Right edge of each bar, from its path: `M x,bottom v … q0,-r r,-r h (w - 2r) …`.
    const barRights = Array.from(root.querySelectorAll('.q-bar-marks path')).map((path) => {
      const d = path.getAttribute('d') ?? '';
      const x = Number(/^M([\d.]+)/.exec(d)![1]);
      const r = Number(/q0,-([\d.]+)/.exec(d)![1]);
      return x + Number(/h([\d.]+)/.exec(d)![1]) + 2 * r;
    });
    const rule = root.querySelector('.q-chart-reference line')!;
    const text = root.querySelector('.q-chart-reference text')!;
    expect(text.textContent).toBe('Target');
    expect(barRights).toHaveLength(3);
    // The text starts past the last bar and ends inside the chart: it cannot be on a bar.
    expect(num(text, 'x')).toBeGreaterThan(Math.max(...barRights));
    expect(num(text, 'x') + 'Target'.length * 6.6).toBeLessThanOrEqual(640);

    const labels = Array.from(root.querySelectorAll('.q-chart-value-labels text'));
    expect(labels.map((l) => l.textContent)).toEqual(['$1.2M', '$860K', '$2.1M']);
    const ruleY = num(rule, 'y1');
    for (const label of labels) {
      // An 11px label reaches about 10px above its baseline and 3px below.
      const y = num(label, 'y');
      expect(ruleY < y - 10 || ruleY > y + 3).toBe(true);
    }
  });

  it('gives labels and rule text a halo in the surface color', () => {
    const css = readFileSync(join(__dirname, '../charts/core/chart.css'), 'utf8');
    const haloed = css
      .split('}')
      .filter((rule) => /paint-order: stroke;[^}]*stroke: var\(--q-surface\);/.test(rule))
      .map((rule) => rule.slice(0, rule.indexOf('{')))
      .join(' ');
    for (const selector of [
      '.q-chart-reference text',
      '.q-chart-value-labels text',
      '.q-chart-end-labels text',
      '.q-chart-haloed text',
    ]) {
      expect(haloed).toContain(selector);
    }
  });
});

describe('donut centre figure', () => {
  const donut = (settings: string, rows: string) =>
    `donut sum(revenue) by region\n${settings}---\nregion,revenue\n${rows}`;
  const BIG = 'EMEA,1200000\nAPAC,860000\nAmericas,2100000\nLATAM,430000\n';
  const centre = (root: ParentNode) => root.querySelector('.q-donut-value')!;
  const summary = (root: ParentNode) =>
    root.querySelector('p.q-visually-hidden')?.textContent ?? '';

  it('shortens a total that would not fit the ring, and keeps the full value readable', () => {
    for (const settings of ['', 'size: 120\n', 'size: 96\nthickness: 12\n']) {
      const root = block(donut(settings, BIG));
      // Whole-currency rows format in full ($4,590,000), which is wider than the hole.
      expect([settings, centre(root).textContent]).toEqual([settings, '$4.59M']);
      expect(centre(root).getAttribute('title')).toBe('$4,590,000');
      expect(summary(root)).toContain('total $4,590,000');
      expect(texts(root, 'table td').join(' ')).toContain('$2,100,000');
    }
  });

  it('leaves a total that fits as it is', () => {
    const small = block(donut('', 'EMEA,1200\nAPAC,860\n'));
    expect(centre(small).textContent).toBe('$2,060');
    expect(centre(small).hasAttribute('title')).toBe(false);
    // A larger ring has room for the long form.
    const large = block(donut('size: 240\n', BIG));
    expect(centre(large).textContent).toBe('$4,590,000');
    expect(centre(large).hasAttribute('title')).toBe(false);
  });

  it('shortens the hovered slice the same way, and leaves a custom centre alone', () => {
    const root = block(donut('', BIG));
    fireEvent.pointerEnter(root.querySelector('.q-donut-slice')!);
    expect(centre(root).textContent).toBe('$2.1M');
    expect(centre(root).getAttribute('title')).toBe('$2,100,000');
    const custom = block(donut('centerValue: 4,590,000 dollars\n', BIG));
    expect(centre(custom).textContent).toBe('4,590,000 dollars');
    expect(centre(custom).hasAttribute('title')).toBe(false);
  });

  it('shortens under an explicit format and for plain counts', () => {
    const rows = [
      { region: 'EMEA', revenue: 1200000 },
      { region: 'APAC', revenue: 860000 },
    ];
    const explicit = render(
      <DonutChart data={rows} category="region" value="revenue" format="currency" size={120} />,
    ).container;
    expect(centre(explicit).textContent).toBe('$2.06M');
    expect(centre(explicit).getAttribute('title')).toBe('$2,060,000.00');
    // A format given as options keeps its currency in the short form.
    const euros = render(
      <DonutChart
        data={rows}
        category="region"
        value="revenue"
        format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }}
      />,
    ).container;
    expect(centre(euros).textContent).toBe('€2.06M');
    expect(centre(euros).getAttribute('title')).toBe('€2,060,000');
    const counts = render(
      <DonutChart
        data={rows.map((r) => ({ region: r.region, units: r.revenue * 10 }))}
        category="region"
        value="units"
      />,
    ).container;
    expect(centre(counts).textContent).toBe('20.6M');
    expect(centre(counts).getAttribute('title')).toBe('20,600,000');
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
