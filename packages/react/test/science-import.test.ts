import { describe, expect, it } from 'vitest';
import { parseCSV, parseDatasetText } from '../../../apps/gallery/src/examples/science/import-data';

describe('scientific snapshot import', () => {
  it('reads quoted CSV, embedded newlines and mixed typed columns without losing identifiers', () => {
    const imported = parseDatasetText(
      'id,value,passed,note\r\n001,12.5,true,"A, B"\r\n002,,false,"two\nlines"',
      'lab.csv',
    );
    expect(imported.rows).toEqual([
      { id: '001', value: 12.5, passed: true, note: 'A, B', _quartile_row: 'row-1' },
      { id: '002', value: null, passed: false, note: 'two\nlines', _quartile_row: 'row-2' },
    ]);
    expect(parseCSV('a,b\n"say ""yes""",2')).toEqual([
      ['a', 'b'],
      ['say "yes"', '2'],
    ]);
  });
  it('accepts typed dataframe snapshots and fields introduced after row 200', () => {
    const rows = Array.from({ length: 201 }, (_, i) => (i === 200 ? { n: i, late: 5 } : { n: i }));
    const result = parseDatasetText(
      JSON.stringify({
        label: 'Samples',
        rows,
        fields: { n: { type: 'quantitative', format: 'integer' } },
      }),
      'samples.json',
    );
    expect(result.rows[200].late).toBe(5);
    expect(result.fields.n).toEqual({ type: 'quantitative', format: 'integer' });
  });
  it('preserves large CSV identifiers as strings and rejects unsafe JSON integers', () => {
    const result = parseDatasetText(
      'id,value\n9007199254740993,1.25\n9007199254740994,2.5',
      'ids.csv',
    );
    expect(result.rows.map((row) => row.id)).toEqual(['9007199254740993', '9007199254740994']);
    expect(result.rows.map((row) => row.value)).toEqual([1.25, 2.5]);
    for (const literal of ['9007199254740993', '-9007199254740993', '1e20'])
      expect(() => parseDatasetText(`[{"id":${literal}}]`, 'ids.json')).toThrow('safe range');
    expect(
      parseDatasetText('[{"id":"9007199254740993","value":9007199254740991}]', 'ids.json').rows[0],
    ).toMatchObject({ id: '9007199254740993', value: Number.MAX_SAFE_INTEGER });
  });
  it('fills absent JSON cells with own null values, including prototype-like field names', () => {
    const result = parseDatasetText(
      '[{"toString":"first","value":1},{"value":2,"later":true}]',
      'sparse.json',
    );
    expect(result.rows).toEqual([
      { toString: 'first', value: 1, later: null, _quartile_row: 'row-1' },
      { toString: null, value: 2, later: true, _quartile_row: 'row-2' },
    ]);
    expect(Object.hasOwn(result.rows[1], 'toString')).toBe(true);
    expect(Object.hasOwn(result.rows[0], 'later')).toBe(true);
  });
  it('rejects malformed, dangerous, nested and oversized imports before rendering', () => {
    for (const text of [
      'x,x\n1,2',
      'x,y\n1',
      'x\n"unfinished',
      'constructor\n1',
      'x\n"closed"extra',
    ])
      expect(() => parseDatasetText(text, 'bad.csv')).toThrow();
    for (const text of ['[{"__proto__":1}]', '[{"x":{"nested":1}}]', '[]', '[1]', '[{"x":1e999}]'])
      expect(() => parseDatasetText(text, 'bad.json')).toThrow();
    expect(() =>
      parseDatasetText(JSON.stringify(Array.from({ length: 10001 }, () => ({ x: 1 }))), 'big.json'),
    ).toThrow('10,000');
    expect(() =>
      parseDatasetText('{"rows":[{"x":1}],"fields":{"unknown":{"type":"nominal"}}}', 'bad.json'),
    ).toThrow('unknown');
    expect(() =>
      parseDatasetText(
        '{"rows":[{"amount":12}],"fields":{"amount":{"format":"currency","currency":"US Dollars"}}}',
        'bad-currency.json',
      ),
    ).toThrow('three-letter');
  });
});
