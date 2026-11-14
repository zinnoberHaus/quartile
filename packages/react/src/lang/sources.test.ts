import { describe, expect, it } from 'vitest';
import { compileBlock } from './compile';
import type { Diagnostic } from './diagnostics';
import { scanDocument } from './document';
import { parseDataPath, resolveDataPath } from './path';
import { parseRefresh, readSourceValue } from './source';
import { parseTable } from './table';

const of = (severity: Diagnostic['severity'], t: { diagnostics: Diagnostic[] }) =>
  t.diagnostics.filter((d) => d.severity === severity);
const errors = (t: { diagnostics: Diagnostic[] }) => of('error', t).map((d) => d.message);
const notes = (t: { diagnostics: Diagnostic[] }) => of('info', t).map((d) => d.message);

const rows = [
  { region: 'EMEA', revenue: 120 },
  { region: 'APAC', revenue: 80 },
];

describe('JSON envelopes', () => {
  it('reads rows from `rows` when it is the only key', () => {
    const t = parseTable(JSON.stringify({ rows }));
    expect(errors(t)).toEqual([]);
    expect(t.columns).toEqual(['region', 'revenue']);
    expect(t.rows).toEqual(rows);
    expect(notes(t)).toEqual(['Read rows from `rows`.']);
  });

  it('reads rows from a `data` envelope and names the key in a note', () => {
    const t = parseTable(JSON.stringify({ data: rows }));
    expect(errors(t)).toEqual([]);
    expect(t.columns).toEqual(['region', 'revenue']);
    expect(t.rows[1]).toEqual({ region: 'APAC', revenue: 80 });
    expect(notes(t)).toEqual(['Read rows from `data`.']);
  });

  it('ignores the metadata beside the rows', () => {
    const t = parseTable(
      JSON.stringify({ data: rows, meta: { page: 1, total: 2 }, next: null, tags: ['a', 'b'] }),
    );
    expect(errors(t)).toEqual([]);
    expect(t.rows).toEqual(rows);
    expect(notes(t)).toEqual(['Read rows from `data`.']);
  });

  it('reads a list of arrays under a header row, as spreadsheet APIs return it', () => {
    const t = parseTable(
      JSON.stringify({
        range: 'Sheet1!A1:B3',
        majorDimension: 'ROWS',
        values: [
          ['region', 'revenue'],
          ['EMEA', '120'],
          ['APAC', '80'],
        ],
      }),
    );
    expect(errors(t)).toEqual([]);
    expect(t.rows).toEqual(rows);
    expect(notes(t)).toContain('Read rows from `values`.');
  });

  it('refuses to guess between several lists of rows that have no conventional name', () => {
    const t = parseTable(JSON.stringify({ current: rows, previous: [{ code: 1 }], total: 2 }));
    expect(t.rows).toEqual([]);
    const [problem] = of('error', t);
    expect(problem.message).toBe('Several keys hold rows: `current`, `previous`.');
    expect(problem.hint).toBe('Choose one with `path:`, e.g. `path: current`.');
    expect(errors(parseTable(JSON.stringify({ current: rows, previous: [] })))).toEqual([]);
  });

  it('prefers the key APIs conventionally keep their rows under', () => {
    // Redash and many query APIs: column descriptions beside the rows.
    const redash = parseTable({
      columns: [
        { name: 'region', type: 'string' },
        { name: 'revenue', type: 'integer' },
      ],
      rows,
    });
    expect(errors(redash)).toEqual([]);
    expect(redash.rows).toEqual(rows);
    expect(notes(redash)).toEqual(['Read rows from `rows`.']);

    const withErrors = parseTable(
      JSON.stringify({ results: rows, errors: [{ code: 429, message: 'slow down' }] }),
    );
    expect(withErrors.rows).toEqual(rows);
    expect(notes(withErrors)).toEqual(['Read rows from `results`.']);

    // rows, then data, results, items, records; the name is matched whatever its case.
    const other = [{ other: 1 }];
    const pick = (doc: Record<string, unknown>) =>
      notes(parseTable(doc)).find((n) => n.startsWith('Read rows from'));
    expect(pick({ records: rows, items: other, results: other, data: other, rows: other })).toBe(
      'Read rows from `rows`.',
    );
    expect(pick({ records: rows, items: other, results: other, data: other })).toBe(
      'Read rows from `data`.',
    );
    expect(pick({ records: rows, items: other, results: other })).toBe('Read rows from `results`.');
    expect(pick({ records: rows, items: other, extra: other })).toBe('Read rows from `items`.');
    expect(pick({ records: rows, extra: other })).toBe('Read rows from `records`.');
    expect(pick({ Extra: other, Results: rows })).toBe('Read rows from `Results`.');
    // Only the whole name counts.
    expect(errors(parseTable({ row_data: rows, results_v2: other }))).toEqual([
      'Several keys hold rows: `row_data`, `results_v2`.',
    ]);
  });

  it('applies the same preference inside the object a path resolves to', () => {
    const doc = { query_result: { data: { columns: [{ name: 'region' }], rows } } };
    const t = parseTable(doc, { path: 'query_result.data' });
    expect(errors(t)).toEqual([]);
    expect(t.rows).toEqual(rows);
    expect(notes(t)).toEqual(['Read rows from `query_result.data.rows`.']);
  });

  it('keeps the conventional key when it is empty, instead of charting its neighbour', () => {
    const none = parseTable({ results: [], errors: [{ code: 404, message: 'nothing found' }] });
    expect(errors(none)).toEqual([]);
    expect(none.rows).toEqual([]);
    expect(notes(none)).toEqual(['Read rows from `results`.']);

    const emptyQuery = parseTable({ rows: [], columns: [{ name: 'region' }, { name: 'revenue' }] });
    expect(emptyQuery.rows).toEqual([]);
    expect(notes(emptyQuery)).toEqual(['Read rows from `rows`.']);

    const several = parseTable({ data: [], warnings: [], meta: { total: 0 } });
    expect(errors(several)).toEqual([]);
    expect(notes(several)).toEqual(['Read rows from `data`.']);

    const beside = parseTable({ data: [], tags: ['a', 'b'] });
    expect(beside.rows).toEqual([]);
    expect(beside.diagnostics.map((d) => d.message)).toEqual(['Read rows from `data`.']);
  });

  it('does not take a list of arrays on its name alone, since its header may be elsewhere', () => {
    // Bare arrays beside another list, and nothing that names their columns.
    const unnamed = parseTable({
      meta: [{ name: 'region' }, { name: 'revenue' }],
      rows: [
        ['EMEA', 120],
        ['APAC', 80],
      ],
    });
    expect(unnamed.rows).toEqual([]);
    expect(of('error', unnamed)[0]).toMatchObject({
      message: 'Several keys hold rows: `meta`, `rows`.',
      hint: 'Choose one with `path:`, e.g. `path: rows`. A list of arrays is read with its first array as the header.',
    });
    // On its own, a list of arrays is still read under its header row.
    const sheet = parseTable({
      rows: [
        ['region', 'revenue'],
        ['EMEA', 120],
      ],
      total: 1,
    });
    expect(sheet.rows).toEqual([{ region: 'EMEA', revenue: 120 }]);
    expect(notes(sheet)).toEqual(['Read rows from `rows`.']);
  });

  describe('column names beside a list of arrays', () => {
    const arrays = [
      ['EMEA', 120],
      ['APAC', 80],
    ];
    const described = [
      { name: 'region', display_name: 'Region', base_type: 'type/Text' },
      { name: 'revenue', display_name: 'Revenue', base_type: 'type/Integer' },
    ];

    it('reads Metabase: `cols` describes the columns of bare `rows`', () => {
      const response = {
        data: { rows: arrays, cols: described, native_form: { query: 'select 1' } },
        status: 'completed',
        row_count: 2,
      };
      const inner = parseTable(response, { path: 'data' });
      expect(errors(inner)).toEqual([]);
      expect(inner.rows).toEqual(rows);
      expect(notes(inner)).toEqual([
        'Read rows from `data.rows`.',
        'Read column names from `data.cols`.',
      ]);

      // A path that ends at the list finds the names in the object that holds it.
      const direct = parseTable(response, { path: 'data.rows' });
      expect(direct.rows).toEqual(rows);
      expect(notes(direct)).toEqual(['Read column names from `data.cols`.']);

      // The inner object on its own.
      const bare = parseTable(JSON.stringify(response.data));
      expect(bare.rows).toEqual(rows);
      expect(notes(bare)).toEqual(['Read rows from `rows`.', 'Read column names from `cols`.']);
    });

    it('reads `{ columns, rows }` with names as strings or as descriptions', () => {
      const strings = parseTable({ columns: ['region', 'revenue'], rows: arrays });
      expect(strings.rows).toEqual(rows);
      expect(notes(strings)).toEqual([
        'Read rows from `rows`.',
        'Read column names from `columns`.',
      ]);

      // Elasticsearch SQL, Trino: `columns` of descriptions.
      const objects = parseTable({
        columns: [
          { name: 'region', type: 'keyword' },
          { name: 'revenue', type: 'long' },
        ],
        rows: arrays,
      });
      expect(errors(objects)).toEqual([]);
      expect(objects.rows).toEqual(rows);
      expect(notes(objects)).toEqual([
        'Read rows from `rows`.',
        'Read column names from `columns`.',
      ]);

      // Redash keeps its rows as objects, which need no names.
      const redash = parseTable({ columns: described, rows });
      expect(redash.rows).toEqual(rows);
      expect(notes(redash)).toEqual(['Read rows from `rows`.']);
    });

    it('reads pandas `orient="split"`', () => {
      const split = parseTable(
        JSON.stringify({ columns: ['region', 'revenue'], index: [0, 1], data: arrays }),
      );
      expect(errors(split)).toEqual([]);
      expect(split.rows).toEqual(rows);
      expect(split.columns).toEqual(['region', 'revenue']);
      expect(notes(split)).toEqual(['Read rows from `data`.', 'Read column names from `columns`.']);
      // Unnamed columns are numbered by pandas.
      const numbered = parseTable({ columns: [0, 1], index: [0, 1], data: arrays });
      expect(numbered.rows).toEqual([
        { 0: 'EMEA', 1: 120 },
        { 0: 'APAC', 1: 80 },
      ]);
    });

    it('tries columns, cols, fields, then schema, whatever their case', () => {
      const from = (doc: Record<string, unknown>) =>
        notes(parseTable(doc)).find((n) => n.startsWith('Read column names'));
      const names = ['region', 'revenue'];
      const wrong = ['only one'];
      expect(
        from({ schema: names, fields: names, cols: names, columns: names, data: arrays }),
      ).toBe('Read column names from `columns`.');
      expect(from({ schema: names, fields: names, cols: names, data: arrays })).toBe(
        'Read column names from `cols`.',
      );
      expect(from({ schema: names, fields: names, data: arrays })).toBe(
        'Read column names from `fields`.',
      );
      expect(from({ schema: names, data: arrays })).toBe('Read column names from `schema`.');
      expect(from({ Columns: names, data: arrays })).toBe('Read column names from `Columns`.');
      // A key whose count does not fit is passed over for the next one.
      expect(from({ columns: wrong, fields: names, data: arrays })).toBe(
        'Read column names from `fields`.',
      );
      // `schema: { fields: [...] }`, as table schemas are written.
      const schema = parseTable({
        schema: {
          fields: [
            { name: 'region', type: 'STRING' },
            { name: 'revenue', type: 'INTEGER' },
          ],
        },
        data: arrays,
      });
      expect(schema.rows).toEqual(rows);
      expect(notes(schema)).toEqual([
        'Read rows from `data`.',
        'Read column names from `schema.fields`.',
      ]);
    });

    it('takes `name`, and another spelling only when there is no `name`', () => {
      const named = (cols: unknown[]) => parseTable({ cols, rows: [['EMEA', 120]] }).columns;
      expect(named([{ name: 'region', display_name: 'Region' }, { name: 'revenue' }])).toEqual([
        'region',
        'revenue',
      ]);
      expect(named([{ display_name: 'Region' }, { field: 'revenue' }])).toEqual([
        'Region',
        'revenue',
      ]);
      expect(named([{ label: 'Region' }, 'revenue'])).toEqual(['Region', 'revenue']);
      // Repeated and empty names are made distinct, as for a header row.
      expect(named(['region', 'region'])).toEqual(['region', 'region_2']);
      expect(named(['', 'revenue'])).toEqual(['column_1', 'revenue']);
    });

    it('keeps today’s reading when the names do not fit the rows', () => {
      // Three names for rows of two values: the first array is the header, as before.
      const single = parseTable({
        columns: ['a', 'b', 'c'],
        data: [
          ['region', 'revenue'],
          ['EMEA', 120],
        ],
      });
      expect(single.rows).toEqual([{ region: 'EMEA', revenue: 120 }]);
      expect(notes(single)).toEqual(['Read rows from `data`.']);

      // Descriptions without a name are not names.
      const nameless = parseTable({ fields: [{ type: 'text' }, { type: 'int' }], result: arrays });
      expect(of('error', nameless)[0]).toMatchObject({
        message: 'Several keys hold rows: `fields`, `result`.',
        hint: 'Choose one with `path:`, e.g. `path: result`.',
      });
      // Named that way, the list finds the names its own key could not claim.
      const chosen = parseTable(
        { columns: [{ name: 'region' }, { name: 'revenue' }], values: arrays },
        { path: 'values' },
      );
      expect(chosen.rows).toEqual(rows);
      expect(notes(chosen)).toEqual(['Read column names from `columns`.']);
      const nullName = parseTable({
        cols: [{ name: null, label: 'Region' }, { name: 'revenue' }],
        rows: arrays,
      });
      expect(errors(nullName)).toEqual(['Several keys hold rows: `cols`, `rows`.']);

      // Beside another list, arrays whose names do not fit stay ambiguous.
      const misfit = parseTable({ cols: [{ name: 'region' }], rows: arrays });
      expect(of('error', misfit)[0]).toMatchObject({
        message: 'Several keys hold rows: `cols`, `rows`.',
        hint: 'Choose one with `path:`, e.g. `path: rows`. A list of arrays is read with its first array as the header.',
      });

      // Rows of another width than the first are filled or cut, as under a header row.
      const ragged = parseTable({
        columns: ['region', 'revenue'],
        rows: [['EMEA', 120], ['APAC'], ['LATAM', 5, 'x']],
      });
      expect(ragged.rows).toEqual([
        { region: 'EMEA', revenue: 120 },
        { region: 'APAC', revenue: null },
        { region: 'LATAM', revenue: 5 },
      ]);

      // Objects need no names, and a list at the top level has nothing beside it.
      expect(notes(parseTable({ columns: ['x', 'y'], rows }))).toEqual(['Read rows from `rows`.']);
      expect(
        parseTable([
          ['region', 'revenue'],
          ['EMEA', 120],
        ]).rows,
      ).toEqual([{ region: 'EMEA', revenue: 120 }]);
    });

    it('applies through a path spelled as JSONPath, an index, and the compiler', () => {
      const doc = { results: [{ columns: ['region', 'revenue'], values: arrays }] };
      const t = parseTable(doc, { path: '$.results[0].values' });
      expect(t.rows).toEqual(rows);
      expect(notes(t)).toEqual([
        'Read `$.results[0].values` as `results.0.values`.',
        'Read column names from `results.0.columns`.',
      ]);

      const block = compileBlock(
        `bar sum(revenue) by region\npath: data\n---\n${JSON.stringify({ data: { cols: described, rows: arrays } })}\n`,
      );
      expect(errors(block)).toEqual([]);
      expect(notes(block)).toEqual(
        expect.arrayContaining([
          'Read rows from `data.rows`.',
          'Read column names from `data.cols`.',
        ]),
      );
      expect(block.spec).toMatchObject({ component: 'BarChart', x: 'region' });
      expect(Object.values(block.data)[0]).toMatchObject({ rows });
    });
  });

  it('still reads an object of equal-length column arrays as columns', () => {
    const t = parseTable('{"region":["EMEA","APAC"],"revenue":[120,80]}');
    expect(t.rows).toEqual(rows);
    expect(t.diagnostics).toEqual([]);
    expect(parseTable('{"data":[1,2,3]}').rows).toEqual([{ data: 1 }, { data: 2 }, { data: 3 }]);
  });

  it('pads columns of different lengths with a warning', () => {
    const t = parseTable('{"a":[1,2,3],"b":[4]}');
    expect(t.rows).toEqual([
      { a: 1, b: 4 },
      { a: 2, b: null },
      { a: 3, b: null },
    ]);
    expect(of('warning', t).map((d) => d.message)).toEqual([
      'Columns have different lengths; the shorter ones end with missing values.',
    ]);
  });

  it('reads an empty answer as no rows, and explains an object without rows', () => {
    const empty = parseTable(JSON.stringify({ data: [], meta: { total: 0 } }));
    expect(errors(empty)).toEqual([]);
    expect(empty.rows).toEqual([]);
    expect(notes(empty)).toEqual(['Read rows from `data`.']);

    const nested = parseTable(JSON.stringify({ status: 'ok', result: { items: rows } }));
    const [problem] = of('error', nested);
    expect(problem.message).toBe('Expected an array of rows or an object of columns.');
    expect(problem.hint).toBe(
      'This object has the keys `status`, `result`. Name the one that holds the rows with `path:`, e.g. `path: data.items`.',
    );
  });

  it('accepts JSON that is already parsed', () => {
    const t = parseTable({ data: rows, meta: {} });
    expect(t.format).toBe('json');
    expect(t.rows).toEqual(rows);
    expect(parseTable(rows).rows).toEqual(rows);
    expect(errors(parseTable(null))).toEqual([
      'Expected an array of rows or an object of columns.',
    ]);
  });
});

describe('path', () => {
  const api = {
    status: 'ok',
    data: { items: rows, total: 2 },
    results: [{ series: rows }, { series: [{ region: 'LATAM', revenue: 5 }] }],
  };

  it('follows keys and positions to the rows', () => {
    expect(parseTable(JSON.stringify(api), { path: 'data.items' }).rows).toEqual(rows);
    expect(parseTable(api, { path: 'results.1.series' }).rows).toEqual([
      { region: 'LATAM', revenue: 5 },
    ]);
    expect(parseTable(api, { path: ' data . items ' }).rows).toEqual(rows);
  });

  it('accepts every table shape at the end of the path', () => {
    const doc = {
      a: {
        columns: { region: ['EMEA', 'APAC'], revenue: [120, 80] },
        arrays: [
          ['region', 'revenue'],
          ['EMEA', 120],
          ['APAC', 80],
        ],
        wrapped: { rows },
      },
    };
    expect(parseTable(doc, { path: 'a.columns' }).rows).toEqual(rows);
    expect(parseTable(doc, { path: 'a.arrays' }).rows).toEqual(rows);
    const wrapped = parseTable(doc, { path: 'a.wrapped' });
    expect(wrapped.rows).toEqual(rows);
    expect(notes(wrapped)).toEqual(['Read rows from `a.wrapped.rows`.']);
  });

  it('names the first missing segment and the keys at that level', () => {
    const t = parseTable(api, { path: 'data.itemz.0', firstLine: 6, pathLine: 3 });
    expect(t.rows).toEqual([]);
    const [problem] = of('error', t);
    expect(problem.message).toBe(
      'The path `data.itemz.0` stops at `itemz`: there is no such key at `data`.',
    );
    expect(problem.hint).toBe('Keys there: `items`, `total`.');
    expect(problem.line).toBe(3);

    const top = of('error', parseTable(api, { path: 'Data.items' }))[0];
    expect(top.message).toBe(
      'The path `Data.items` stops at `Data`: there is no such key at the top level.',
    );
    expect(top.hint).toBe('Did you mean `data`? Keys there: `status`, `data`, `results`.');
  });

  it('explains positions in lists and values that hold nothing further', () => {
    const outOfRange = of('error', parseTable(api, { path: 'results.5.series' }))[0];
    expect(outOfRange.message).toBe(
      'The path `results.5.series` stops at `5`: `results` has 2 items.',
    );
    expect(outOfRange.hint).toBe('Positions run from 0 to 1.');

    const key = of('error', parseTable(api, { path: 'data.items.region' }))[0];
    expect(key.message).toBe(
      'The path `data.items.region` stops at `region`: `data.items` is a list, which takes a position, not a key.',
    );
    expect(key.hint).toBe(
      'Use a position from 0 to 1, or end the path at `data.items` to read its items as rows.',
    );

    expect(errors(parseTable(api, { path: 'status.code' }))).toEqual([
      'The path `status.code` stops at `code`: `status` is text, not an object or a list.',
    ]);
    expect(errors(parseTable(api, { path: 'data.total' }))).toEqual([
      '`data.total` does not hold rows. Expected an array of rows or an object of columns.',
    ]);
    // A path that stops one level short of the rows says what is there.
    const short = { report: { summary: { count: 2 }, generated: '2026-11-10' } };
    expect(of('error', parseTable(short, { path: 'report' }))[0]).toMatchObject({
      message: '`report` does not hold rows. Expected an array of rows or an object of columns.',
      hint: '`report` has the keys `summary`, `generated`. Extend the path to the one that holds the rows.',
    });
    const two = { report: { current: rows, previous: rows } };
    expect(of('error', parseTable(two, { path: 'report' }))[0]).toMatchObject({
      message: '`report` does not hold rows. Several keys hold rows: `current`, `previous`.',
      hint: 'Choose one with `path:`, e.g. `path: report.current`.',
    });
  });

  it('reads the JSONPath spellings of a lookup, with a note', () => {
    const read = (path: string) => {
      const t = parseTable(api, { path, firstLine: 6, pathLine: 3 });
      return { rows: t.rows, notes: of('info', t), errors: errors(t) };
    };
    const second = [{ region: 'LATAM', revenue: 5 }];
    const cases: [string, string, unknown[]][] = [
      ['$.data.items', 'data.items', rows],
      ['$.results[1].series', 'results.1.series', second],
      ['results[1].series', 'results.1.series', second],
      ['$["results"][1]["series"]', 'results.1.series', second],
      ["data['items']", 'data.items', rows],
      ['data["items"]', 'data.items', rows],
      ["$['data'].items", 'data.items', rows],
      ['results[ 0 ].series', 'results.0.series', rows],
    ];
    for (const [written, dotted, expected] of cases) {
      const out = read(written);
      expect(out.errors, written).toEqual([]);
      expect(out.rows, written).toEqual(expected);
      expect(out.notes, written).toEqual([
        { severity: 'info', message: `Read \`${written}\` as \`${dotted}\`.`, line: 3 },
      ]);
    }
    // A position at the end selects one item, which must itself hold rows.
    expect(
      parseTable({ data: { items: [{ series: rows }] } }, { path: 'data.items[0]' }).rows,
    ).toEqual(rows);
    // `$` alone is the document.
    const whole = parseTable({ data: rows, meta: {} }, { path: '$' });
    expect(whole.rows).toEqual(rows);
    expect(notes(whole)).toEqual(['Read `$` as the whole document.', 'Read rows from `data`.']);
    // The dotted form needs no note, and a key may itself start with `$`.
    expect(parseTable(api, { path: 'data.items' }).diagnostics).toEqual([]);
    expect(parseTable({ $values: rows, $id: '1' }, { path: '$values' }).diagnostics).toEqual([]);
  });

  it('reports a normalized path that does not resolve in its dotted form', () => {
    const t = parseTable(api, { path: '$.results[5].series' });
    expect(notes(t)).toEqual(['Read `$.results[5].series` as `results.5.series`.']);
    expect(of('error', t)[0]).toMatchObject({
      message: 'The path `results.5.series` stops at `5`: `results` has 2 items.',
      hint: 'Positions run from 0 to 1.',
    });
  });

  it('has no wildcards, recursive descent, filters, slices or unions', () => {
    const hint =
      'A path is keys and positions separated by dots, e.g. `data.items` or `results.0`. Wildcards and filters are not supported.';
    for (const path of [
      'data.*',
      '*',
      'data[*].items',
      '$.results[*].series',
      '$..items',
      'a..b',
      'data.items[?(@.revenue>100)]',
      'results[0:2]',
      'results[0,1].series',
      'results[-1].series',
      'results[first]',
      "data['a.b']",
      'data[0',
      'data.',
      '$.',
      'results[0]series',
      '',
    ]) {
      const result = resolveDataPath(api, path);
      expect(result.ok, path).toBe(false);
      expect(parseDataPath(path), path).toEqual({
        message: `\`${path}\` is not a path this language reads.`,
        hint,
      });
    }
    // jq's leading dot is not read, but the hint gives the form that is.
    expect(parseDataPath('.data.items[0]')).toEqual({
      message: '`.data.items[0]` is not a path this language reads.',
      hint: 'Write `path: data.items.0`.',
    });
    expect(parseDataPath('data.items')).toEqual({
      segments: ['data', 'items'],
      dotted: 'data.items',
    });
    expect(parseDataPath('$.results[0].series')).toEqual({
      segments: ['results', '0', 'series'],
      dotted: 'results.0.series',
      written: '$.results[0].series',
    });
  });

  it('reads own keys only', () => {
    expect(resolveDataPath({ a: 1 }, '__proto__').ok).toBe(false);
    expect(resolveDataPath({ a: 1 }, 'constructor.name').ok).toBe(false);
    expect(resolveDataPath([rows], 'length').ok).toBe(false);
  });

  it('is ignored with a warning for data that is not JSON', () => {
    const t = parseTable('region,revenue\nEMEA,120\n', { path: 'data' });
    expect(t.rows).toEqual([{ region: 'EMEA', revenue: 120 }]);
    expect(of('warning', t).map((d) => d.message)).toEqual([
      '`path:` applies to JSON; this data is a table already, so it was ignored.',
    ]);
  });

  it('waits for the whole document while a block streams', () => {
    const partial = parseTable('{"data":{"items":[{"region":"EMEA","revenue":120},{"reg', {
      path: 'data.items',
      partial: true,
    });
    expect(partial.rows).toEqual([]);
    expect(partial.truncated).toBe(true);
    expect(partial.diagnostics).toEqual([]);
  });
});

describe('readSourceValue', () => {
  it('passes host rows and datasets through, and reads text and envelopes', () => {
    expect(readSourceValue(rows)).toBe(rows);
    const envelope = readSourceValue({ data: rows, meta: {} });
    expect((envelope as { rows: unknown[] }).rows).toEqual(rows);
    const text = readSourceValue('region,revenue\nEMEA,$120\n');
    expect((text as { rows: unknown[] }).rows).toEqual([{ region: 'EMEA', revenue: 120 }]);
    const nested = readSourceValue([{ series: rows }], { path: '0.series' });
    expect((nested as { rows: unknown[] }).rows).toEqual(rows);
  });

  it('throws the problem with its hint', () => {
    expect(() => readSourceValue({ data: { items: rows } }, { path: 'data.rows' })).toThrow(
      'The path `data.rows` stops at `rows`: there is no such key at `data`. Keys there: `items`.',
    );
    expect(() => readSourceValue('{"a":')).toThrow(/not valid JSON/);
  });
});

describe('compileBlock with path and refresh', () => {
  it('reads inline JSON through path', () => {
    const block = compileBlock(
      `bar sum(revenue) by region\npath: data.items\n---\n${JSON.stringify({ data: { items: rows } })}\n`,
    );
    expect(errors(block)).toEqual([]);
    expect(block.spec).toMatchObject({ component: 'BarChart', x: 'region' });
    expect(Object.values(block.data)[0]).toMatchObject({ rows });
  });

  it('reads an inline envelope without a path and says which key it used', () => {
    const block = compileBlock(
      `bar sum(revenue) by region\n---\n${JSON.stringify({ data: rows, meta: { total: 2 } })}\n`,
    );
    expect(errors(block)).toEqual([]);
    expect(notes(block)).toContain('Read rows from `data`.');
  });

  it('reports a path that does not resolve at the setting', () => {
    const block = compileBlock(
      `bar sum(revenue) by region\npath: data.rows\n---\n${JSON.stringify({ data: { items: rows } })}\n`,
    );
    expect(of('error', block)[0]).toMatchObject({
      message: 'The path `data.rows` stops at `rows`: there is no such key at `data`.',
      hint: 'Keys there: `items`.',
      line: 2,
    });
    expect(block.spec).toBeUndefined();
  });

  it('records path and refresh with the source, under every alias', () => {
    const chart = compileBlock(
      'line sum(value) by time\nsrc: https://api.example.com/v1/metrics\npath: data.items\nrefresh: 5m\n',
    );
    expect(chart.sources).toEqual([
      {
        name: 'url:https://api.example.com/v1/metrics path:data.items',
        url: 'https://api.example.com/v1/metrics',
        line: 2,
        path: 'data.items',
        refresh: 300,
      },
    ]);
    expect(chart.diagnostics).toEqual([]);
    expect(chart.pending).toBe(true);

    for (const key of ['rows-path', 'rowsPath', 'data path', 'json_path']) {
      const aliased = compileBlock(`data metrics\nurl: /api/metrics\n${key}: "results.0"\n`);
      expect(aliased.sources).toEqual([
        { name: 'metrics', url: '/api/metrics', line: 2, path: 'results.0' },
      ]);
      expect(aliased.diagnostics).toEqual([]);
    }
    // `rows` keeps meaning `limit`.
    const limited = compileBlock('table\nsrc: /a.json\nrows: 5\n', {
      datasets: { 'url:/a.json': rows },
    });
    expect(limited.sources[0].path).toBeUndefined();
    expect(limited.spec).toMatchObject({ limit: 5 });
  });

  it('records another spelling of a path in dotted form, with the note at the setting', () => {
    const chart = compileBlock(
      'line sum(value) by time\nsrc: https://api.example.com/v1/metrics\npath: $.data.items[0].series\n',
    );
    expect(chart.sources).toEqual([
      {
        name: 'url:https://api.example.com/v1/metrics path:data.items.0.series',
        url: 'https://api.example.com/v1/metrics',
        line: 2,
        path: 'data.items.0.series',
      },
    ]);
    expect(chart.diagnostics).toEqual([
      {
        severity: 'info',
        message: 'Read `$.data.items[0].series` as `data.items.0.series`.',
        line: 3,
        hint: undefined,
      },
    ]);
    // The same place written two ways is one source.
    const plain = compileBlock(
      'line sum(value) by time\nsrc: https://api.example.com/v1/metrics\npath: data.items.0.series\n',
    );
    expect(plain.sources[0].name).toBe(chart.sources[0].name);

    const inline = compileBlock(
      `bar sum(revenue) by region\npath: $.data["items"]\n---\n${JSON.stringify({ data: { items: rows } })}\n`,
    );
    expect(errors(inline)).toEqual([]);
    expect(notes(inline)).toEqual(['Read `$.data["items"]` as `data.items`.']);
    expect(inline.spec).toMatchObject({ component: 'BarChart', x: 'region' });

    // `$` is the whole document, so nothing is recorded as a path.
    const whole = compileBlock('table\nsrc: /rows.json\npath: $\n');
    expect(whole.sources).toEqual([{ name: 'url:/rows.json', url: '/rows.json', line: 2 }]);
    expect(notes(whole)).toEqual(['Read `$` as the whole document.']);

    // A wildcard is still an error, reported once at the setting.
    const wild = compileBlock(
      `bar sum(revenue) by region\npath: $.data[*]\n---\n${JSON.stringify({ data: rows })}\n`,
    );
    expect(of('error', wild).filter((d) => d.message.includes('is not a path'))).toEqual([
      {
        severity: 'error',
        message: '`$.data[*]` is not a path this language reads.',
        line: 2,
        hint: 'A path is keys and positions separated by dots, e.g. `data.items` or `results.0`. Wildcards and filters are not supported.',
      },
    ]);
  });

  it('keeps charts of one URL with different paths apart', () => {
    const a = compileBlock('table\nsrc: /api\npath: a\n');
    const b = compileBlock('table\nsrc: /api\npath: b\n');
    const none = compileBlock('table\nsrc: /api\n');
    expect(new Set([a.sources[0].name, b.sources[0].name, none.sources[0].name]).size).toBe(3);
    expect(none.sources[0].name).toBe('url:/api');
  });

  it('reads refresh as seconds and raises it to the host floor with a note', () => {
    expect(parseRefresh('30s')).toBe(30);
    expect(parseRefresh('5m')).toBe(300);
    expect(parseRefresh('1h')).toBe(3600);
    expect(parseRefresh('90')).toBe(90);
    expect(parseRefresh('2 min')).toBe(120);
    expect(parseRefresh('off')).toBe(0);
    expect(parseRefresh('soon')).toBeUndefined();
    expect(parseRefresh('5d')).toBeUndefined();
    expect(parseRefresh('-5')).toBeUndefined();

    const fast = compileBlock('kpi sum(value)\nsrc: /api\nrefresh: 2s\n', { minRefresh: 10 });
    expect(fast.sources[0].refresh).toBe(10);
    expect(of('info', fast)[0]).toMatchObject({
      message: 'Refresh raised from 2s to 10s, the shortest interval this page allows.',
      line: 3,
    });
    expect(compileBlock('kpi sum(value)\nsrc: /api\nrefresh: 2s\n').sources[0].refresh).toBe(2);
    expect(
      compileBlock('kpi sum(value)\nsrc: /api\nrefresh: 30\n', { minRefresh: 10 }).diagnostics,
    ).toEqual([]);
    expect(compileBlock('kpi sum(value)\nsrc: /api\nrefresh: off\n').sources[0]).not.toHaveProperty(
      'refresh',
    );
  });

  it('warns about settings that cannot apply', () => {
    const inline = compileBlock('kpi sum(revenue)\nrefresh: 30s\n---\nrevenue\n1\n');
    expect(of('warning', inline).map((d) => d.message)).toEqual([
      '`refresh:` reloads a `src:` URL; this block’s rows are written in it, so it was ignored.',
    ]);
    const named = compileBlock('kpi sum(revenue)\ndata: sales\nrefresh: 30s\n', {
      datasets: { sales: [{ revenue: 1 }] },
    });
    expect(of('warning', named)[0]).toMatchObject({
      message: '`refresh:` reloads a `src:` URL; this block has none, so it was ignored.',
      hint: 'Write `refresh:` in the block that has `src:`.',
      line: 3,
    });
    const bad = compileBlock('kpi sum(value)\nsrc: /api\nrefresh: often\n');
    expect(of('warning', bad)[0]).toMatchObject({
      message: '“often” is not a refresh interval; it was ignored.',
      hint: 'Use a duration or seconds: 30s, 5m, 1h, 90.',
    });
    expect(bad.sources[0]).not.toHaveProperty('refresh');
    const lone = compileBlock('kpi sum(revenue)\ndata: sales\npath: data\n', {
      datasets: { sales: [{ revenue: 1 }] },
    });
    expect(of('warning', lone).map((d) => d.message)).toEqual([
      '`path:` applies to a `src:` response or to JSON rows after `---`; it was ignored.',
    ]);
  });

  it('accepts `url:` for `src:` without a warning', () => {
    const chart = compileBlock('bar sum(revenue) by region\nurl: /sales.csv\n');
    expect(chart.sources).toEqual([{ name: 'url:/sales.csv', url: '/sales.csv', line: 2 }]);
    expect(chart.diagnostics).toEqual([]);
  });

  it('reads a dashboard’s source settings before its first view', () => {
    const source = [
      'dashboard Live metrics',
      'src: https://api.example.com/v1/metrics',
      'path: data.items',
      'refresh: 1m',
      '',
      'kpi sum(value) as "Total"',
      'line sum(value) by day',
    ].join('\n');
    const waiting = compileBlock(source);
    const name = 'url:https://api.example.com/v1/metrics path:data.items';
    expect(waiting.sources).toEqual([
      {
        name,
        url: 'https://api.example.com/v1/metrics',
        line: 2,
        path: 'data.items',
        refresh: 60,
      },
    ]);
    expect(waiting.pending).toBe(true);
    const loaded = compileBlock(source, {
      datasets: {
        [name]: [
          { day: '2026-11-01', value: 3 },
          { day: '2026-11-02', value: 4 },
        ],
      },
    });
    expect(errors(loaded)).toEqual([]);
    expect(of('warning', loaded)).toEqual([]);
    const views = (loaded.spec as { layout: { component: string; data: string }[] }).layout;
    expect(views.map((v) => v.component)).toEqual(['KPI', 'LineChart']);
    // Both views read the loaded rows (the KPI through a derived copy that carries its label).
    expect(views.every((v) => v.data.startsWith(name))).toBe(true);

    // A view inside a dashboard has no source of its own, so the setting is reported there.
    const inner = compileBlock(`${source}\nrefresh: 5s\n`, {
      datasets: { [name]: [{ day: '2026-11-01', value: 3 }] },
    });
    expect(of('warning', inner).map((d) => d.message)).toEqual([
      '“refresh” is not a line setting; it was ignored.',
    ]);
  });

  it('carries path and refresh through a document scan', () => {
    const scan = scanDocument(
      [
        '```quartile',
        'data metrics',
        'src: https://api.example.com/metrics',
        'path: data',
        'refresh: 1m',
        '```',
        '',
        '```quartile',
        'kpi sum(value)',
        'data: metrics',
        '```',
      ].join('\n'),
    );
    expect(scan.sources).toEqual([
      { name: 'metrics', url: 'https://api.example.com/metrics', path: 'data', refresh: 60 },
    ]);
  });
});
