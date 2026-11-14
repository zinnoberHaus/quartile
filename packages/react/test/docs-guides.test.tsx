// Keeps two things the styling guide states in step with the code: the table of which chart
// takes which setting, and the custom chart it shows, which is the file fixtures/lollipop.tsx.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BarList, type Predicate, Selection, useSelection } from '@quartile/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/lang/kinds';
import { quartileSchema } from '../src/spec/schema';
import { Lollipop } from './fixtures/lollipop';

const root = join(__dirname, '../../..');
const guide = readFileSync(join(root, 'docs/guides/styling.md'), 'utf8');

type Property = Record<string, unknown>;
const propertiesOf = (component: string) =>
  ((quartileSchema.$defs as Record<string, { properties?: Record<string, Property> }>)[component]
    ?.properties ?? {}) as Record<string, Property>;

/** A guide row label → whether the component's schema has what the row promises. */
const ROWS: Record<string, (props: Record<string, Property>) => boolean> = {
  margin: (p) => 'margin' in p,
  colors: (p) => 'colors' in p,
  // `color` names a field on most charts; it is a color only where the schema gives a pattern.
  'color (one color)': (p) => typeof p.color?.pattern === 'string',
  'y.min, y.max': (p) => 'yMin' in p && 'yMax' in p,
  'x.min, x.max': (p) => 'xMin' in p && 'xMax' in p,
  'y.ticks': (p) => 'yTicks' in p,
  'x.ticks': (p) => 'xTicks' in p,
  grid: (p) => 'grid' in p,
  'x axis': (p) => 'xAxis' in p,
  'y axis': (p) => 'yAxis' in p,
  'legend (a side)': (p) => Array.isArray(p.legend?.enum) && p.legend.enum.includes('bottom'),
  labels: (p) => 'labels' in p,
  reference: (p) => 'reference' in p,
  'y.scale': (p) => 'yScale' in p,
  'stroke width': (p) => 'strokeWidth' in p,
  'radius, padding': (p) => 'radius' in p && 'padding' in p,
  annotations: (p) => 'annotations' in p,
};

describe('styling guide: which chart takes which setting', () => {
  const section = guide.split('## 3. Which chart takes which setting')[1].split('\n## ')[0];
  const lines = section.split('\n').filter((line) => line.startsWith('|'));
  const cells = (line: string) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/`/g, ''));
  const [, ...kinds] = cells(lines[0]);
  const body = lines.slice(2).map(cells);

  it('has one row per setting this test knows, and only kinds of the language', () => {
    expect(body.map((row) => row[0])).toEqual(Object.keys(ROWS));
    for (const kind of kinds) expect(Object.keys(KINDS)).toContain(kind);
  });

  it('agrees with the component schema in every cell', () => {
    for (const [label, ...marks] of body) {
      kinds.forEach((kind, i) => {
        const has = ROWS[label](propertiesOf(KINDS[kind as keyof typeof KINDS].component));
        expect([label, kind, marks[i]]).toEqual([label, kind, has ? 'yes' : '-']);
      });
    }
  });

  it('leaves out only kinds that take none of these settings', () => {
    // Heatmaps and calendars have a yes/no color legend, which the guide states in a note.
    for (const kind of Object.keys(KINDS).filter((k) => !kinds.includes(k))) {
      const props = propertiesOf(KINDS[kind as keyof typeof KINDS].component);
      const taken = Object.entries(ROWS)
        .filter(([, has]) => has(props))
        .map(([label]) => label);
      expect([kind, taken]).toEqual([kind, []]);
    }
  });
});

const orders = [
  { region: 'EMEA', channel: 'Web', amount: 120 },
  { region: 'EMEA', channel: 'Store', amount: 80 },
  { region: 'APAC', channel: 'Web', amount: 60 },
  { region: 'Americas', channel: 'Web', amount: 210 },
];
const marks = (root: ParentNode) =>
  Array.from(root.querySelectorAll('[data-mark]')).map((m) => m.getAttribute('data-mark'));
const channels = () =>
  Array.from(document.querySelectorAll('.q-bar-list-row')).map(
    (row) =>
      `${row.querySelector('.q-bar-list-label')?.textContent} ${row.querySelector('.q-bar-list-value')?.textContent}`,
  );

describe('styling guide: build your own chart', () => {
  it('shows exactly the code of fixtures/lollipop.tsx', () => {
    const shown = [...guide.matchAll(/```tsx\n([\s\S]*?)```/g)]
      .map((m) => m[1])
      .find((code) => code.includes('export function Lollipop'));
    expect(shown).toBe(readFileSync(join(__dirname, 'fixtures/lollipop.tsx'), 'utf8'));
  });

  it('draws marks, axes and gridlines, with a summary and a table alternative', () => {
    const { container } = render(
      <Lollipop data={orders} category="region" value="amount" aria-label="Orders by region" />,
    );
    expect(container.querySelector('[role="figure"]')?.getAttribute('aria-label')).toBe(
      'Orders by region',
    );
    expect(marks(container)).toEqual(['EMEA', 'APAC', 'Americas']);
    expect(container.querySelectorAll('.q-chart-grid line').length).toBeGreaterThan(2);
    expect(container.querySelectorAll('.q-chart-axis')).toHaveLength(2);
    expect(container.textContent).toContain('3 marks.');
    expect(screen.getByRole('table').textContent).toContain('EMEA$200.00');
  });

  it('renders on a server, and in the loading and empty states', () => {
    const html = renderToStaticMarkup(<Lollipop data={orders} category="region" value="amount" />);
    expect(html).toContain('data-mark="EMEA"');
    expect(html).toContain('data-width="assumed"');
    const { container, rerender } = render(
      <Lollipop data={orders} category="region" value="amount" loading />,
    );
    expect(container.querySelector('[data-status="loading"]')).not.toBeNull();
    rerender(<Lollipop data={[]} category="region" value="amount" />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('takes margin and color like the built-in charts', () => {
    const { container } = render(
      <Lollipop
        data={orders}
        category="region"
        value="amount"
        margin={{ left: 80 }}
        color="positive"
      />,
    );
    expect(container.querySelector('.q-chart-grid line')?.getAttribute('x1')).toBe('80');
    expect((container.querySelector('[data-mark] circle') as SVGElement).style.fill).toBe(
      'var(--q-positive)',
    );
  });

  it('filters a built-in sibling with a click, and is filtered by it, never by itself', () => {
    let predicates: Predicate[] = [];
    function Probe() {
      predicates = useSelection().predicates;
      return null;
    }
    const { container } = render(
      <Selection>
        <Lollipop data={orders} category="region" value="amount" select />
        <BarList data={orders} category="channel" value="amount" select />
        <Probe />
      </Selection>,
    );
    expect(channels()).toEqual(['Web $390', 'Store $80']);
    fireEvent.click(container.querySelector('[data-mark="EMEA"]')!);
    expect(predicates).toMatchObject([{ field: 'region', op: 'in', value: ['EMEA'] }]);
    expect(channels()).toEqual(['Web $120', 'Store $80']);
    // Its own selection dims the other marks and removes none.
    expect(marks(container)).toEqual(['EMEA', 'APAC', 'Americas']);
    expect(container.querySelector('[data-mark="APAC"]')?.hasAttribute('data-dim')).toBe(true);
    fireEvent.click(container.querySelector('[data-mark="EMEA"]')!);
    fireEvent.click(screen.getByRole('button', { name: /Store/ }));
    expect(marks(container)).toEqual(['EMEA']);
  });
});
