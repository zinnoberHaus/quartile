import { describe, expect, it } from 'vitest';
import { quartileSchema } from './schema';
import { validateSpec } from './validate';

const line = { component: 'LineChart', data: 'd', x: 'date', y: 'users' };
const bar = { component: 'BarChart', data: 'd', x: 'region', y: 'users' };

const ok = (spec: unknown) => expect(validateSpec(spec).errors).toEqual([]);
const errors = (spec: unknown) => validateSpec(spec).errors.map((e) => `${e.path} ${e.message}`);
const props = (name: string) =>
  Object.keys((quartileSchema.$defs[name] as { properties: object }).properties);

describe('presentation settings in the schema', () => {
  it('accepts every setting on a line chart', () => {
    ok({
      ...line,
      margin: { left: 64, top: 8 },
      colors: ['signal', 3, '#2f45e8', '#abc', '#2F45E880'],
      yMin: 0,
      yMax: 100.5,
      xMin: -5,
      xMax: 50,
      yTicks: 6,
      xTicks: 0,
      grid: 'both',
      xAxis: false,
      yAxis: true,
      legend: 'bottom',
      labels: true,
      reference: [{ value: 80, label: 'Target' }, { value: 20 }],
    });
  });

  it('accepts each form of margin, legend, grid and reference', () => {
    for (const margin of [0, 16, [16, 24, 32, 48], { left: 64 }, {}]) ok({ ...line, margin });
    for (const legend of [true, false, 'top', 'bottom', 'left', 'right', 'none']) {
      ok({ ...line, legend });
    }
    for (const grid of [true, false, 'x', 'y', 'both', 'none']) ok({ ...line, grid });
    for (const reference of [1000, { value: 5 }, { value: 5, label: 'Plan' }, [{ value: 1 }]]) {
      ok({ ...bar, reference });
    }
  });

  it('rejects colors that are not tokens and says what is allowed', () => {
    for (const bad of [
      'red',
      'rgb(47, 69, 232)',
      'url(https://example.com/p.svg#a)',
      'var(--x)',
      'var(--q-signal)',
      '#12',
      '#12345g',
      'Signal',
      '',
      'signal; fill: red',
    ]) {
      const found = errors({ ...line, colors: [bad] });
      expect([bad, found.length]).toEqual([bad, 1]);
      expect(found[0]).toContain('/colors/0');
      expect(found[0]).toContain('is not allowed');
      expect(found[0]).toContain('signal, positive, negative, warning, muted');
      expect(found[0]).toContain('hex color such as #2f45e8');
    }
    expect(errors({ ...line, colors: [0] })[0]).toContain('/colors/0 Expected a value ≥ 1');
    expect(errors({ ...line, colors: [9] })[0]).toContain('/colors/0 Expected a value ≤ 8');
    expect(errors({ ...line, colors: [1.5] })[0]).toContain('/colors/0');
    expect(errors({ ...line, colors: 'signal' })[0]).toContain('/colors Expected an array');
    expect(errors({ ...line, colors: [] })[0]).toContain('at least 1 item');
    expect(errors({ ...line, colors: [{ css: 'red' }] })[0]).toContain('/colors/0');
  });

  it('rejects bad margins, ticks, bounds, legends and references', () => {
    expect(errors({ ...line, margin: '16px' })[0]).toContain('/margin');
    expect(errors({ ...line, margin: -4 })[0]).toContain('≥ 0');
    expect(errors({ ...line, margin: 4000 })[0]).toContain('≤ 400');
    expect(errors({ ...line, margin: [16, 24] })[0]).toContain('at least 4 items');
    expect(errors({ ...line, margin: [1, 2, 3, 4, 5] })[0]).toContain('at most 4 items');
    expect(errors({ ...line, margin: { left: '64px' } })[0]).toContain('/margin/left');
    expect(errors({ ...line, margin: { inline: 4 } })[0]).toContain('Unknown property "inline"');
    expect(errors({ ...line, yTicks: -1 })[0]).toContain('/yTicks');
    expect(errors({ ...line, yTicks: 2.5 })[0]).toContain('/yTicks');
    expect(errors({ ...line, xTicks: 500 })[0]).toContain('≤ 20');
    expect(errors({ ...line, yMin: '0' })[0]).toContain('/yMin Expected a number');
    expect(errors({ ...line, grid: 'dotted' })[0]).toContain('/grid');
    expect(errors({ ...line, xAxis: 'no' })[0]).toContain('/xAxis Expected a boolean');
    expect(errors({ ...line, legend: 'center' })[0]).toContain('/legend');
    expect(errors({ ...line, labels: 'yes' })[0]).toContain('/labels Expected a boolean');
    expect(errors({ ...bar, reference: 'high' })[0]).toContain('/reference');
    expect(errors({ ...bar, reference: { label: 'no value' } })[0]).toContain(
      'Missing required property "value"',
    );
    expect(errors({ ...bar, reference: { value: 1, color: 'red' } })[0]).toContain(
      'Unknown property "color"',
    );
    expect(errors({ ...bar, reference: [] })[0]).toContain('at least 1 item');
  });

  it('gives each chart the settings it draws, and no others', () => {
    const plot = ['margin', 'yMin', 'yMax', 'yTicks', 'xTicks', 'grid', 'xAxis', 'yAxis'];
    for (const name of ['LineChart', 'AreaChart', 'ScatterPlot', 'BoxPlot']) {
      expect(props(name)).toEqual(expect.arrayContaining([...plot, 'xMin', 'xMax']));
    }
    expect(props('BarChart')).toEqual(expect.arrayContaining(plot));
    expect(props('BarChart')).not.toContain('xMin');
    for (const name of ['LineChart', 'AreaChart', 'BarChart']) {
      expect(props(name)).toEqual(
        expect.arrayContaining(['colors', 'labels', 'reference', 'legend']),
      );
    }
    expect(props('ScatterPlot')).toEqual(expect.arrayContaining(['colors', 'reference']));
    expect(props('ScatterPlot')).not.toContain('labels');
    expect(props('DonutChart')).toEqual(expect.arrayContaining(['colors', 'labels', 'legend']));
    expect(props('DonutChart')).not.toContain('margin');
    expect(props('Histogram')).toEqual(
      expect.arrayContaining(['color', 'labels', 'reference', 'margin', 'xAxis']),
    );
    expect(props('Histogram')).not.toContain('colors');
    expect(props('BoxPlot')).not.toContain('colors');
    for (const name of ['Sparkline', 'BarList']) {
      expect(props(name)).toContain('color');
      expect(props(name)).not.toContain('colors');
    }
    ok({ component: 'Histogram', data: 'd', x: 'latency', color: 'positive', reference: 50 });
    ok({ component: 'Sparkline', data: 'd', y: 'users', color: '#2f45e8' });
    ok({ component: 'BarList', data: 'd', category: 'region', color: 4 });
    ok({ component: 'DonutChart', data: 'd', category: 'region', colors: [1, 2], legend: 'left' });
    expect(errors({ component: 'Sparkline', data: 'd', y: 'users', color: 'red' })[0]).toContain(
      '/color "red" is not allowed',
    );
    expect(
      errors({ component: 'Funnel', data: 'd', step: 's', value: 'v', colors: [1] })[0],
    ).toContain('Unknown property "colors"');
    // On charts that split series, `color` is still the field.
    ok({ ...line, color: 'plan', colors: ['signal'] });
  });

  it('describes every new property for models', () => {
    for (const name of [
      'LineChart',
      'AreaChart',
      'BarChart',
      'ScatterPlot',
      'Histogram',
      'BoxPlot',
    ]) {
      const defs = (
        quartileSchema.$defs[name] as { properties: Record<string, { description?: string }> }
      ).properties;
      for (const key of [
        'margin',
        'colors',
        'color',
        'yMin',
        'yTicks',
        'grid',
        'xAxis',
        'legend',
        'labels',
        'reference',
      ]) {
        if (key in defs && !(key === 'color' && name !== 'Histogram')) {
          expect([name, key, typeof defs[key].description]).toEqual([name, key, 'string']);
        }
      }
    }
    expect(JSON.parse(JSON.stringify(quartileSchema))).toEqual(quartileSchema);
  });
});
