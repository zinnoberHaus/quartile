import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompiledBlock } from '../lang/compile';
import type { Diagnostic } from '../lang/diagnostics';
import type { SourceValue } from '../lang/source';
import { QuartileBlock } from './QuartileBlock';
import { QuartileDocument } from './QuartileDocument';

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const settle = () => act(async () => {});

afterEach(() => {
  vi.useRealTimers();
});

describe('a source that answers with no rows', () => {
  const answers: [string, SourceValue][] = [
    ['an empty list', '[]'],
    ['an envelope around no rows', { results: [], meta: { total: 0 } }],
    ['a header without rows', 'region,revenue\n'],
  ];

  it.each(answers)('draws the empty state of each view for %s', async (_name, answer) => {
    const loadSource = vi.fn(async () => answer);
    const seen: Diagnostic[] = [];
    const { container } = render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock
          source={'bar sum(revenue) by region\ntitle: Revenue by region\nsrc: /api/orders\n'}
          onDiagnostics={(d) => seen.push(...d)}
        />
        <QuartileBlock source={'kpi sum(revenue) as "Revenue"\nsrc: /api/orders\n'} />
        <QuartileBlock source={'table region, revenue\nsrc: /api/orders\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('No data to show')).toBeTruthy());
    await settle();
    const chart = screen.getByRole('figure', { name: 'Revenue by region' });
    expect(chart.getAttribute('data-status')).toBe('empty');
    expect(screen.getByText('Revenue by region')).toBeTruthy();
    expect(container.querySelector('.q-kpi')?.textContent).toContain('Revenue');
    expect(screen.getByText('No rows to show')).toBeTruthy();
    expect(screen.getByText('Region')).toBeTruthy();
    // Nothing is reported, on the page or to the host.
    expect(container.querySelector('.q-block-error')).toBeNull();
    expect(container.textContent).not.toContain('There is no column');
    expect(container.querySelector('[data-warnings]')).toBeNull();
    expect(seen.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(loadSource).toHaveBeenCalledTimes(1);
  });

  it('shows a plain empty card when the fields were left to be inferred', async () => {
    const loadSource = vi.fn(async () => '[]');
    const { container } = render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'table\ntitle: Latest orders\nsrc: /api/latest\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('No data to show')).toBeTruthy());
    expect(screen.getByText('Latest orders')).toBeTruthy();
    const card = screen.getByRole('figure', { name: 'Latest orders' });
    expect(card.getAttribute('data-status')).toBe('empty');
    expect(card.getAttribute('aria-busy')).toBeNull();
    expect(container.querySelector('.q-block-error')).toBeNull();
  });

  it('draws the chart when a later refresh brings rows, and empties again without an error', async () => {
    vi.useFakeTimers();
    const answers: SourceValue[] = [
      '[]',
      [
        { region: 'EMEA', revenue: 120 },
        { region: 'APAC', revenue: 80 },
      ],
      { results: [] },
    ];
    const loadSource = vi.fn(async () => answers.shift() ?? '[]');
    const { container } = render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock
          source={'bar sum(revenue) by region\ntitle: Live revenue\nsrc: /api/live\nrefresh: 30s\n'}
        />
        <QuartileBlock
          source={'kpi sum(revenue) as "Total"\nsrc: /api/live\nrefresh: 30s\nformat: integer\n'}
        />
      </QuartileDocument>,
    );
    await tick();
    const chart = () => screen.getByRole('figure', { name: 'Live revenue' });
    expect(chart().getAttribute('data-status')).toBe('empty');
    expect(container.querySelector('.q-block-error')).toBeNull();

    await tick(30_000);
    expect(loadSource).toHaveBeenCalledTimes(2);
    expect(chart().getAttribute('data-status')).toBe('ready');
    expect(chart().querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.q-kpi')?.textContent).toContain('200');

    await tick(30_000);
    expect(loadSource).toHaveBeenCalledTimes(3);
    expect(chart().getAttribute('data-status')).toBe('empty');
    expect(container.querySelector('.q-block-error')).toBeNull();
  });

  it('treats an empty dataset from the host the same way', () => {
    const { container } = render(
      <QuartileDocument data={{ orders: [] }}>
        <QuartileBlock source={'line sum(revenue) by month\ntitle: Orders\ndata: orders\n'} />
      </QuartileDocument>,
    );
    expect(screen.getByRole('figure', { name: 'Orders' }).getAttribute('data-status')).toBe(
      'empty',
    );
    expect(container.querySelector('.q-block-error')).toBeNull();
  });

  it('lets a data block with an empty source feed empty views', async () => {
    const loadSource = vi.fn(async () => ({ data: [] }));
    const { container } = render(
      <QuartileDocument loadSource={loadSource} dataDisplay="table">
        <QuartileBlock source={'data orders\nsrc: /api/orders\ntotal.format: currency USD\n'} />
        <QuartileBlock
          source={'donut sum(total) by status\ntitle: Orders by status\ndata: orders\n'}
        />
      </QuartileDocument>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('figure', { name: 'Orders by status' }).getAttribute('data-status'),
      ).toBe('empty'),
    );
    // The data block has no columns to lay a table out with: its own empty card, by name.
    expect(screen.getByRole('figure', { name: 'orders' }).getAttribute('data-status')).toBe(
      'empty',
    );
    expect(container.querySelector('.q-block-error')).toBeNull();
    expect(container.querySelector('.q-spec-error')).toBeNull();
    expect(container.textContent).not.toContain('not valid');
  });
});

describe('one problem, one message', () => {
  it('shows only the failure to read the block’s data', () => {
    const { container } = render(
      <QuartileBlock
        source={
          'bar sum(revenue) by region\npath: data.rows\n---\n{"data": {"items": [{"region": "EMEA", "revenue": 1}]}}\n'
        }
      />,
    );
    const list = container.querySelector('.q-block-error-list') as HTMLElement;
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain(
      'The path `data.rows` stops at `rows`: there is no such key at `data`.',
    );
    expect(container.textContent).not.toContain('There is no column');
  });

  it('shows only the failure to load a source', async () => {
    const loadSource = vi.fn(async () => ({ data: { items: [{ region: 'EMEA', revenue: 1 }] } }));
    const { container } = render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'bar sum(revenue) by region\nsrc: /api/x\npath: data.rows\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(container.querySelector('.q-block-error')).not.toBeNull());
    const list = container.querySelector('.q-block-error-list') as HTMLElement;
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain('Could not load /api/x: The path `data.rows` stops at');
    expect(container.textContent).not.toContain('There is no column');
  });
});

describe('a source longer than the row limit', () => {
  const rows = (n: number) =>
    `region,revenue\n${Array.from({ length: n }, (_, i) => `R${i % 7},${i + 1}`).join('\n')}\n`;

  it('says so under the view, and keeps the warning for the host', async () => {
    const loadSource = vi.fn(async () => rows(10));
    const seen: Diagnostic[][] = [];
    let compiled: CompiledBlock | undefined;
    const { container } = render(
      <QuartileDocument loadSource={loadSource} maxRows={3}>
        <QuartileBlock
          source={'kpi sum(revenue) as "Revenue"\nsrc: /api/long.csv\nformat: integer\n'}
          onDiagnostics={(d, c) => {
            seen.push(d);
            compiled = c;
          }}
        />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('Showing the first 3 of 10 rows.')).toBeTruthy());
    // 1 + 2 + 3: the chart is of the rows that were kept.
    expect(container.querySelector('.q-kpi')?.textContent).toContain('6');
    expect(screen.getByText('Showing the first 3 of 10 rows.').className).toBe('q-block-note');
    expect(container.querySelector('.q-block')?.getAttribute('data-warnings')).toBe('1');
    expect(seen.at(-1)).toEqual([
      {
        severity: 'warning',
        message: 'Kept the first 3 of 10 rows.',
        line: 1,
        hint: 'The page keeps a limited number of rows from a source; its host can raise `maxRows`.',
      },
    ]);
    expect(compiled?.rowLimits).toEqual([{ data: 'url:/api/long.csv', kept: 3, total: 10 }]);
  });

  it('keeps 5,000 rows unless the host says otherwise', async () => {
    const loadSource = vi.fn(async () => rows(5200));
    const { rerender } = render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'kpi count as "Rows"\nsrc: /api/big.csv\n'} />
      </QuartileDocument>,
    );
    await waitFor(() =>
      expect(screen.getByText('Showing the first 5,000 of 5,200 rows.')).toBeTruthy(),
    );
    rerender(
      <QuartileDocument loadSource={loadSource} maxRows={10_000} key="raised">
        <QuartileBlock source={'kpi count as "Rows"\nsrc: /api/big.csv\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('5,200')).toBeTruthy());
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('says so for every block drawn from a named dataset, but not for the hidden data block', async () => {
    const loadSource = vi.fn(async () => rows(8));
    const { container } = render(
      <QuartileDocument loadSource={loadSource} maxRows={4} dataDisplay="hidden">
        <QuartileBlock source={'data sales\nsrc: /sales.csv\nrevenue.format: currency EUR\n'} />
        <QuartileBlock source={'kpi sum(revenue) as "Revenue"\ndata: sales\n'} />
        <QuartileBlock source={'bar sum(revenue) by region\ndata: sales\n'} />
      </QuartileDocument>,
    );
    await waitFor(() =>
      expect(screen.getAllByText('Showing the first 4 of 8 rows.')).toHaveLength(2),
    );
    const blocks = [...container.querySelectorAll('.q-block')];
    expect(blocks[0].textContent).toBe('');
    expect(blocks[1].textContent).toContain('€10');
  });

  it('says so for rows written in the block', () => {
    const inline = `kpi count as "Rows"\n---\nid\n${Array.from({ length: 5003 }, (_, i) => i).join('\n')}\n`;
    render(<QuartileBlock source={inline} />);
    expect(screen.getByText('Showing the first 5,000 of 5,003 rows.')).toBeTruthy();
  });

  it('says nothing when the block could not be drawn', () => {
    const inline = `bar sum(nope) by id\n---\nid\n${Array.from({ length: 5003 }, (_, i) => i).join('\n')}\n`;
    const { container } = render(<QuartileBlock source={inline} />);
    expect(container.querySelector('.q-block-error')).not.toBeNull();
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });
});
