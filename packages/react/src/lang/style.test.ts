import { describe, expect, it } from 'vitest';
import type { ComponentSpec, DashboardSpec } from '../spec/schema';
import { compileBlock } from './compile';

const ROWS = `---
month,plan,users
2026-01,Team,120
2026-02,Team,180
2026-01,Pro,90
2026-02,Pro,95
`;
const REGIONS = `---
region,users
EMEA,120
APAC,90
`;

function compile(source: string, options?: Parameters<typeof compileBlock>[1]) {
  const compiled = compileBlock(source, options);
  return {
    spec: compiled.spec as ComponentSpec,
    errors: compiled.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
    warnings: compiled.diagnostics.filter((d) => d.severity === 'warning'),
    notes: compiled.diagnostics.filter((d) => d.severity === 'info').map((d) => d.message),
  };
}
const line = (settings: string, options?: Parameters<typeof compileBlock>[1]) =>
  compile(`line users by month and plan\n${settings}\n${ROWS}`, options);
const bar = (settings: string, options?: Parameters<typeof compileBlock>[1]) =>
  compile(`bar users by region\n${settings}\n${REGIONS}`, options);

describe('margin', () => {
  it('reads one, two, three or four numbers in CSS order', () => {
    expect(line('margin: 16').spec.margin).toBe(16);
    expect(line('margin: 16 24').spec.margin).toEqual([16, 24, 16, 24]);
    expect(line('margin: 8 24 32').spec.margin).toEqual([8, 24, 32, 24]);
    expect(line('margin: 16 24 32 48').spec.margin).toEqual([16, 24, 32, 48]);
    expect(line('margin: 16px, 24px, 32px, 48px').spec.margin).toEqual([16, 24, 32, 48]);
    expect(line('margin: [16, 24, 32, 48]').spec.margin).toEqual([16, 24, 32, 48]);
  });

  it('reads named sides, alone or over a shorthand', () => {
    expect(line('margin.left: 64').spec.margin).toEqual({ left: 64 });
    expect(line('margin left: 64\nmargin-top: 4').spec.margin).toEqual({ left: 64, top: 4 });
    expect(line('margin: 16 24\nmargin.left: 64').spec.margin).toEqual({
      top: 16,
      right: 24,
      bottom: 16,
      left: 64,
    });
    expect(line('margin: {"left": 64, "right": 8}').spec.margin).toEqual({ left: 64, right: 8 });
  });

  it('ignores a margin it cannot read and caps a huge one, with a warning each', () => {
    const bad = line('margin: 1em auto');
    expect(bad.spec.margin).toBeUndefined();
    expect(bad.errors).toEqual([]);
    expect(bad.warnings[0].message).toContain('Could not read the margin');
    expect(bad.warnings[0].hint).toContain('margin.left: 64');
    expect(bad.warnings[0].line).toBe(2);
    const huge = line('margin.left: 5000');
    expect(huge.spec.margin).toEqual({ left: 400 });
    expect(huge.warnings[0].message).toContain('at most 400px');
    expect(line('margin: calc(100% - 4px)').spec.margin).toBeUndefined();
  });
});

describe('colors', () => {
  it('reads palette names, categorical indexes and hex colors', () => {
    const { spec, warnings } = line('colors: Signal, 3, #F26B3A, #abc, #2f45e880');
    expect(spec.colors).toEqual(['signal', 3, '#f26b3a', '#abc', '#2f45e880']);
    expect(warnings).toEqual([]);
    expect(line('colours: [positive, negative]').spec.colors).toEqual(['positive', 'negative']);
    expect(line('palette: ["warning", "#111111"]').spec.colors).toEqual(['warning', '#111111']);
  });

  it('drops anything else with a warning that says what is allowed', () => {
    const { spec, warnings, errors } = line(
      'colors: signal, red, rgb(47, 69, 232), url(https://example.com/p.svg#a), var(--x), #12',
    );
    expect(spec.colors).toEqual(['signal']);
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.message)).toEqual([
      '“red” is not a color a block can set; it was ignored.',
      '“rgb(47, 69, 232)” is not a color a block can set; it was ignored.',
      '“url(https://example.com/p.svg#a)” is not a color a block can set; it was ignored.',
      '“var(--x)” is not a color a block can set; it was ignored.',
      '“#12” is not a color a block can set; it was ignored.',
    ]);
    for (const w of warnings) {
      expect(w.hint).toContain('signal, positive, negative, warning, muted');
      expect(w.hint).toContain('1 to 8');
      expect(w.hint).toContain('#2f45e8');
      expect(w.line).toBe(2);
    }
    // Nothing valid: the setting is left out and the chart keeps its palette.
    const none = line('colors: tomato; background: url(x)');
    expect(none.spec.colors).toBeUndefined();
    expect(JSON.stringify(none.spec)).not.toContain('url');
  });

  it('reads “color” as colors when its value can only be a color', () => {
    const hex = bar('color: #2f45e8');
    expect(hex.spec.colors).toEqual(['#2f45e8']);
    expect(hex.spec.group).toBeUndefined();
    expect(hex.notes.join(' ')).toContain('Read “color: #2f45e8” as the chart’s colors');

    const several = line('color: signal, 2');
    expect(several.spec.colors).toEqual(['signal', 2]);
    // The sentence's series field is untouched.
    expect(several.spec.color).toBe('plan');

    // A CSS color a block may not carry is refused, not looked up as a column.
    const css = bar('color: red');
    expect(css.errors).toEqual([]);
    expect(css.spec.colors).toBeUndefined();
    expect(css.warnings[0].message).toContain('“red” is not a color a block can set');
  });

  it('keeps “color” as the series field when the value is a column', () => {
    const field = compile(`line users by month\ncolor: plan\n${ROWS}`);
    expect(field.spec.color).toBe('plan');
    expect(field.spec.colors).toBeUndefined();

    // A column named like a palette color is still a column.
    const named = compile(
      'line users by month\ncolor: signal\n---\nmonth,signal,users\n2026-01,a,1\n2026-02,b,2\n',
    );
    expect(named.spec.color).toBe('signal');
    expect(named.spec.colors).toBeUndefined();
    expect(compile(`bar users by month\ncolor: plan\n${ROWS}`).spec.group).toBe('plan');

    // An unknown name that is not a color stays an error that lists the columns.
    expect(compile(`line users by month\ncolor: plam_x\n${ROWS}`).errors[0]).toContain(
      'There is no column “plam_x”',
    );
  });

  it('sets the single color of a histogram, sparkline or bar list', () => {
    const data = '---\nlatency,service\n10,web\n30,api\n45,web\n';
    expect(compile(`histogram latency\ncolor: positive\n${data}`).spec.color).toBe('positive');
    expect(compile(`barlist latency by service\ncolor: #2f45e8\n${data}`).spec.color).toBe(
      '#2f45e8',
    );
    expect(compile(`sparkline latency\ncolor: 4\n${data}`).spec.color).toBe(4);
    const many = compile(`histogram latency\ncolors: negative, signal\n${data}`);
    expect(many.spec.color).toBe('negative');
    expect(many.notes.join(' ')).toContain('has one color');
    const bad = compile(`histogram latency\ncolor: hotpink\n${data}`);
    expect(bad.spec.color).toBeUndefined();
    expect(bad.warnings[0].hint).toContain('hex color');
    expect(
      compile(`donut latency by service\ncolor: #111111, #222222\n${data}`).spec.colors,
    ).toEqual(['#111111', '#222222']);
  });

  it('says so on a chart without color settings', () => {
    const funnel = compile('funnel users by step\ncolors: signal\n---\nstep,users\nA,3\nB,2\n');
    expect(funnel.spec.colors).toBeUndefined();
    expect(funnel.warnings[0].message).toContain('is not a funnel setting');
  });
});

describe('blockColors: false', () => {
  it('drops block colors with a note and keeps everything else', () => {
    const strict = line('colors: signal, #f26b3a\nlegend: bottom', { blockColors: false });
    expect(strict.spec.colors).toBeUndefined();
    expect(strict.spec.legend).toBe('bottom');
    expect(strict.warnings).toEqual([]);
    expect(strict.notes).toContain(
      'This page keeps its own chart colors, so “colors” was ignored.',
    );
    expect(bar('color: #2f45e8', { blockColors: false }).spec.colors).toBeUndefined();
    expect(
      compile('histogram users\ncolor: signal\n---\nusers\n1\n2\n', { blockColors: false }).spec
        .color,
    ).toBeUndefined();
    // The series field is not a color setting.
    expect(
      compile(`line users by month\ncolor: plan\n${ROWS}`, { blockColors: false }).spec.color,
    ).toBe('plan');
    expect(line('colors: signal').spec.colors).toEqual(['signal']);
    expect(line('colors: signal', { blockColors: true }).spec.colors).toEqual(['signal']);
  });

  it('applies to JSON specs in a block', () => {
    const json = JSON.stringify({
      component: 'BarChart',
      x: 'region',
      y: 'users',
      colors: ['signal'],
      data: [{ region: 'EMEA', users: 1 }],
    });
    expect(compile(json).spec.colors).toEqual(['signal']);
    const strict = compile(json, { blockColors: false });
    expect(strict.spec.colors).toBeUndefined();
    expect(strict.errors).toEqual([]);
    expect(strict.notes.join(' ')).toContain('keeps its own chart colors');
  });
});

describe('axes', () => {
  it('reads bounds with dots or as one word, in the number forms data uses', () => {
    const { spec } = line('y.min: 100\ny.max: 1.2K\nx.min: 0\nxmax: 10');
    expect([spec.yMin, spec.yMax, spec.xMin, spec.xMax]).toEqual([100, 1200, 0, 10]);
    expect(line('ymin: 50').spec.yMin).toBe(50);
    expect(line('Y Max: 1,000,000').spec.yMax).toBe(1000000);
    // Percent columns hold ratios, so 85% is 0.85.
    expect(line('y.max: 85%').spec.yMax).toBe(0.85);
    const bad = line('y.min: lots');
    expect(bad.spec.yMin).toBeUndefined();
    expect(bad.warnings[0].message).toBe('Expected a number, got “lots”.');
  });

  it('reads tick counts and gridlines', () => {
    const { spec } = line('y.ticks: 6\nx.ticks: 3');
    expect([spec.yTicks, spec.xTicks]).toEqual([6, 3]);
    expect(line('yticks: 2\nxTicks: 0').spec).toMatchObject({ yTicks: 2, xTicks: 0 });
    expect(line('ticks: 8').spec.yTicks).toBe(8);
    expect(line('gridlines: no').spec.grid).toBe(false);
    expect(line('grid lines: none').spec.grid).toBe('none');
    expect(line('grid: both').spec.grid).toBe('both');
    expect(line('grid: vertical').spec.grid).toBe('x');
    expect(line('grid: yes').spec.grid).toBe(true);
    const bad = line('grid: dotted');
    expect(bad.spec.grid).toBeUndefined();
    expect(bad.warnings[0].message).toContain('is not one of');
  });

  it('hides an axis in several spellings', () => {
    expect(line('y axis: no').spec.yAxis).toBe(false);
    expect(line('x-axis: off').spec.xAxis).toBe(false);
    expect(line('yAxis: false').spec.yAxis).toBe(false);
    expect(line('y.hide: yes').spec.yAxis).toBe(false);
    expect(line('x.hide: no').spec.xAxis).toBe(true);
    expect(line('y.axis: hidden').spec.yAxis).toBe(false);
    expect(line('axes: no').spec).toMatchObject({ xAxis: false, yAxis: false });
  });

  it('still reads “x axis” and “y axis” as fields when they name columns', () => {
    const { spec, errors } = compile(
      'type: line\nx axis: step\ny axis: loss\n---\nstep,loss\n1,9\n2,5\n',
    );
    expect(errors).toEqual([]);
    expect([spec.x, spec.y]).toEqual(['step', 'loss']);
    expect(spec.xAxis).toBeUndefined();
    // A column called "no" is a column.
    expect(compile('type: line\nx axis: step\ny axis: no\n---\nstep,no\n1,9\n2,5\n').spec.y).toBe(
      'no',
    );
  });

  it('refuses a raised baseline on bars and stacked areas, and honors it on lines', () => {
    const cut = bar('y.min: 50');
    expect(cut.spec.yMin).toBeUndefined();
    expect(cut.errors).toEqual([]);
    expect(cut.warnings[0].message).toBe(
      'Bars are measured from zero, so the axis minimum 50 was ignored: a cut axis would overstate the differences.',
    );
    expect(cut.warnings[0].hint).toBe('Use a line chart to zoom in on a range.');
    expect(cut.warnings[0].line).toBe(2);
    // Room below zero is fine.
    expect(bar('y.min: -20\ny.max: 500').spec).toMatchObject({ yMin: -20, yMax: 500 });

    const stacked = compile(`area users by month and plan stacked\ny.min: 50\n${ROWS}`);
    expect(stacked.spec.yMin).toBeUndefined();
    expect(stacked.warnings[0].message).toContain('Stacked areas are measured from zero');
    expect(compile(`area users by month and plan\ny.min: 50\n${ROWS}`).spec.yMin).toBe(50);
    expect(line('y.min: 50').spec.yMin).toBe(50);
    expect(compile('scatter a vs b\ny.min: 5\n---\na,b\n9,1\n8,2\n').spec.yMin).toBe(5);
  });
});

describe('legend and labels', () => {
  it('keeps the boolean and adds positions', () => {
    expect(line('legend: no').spec.legend).toBe(false);
    expect(line('legend: yes').spec.legend).toBe(true);
    for (const side of ['top', 'bottom', 'left', 'right', 'none']) {
      expect(line(`legend: ${side}`).spec.legend).toBe(side);
    }
    expect(line('Legend: Bottom').spec.legend).toBe('bottom');
    expect(line('legend.position: right').spec.legend).toBe('right');
    expect(line('legend position: below').spec.legend).toBe('bottom');
    const bad = line('legend: diagonal');
    expect(bad.spec.legend).toBeUndefined();
    expect(bad.warnings[0].message).toContain('is not one of');
    expect(
      compile('donut users by region\nlegend: left\n---\nregion,users\nA,1\nB,2\n').spec.legend,
    ).toBe('left');
  });

  it('turns value labels on and off', () => {
    expect(line('labels: yes').spec.labels).toBe(true);
    expect(bar('labels: no').spec.labels).toBe(false);
    expect(bar('data labels: on').spec.labels).toBe(true);
    expect(bar('show values: true').spec.labels).toBe(true);
  });
});

describe('reference', () => {
  it('reads a value, a label and a JSON list', () => {
    expect(bar('reference: 1000000').spec.reference).toBe(1000000);
    expect(bar('reference: 1,000,000\nreference.label: Target').spec.reference).toEqual({
      value: 1000000,
      label: 'Target',
    });
    expect(bar('reference label: "Q3 plan"\nreference: 1.5M').spec.reference).toEqual({
      value: 1500000,
      label: 'Q3 plan',
    });
    expect(
      bar('reference: [{"value": 100, "label": "Floor"}, {"value": 200}]').spec.reference,
    ).toEqual([{ value: 100, label: 'Floor' }, { value: 200 }]);
    expect(bar('reference: {"value": 150}\nreference.label: Plan').spec.reference).toEqual({
      value: 150,
      label: 'Plan',
    });
    expect(bar('target: 140').spec.reference).toBe(140);
    expect(bar('reference line: 140').spec.reference).toBe(140);
  });

  it('keeps the label as text and reports what it cannot read', () => {
    const html = bar('reference: 100\nreference.label: <b onclick=x>Target</b>');
    expect(html.spec.reference).toEqual({ value: 100, label: '<b onclick=x>Target</b>' });
    const bad = bar('reference: soon');
    expect(bad.spec.reference).toBeUndefined();
    expect(bad.warnings[0].message).toContain('A reference line needs a number');
    const alone = bar('reference.label: Target');
    expect(alone.spec.reference).toBeUndefined();
    expect(alone.warnings[0].message).toBe('A reference label needs a value; it was ignored.');
    // A malformed list is rejected by the schema, with the line of the setting.
    const wrong = compileBlock(`bar users by region\nreference: [{"label": "x"}]\n${REGIONS}`);
    expect(wrong.spec).toBeUndefined();
    expect(wrong.diagnostics.find((d) => d.severity === 'error')?.line).toBe(2);
  });

  it('leaves a column called “reference” and a KPI target alone', () => {
    const column = compile(
      'bar users by reference\nreference.label: Source\n---\nreference,users\na,1\nb,2\n',
    );
    expect(column.spec.reference).toBeUndefined();
    expect(column.warnings).toEqual([]);
    const kpi = compile('kpi sum(users)\ntarget: 500\ntarget.label: Goal\n---\nusers\n120\n90\n');
    expect(kpi.spec.target).toEqual({ value: 500, label: 'Goal' });
    expect(kpi.spec.reference).toBeUndefined();
  });
});

describe('presentation settings in dashboards and JSON', () => {
  it('applies per view in a dashboard', () => {
    const compiled = compileBlock(
      `dashboard Users\nline users by month and plan\ncolors: signal, muted\ny.min: 50\nbar users by plan\nreference: 200\nlabels: yes\n${ROWS}`,
    );
    const [first, second] = (compiled.spec as DashboardSpec).layout;
    expect(first).toMatchObject({ component: 'LineChart', colors: ['signal', 'muted'], yMin: 50 });
    expect(second).toMatchObject({ component: 'BarChart', reference: 200, labels: true });
    expect(second.colors).toBeUndefined();
  });

  it('drops refused colors from a JSON spec instead of failing the chart', () => {
    const { spec, warnings, errors } = compile(
      JSON.stringify({
        component: 'LineChart',
        x: 'month',
        y: 'users',
        colors: ['signal', 'red', 'url(https://example.com/x)'],
        yMin: 10,
        margin: { left: 64 },
        reference: [{ value: 5, label: 'Floor' }],
        data: [{ month: '2026-01', users: 1 }],
      }),
    );
    expect(errors).toEqual([]);
    expect(spec.colors).toEqual(['signal']);
    expect(spec).toMatchObject({ yMin: 10, margin: { left: 64 } });
    expect(warnings.map((w) => w.message)).toEqual([
      '“red” is not a color a spec can set; it was ignored.',
      '“url(https://example.com/x)” is not a color a spec can set; it was ignored.',
    ]);
    const cut = compile(
      JSON.stringify({
        component: 'BarChart',
        x: 'region',
        y: 'users',
        yMin: 50,
        data: [{ region: 'EMEA', users: 100 }],
      }),
    );
    expect(cut.spec.yMin).toBeUndefined();
    expect(cut.warnings[0].message).toContain('Bars are measured from zero');
  });
});
