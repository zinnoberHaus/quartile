// A chart built outside the library, from its public exports only: the frame, scales, axes,
// gridlines, tooltip, keyboard model and the selection hooks the built-in charts use. It must
// render, publish a selection and filter a built-in sibling, like any chart in the package.
import {
  AxisBottom,
  AxisLeft,
  aggregateBy,
  BarList,
  bandScale,
  type ChartBaseProps,
  type ChartColor,
  ChartFrame,
  type ChartMargin,
  type ChartTable,
  ChartTooltip,
  chartColor,
  continuousX,
  type DataInput,
  fieldOf,
  GridRows,
  makeFieldFormatter,
  marginSides,
  monoTextWidth,
  type Predicate,
  resolveData,
  Selection,
  seriesColor,
  statusOf,
  tickFormatter,
  useChartKeyboard,
  useLinkedRows,
  useQuartile,
  useRangeBrush,
  useSelection,
  useSourceId,
  useToggleSelect,
  valueAxis,
} from '@quartile/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { bisectCenter } from 'd3-array';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface LollipopProps extends ChartBaseProps {
  data: DataInput;
  category: string;
  value: string;
  /** Click a mark (or Enter on it) to toggle its category in the nearest Selection. */
  select?: boolean;
  color?: ChartColor;
  margin?: ChartMargin;
  onSelect?: (predicate: Predicate | null) => void;
}

/** One stem and dot per category: a bar chart for sparse values. */
function Lollipop({
  data,
  category,
  value,
  select = false,
  color,
  margin,
  onSelect,
  height = 200,
  ...frame
}: LollipopProps) {
  const { locale, timeZone } = useQuartile();
  const source = useSourceId();
  const { rows: allRows, schema } = resolveData(data);
  const { rows, selection } = useLinkedRows(allRows, { source });
  const picker = useToggleSelect(selection, category, source, onSelect);
  const buckets = aggregateBy(rows, category, { value });
  const valueField = fieldOf(schema, value, rows);
  const categoryField = fieldOf(schema, category, rows);
  const format = makeFieldFormatter(valueField, { locale, timeZone });
  const label = makeFieldFormatter(categoryField, { locale, timeZone });
  const { active, keyboardProps } = useChartKeyboard(buckets.length, (i) => {
    if (select) picker.toggle(buckets[i].raw);
  });
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;
  const fill = chartColor(color) ?? seriesColor(0);

  const table: ChartTable = {
    columns: [categoryField.label, valueField.label],
    rows: buckets.map((b) => [label(b.raw), format(b.value)]),
  };
  const top = buckets.reduce((a, b) => (b.value > a.value ? b : a), buckets[0]);
  const summary = top
    ? `${buckets.length} marks. Highest ${label(top.raw)} at ${format(top.value)}.`
    : '';

  return (
    <ChartFrame
      kind="Lollipop chart"
      status={statusOf(frame, buckets.length)}
      height={height}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => {
        const pad = marginSides(margin);
        const bottom = height - (pad.bottom ?? 24);
        const axis = valueAxis(
          buckets.map((b) => b.value),
          [bottom, pad.top ?? 10],
        );
        const tick = tickFormatter(valueField, locale, timeZone);
        const ticks = axis.ticks.map((v) => ({ y: axis.scale(v), label: tick(v) }));
        const left =
          pad.left ?? Math.ceil(Math.max(16, ...ticks.map((t) => monoTextWidth(t.label)))) + 12;
        const right = width - (pad.right ?? 8);
        const band = bandScale(
          buckets.map((b) => b.key),
          [left, right],
        );
        const cx = (key: string) => (band(key) ?? 0) + band.bandwidth() / 2;
        return (
          <div style={{ position: 'relative', height }}>
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              aria-hidden="true"
            >
              <GridRows ys={ticks.map((t) => t.y)} x0={left} x1={right} />
              <AxisLeft ticks={ticks} x={left - 10} />
              <AxisBottom
                ticks={buckets.map((b) => ({ x: cx(b.key), label: label(b.raw) }))}
                y={bottom + 8}
                x0={Number.NEGATIVE_INFINITY}
                x1={Number.POSITIVE_INFINITY}
              />
              {buckets.map((b, i) => (
                <g
                  key={b.key}
                  data-mark={b.key}
                  data-dim={(picker.selecting && !picker.has(b.raw)) || undefined}
                  onClick={() => select && picker.toggle(b.raw)}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                >
                  <line
                    x1={cx(b.key)}
                    x2={cx(b.key)}
                    y1={axis.scale(0)}
                    y2={axis.scale(b.value)}
                    style={{ stroke: fill }}
                  />
                  <circle cx={cx(b.key)} cy={axis.scale(b.value)} r={5} style={{ fill }} />
                </g>
              ))}
            </svg>
            <div
              data-testid="lollipop-keys"
              role="application"
              aria-label="Lollipop chart. Use arrow keys to move between marks."
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              {...keyboardProps}
            />
            {focus != null && buckets[focus] && (
              <ChartTooltip
                x={cx(buckets[focus].key)}
                width={width}
                title={label(buckets[focus].raw)}
                rows={[{ label: valueField.label, value: format(buckets[focus].value) }]}
              />
            )}
          </div>
        );
      }}
    </ChartFrame>
  );
}

interface StepTrendProps extends ChartBaseProps {
  data: DataInput;
  x: string;
  y: string;
  onSelect?: (predicate: Predicate | null) => void;
}

/** A step line over a numeric x that publishes a brushed range. */
function StepTrend({ data, x, y, onSelect, height = 160, ...frame }: StepTrendProps) {
  const { locale, timeZone } = useQuartile();
  const source = useSourceId();
  const { rows: allRows, schema } = resolveData(data);
  const { rows, selection } = useLinkedRows(allRows, { source });
  const brush = useRangeBrush(selection, x, source, { onSelect });
  const xField = fieldOf(schema, x, rows);
  const sorted = [...rows].sort((a, b) => Number(a[x]) - Number(b[x]));
  const xs = sorted.map((r) => r[x]);
  return (
    <ChartFrame
      kind="Step trend"
      status={statusOf(frame, sorted.length)}
      height={height}
      {...frame}
    >
      {({ width }) => {
        const axis = valueAxis(
          sorted.map((r) => Number(r[y])),
          [height - 20, 8],
        );
        const scale = continuousX(xField, xs, [30, width - 10]);
        const px = xs.map((v) => scale.value(v));
        const d = sorted
          .map((r, i) => `${i ? 'H' : 'M'}${px[i]}${i ? 'V' : ','}${axis.scale(Number(r[y]))}`)
          .join('');
        const drag = brush.handlers(30, width - 10, (at) => xs[bisectCenter(px, at)]);
        const extent =
          brush.drag ??
          (brush.range ? { a: scale.value(brush.range[0]), b: scale.value(brush.range[1]) } : null);
        const tick = tickFormatter(xField, locale, timeZone);
        return (
          <div style={{ position: 'relative', height }}>
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              aria-hidden="true"
            >
              <AxisBottom
                ticks={[0, xs.length - 1].map((i) => ({ x: px[i], label: tick(xs[i]) }))}
                y={height - 14}
                x0={30}
                x1={width - 10}
              />
              {extent && (
                <rect
                  data-testid="extent"
                  x={Math.min(extent.a, extent.b)}
                  width={Math.abs(extent.b - extent.a)}
                  y={8}
                  height={height - 28}
                />
              )}
              <path d={d} fill="none" style={{ stroke: seriesColor(0) }} />
            </svg>
            <div data-testid="brush" style={{ position: 'absolute', inset: 0 }} {...drag} />
          </div>
        );
      }}
    </ChartFrame>
  );
}

const orders = [
  { region: 'EMEA', channel: 'Web', week: 1, amount: 120 },
  { region: 'EMEA', channel: 'Store', week: 2, amount: 80 },
  { region: 'APAC', channel: 'Web', week: 3, amount: 60 },
  { region: 'APAC', channel: 'Partner', week: 4, amount: 30 },
  { region: 'Americas', channel: 'Web', week: 5, amount: 210 },
];

/** Reads the nearest Selection, as a host app would to mirror it in a URL or a query. */
function Probe({ onPredicates }: { onPredicates: (predicates: Predicate[]) => void }) {
  onPredicates(useSelection().predicates);
  return null;
}

const channels = () =>
  Array.from(document.querySelectorAll('.q-bar-list-row')).map(
    (row) =>
      `${row.querySelector('.q-bar-list-label')?.textContent} ${row.querySelector('.q-bar-list-value')?.textContent}`,
  );
const marks = (root: ParentNode) =>
  Array.from(root.querySelectorAll('[data-mark]')).map((m) => m.getAttribute('data-mark'));

describe('a custom chart built from public exports', () => {
  it('renders marks, axes, gridlines, a summary and a table alternative', () => {
    const { container } = render(
      <Lollipop data={orders} category="region" value="amount" aria-label="Orders by region" />,
    );
    const figure = container.querySelector('[role="figure"]')!;
    expect(figure.getAttribute('aria-label')).toBe('Orders by region');
    expect(marks(container)).toEqual(['EMEA', 'APAC', 'Americas']);
    expect(container.querySelectorAll('.q-chart-grid line').length).toBeGreaterThan(2);
    const [yAxis, xAxis] = Array.from(container.querySelectorAll('.q-chart-axis'));
    expect(yAxis.querySelector('text')?.textContent).toBe('$0');
    expect(Array.from(xAxis.querySelectorAll('text')).map((t) => t.textContent)).toEqual([
      'EMEA',
      'APAC',
      'Americas',
    ]);
    expect(container.textContent).toContain('3 marks. Highest Americas at $210.00.');
    expect(screen.getByRole('table').textContent).toContain('EMEA$200.00APAC$90.00Americas$210.00');
  });

  it('renders on the server and in the loading and empty states', () => {
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

  it('takes the same margin and color settings as the built-in charts', () => {
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
    const css = render(
      <Lollipop data={orders} category="region" value="amount" color="rebeccapurple" />,
    );
    expect((css.container.querySelector('[data-mark] circle') as SVGElement).style.fill).toBe(
      'rebeccapurple',
    );
  });

  it('publishes a click to the selection and filters a built-in sibling, not itself', () => {
    const onSelect = vi.fn();
    let predicates: Predicate[] = [];
    const { container } = render(
      <Selection>
        <Lollipop data={orders} category="region" value="amount" select onSelect={onSelect} />
        <BarList data={orders} category="channel" value="amount" />
        <Probe
          onPredicates={(p) => {
            predicates = p;
          }}
        />
      </Selection>,
    );
    expect(channels()).toEqual(['Web $390', 'Store $80', 'Partner $30']);

    fireEvent.click(container.querySelector('[data-mark="EMEA"]')!);
    expect(predicates).toHaveLength(1);
    expect(predicates[0]).toMatchObject({ field: 'region', op: 'in', value: ['EMEA'] });
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: 'region', op: 'in', value: ['EMEA'] }),
    );
    // The sibling shows EMEA only; the custom chart keeps every mark and dims the others.
    expect(channels()).toEqual(['Web $120', 'Store $80']);
    expect(marks(container)).toEqual(['EMEA', 'APAC', 'Americas']);
    expect(container.querySelector('[data-mark="APAC"]')?.hasAttribute('data-dim')).toBe(true);
    expect(container.querySelector('[data-mark="EMEA"]')?.hasAttribute('data-dim')).toBe(false);

    fireEvent.click(container.querySelector('[data-mark="EMEA"]')!);
    expect(predicates).toEqual([]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(channels()).toEqual(['Web $390', 'Store $80', 'Partner $30']);
  });

  it('is filtered by a sibling, and selects from the keyboard', () => {
    const { container } = render(
      <Selection>
        <Lollipop data={orders} category="region" value="amount" select />
        <BarList data={orders} category="channel" value="amount" select />
      </Selection>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Partner/ }));
    expect(marks(container)).toEqual(['APAC']);
    fireEvent.click(screen.getByRole('button', { name: /Partner/ }));
    expect(marks(container)).toEqual(['EMEA', 'APAC', 'Americas']);

    const keys = screen.getByTestId('lollipop-keys');
    fireEvent.keyDown(keys, { key: 'ArrowRight' });
    fireEvent.keyDown(keys, { key: 'ArrowRight' });
    expect(container.querySelector('.q-chart-tooltip')?.textContent).toContain('APAC');
    fireEvent.keyDown(keys, { key: 'Enter' });
    expect(channels()).toEqual(['Web $60', 'Partner $30']);
  });

  it('publishes a brushed range and clears it with a click', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Selection>
        <StepTrend data={orders} x="week" y="amount" onSelect={onSelect} />
        <BarList data={orders} category="region" value="amount" />
      </Selection>,
    );
    const plot = screen.getByTestId('brush');
    // The plot spans 30 … 630px for weeks 1 … 5, so 150px per week.
    act(() => {
      fireEvent.pointerDown(plot, { clientX: 190, pointerId: 1 });
    });
    act(() => {
      fireEvent.pointerMove(plot, { clientX: 300, pointerId: 1 });
    });
    expect(Number(screen.getByTestId('extent').getAttribute('width'))).toBe(110);
    act(() => {
      fireEvent.pointerUp(plot, { clientX: 470, pointerId: 1 });
    });
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ field: 'week', op: 'between', value: [2, 4] }),
    );
    // Weeks 2–4: one EMEA order and both APAC orders. The brushing chart keeps its line.
    expect(channels()).toEqual(['APAC $90', 'EMEA $80']);
    expect(container.querySelector('path')?.getAttribute('d')?.split('H')).toHaveLength(5);
    expect(Number(screen.getByTestId('extent').getAttribute('x'))).toBe(180);

    act(() => {
      fireEvent.pointerDown(plot, { clientX: 300, pointerId: 1 });
    });
    act(() => {
      fireEvent.pointerUp(plot, { clientX: 301, pointerId: 1 });
    });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(channels()).toEqual(['Americas $210', 'EMEA $200', 'APAC $90']);
    expect(screen.queryByTestId('extent')).toBeNull();
  });
});
