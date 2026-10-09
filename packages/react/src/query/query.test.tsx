import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BarList } from '../charts/BarList';
import { applyPredicates } from '../data/predicates';
import { dataset } from '../data/schema';
import type { Row } from '../data/types';
import { Selection, type SelectionApi, useSelection } from '../selection/Selection';
import { QueryResultView } from './QueryResultView';
import type { QueryOptions, QueryPlan, QueryRequest, QueryResult, QuerySource } from './types';
import { type DataQueryState, queryKey, useDataQuery } from './useDataQuery';
import { QueryBarList, QueryDataTable, QueryKPI } from './views';

vi.mock('../lib/useElementSize', () => ({ useElementSize: () => ({ width: 600, height: 300 }) }));

const schema = dataset([{ region: 'Europe', amount: 2 }]).schema;
const request: QueryRequest = { kind: 'rows', window: { offset: 0, limit: 25 } };

function sourceWith(run: (plan: QueryPlan, options: QueryOptions) => Promise<Row[]>): QuerySource {
  return {
    kind: 'query-source',
    id: 'orders',
    version: 'v1',
    schema,
    query: vi.fn(async (plan, options) => {
      const rows = await run(plan, options);
      return {
        requestId: options.requestId,
        sourceVersion: 'v1',
        rows,
        schema,
        totalRows: rows.length,
        complete: true,
      };
    }),
    dispose: vi.fn(async () => {}),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Probe({
  source,
  plan = request,
  capture,
}: {
  source: QuerySource | null;
  plan?: QueryRequest;
  capture?: (query: DataQueryState) => void;
}) {
  const query = useDataQuery(source, plan, { id: 'probe' });
  capture?.(query);
  return (
    <QueryResultView query={query}>
      {(data) => <span>{JSON.stringify(data.rows)}</span>}
    </QueryResultView>
  );
}

describe('useDataQuery', () => {
  it('rejects an unbounded custom-source request before invoking the source', async () => {
    const source = sourceWith(async () => []);
    render(
      <Probe source={source} plan={{ kind: 'rows', window: { offset: 0, limit: Infinity } }} />,
    );
    await screen.findByRole('alert');
    expect(source.query).not.toHaveBeenCalled();
  });
  it('stabilizes inline plans while retaining typed values', async () => {
    const source = sourceWith(async () => [{ region: 'Europe' }]);
    const { rerender } = render(<Probe source={source} plan={{ ...request }} />);
    await screen.findByText('[{"region":"Europe"}]');
    rerender(<Probe source={source} plan={{ ...request }} />);
    expect(source.query).toHaveBeenCalledTimes(1);
    expect(queryKey({ a: 1, b: '2' })).toBe(queryKey({ b: '2', a: 1 }));
    expect(queryKey(new Date(0))).not.toBe(queryKey(new Date(0).toISOString()));
    expect(queryKey(Number.NaN)).not.toBe(queryKey(null));
  });

  it('hides obsolete data immediately, aborts superseded work, ignores late success and failure', async () => {
    const first = deferred<Row[]>();
    const second = deferred<Row[]>();
    const third = deferred<Row[]>();
    const pending = [first, second, third];
    const source = sourceWith(async () => pending.shift()!.promise);
    const { rerender } = render(<Probe source={source} />);
    rerender(<Probe source={source} plan={{ kind: 'rows', window: { offset: 25, limit: 25 } }} />);
    expect(vi.mocked(source.query).mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => second.resolve([{ region: 'second' }]));
    expect(screen.getByText('[{"region":"second"}]')).toBeTruthy();
    await act(async () => first.reject(new Error('obsolete worker error')));
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<Probe source={source} plan={{ kind: 'rows', window: { offset: 50, limit: 25 } }} />);
    expect(screen.queryByText('[{"region":"second"}]')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => third.resolve([{ region: 'third' }]));
    expect(screen.getByText('[{"region":"third"}]')).toBeTruthy();
  });

  it('ignores a late success after a newer result, and never disposes application sources', async () => {
    const slow = deferred<Row[]>();
    const source = sourceWith(
      vi
        .fn()
        .mockReturnValueOnce(slow.promise)
        .mockResolvedValue([{ region: 'latest' }]),
    );
    const { rerender, unmount } = render(<Probe source={source} />);
    rerender(<Probe source={source} plan={{ kind: 'rows', window: { offset: 1, limit: 25 } }} />);
    await screen.findByText('[{"region":"latest"}]');
    await act(async () => slow.resolve([{ region: 'obsolete' }]));
    expect(screen.queryByText('[{"region":"obsolete"}]')).toBeNull();
    unmount();
    expect(source.dispose).not.toHaveBeenCalled();
    expect(vi.mocked(source.query).mock.calls.at(-1)?.[1].signal.aborted).toBe(true);
  });

  it('survives StrictMode effect replay and retries current failures', async () => {
    const source = sourceWith(async () => {
      throw new Error('worker failed');
    });
    render(
      <StrictMode>
        <Probe source={source} />
      </StrictMode>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('worker failed');
    expect(vi.mocked(source.query).mock.calls[0][1].signal.aborted).toBe(true);
    vi.mocked(source.query).mockImplementationOnce(async (_, options) => ({
      requestId: options.requestId,
      sourceVersion: 'v1',
      rows: [],
      schema,
      totalRows: 0,
      complete: true,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('[]');
  });

  it.each(['revision', 'bound', 'count'])(
    'rejects an invalid %s from a custom source',
    async (kind) => {
      const source = sourceWith(async () => []);
      vi.mocked(source.query).mockImplementationOnce(async (_, options) => ({
        requestId: options.requestId,
        sourceVersion: kind === 'revision' ? 'v0' : 'v1',
        rows: kind === 'bound' ? Array.from({ length: 26 }, () => ({})) : [],
        schema,
        totalRows: kind === 'count' ? -1 : 26,
        complete: false,
      }));
      render(<Probe source={source} />);
      await screen.findByRole('alert');
    },
  );

  it('does not query until a source is available', async () => {
    let state: DataQueryState | undefined;
    const { rerender } = render(
      <Probe
        source={null}
        capture={(query) => {
          state = query;
        }}
      />,
    );
    expect(state?.status).toBe('idle');
    const source = sourceWith(async () => []);
    rerender(<Probe source={source} />);
    await screen.findByText('[]');
    expect(source.query).toHaveBeenCalledTimes(1);
  });
});

let selection: SelectionApi;
function Controller() {
  selection = useSelection();
  return null;
}

describe('linked query views', () => {
  it('keeps null, empty, and ISO-looking nominal categories distinct in prepared bars', async () => {
    const categories = [null, '', '2026-10-09', '2026-10-09T00:00:00Z'];
    const source = sourceWith(async (plan) =>
      plan.kind === 'aggregate'
        ? categories.map((region, i) => ({ region, [plan.measures[0].as]: i + 1 }))
        : [],
    );
    render(
      <Selection>
        <Controller />
        <QueryBarList data={source} category="region" select sort="none" />
      </Selection>,
    );
    await within(await screen.findByRole('list')).findByText('(empty string)');
    const buttons = within(screen.getByRole('list')).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    for (const [index, value] of categories.entries()) {
      fireEvent.click(buttons[index]);
      expect(selection.get('region')?.value).toEqual([value]);
      expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toEqual([
        buttons[index],
      ]);
    }
    expect(source.query).toHaveBeenCalledTimes(1);
  });

  it('preserves typed table row identity and single selection for nominal ISO strings', async () => {
    const categories = [null, '', '2026-10-09', '2026-10-09T00:00:00Z'];
    const source = sourceWith(async () => categories.map((region, amount) => ({ region, amount })));
    render(
      <Selection>
        <Controller />
        <QueryDataTable
          data={source}
          select="region"
          multiple={false}
          rowKey="region"
          columns={[{ field: 'region' }, { field: 'amount' }]}
        />
      </Selection>,
    );
    await screen.findByText('1–4 of 4 rows');
    const rows = screen.getAllByRole('row').slice(1);
    for (const [index, value] of categories.entries()) {
      fireEvent.click(rows[index]);
      expect(selection.get('region')?.value).toEqual([value]);
      expect(rows.filter((row) => row.getAttribute('aria-selected') === 'true')).toEqual([
        rows[index],
      ]);
    }
    expect(source.query).toHaveBeenCalledTimes(1);
  });

  it('does not give a count the currency unit of the counted field', async () => {
    const source = sourceWith(async (plan) =>
      plan.kind === 'aggregate' ? [{ [plan.measures[0].as]: 12 }] : [],
    );
    render(<QueryKPI data={source} value="amount" aggregate="count" label="Count" />);
    await screen.findByText('12');
    expect(screen.getByRole('group', { name: 'Count' }).textContent).not.toContain('USD');
  });
  it('preserves worker ordering and keyboard focus when a remote table header changes sort', async () => {
    const source = sourceWith(async () => [
      { region: 'A10', amount: 1 },
      { region: 'A2', amount: 2 },
    ]);
    render(
      <QueryDataTable
        data={source}
        defaultSort="region"
        columns={[{ field: 'region' }, { field: 'amount' }]}
      />,
    );
    await screen.findByText('1–2 of 2 rows');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('A10');
    expect(rows[1].textContent).toContain('A2');
    const header = screen.getByRole('button', { name: /Region/ });
    header.focus();
    fireEvent.click(header);
    await waitFor(() => expect(source.query).toHaveBeenCalledTimes(2));
    await screen.findByText('1–2 of 2 rows');
    expect(document.activeElement).toBe(header);
    const plan = vi.mocked(source.query).mock.calls.at(-1)?.[0];
    expect(plan?.kind === 'rows' && plan.orderBy).toEqual([{ field: 'region', direction: 'desc' }]);
  });

  it('excludes each publisher before querying and does not refilter the collapsed result', async () => {
    const source = sourceWith(async () => [{ region: 'Europe', amount: 6 }]);
    function AggregateView() {
      const query = useDataQuery(
        source,
        {
          kind: 'aggregate',
          groupBy: ['region'],
          measures: [{ field: 'amount', aggregate: 'sum', as: 'amount' }],
          limit: 10,
        },
        { id: 'bars' },
      );
      return (
        <QueryResultView query={query}>
          {(data) => (
            <BarList
              id="bars"
              data={data}
              category="region"
              value="amount"
              format="number"
              select
            />
          )}
        </QueryResultView>
      );
    }
    render(
      <Selection>
        <Controller />
        <AggregateView />
        <Probe source={source} />
      </Selection>,
    );
    await screen.findByRole('button', { name: /Europe.*6/ });
    act(() => selection.set('amount', [1, 5], { op: 'between', source: 'range' }));
    await screen.findByRole('button', { name: /Europe.*6/ });
    fireEvent.click(screen.getByRole('button', { name: /Europe.*6/ }));
    await waitFor(() =>
      expect(vi.mocked(source.query).mock.calls.at(-1)?.[0].predicates).toHaveLength(2),
    );
    const bars = vi
      .mocked(source.query)
      .mock.calls.filter(([, options]) => options.requestId.startsWith('bars:'));
    expect(bars.at(-1)?.[0].predicates.map((p) => p.field)).toEqual(['amount']);
    expect(screen.getByRole('button', { name: /Europe.*6/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('uses the queried scalar and category totals without counting groups or averaging twice', async () => {
    const source = sourceWith(async (plan) =>
      plan.kind === 'aggregate'
        ? plan.groupBy.length
          ? [
              { region: 'Europe', [plan.measures[0].as]: 30 },
              { region: 'Asia', [plan.measures[0].as]: 10 },
            ]
          : [{ [plan.measures[0].as]: 22.5 }]
        : [],
    );
    render(
      <Selection>
        <QueryKPI
          data={source}
          label="Mean amount"
          value="amount"
          aggregate="mean"
          format="number"
        />
        <QueryBarList data={source} category="region" aggregate="count" format="number" />
      </Selection>,
    );
    await screen.findByText('22.5');
    await screen.findAllByText('30');
    expect(
      vi
        .mocked(source.query)
        .mock.calls.map(([plan]) => plan.kind === 'aggregate' && plan.measures[0].aggregate),
    ).toEqual(['mean', 'count']);
  });

  it('paginates remote rows using exact totals and resets the page when another view filters', async () => {
    const rows = [
      { region: 'A', amount: 1 },
      { region: 'B', amount: 2 },
      { region: 'B', amount: 3 },
    ];
    const source = sourceWith(async () => []);
    vi.mocked(source.query).mockImplementation(async (plan, options): Promise<QueryResult> => {
      const matching = applyPredicates(rows, plan.predicates);
      const page =
        plan.kind === 'rows'
          ? matching.slice(plan.window.offset, plan.window.offset + plan.window.limit)
          : [];
      return {
        requestId: options.requestId,
        sourceVersion: 'v1',
        rows: page,
        schema,
        totalRows: matching.length,
        complete: false,
      };
    });
    render(
      <Selection>
        <Controller />
        <QueryDataTable
          data={source}
          pageSize={2}
          columns={[{ field: 'region' }, { field: 'amount' }]}
        />
      </Selection>,
    );
    await screen.findByText('1–2 of 3 rows');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('3–3 of 3 rows');
    act(() => selection.set('region', 'B', { source: 'filter' }));
    await screen.findByText('1–2 of 2 rows');
    const finalPlan = vi.mocked(source.query).mock.calls.at(-1)?.[0];
    expect(finalPlan?.kind === 'rows' && finalPlan.window.offset).toBe(0);
    expect(screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(true);
  });
});
