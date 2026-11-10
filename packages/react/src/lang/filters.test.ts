import { describe, expect, it } from 'vitest';
import { validateSpec } from '../spec/validate';
import { compileBlock } from './compile';

const rows =
  '---\nregion,channel,revenue\nEMEA,Online,552000\nAPAC,Retail,310000\nAmericas,Online,120000\n';
const errors = (source: string) =>
  compileBlock(source).diagnostics.filter((d) => d.severity === 'error');

describe('filters blocks', () => {
  it('compiles the fields named in the sentence to FilterBar field objects', () => {
    const compiled = compileBlock(`filters region, channel\n${rows}`);
    expect(errors(`filters region, channel\n${rows}`)).toEqual([]);
    expect(compiled.spec).toMatchObject({
      component: 'FilterBar',
      fields: [{ field: 'region' }, { field: 'channel' }],
    });
    expect(validateSpec(compiled.spec).valid).toBe(true);
  });

  it('offers low-cardinality text columns when no field is named', () => {
    const compiled = compileBlock(`filters\n${rows}`);
    expect(errors(`filters\n${rows}`)).toEqual([]);
    expect(compiled.spec).toMatchObject({
      component: 'FilterBar',
      fields: [{ field: 'region' }, { field: 'channel' }],
    });
  });

  it('sits in a dashboard next to the views it filters', () => {
    const source = `dashboard Sales\nfilters region\nkpi sum(revenue) as "Revenue"\nbar sum(revenue) by channel\n${rows}`;
    expect(errors(source)).toEqual([]);
    const spec = compileBlock(source).spec as { layout: { component: string }[] };
    expect(spec.layout.map((item) => item.component)).toEqual(['FilterBar', 'KPI', 'BarChart']);
  });

  it('still reports a field that is not a column', () => {
    const problems = errors(`filters nowhere\n${rows}`);
    expect(problems).toHaveLength(1);
    expect(`${problems[0].message} ${problems[0].hint ?? ''}`).toMatch(/region/);
  });
});
