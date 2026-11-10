// Colors written by a developer in React props may be any CSS color. Colors that arrive as text
// (a Markdown block, a JSON spec from a model) may only be palette names, 1–8 or hex. Two gates
// enforce that, and every path from such text to a chart passes one of them:
//
//   compileBlock  drops anything else with a warning (block text and JSON blocks)
//   SpecView      validates the spec against the schema and refuses to draw it otherwise
//
// QuartileBlock, the static renderer and <quartile-chart> all compile, then render through
// SpecView; nothing else turns a spec into a component.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BarChart } from '../charts/BarChart';
import { BarList } from '../charts/BarList';
import { isChartColor } from '../charts/core/colors';
import { defineQuartileElements, setEmbedStyles } from '../embed/element';
import { compileBlock } from '../lang/compile';
import { QuartileBlock } from '../markdown/QuartileBlock';
import { Selection } from '../selection/Selection';
import { renderBlockToHTML } from '../server';
import { SpecView } from './SpecView';
import type { ComponentSpec } from './schema';
import { validateSpec } from './validate';

const rows = [
  { region: 'EMEA', users: 120 },
  { region: 'APAC', users: 90 },
];
const data = { d: rows };
const CSV = '---\nregion,users\nEMEA,120\nAPAC,90\n';

/** Valid CSS a developer may pass, and text that is not a color at all: none of it is data. */
const NOT_DATA = [
  'rebeccapurple',
  'red',
  'rgb(20 80 200)',
  'var(--brand)',
  'var(--q-signal)',
  'url(https://example.com/p.svg#a)',
  'signal; background: url(https://example.com/x)',
  '#12',
];

const fills = (root: ParentNode) =>
  Array.from(root.querySelectorAll<SVGPathElement>('.q-bar-marks path')).map((p) => p.style.fill);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('React props: trusted code', () => {
  it('draws whatever CSS color a developer passes', () => {
    const markup = renderToStaticMarkup(
      <BarChart
        data={rows}
        x="region"
        y="users"
        colors={['color-mix(in srgb, rebeccapurple 60%, white)']}
      />,
    );
    expect(markup).toContain('fill:color-mix(in srgb, rebeccapurple 60%, white)');
  });
});

describe('gate: compileBlock', () => {
  const compile = (source: string, blockColors = true) => {
    const compiled = compileBlock(source, { blockColors });
    return {
      spec: compiled.spec as ComponentSpec | undefined,
      text: JSON.stringify(compiled.spec ?? null),
      warnings: compiled.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message),
      errors: compiled.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
    };
  };

  it('keeps tokens and hex from a block and drops every other text, CSS or not', () => {
    for (const bad of NOT_DATA) {
      const list = compile(`bar users by region\ncolors: #2f45e8, ${bad}\n${CSV}`);
      const kept = list.spec?.colors as unknown[];
      // The hex survives; of the rest, at most a bare token inside the text does.
      expect([bad, kept[0], kept.every(isChartColor)]).toEqual([bad, '#2f45e8', true]);
      expect(list.text).not.toMatch(/url\(|rgb\(|var\(|purple|example\.com|background/);
      expect(list.warnings.join(' ')).toContain('is not a color a block can set');
      expect(list.errors).toEqual([]);

      const single = compile(`histogram users\ncolor: ${bad}\n${CSV}`);
      const color = single.spec?.color;
      expect([bad, color === undefined || isChartColor(color)]).toEqual([bad, true]);
      expect(single.text).not.toMatch(/url\(|rgb\(|var\(|purple|example\.com|background/);
      expect(single.errors).toEqual([]);
    }
  });

  it('does not let a series alias set the color of a single-color chart', () => {
    for (const key of ['series', 'split', 'split by', 'color by']) {
      for (const kind of ['histogram users', 'barlist users by region', 'sparkline users']) {
        const smuggled = compile(`${kind}\n${key}: url(https://example.com/p.svg#a)\n${CSV}`);
        expect([kind, key, smuggled.spec?.color]).toEqual([kind, key, undefined]);
        expect(smuggled.text).not.toContain('example.com');
        expect(smuggled.errors).toEqual([]);
        expect(smuggled.warnings.join(' ')).toContain('draws one series');
        // Nor may it be a way around a host that keeps its own colors.
        const strict = compile(`${kind}\n${key}: #ff0000\n${CSV}`, false);
        expect([kind, key, strict.spec?.color]).toEqual([kind, key, undefined]);
      }
    }
  });

  it('applies the same rule to a JSON spec written in a block', () => {
    const json = (extra: object) =>
      compile(
        JSON.stringify({ component: 'BarChart', x: 'region', y: 'users', data: rows, ...extra }),
      );
    for (const bad of NOT_DATA) {
      const result = json({ colors: ['#2f45e8', bad] });
      expect([bad, result.spec?.colors]).toEqual([bad, ['#2f45e8']]);
      expect(result.warnings.join(' ')).toContain('is not a color a spec can set');
    }
    // The by-key form is a React prop, not part of the spec.
    const keyed = json({ colors: { EMEA: 'red' } });
    expect(keyed.spec?.colors).toBeUndefined();
    expect(keyed.warnings.join(' ')).toContain('is not a color a spec can set');
    const single = compile(
      JSON.stringify({ component: 'Sparkline', y: 'users', data: rows, color: 'url(x)' }),
    );
    expect(single.spec?.color).toBeUndefined();
  });
});

describe('gate: SpecView validates before it draws', () => {
  const specs: [string, ComponentSpec][] = [
    ['BarChart', { component: 'BarChart', data: 'd', x: 'region', y: 'users' }],
    ['LineChart', { component: 'LineChart', data: 'd', x: 'users', y: 'users' }],
    ['AreaChart', { component: 'AreaChart', data: 'd', x: 'users', y: 'users' }],
    ['ScatterPlot', { component: 'ScatterPlot', data: 'd', x: 'users', y: 'users' }],
    ['DonutChart', { component: 'DonutChart', data: 'd', category: 'region', value: 'users' }],
  ];
  const single: [string, ComponentSpec][] = [
    ['Histogram', { component: 'Histogram', data: 'd', x: 'users' }],
    ['Sparkline', { component: 'Sparkline', data: 'd', y: 'users' }],
    ['BarList', { component: 'BarList', data: 'd', category: 'region', value: 'users' }],
  ];

  it('refuses a spec whose color is not a token or hex, with a readable error', () => {
    for (const bad of NOT_DATA) {
      for (const [name, base] of [
        ...specs.map(([n, s]) => [n, { ...s, colors: [bad] }] as const),
        ...single.map(([n, s]) => [n, { ...s, color: bad }] as const),
      ]) {
        expect(validateSpec(base).valid).toBe(false);
        const { container, unmount } = render(<SpecView spec={base} data={data} />);
        const error = container.querySelector('.q-spec-error');
        expect([name, bad, !!error]).toEqual([name, bad, true]);
        expect(error?.textContent).toContain('is not allowed');
        expect(error?.textContent).toContain('hex color such as #2f45e8');
        // No chart was drawn, so the text is nowhere but in the message.
        expect(container.querySelector('.q-chart, .q-sparkline, .q-bar-list')).toBeNull();
        expect(container.querySelector('[style]')).toBeNull();
        unmount();
      }
    }
  });

  it('draws the same specs with tokens and hex', () => {
    for (const [name, base] of specs) {
      const { container, unmount } = render(
        <SpecView spec={{ ...base, colors: ['signal', 2, '#2f45e8'] }} data={data} />,
      );
      expect([name, container.querySelector('.q-spec-error')]).toEqual([name, null]);
      expect(container.querySelector('.q-chart')).not.toBeNull();
      unmount();
    }
    for (const [name, base] of single) {
      const { container, unmount } = render(
        <SpecView spec={{ ...base, color: '#2f45e8' }} data={data} />,
      );
      expect([name, container.querySelector('.q-spec-error')]).toEqual([name, null]);
      unmount();
    }
  });

  it('refuses the item of a dashboard and still draws its valid neighbours', () => {
    const { container } = render(
      <SpecView
        spec={{
          layout: [
            { component: 'BarChart', data: 'd', x: 'region', y: 'users', colors: ['red'] },
            { component: 'BarChart', data: 'd', x: 'region', y: 'users', colors: ['signal'] },
          ],
        }}
        data={data}
      />,
    );
    expect(container.querySelectorAll('.q-spec-error')).toHaveLength(1);
    expect(new Set(fills(container))).toEqual(new Set(['var(--q-signal)']));
  });

  it('filters colors as the spec becomes props, even when validation has not seen them', () => {
    // A host that edits a spec object in place after it was drawn does not get it validated
    // again; a later re-read of that object must still not hand the new text to the chart.
    const spec = {
      component: 'BarChart',
      data: 'd',
      x: 'region',
      y: 'users',
      colors: ['signal'] as unknown[],
    };
    const { container } = render(
      <Selection>
        <SpecView spec={spec} data={data} />
        <BarList data={rows} category="region" value="users" select />
      </Selection>,
    );
    expect(new Set(fills(container))).toEqual(new Set(['var(--q-signal)']));
    spec.colors[0] = 'url(https://example.com/p.svg#a)';
    // A selection elsewhere makes the view rebuild its props from the same object.
    fireEvent.click(screen.getByRole('button', { name: /EMEA/ }));
    expect(fills(container).length).toBeGreaterThan(0);
    expect(new Set(fills(container))).toEqual(new Set(['var(--q-cat-1)']));
    expect(container.innerHTML).not.toContain('example.com');
  });
});

describe('every path from text to a chart passes a gate', () => {
  const TEXT = `bar users by region\ncolors: rebeccapurple, url(https://example.com/p.svg#a)\n${CSV}`;
  const JSON_SPEC = JSON.stringify({
    component: 'BarChart',
    x: 'region',
    y: 'users',
    colors: ['rebeccapurple', 'url(https://example.com/p.svg#a)'],
    data: rows,
  });

  beforeAll(() => {
    setEmbedStyles(':root,\n[data-theme="light"] { --q-bg: #fff; }');
    defineQuartileElements();
  });

  it('QuartileBlock', () => {
    for (const source of [TEXT, JSON_SPEC]) {
      const { container, unmount } = render(<QuartileBlock source={source} />);
      expect(new Set(fills(container))).toEqual(new Set(['var(--q-cat-1)']));
      expect(container.innerHTML).not.toContain('rebeccapurple');
      unmount();
    }
  });

  it('static rendering', () => {
    for (const source of [TEXT, JSON_SPEC]) {
      const html = renderBlockToHTML(source);
      const drawn = html.slice(html.indexOf('>') + 1);
      expect(drawn).toContain('fill:var(--q-cat-1)');
      // The source is kept, escaped, in one attribute; the drawing never carries the text.
      expect(drawn).not.toContain('rebeccapurple');
      expect(drawn).not.toContain('example.com');
    }
  });

  it('the embedded element', async () => {
    for (const source of [TEXT, JSON_SPEC]) {
      const el = document.createElement('quartile-chart');
      el.setAttribute('theme', 'light');
      (el as HTMLElement & { source: string }).source = source;
      document.body.appendChild(el);
      await act(async () => {});
      const shadow = el.shadowRoot!;
      expect(new Set(fills(shadow))).toEqual(new Set(['var(--q-cat-1)']));
      expect(shadow.innerHTML).not.toContain('rebeccapurple');
      el.remove();
    }
  });
});
