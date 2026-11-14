// Settings whose size a block chooses must stay bounded: a block can come from a model or a reader.
import { describe, expect, it } from 'vitest';
import { compileBlock } from '../lang/compile';
import { renderBlockToHTML } from '../server';

const nums = ['x,y', ...Array.from({ length: 30 }, (_, i) => `${i},${i * 2}`)].join('\n');
const days = [
  'day,users',
  ...Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')},${i}`),
].join('\n');

describe('size limits', () => {
  it('refuses bins and weeks beyond what a screen can show', () => {
    const bins = compileBlock(`histogram x\nbins: 2000000\n---\n${nums}`);
    expect(bins.diagnostics.some((d) => d.severity === 'error' && /200/.test(d.message))).toBe(
      true,
    );
    const weeks = compileBlock(`calendar users by day\nweeks: 50000000\n---\n${days}`);
    expect(weeks.diagnostics.some((d) => d.severity === 'error' && /520/.test(d.message))).toBe(
      true,
    );
    expect(
      compileBlock(`histogram x\nbins: 200\n---\n${nums}`).diagnostics.filter(
        (d) => d.severity === 'error',
      ),
    ).toEqual([]);
  });

  it('draws at most 200 bins and 520 weeks when a host passes more', async () => {
    const { Histogram } = await import('./Histogram');
    const { CalendarHeatmap } = await import('./CalendarHeatmap');
    const { renderToString } = await import('react-dom/server');
    const { createElement } = await import('react');
    const rows = Array.from({ length: 30 }, (_, i) => ({
      x: i,
      day: `2026-01-${String(i + 1).padStart(2, '0')}`,
      users: i,
    }));
    const started = performance.now();
    const hist = renderToString(createElement(Histogram, { data: rows, x: 'x', bins: 5_000_000 }));
    const cal = renderToString(
      createElement(CalendarHeatmap, {
        data: rows,
        date: 'day',
        value: 'users',
        weeks: 50_000_000,
      }),
    );
    expect(performance.now() - started).toBeLessThan(5000);
    expect(hist.length).toBeLessThan(2_000_000);
    expect(cal.length).toBeLessThan(5_000_000);
  });

  it('keeps a static render of the largest allowed settings small', () => {
    const html = renderBlockToHTML(`calendar users by day\nweeks: 520\n---\n${days}`, {
      timeZone: 'UTC',
    });
    expect(html.length).toBeLessThan(5_000_000);
  });
});
