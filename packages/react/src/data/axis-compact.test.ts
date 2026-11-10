import { describe, expect, it } from 'vitest';
import { renderBlockToHTML } from '../server';
import { makeFieldFormatter } from './format';
import { dataset } from './schema';

describe('compact formats on an axis', () => {
  const field = dataset([{ revenue: 1 }], {
    revenue: { format: 'currency', axisFormat: 'currency-compact', currency: 'USD' },
  }).schema.revenue;

  it('drops trailing zeros from ticks', () => {
    const axis = makeFieldFormatter(field, { short: true, surface: 'axis', locale: 'en-US' });
    expect([0, 500_000, 1_000_000, 1_250_000, 2_500_000].map(axis)).toEqual([
      '$0',
      '$500K',
      '$1M',
      '$1.25M',
      '$2.5M',
    ]);
  });

  it('keeps the padded form where values line up in a column', () => {
    const cell = makeFieldFormatter({ ...field, format: 'currency-compact' }, { locale: 'en-US' });
    expect(cell(548_000)).toBe('$548.0K');
  });

  it('gives a block with whole currency amounts the same ticks as application data', () => {
    const html = renderBlockToHTML(
      'bar sum(revenue) by region\nformat: currency USD\n---\nregion,revenue\nEMEA,1200000\nAPAC,860000\nAmericas,2100000\n',
      { timeZone: 'UTC' },
    );
    expect(html).toContain('$500K');
    expect(html).toContain('$2.5M');
    expect(html).not.toMatch(/\$500\.0K|\$2\.50M/);
  });
});
