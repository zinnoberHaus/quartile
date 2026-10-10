import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dataset } from '../data/schema';
import { BarList } from './BarList';
import { BoxPlot } from './BoxPlot';
import { Funnel } from './Funnel';
import { Histogram } from './Histogram';
import { LineChart } from './LineChart';
import { ScatterPlot } from './ScatterPlot';

afterEach(cleanup);
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 200,
    width: 400,
    height: 200,
    toJSON() {},
  });
});
afterAll(() => vi.restoreAllMocks());
const invalid = [null, undefined, '', '  ', false, true, {}, [], NaN, Infinity, 'invalid'];
const numberField = { type: 'quantitative', format: 'number' } as const;
const cells = () =>
  [...screen.getByRole('table').querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent),
  );

describe('numeric observations', () => {
  it.each(['start', 'center'] as const)(
    'does not claim a full conversion for a missing funnel baseline (%s)',
    (align) => {
      const { container } = render(
        <Funnel
          data={[
            { step: 'A', value: null },
            { step: 'B', value: 10 },
          ]}
          step="step"
          value="value"
          align={align}
        />,
      );
      expect(container.querySelector('.q-funnel-conv')?.textContent).toContain('—');
      expect(container.querySelector('.q-funnel-conv')?.textContent).not.toContain('100%');
    },
  );
  it('renders an all-missing raw measure as missing even when its inferred format is text', () => {
    render(
      <BarList
        data={[{ category: 'A', value: null }]}
        category="category"
        value="value"
        view="table"
      />,
    );
    expect(cells()).toEqual([['A', '—']]);
    expect(screen.getByRole('figure').textContent).not.toContain('NaN');
  });
  it.each([false, true])(
    'keeps raw and prepared null categories missing (prepared=%s)',
    (prepared) => {
      const data = dataset(
        [
          { category: 'missing', value: null },
          { category: 'zero', value: 0 },
          { category: 'observed', value: 10 },
        ],
        { value: numberField },
      );
      render(
        <BarList data={data} category="category" value="value" prepared={prepared} view="table" />,
      );
      expect(cells()).toEqual([
        ['observed', '10'],
        ['zero', '0'],
        ['missing', '—'],
      ]);
    },
  );
  it('counts histogram observations and computes the median without manufacturing missing zeroes', () => {
    const data = dataset(
      [0, 10, '10', ...invalid].map((x) => ({ x })),
      { x: numberField },
    );
    render(<Histogram data={data} x="x" bins={2} median view="table" />);
    expect(cells().map((row) => row[1])).toEqual(['1', '2']);
    expect(screen.getByRole('figure').textContent).toContain('Median 10');
  });

  it('keeps only observed values in box plot sample size and quartiles', () => {
    const data = dataset(
      [0, 10, '10', ...invalid].map((value) => ({ category: 'A', value })),
      { value: numberField },
    );
    render(<BoxPlot data={data} category="category" value="value" view="table" />);
    expect(cells()).toEqual([['A', '0', '5', '10', '10', '10', '3']]);
  });

  it('plots zero and numeric strings while excluding invalid coordinates', () => {
    const data = dataset(
      [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: '10', y: '30' },
        ...invalid.flatMap((v) => [
          { x: v, y: 1 },
          { x: 1, y: v },
        ]),
      ],
      { x: numberField, y: numberField },
    );
    render(<ScatterPlot data={data} x="x" y="y" view="table" />);
    expect(cells()).toEqual([
      ['0', '0'],
      ['10', '20'],
      ['10', '30'],
    ]);
    expect(screen.getByRole('figure').textContent).toContain('3 points');
  });

  it('preserves line gaps and does not let invalid duplicate rows poison observed sums', () => {
    const data = dataset(
      [
        { x: 'A', value: null, previous: '' },
        { x: 'B', value: 0, previous: 0 },
        { x: 'C', value: 10, previous: 20 },
        ...invalid.map((value) => ({ x: 'C', value, previous: value })),
        { x: 'C', value: '5', previous: '5' },
      ],
      { value: numberField },
    );
    render(<LineChart data={data} x="x" y="value" compare="previous" view="table" />);
    expect(cells()).toEqual([
      ['A', '—', '—'],
      ['B', '0', '0'],
      ['C', '15', '25'],
    ]);
  });
});
