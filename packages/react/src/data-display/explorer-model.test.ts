import { dataset } from '../data/schema';
import {
  createTableViewState,
  deriveTableRows,
  filterTableRows,
  matchesTableFilter,
  parseTableViewState,
  serializeTableViewState,
  tableToCSV,
} from './explorer-model';
import { sortRows } from './table-model';

describe('analytical table model', () => {
  it('uses subsequent sort priorities for ties, keeps blanks last, and preserves source order for complete ties', () => {
    const rows = [
      { id: 'a', team: 'B', score: 5 },
      { id: 'b', team: 'A', score: 4 },
      { id: 'c', team: 'A', score: 9 },
      { id: 'd', team: 'A', score: 9 },
      { id: 'e', team: null, score: 3 },
      { id: 'f', team: null, score: 7 },
      { id: 'g', team: 'A', score: null },
    ];
    expect(
      sortRows(rows, [
        { key: 'team', desc: false },
        { key: 'score', desc: true },
      ]).map((r) => r.id),
    ).toEqual(['c', 'd', 'b', 'g', 'a', 'f', 'e']);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('does not coerce strings and booleans into numeric filters or erase category identities', () => {
    const rows = [{ v: 1 }, { v: '1' }, { v: true }, { v: null }, { v: '' }, { v: 0 }];
    expect(
      filterTableRows(
        rows,
        createTableViewState({ filters: [{ field: 'v', type: 'number', op: 'gte', value: 0 }] }),
      ),
    ).toEqual([{ v: 1 }, { v: 0 }]);
    expect(
      filterTableRows(
        rows,
        createTableViewState({
          filters: [{ field: 'v', type: 'category', op: 'in', value: ['1', null] }],
        }),
      ),
    ).toEqual([{ v: '1' }, { v: null }]);
    expect(
      filterTableRows(
        rows,
        createTableViewState({ filters: [{ field: 'v', type: 'boolean', op: 'is', value: true }] }),
      ),
    ).toEqual([{ v: true }]);
    expect(
      filterTableRows(
        rows,
        createTableViewState({ filters: [{ field: 'v', type: 'empty', op: 'isEmpty' }] }),
      ),
    ).toEqual([{ v: null }, { v: '' }]);
  });

  it('applies UTC day ranges inclusively without treating a missing date as the epoch', () => {
    const f = {
      field: 'date',
      type: 'date',
      op: 'between',
      value: ['2026-04-01', '2026-04-02'],
    } as const;
    const filter = { ...f, value: [...f.value] as [string, string] };
    expect(matchesTableFilter({ date: '2026-04-02T23:59:59.999Z' }, filter)).toBe(true);
    expect(matchesTableFilter({ date: '2026-04-03T00:00:00Z' }, filter)).toBe(false);
    expect(matchesTableFilter({ date: new Date('2026-04-01T03:00:00Z') }, filter)).toBe(true);
    expect(
      matchesTableFilter(
        { date: null },
        { field: 'date', type: 'date', op: 'on', value: '1970-01-01' },
      ),
    ).toBe(false);
    expect(
      matchesTableFilter(
        { date: '2026-04-02T23:00:00-03:00' },
        { field: 'date', type: 'date', op: 'after', value: '2026-04-02' },
      ),
    ).toBe(true);
  });

  it('combines search and predicates before aggregation and sorts aggregate aliases', () => {
    const rows = [
      { team: 'Lab A', region: 'East', score: 2 },
      { team: 'Lab A', region: 'West', score: 100 },
      { team: 'Lab B', region: 'East', score: 8 },
      { team: 'Other', region: 'East', score: 1000 },
    ];
    const view = createTableViewState({
      search: 'lab',
      filters: [{ field: 'region', type: 'text', op: 'eq', value: 'east' }],
      groupBy: 'team',
      sorts: [{ key: 'mean_score', desc: true }],
    });
    const result = deriveTableRows(
      rows,
      [
        { field: 'team' },
        { field: 'region' },
        { field: 'score', key: 'mean_score', aggregate: 'mean' },
      ],
      view,
    );
    expect(result.map((r) => [r.team, r.mean_score])).toEqual([
      ['Lab B', 8],
      ['Lab A', 2],
    ]);
    expect(rows[0]).not.toHaveProperty('mean_score');
  });

  it('groups physical nominal identities without collapsing null, empty, numeric or ISO-looking labels', () => {
    const rows = [
      { group: null, n: 1 },
      { group: '', n: 2 },
      { group: 1, n: 3 },
      { group: '1', n: 4 },
      { group: '2026-01-01', n: 5 },
      { group: new Date('2026-01-01'), n: 6 },
    ];
    const data = dataset(rows, { group: { type: 'nominal' } });
    const result = deriveTableRows(
      rows,
      [{ field: 'group' }, { field: 'n', aggregate: 'sum' }],
      createTableViewState({ groupBy: 'group' }),
      data.schema,
    );
    expect(result).toHaveLength(6);
    expect(result.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ignores missing values in means and keeps legitimate prototype-named aliases as own properties', () => {
    const rows = [
      { group: 'A', n: 10 },
      { group: 'A', n: null },
      { group: 'A', n: 20 },
    ];
    const result = deriveTableRows(
      rows,
      [{ field: 'group' }, { field: 'n', key: '__proto__', aggregate: 'mean' }],
      createTableViewState({ groupBy: 'group' }),
    );
    expect(Object.getPrototypeOf(result[0])).toBe(Object.prototype);
    expect(Object.hasOwn(result[0], '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(result[0], '__proto__')?.value).toBe(15);
  });

  it('round-trips complete view configuration without source records or executable values', () => {
    const view = createTableViewState({
      search: 'trial',
      filters: [{ field: 'group', type: 'category', op: 'in', value: ['', null, 0, '0'] }],
      sorts: [{ key: 'score', desc: true }],
      hiddenColumns: ['private'],
      columnOrder: ['score', 'group'],
      columnWidths: { score: 160 },
      pinnedColumns: { left: ['group'], right: [] },
      groupBy: 'group',
      page: 2,
      pageSize: 10,
    });
    expect(parseTableViewState(serializeTableViewState(view))).toEqual(view);
    expect(serializeTableViewState(view)).not.toContain('rows');
    expect(parseTableViewState({ ...view, ignored: () => 'not serialized' })).not.toHaveProperty(
      'ignored',
    );
  });

  it('rejects malformed saved views instead of changing filter meaning', () => {
    const view = createTableViewState();
    expect(() => parseTableViewState({ ...view, version: 2 })).toThrow('version 1');
    expect(() =>
      parseTableViewState({
        ...view,
        filters: [{ field: 'date', type: 'date', op: 'on', value: '2026-02-30' }],
      }),
    ).toThrow('filters');
    expect(() =>
      createTableViewState({
        filters: [{ field: 'score', type: 'number', op: 'between', value: [9, 2] }],
      }),
    ).toThrow('filters');
    expect(() => createTableViewState({ pageSize: 0 })).toThrow('page size');
    expect(() => createTableViewState({ page: -1 })).toThrow('page');
    expect(() => createTableViewState({ columnWidths: { score: 5 } })).toThrow('widths');
    expect(() =>
      createTableViewState({
        filters: [{ field: 'score', type: 'number', op: 'eq', value: Number.NaN }],
      }),
    ).toThrow('filters');
  });

  it('exports raw values in visible-column order, escapes CSV, and neutralizes formula strings without changing negative numbers', () => {
    const csv = tableToCSV(
      [
        { name: 'a,"b"\nnext', amount: -12, hidden: 'secret' },
        { name: '\t=SUM(A1:A2)', amount: 4, hidden: 'secret' },
      ],
      [
        { field: 'amount', label: 'Amount' },
        { field: 'name', label: 'Name' },
      ],
    );
    expect(csv).toBe('"Amount","Name"\r\n"-12","a,""b""\nnext"\r\n"4","\'\t=SUM(A1:A2)"');
    expect(csv).not.toContain('secret');
  });

  it('searches schema-free fields and handles invalid dates safely', () => {
    const rows = [
      { a: 'alpha', d: new Date('invalid') },
      { b: 'Beta', d: null },
    ];
    expect(filterTableRows(rows, createTableViewState({ search: 'beta' }))).toEqual([rows[1]]);
    expect(filterTableRows(rows, createTableViewState({ search: 'alpha' }))).toEqual([rows[0]]);
  });
});
