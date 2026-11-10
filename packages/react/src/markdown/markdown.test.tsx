import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Markdown from 'react-markdown';
import { describe, expect, it, vi } from 'vitest';
import { QuartileBlock } from './QuartileBlock';
import { QuartileDocument } from './QuartileDocument';
import { QuartileCode, QuartilePre, quartileComponents } from './renderers';

const orders = 'region,amount\nEMEA,120\nAPAC,80\nEMEA,40\nAmericas,200\n';

describe('QuartileBlock', () => {
  it('draws a chart from block text', () => {
    render(<QuartileBlock source={`bar sum(amount) by region\ntitle: Revenue\n---\n${orders}`} />);
    const figure = screen.getByRole('figure', { name: 'Revenue' });
    expect(figure.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('table').textContent).toContain('EMEA');
  });

  it('shows errors with their line and keeps the source readable', () => {
    render(<QuartileBlock source={`bar profit by region\n---\n${orders}`} />);
    expect(screen.getByRole('group', { name: 'This chart could not be drawn' })).toBeTruthy();
    expect(screen.getByText('line 1')).toBeTruthy();
    expect(screen.getByText('There is no column “profit”.')).toBeTruthy();
    expect(screen.getByText(/Columns: region, amount/)).toBeTruthy();
    expect(document.querySelector('pre code')?.textContent).toContain('bar profit by region');
  });

  it('waits instead of failing while the block streams', () => {
    const { container, rerender } = render(
      <QuartileBlock streaming source={'bar sum(amount) by reg'} />,
    );
    expect(container.querySelector('[data-status="loading"]')).not.toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    rerender(
      <QuartileBlock
        streaming
        source={`bar sum(amount) by region\n---\nregion,amount\nEMEA,1\nAP`}
      />,
    );
    expect(screen.getByRole('table').textContent).toContain('EMEA');
    expect(screen.getByRole('table').textContent).not.toContain('AP ');
    rerender(<QuartileBlock source={`bar sum(amount) by region\n---\n${orders}`} />);
    expect(screen.getByRole('table').textContent).toContain('Americas');
  });

  it('keeps the valid views of a dashboard when one view fails', () => {
    const { container } = render(
      <QuartileBlock
        source={`dashboard\nkpi sum(amount) as "Revenue"\nbar profit by region\n---\n${orders}`}
      />,
    );
    expect(container.querySelector('.q-kpi')?.textContent).toContain('Revenue');
    expect(screen.getByRole('group', { name: 'Some views could not be drawn' })).toBeTruthy();
    expect(screen.getByText('There is no column “profit”.')).toBeTruthy();
  });

  it('renders JSON specs through the same path', () => {
    render(
      <QuartileBlock
        source={JSON.stringify({
          component: 'KPI',
          label: 'Orders',
          value: { field: 'id', aggregate: 'count' },
          data: [{ id: 1 }, { id: 2 }],
        })}
      />,
    );
    expect(screen.getByText('Orders')).toBeTruthy();
  });
});

describe('QuartileDocument', () => {
  it('lets a block use a dataset defined later in the Markdown', () => {
    const markdown = [
      '```quartile',
      'kpi sum(amount) as "Revenue"',
      'data: orders',
      '```',
      '',
      '```quartile',
      'data orders',
      '---',
      orders,
      '```',
    ].join('\n');
    render(
      <QuartileDocument markdown={markdown}>
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\ndata: orders\n'} />
        <QuartileBlock source={`data orders\n---\n${orders}`} />
      </QuartileDocument>,
    );
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('$440')).toBeTruthy();
    // The data block renders a collapsed summary with its size.
    expect(screen.getByText('orders', { selector: '.q-block-data-name' })).toBeTruthy();
    expect(screen.getByText(/4 rows · 2 columns/)).toBeTruthy();
  });

  it('registers data blocks when the Markdown source is not provided', async () => {
    render(
      <QuartileDocument>
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\ndata: orders\n'} />
        <QuartileBlock source={`data orders\n---\n${orders}`} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('$440')).toBeTruthy());
  });

  it('links blocks over the same dataset: a selection in one filters the other', () => {
    const { container } = render(
      <QuartileDocument
        data={{
          orders: [
            { region: 'EMEA', amount: 120 },
            { region: 'APAC', amount: 80 },
            { region: 'EMEA', amount: 40 },
          ],
        }}
      >
        <QuartileBlock source={'barlist sum(amount) by region\nselect: true\ndata: orders\n'} />
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\ndata: orders\n'} />
      </QuartileDocument>,
    );
    const kpi = () => container.querySelector('.q-kpi')?.textContent ?? '';
    expect(kpi()).toContain('$240.00');
    fireEvent.click(screen.getByRole('button', { name: /APAC/ }));
    expect(kpi()).toContain('$80.00');
    expect(kpi()).not.toContain('$240.00');
  });

  it('loads src URLs only through the host loader', async () => {
    const loadSource = vi.fn(async () => 'region,amount\nEMEA,5\nAPAC,7\n');
    render(
      <QuartileDocument loadSource={loadSource}>
        <QuartileBlock source={'kpi sum(amount) as "Remote"\nsrc: /data/orders.csv\n'} />
      </QuartileDocument>,
    );
    await waitFor(() => expect(screen.getByText('$12.00')).toBeTruthy());
    expect(loadSource).toHaveBeenCalledWith('/data/orders.csv', expect.any(AbortSignal));

    render(<QuartileBlock source={'kpi sum(amount)\nsrc: https://example.com/x.csv\n'} />);
    expect(screen.getByText(/does not load remote data/)).toBeTruthy();
  });

  it('waits for datasets the host is still loading', () => {
    const { container, rerender } = render(
      <QuartileDocument pending={['orders']}>
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\ndata: orders\n'} />
      </QuartileDocument>,
    );
    expect(container.querySelector('[data-status="loading"]')).not.toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    rerender(
      <QuartileDocument data={{ orders: [{ amount: 5 }] }}>
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\ndata: orders\n'} />
      </QuartileDocument>,
    );
    expect(screen.getByText('Revenue')).toBeTruthy();
  });

  it('marks blocks while the answer streams', () => {
    const { container } = render(
      <QuartileDocument streaming>
        <QuartileBlock source={`bar sum(amount) by region\n---\n${orders}`} />
      </QuartileDocument>,
    );
    expect(container.querySelector('.q-block[data-streaming]')).not.toBeNull();
  });
});

describe('Markdown renderers', () => {
  const markdown = [
    '# Revenue',
    '',
    'Regions ranked by revenue:',
    '',
    '```quartile',
    'barlist sum(amount) by region',
    '---',
    orders.trim(),
    '```',
    '',
    '```js',
    'console.log(1)',
    '```',
  ].join('\n');

  it('renders fences inside react-markdown via the pre override', () => {
    const { container } = render(
      <QuartileDocument markdown={markdown}>
        <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
      </QuartileDocument>,
    );
    expect(container.querySelector('.q-block[data-kind="BarList"]')).not.toBeNull();
    expect(container.querySelector('pre code.language-js')?.textContent).toContain('console.log');
    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
  });

  it('offers a components map and a code override', () => {
    const { container, unmount } = render(
      <Markdown components={quartileComponents()}>{markdown}</Markdown>,
    );
    expect(container.querySelector('.q-block')).not.toBeNull();
    unmount();
    const code = render(
      <QuartileCode className="language-quartile">{`kpi sum(amount)\n---\n${orders}`}</QuartileCode>,
    );
    expect(code.container.querySelector('.q-kpi')).not.toBeNull();
    const other = render(<QuartileCode className="language-ts">x</QuartileCode>);
    expect(other.container.querySelector('code.language-ts')).not.toBeNull();
  });

  it('treats fences already closed in a streaming answer as complete', () => {
    const answer = [
      'Rows so far:',
      '',
      '```quartile',
      'kpi count as "Closed rows"',
      '---',
      'id',
      '1',
      '2',
      '3',
      '```',
      '',
      '```quartile',
      'kpi count as "Open rows"',
      '---',
      'id',
      '1',
      '2',
    ].join('\n');
    const { container } = render(
      <QuartileDocument markdown={answer} streaming>
        <Markdown components={{ pre: QuartilePre }}>{answer}</Markdown>
      </QuartileDocument>,
    );
    const kpis = [...container.querySelectorAll('.q-kpi')].map((k) => k.textContent);
    // The closed block keeps its last row; the open one holds back the row being written.
    expect(kpis[0]).toContain('3');
    expect(kpis[1]).toContain('1');
    expect(kpis[1]).not.toContain('2');
  });

  it('accepts host aliases for the fence language', async () => {
    const md = '```chart\nkpi count as "Rows"\n---\nid\n1\n2\n```';
    render(
      <QuartileDocument markdown={md} languages={['quartile', 'chart']}>
        <Markdown components={{ pre: QuartilePre }}>{md}</Markdown>
      </QuartileDocument>,
    );
    await act(async () => {});
    expect(screen.getByText('Rows')).toBeTruthy();
  });
});
