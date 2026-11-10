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

  it('refuses to guess between several lists of rows', () => {
    const t = parseTable(JSON.stringify({ results: rows, errors: [{ code: 1 }], total: 2 }));
    expect(t.rows).toEqual([]);
    const [problem] = of('error', t);
    expect(problem.message).toBe('Several keys hold rows: `results`, `errors`.');
    expect(problem.hint).toBe('Choose one with `path:`, e.g. `path: results`.');
    expect(errors(parseTable(JSON.stringify({ results: rows, errors: [] })))).toEqual([]);
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

  it('has no wildcards, filters, brackets or expressions', () => {
    for (const path of [
      'data.*',
      'data[*].items',
      '$..items',
      'data.items[?(@.x>1)]',
      'a..b',
      '',
    ]) {
      const result = resolveDataPath(api, path);
      expect(result.ok, path).toBe(false);
    }
    const jsonPath = parseDataPath('$.results[0].series');
    expect(jsonPath).toEqual({
      message: '`$.results[0].series` is not a path this language reads.',
      hint: 'Write `path: results.0.series`.',
    });
    expect(parseDataPath('data.*')).toMatchObject({
      hint: 'A path is keys and positions separated by dots, e.g. `data.items` or `results.0`. Wildcards and filters are not supported.',
    });
    expect(parseDataPath('data.items')).toEqual(['data', 'items']);
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
