import { describe, expect, it } from 'vitest';
import { checkMarkdown, formatProblem } from './check';

const fence = '```';
const doc = (...lines: string[]) => lines.join('\n');

describe('checkMarkdown', () => {
  it('passes a document whose blocks compile, counting them', () => {
    const result = checkMarkdown(
      doc(
        '# Q3',
        '',
        `${fence}quartile`,
        'bar sum(revenue) by region',
        '---',
        'region,revenue',
        'EMEA,12',
        fence,
      ),
    );
    expect(result.blocks).toBe(1);
    expect(result.problems.filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('reports an unknown column on its line in the document, with the real columns', () => {
    const result = checkMarkdown(
      doc(
        'Intro',
        '',
        `${fence}quartile`,
        'bar sum(revenue) by nowhere',
        '---',
        'region,revenue',
        'EMEA,12',
        fence,
      ),
    );
    const errors = result.problems.filter((p) => p.severity === 'error');
    expect(errors).toHaveLength(1);
    // The fence opens on line 3; the header is the first line inside it.
    expect(errors[0].line).toBe(4);
    expect(`${errors[0].message} ${errors[0].hint ?? ''}`).toMatch(/region/);
    expect(formatProblem('report.md', errors[0])).toMatch(/^report\.md:4: error: /);
  });

  it('lets a chart use a data block defined later in the same document', () => {
    const result = checkMarkdown(
      doc(
        `${fence}quartile`,
        'line sum(revenue) by month',
        'data: sales',
        fence,
        '',
        `${fence}quartile`,
        'data sales',
        '---',
        'month,revenue',
        '2026-07,10',
        '2026-08,12',
        fence,
      ),
    );
    expect(result.blocks).toBe(2);
    expect(result.problems.filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('fails on a dataset nobody defines, unless the host declares or supplies it', () => {
    const text = doc(`${fence}quartile`, 'bar sum(amount) by region', 'data: orders', fence);
    expect(checkMarkdown(text).problems.some((p) => p.severity === 'error')).toBe(true);
    expect(
      checkMarkdown(text, { hostDatasets: ['orders'] }).problems.filter(
        (p) => p.severity === 'error',
      ),
    ).toEqual([]);
    const rows = [{ region: 'EU', amount: 1 }];
    expect(
      checkMarkdown(text, { datasets: { orders: rows } }).problems.filter(
        (p) => p.severity === 'error',
      ),
    ).toEqual([]);
    // With the rows known, a field that is not in them is caught.
    const wrong = text.replace('by region', 'by nowhere');
    expect(
      checkMarkdown(wrong, { datasets: { orders: rows } }).problems.some(
        (p) => p.severity === 'error',
      ),
    ).toBe(true);
  });

  it('does not ask for the columns of a src: dataset, which only the page can load', () => {
    const result = checkMarkdown(
      doc(
        `${fence}quartile`,
        'data sales',
        'src: sales.csv',
        fence,
        '',
        `${fence}quartile`,
        'bar sum(revenue) by region',
        'data: sales',
        fence,
      ),
    );
    expect(result.problems.filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('warns about a fence that is never closed', () => {
    const result = checkMarkdown(doc(`${fence}quartile`, 'bar sum(a) by b', '---', 'b,a', 'x,1'));
    expect(
      result.problems.some((p) => p.severity === 'warning' && /never closed/.test(p.message)),
    ).toBe(true);
  });

  it('checks blocks inside markdown example fences only when asked, with document lines', () => {
    const text = doc(
      'An example:',
      '',
      '````markdown',
      `${fence}quartile`,
      'bar sum(revenue) by nowhere',
      '---',
      'region,revenue',
      'EMEA,12',
      fence,
      '````',
    );
    expect(checkMarkdown(text).blocks).toBe(0);
    const nested = checkMarkdown(text, { nested: true });
    expect(nested.blocks).toBe(1);
    expect(nested.problems.find((p) => p.severity === 'error')?.line).toBe(5);
  });

  it('reads other fence languages when the host names them', () => {
    const text = doc(`${fence}chart`, 'kpi count', '---', 'id', '1', fence);
    expect(checkMarkdown(text).blocks).toBe(0);
    expect(checkMarkdown(text, { languages: ['quartile', 'chart'] }).blocks).toBe(1);
  });
});
