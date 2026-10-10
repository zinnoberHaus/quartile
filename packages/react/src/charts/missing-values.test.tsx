import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dataset } from '../data/schema';
import type { Row } from '../data/types';
import { Histogram } from './Histogram';
import { LineChart } from './LineChart';

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 640,
    bottom: 300,
    width: 640,
    height: 300,
    toJSON() {},
  });
});
afterEach(cleanup);
afterAll(() => vi.restoreAllMocks());

function tableRows() {
  return [...screen.getByRole('table').querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td,th')].map((cell) => cell.textContent),
  );
}

describe('missing chart observations', () => {
  it.each([undefined, 'group'])(
    'keeps actual zero but draws gaps for absent/nonfinite y with series %s',
    (color) => {
      const values = [0, null, 10, Number.NaN, undefined, Infinity, '', 20];
      const rows: Row[] = values.map((y, x) => ({
        x,
        y,
        group: 'A',
        previous:
          x === 0 ? null : x === 1 ? 5 : x === 2 ? '' : x === 3 ? Infinity : x === 4 ? 0 : null,
      }));
      const data = dataset(rows, {
        x: { type: 'quantitative', format: 'integer' },
        y: { type: 'quantitative', format: 'number' },
      });
      const { container } = render(
        <LineChart data={data} x="x" y="y" color={color} compare="previous" points />,
      );
      const cells = tableRows();
      expect(cells.map((row) => row[1])).toEqual(['0', '—', '10', '—', '—', '—', '—', '20']);
      expect(cells.map((row) => row[2])).toEqual(['—', '5', '—', '—', '0', '—', '—', '—']);
      expect(container.querySelectorAll('.q-chart-dot')).toHaveLength(3);
      const mainPath = container.querySelector('path[stroke-width="2"]')?.getAttribute('d');
      expect(mainPath?.match(/M/g)).toHaveLength(3);
      expect(container.innerHTML).not.toMatch(/(?:NaN|Infinity)/);
    },
  );

  it('omits missing/invalid continuous x coordinates from the chart and accessible table', () => {
    const rows: Row[] = [null, undefined, '', NaN, Infinity, 'bad'].map((x) => ({ x, y: 99 }));
    rows.push({ x: 0, y: 4 }, { x: 2, y: 8 });
    const { container, rerender } = render(
      <LineChart
        data={dataset(rows, { x: { type: 'quantitative', format: 'integer' } })}
        x="x"
        y="y"
        points
      />,
    );
    expect(tableRows()).toEqual([
      ['0', '4'],
      ['2', '8'],
    ]);
    expect(container.querySelectorAll('.q-chart-dot')).toHaveLength(2);
    const temporal: Row[] = [
      { x: new Date(NaN), y: 99 },
      { x: 'bad', y: 99 },
      { x: null, y: 99 },
      { x: '2026-10-10T12:00:00Z', y: 8 },
    ];
    rerender(
      <LineChart
        data={dataset(temporal, { x: { type: 'temporal', format: 'datetime' } })}
        x="x"
        y="y"
        points
      />,
    );
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0][1]).toBe('8');
    expect(container.innerHTML).not.toMatch(/(?:NaN|Infinity|Invalid Date)/);
  });

  it('preserves finite duplicate-coordinate sums, ignores missing inputs, and suppresses overflow', () => {
    const rows = [
      { x: 0, y: 10, z: null },
      { x: 0, y: null, z: 4 },
      { x: 0, y: NaN, z: 2 },
      { x: 0, y: 2, z: '' },
      { x: 1, y: 1e308, z: 5 },
      { x: 1, y: 1e308, z: 6 },
    ];
    render(
      <LineChart
        data={dataset(rows, {
          y: { type: 'quantitative', format: 'number' },
          z: { type: 'quantitative', format: 'number' },
        })}
        x="x"
        y={['y', 'z']}
      />,
    );
    expect(tableRows()).toEqual([
      ['0', '12', '6'],
      ['1', '—', '11'],
    ]);
  });

  it('excludes missing histogram coordinates from counts and median even when the range contains zero', () => {
    const rows: Row[] = [0, 10, null, undefined, '', NaN, Infinity].map((x) => ({ x }));
    const { container } = render(
      <Histogram
        data={dataset(rows, { x: { type: 'quantitative', format: 'number' } })}
        x="x"
        bins={2}
        median
      />,
    );
    expect(tableRows().map((row) => row[1])).toEqual(['1', '1']);
    expect(container.querySelector('.q-histogram-median text')?.textContent).toBe('median 5');
  });

  it('excludes absent coordinates and absent/nonfinite weights from weighted histograms', () => {
    const rows = [
      { x: 0, weight: 10 },
      { x: 0, weight: null },
      { x: 0, weight: '' },
      { x: 0, weight: Infinity },
      { x: 10, weight: 20 },
      { x: null, weight: 500 },
    ];
    render(
      <Histogram
        data={dataset(rows, {
          x: { type: 'quantitative', format: 'number' },
          weight: { type: 'quantitative', format: 'number' },
        })}
        x="x"
        value="weight"
        bins={2}
      />,
    );
    expect(tableRows().map((row) => row[1])).toEqual(['10', '20']);
  });
});
