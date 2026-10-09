import type { Schema } from '../data/types';
import type { QueryPlan } from '../query/types';
import { compileQuery } from './compile';

const schema: Schema = {
  label: { name: 'label', type: 'nominal', label: 'Label', format: 'text' },
  value: {
    name: 'value',
    type: 'quantitative',
    label: 'Value',
    format: 'currency',
    currency: 'EUR',
  },
  ok: { name: 'ok', type: 'boolean', label: 'Okay', format: 'text' },
};
const rows: QueryPlan = { kind: 'rows', predicates: [], window: { offset: 0, limit: 10 } };

describe('bounded DuckDB query compilation', () => {
  it('rejects unbounded row windows, malformed bins, aliases and unknown fields before worker execution', () => {
    expect(() =>
      compileQuery({ ...rows, window: { offset: 0, limit: 10_001 } }, schema, 'input'),
    ).toThrow('limit');
    expect(() =>
      compileQuery({ ...rows, window: { offset: -1, limit: 1 } }, schema, 'input'),
    ).toThrow('offset');
    expect(() => compileQuery({ ...rows, fields: ['missing'] }, schema, 'input')).toThrow(
      'Unknown query field',
    );
    expect(() =>
      compileQuery(
        { kind: 'histogram', predicates: [], field: 'value', edges: [0, 0, 1] },
        schema,
        'input',
      ),
    ).toThrow('increasing');
    expect(() =>
      compileQuery(
        {
          kind: 'aggregate',
          predicates: [],
          groupBy: ['label'],
          measures: [{ aggregate: 'count', as: 'LABEL' }],
          limit: 10,
        },
        schema,
        'input',
      ),
    ).toThrow('alias');
  });

  it('requires physical numeric fields for numeric measures and exact predicate types', () => {
    for (const field of ['label', 'ok']) {
      expect(() =>
        compileQuery(
          {
            kind: 'aggregate',
            predicates: [],
            groupBy: [],
            measures: [{ aggregate: 'sum', field, as: 'sum' }],
            limit: 10,
          },
          schema,
          'input',
        ),
      ).toThrow('quantitative');
    }
    expect(() =>
      compileQuery({ ...rows, predicates: [{ field: 'ok', op: 'eq', value: 1 }] }, schema, 'input'),
    ).toThrow('boolean');
    expect(() =>
      compileQuery(
        { ...rows, predicates: [{ field: 'value', op: 'eq', value: Number.NaN }] },
        schema,
        'input',
      ),
    ).toThrow('quantitative');
    expect(() =>
      compileQuery(
        { ...rows, predicates: [{ field: 'label', op: 'between', value: [null, 'Z'] }] },
        schema,
        'input',
      ),
    ).toThrow('Ranges');
  });

  it('snapshots bound values and retains measure formatting without converting counts to currency', () => {
    const values = ['A'];
    const compiled = compileQuery(
      {
        kind: 'aggregate',
        predicates: [{ field: 'label', op: 'in', value: values }],
        groupBy: [],
        measures: [
          { field: 'value', aggregate: 'sum', as: 'total' },
          { field: 'value', aggregate: 'count', as: 'n' },
        ],
        limit: 10,
      },
      schema,
      'input',
    );
    values[0] = 'B';
    expect(compiled.params).toEqual(['A', 10]);
    expect(compiled.schema.total).toMatchObject({ format: 'currency', currency: 'EUR' });
    expect(compiled.schema.n.format).toBe('integer');
    expect(compiled.schema.n.currency).toBeUndefined();
  });
});
