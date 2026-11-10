import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHART_COLOR_PATTERN,
  chartColor,
  isChartColor,
  optionalColor,
  pickColor,
  seriesColors,
  singleColor,
  specColors,
} from './colors';
import {
  boundX,
  describeLimits,
  describeReferences,
  gridLines,
  labelCount,
  legendPlacement,
  marginSides,
  readOut,
  referenceLines,
  spreadLabels,
  tickCount,
  valueAxis,
} from './options';
import { seriesColor, valueScale } from './scales';

afterEach(() => vi.restoreAllMocks());

/** Text a block or a spec must never carry as a color. Much of it is valid CSS. */
const NOT_DATA = [
  'red',
  'rgb(47, 69, 232)',
  'rgba(0,0,0,.5)',
  'hsl(230 80% 55%)',
  'url(https://example.com/paint.svg#p)',
  'var(--x)',
  'var(--q-signal); background: url(https://example.com/x)',
  '#12',
  '#12345',
  '#gggggg',
  'signal;',
  ' ',
  '',
  '9',
  '0',
  'Signal ',
  'expression(alert(1))',
  'javascript:alert(1)',
];

describe('chart colors', () => {
  it('maps palette names, categorical indexes and hex colors to CSS', () => {
    expect(chartColor('signal')).toBe('var(--q-signal)');
    expect(chartColor('positive')).toBe('var(--q-positive)');
    expect(chartColor('negative')).toBe('var(--q-negative)');
    expect(chartColor('warning')).toBe('var(--q-warning)');
    expect(chartColor('muted')).toBe('var(--q-series-muted)');
    expect(chartColor(1)).toBe('var(--q-cat-1)');
    expect(chartColor('8')).toBe('var(--q-cat-8)');
    expect(chartColor('#abc')).toBe('#abc');
    expect(chartColor('#2f45e8')).toBe('#2f45e8');
    expect(chartColor('#2F45E880')).toBe('#2F45E880');
  });

  it('uses any other CSS color a developer passes, as written', () => {
    for (const css of [
      'rebeccapurple',
      'rgb(20 80 200)',
      'hsl(230 80% 55% / 0.5)',
      'var(--brand)',
      'var(--q-line-strong)',
      'color-mix(in srgb, red 40%, white)',
      'currentColor',
    ]) {
      expect(chartColor(css)).toBe(css);
    }
    expect(chartColor('  tomato ')).toBe('tomato');
    expect(chartColor('Signal')).toBe('var(--q-signal)');
  });

  it('has no CSS value for a prop that is not a color', () => {
    for (const value of ['', '   ', 0, 9, 1.5, Number.NaN, null, undefined, {}, [], true]) {
      expect(chartColor(value)).toBeNull();
    }
  });

  it('accepts only exact tokens as data, in the same words as the schema pattern', () => {
    const pattern = new RegExp(CHART_COLOR_PATTERN);
    for (const ok of ['signal', 'muted', '1', '8', '#abc', '#2f45e8', '#2F45E8AA']) {
      expect([ok, isChartColor(ok), pattern.test(ok)]).toEqual([ok, true, true]);
    }
    for (const bad of [...NOT_DATA, 'rebeccapurple', 'var(--q-signal)', 'SIGNAL', '#abcd']) {
      expect([bad, isChartColor(bad), pattern.test(bad)]).toEqual([bad, false, false]);
    }
    expect(isChartColor(3)).toBe(true);
    expect(isChartColor(0)).toBe(false);
    expect(isChartColor(2.5)).toBe(false);
  });

  it('filters the color settings of a spec down to what data may carry', () => {
    expect(specColors(['signal', 'red', 3, 'url(https://example.com/x)', '#2f45e8'])).toEqual([
      'signal',
      3,
      '#2f45e8',
    ]);
    expect(specColors('#2f45e8')).toBe('#2f45e8');
    expect(specColors('rebeccapurple')).toBeUndefined();
    expect(specColors({ Paid: 'red' })).toBeUndefined();
    expect(specColors(undefined)).toBeUndefined();
  });

  it('resolves series colors, leaving a gap only for props that are not colors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(seriesColors(['signal', 'tomato', 3, 'rgb(1 2 3)'])).toEqual([
      'var(--q-signal)',
      'tomato',
      'var(--q-cat-3)',
      'rgb(1 2 3)',
    ]);
    expect(seriesColors({ Paid: '#ff0000', Organic: 'var(--brand)' })).toEqual({
      Paid: '#ff0000',
      Organic: 'var(--brand)',
    });
    expect(seriesColors(undefined)).toBeUndefined();
    expect(singleColor('teal', 'var(--q-text)')).toBe('teal');
    expect(optionalColor('positive')).toBe('var(--q-positive)');
    // A developer's CSS color is never reported.
    expect(warn).not.toHaveBeenCalled();

    expect(seriesColors(['signal', 12, ''])).toEqual(['var(--q-signal)', undefined, undefined]);
    expect(singleColor({}, 'var(--q-text)')).toBe('var(--q-text)');
    expect(optionalColor(0)).toBeUndefined();
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('Ignored the color 12'))).toBe(true);
    expect(messages.every((m) => m.includes('or a CSS color'))).toBe(true);
  });

  it('picks by index or by own key, falling back to the palette', () => {
    expect(pickColor(['#111111', undefined], 'a', 0, seriesColor)).toBe('#111111');
    expect(pickColor(['#111111', undefined], 'b', 1, seriesColor)).toBe('var(--q-cat-2)');
    expect(pickColor({ a: '#222222' }, 'a', 4, seriesColor)).toBe('#222222');
    expect(pickColor({ a: '#222222' }, 'constructor', 2, seriesColor)).toBe('var(--q-cat-3)');
    expect(pickColor(undefined, 'a', 0, seriesColor)).toBe('var(--q-cat-1)');
  });
});

describe('margin, grid, legend and reference settings', () => {
  it('reads a margin as every side, four sides, or named sides only', () => {
    expect(marginSides(undefined)).toEqual({});
    expect(marginSides(12)).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(marginSides([1, 2, 3, 4])).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
    expect(marginSides({ left: 64 })).toEqual({ left: 64 });
    expect(marginSides({ left: -5, top: 9999 })).toEqual({ left: 0, top: 400 });
    expect(marginSides('4px' as never)).toEqual({});
    expect(marginSides({ left: 'calc(1px)' } as never)).toEqual({});
  });

  it('chooses gridlines from a boolean or a direction', () => {
    const usual = { x: false, y: true };
    expect(gridLines(undefined, usual)).toEqual(usual);
    expect(gridLines(true, usual)).toEqual({ x: false, y: true });
    expect(gridLines(true, { x: false, y: false }, 'x')).toEqual({ x: true, y: false });
    expect(gridLines(false, usual)).toEqual({ x: false, y: false });
    expect(gridLines('none', usual)).toEqual({ x: false, y: false });
    expect(gridLines('x', usual)).toEqual({ x: true, y: false });
    expect(gridLines('both', usual)).toEqual({ x: true, y: true });
  });

  it('places a legend', () => {
    expect(legendPlacement(undefined, true, 'top')).toBe('top');
    expect(legendPlacement(undefined, false, 'top')).toBeNull();
    expect(legendPlacement(true, false, 'bottom')).toBe('bottom');
    expect(legendPlacement(false, true, 'bottom')).toBeNull();
    expect(legendPlacement('none', true, 'bottom')).toBeNull();
    expect(legendPlacement('left', true, 'bottom')).toBe('left');
    expect(legendPlacement('sideways' as never, true, 'bottom')).toBe('bottom');
  });

  it('normalizes reference lines and describes them', () => {
    expect(referenceLines(undefined)).toEqual([]);
    expect(referenceLines(10)).toEqual([{ value: 10 }]);
    expect(referenceLines({ value: 5, label: 'Target' })).toEqual([{ value: 5, label: 'Target' }]);
    expect(
      referenceLines([{ value: 1 }, { value: Number.NaN }, { label: 'no value' } as never]),
    ).toEqual([{ value: 1 }]);
    expect(describeReferences([{ value: 5, label: 'Target' }, { value: 7 }], String)).toBe(
      'Reference line Target at 5. Reference line at 7.',
    );
  });

  it('describes axis limits only when one is set', () => {
    expect(describeLimits(undefined, undefined, String)).toBe('');
    expect(describeLimits(0, 10, String)).toBe('The y axis runs from 0 to 10.');
    expect(describeLimits(5, undefined, String)).toBe('The y axis starts at 5.');
    expect(describeLimits(undefined, 9, String, 'The x axis')).toBe('The x axis ends at 9.');
  });

  it('reads whole numbers in the full format and fractions as the axis writes them', () => {
    const say = readOut(
      (v) => `${Math.round(v as number)} users`,
      (v) => String(v),
    );
    expect(say(5)).toBe('5 users');
    expect(say(4.5)).toBe('4.5');
  });

  it('bounds tick and label counts', () => {
    expect(tickCount(undefined, 4)).toBe(4);
    expect(tickCount(6.4, 4)).toBe(6);
    expect(tickCount(-3, 4)).toBe(0);
    expect(tickCount(500, 4)).toBe(20);
    expect(labelCount(undefined, 6)).toBe(6);
    expect(labelCount(0, 6)).toBe(0);
    expect(labelCount(1, 6)).toBe(2);
  });

  it('spreads labels that would overlap and keeps them in bounds', () => {
    expect(spreadLabels([10, 50, 90], 12, 0, 100)).toEqual([10, 50, 90]);
    const close = spreadLabels([50, 52, 54], 12, 0, 100);
    expect(close[1] - close[0]).toBeGreaterThanOrEqual(12);
    expect(close[2] - close[1]).toBeGreaterThanOrEqual(12);
    const low = spreadLabels([98, 99], 12, 0, 100);
    expect(Math.max(...low)).toBeLessThanOrEqual(100);
    expect(Math.abs(low[1] - low[0])).toBeGreaterThanOrEqual(12);
  });
});

describe('valueAxis', () => {
  const values = [120, 180, 150];

  it('is the zero-based niced scale with four ticks when nothing is set', () => {
    const axis = valueAxis(values, [200, 10]);
    const usual = valueScale(values, [200, 10]);
    expect(axis.scale.domain()).toEqual(usual.domain());
    expect(axis.ticks).toEqual(usual.ticks(4));
    expect(axis.clipped).toBe(false);
    expect(axis.log).toBe(false);
    expect(valueAxis([], [200, 10]).scale.domain()).toEqual(valueScale([0], [200, 10]).domain());
  });

  it('honors bounds and an approximate tick count', () => {
    const axis = valueAxis(values, [200, 10], { min: 100, max: 200 });
    expect(axis.scale.domain()).toEqual([100, 200]);
    expect(axis.clipped).toBe(false);
    expect(valueAxis(values, [200, 10], { min: 140 }).clipped).toBe(true);
    expect(valueAxis(values, [200, 10], { ticks: 2 }).ticks).toEqual([0, 100, 200]);
    expect(valueAxis(values, [200, 10], { ticks: 0 }).ticks).toEqual([]);
    // Bounds that leave no extent are ignored.
    expect(valueAxis(values, [200, 10], { min: 300, max: 100 }).scale.domain()).toEqual([0, 200]);
  });

  it('refuses bounds that would cut marks measured from zero', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cut = valueAxis(values, [200, 10], { min: 100, anchored: true, chart: 'TestBars' });
    expect(cut.scale.domain()).toEqual([0, 200]);
    const low = valueAxis(values, [200, 10], { max: 150, anchored: true, chart: 'TestBars' });
    expect(low.scale.domain()).toEqual([0, 200]);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(
      /TestBars ignored yMin 100[\s\S]*TestBars ignored yMax 150/,
    );
    // Bounds that only add room are fine.
    const roomy = valueAxis(values, [200, 10], { min: -50, max: 400, anchored: true });
    expect(roomy.scale.domain()).toEqual([-50, 400]);
  });

  it('draws a log scale for positive values and falls back to linear otherwise', () => {
    const log = valueAxis([3, 40, 900], [200, 10], { log: true });
    expect(log.log).toBe(true);
    expect(log.note).toBeUndefined();
    expect(log.scale.domain()).toEqual([1, 1000]);
    expect(log.ticks).toEqual([1, 10, 100, 1000]);
    // Equal steps on the axis are equal ratios in the data.
    const step = (a: number, b: number) => log.scale(a) - log.scale(b);
    expect(step(1, 10)).toBeCloseTo(step(10, 100), 6);

    const fallback = valueAxis([0, 40, 900], [200, 10], { log: true });
    expect(fallback.log).toBe(false);
    expect(fallback.note).toMatch(/log scale needs values above zero/i);
    expect(fallback.scale.domain()).toEqual(valueScale([0, 40, 900], [200, 10]).domain());
    expect(valueAxis([-5, 5], [200, 10], { log: true }).log).toBe(false);
  });
});

describe('boundX', () => {
  it('applies numeric bounds and reports clipped values', () => {
    let domain = [0, 10];
    const scale = {
      domain(next?: number[]) {
        if (next) domain = next;
        return domain;
      },
    } as { domain(): number[]; domain(d: number[]): unknown };
    expect(boundX(scale, [0, 5, 10], undefined, undefined)).toBe(false);
    expect(domain).toEqual([0, 10]);
    expect(boundX(scale, [0, 5, 10], 2, undefined)).toBe(true);
    expect(domain).toEqual([2, 10]);
    expect(boundX(scale, [3, 5], 9, 1)).toBe(false);
    expect(domain).toEqual([2, 10]);
  });
});
