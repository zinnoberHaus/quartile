import { quartileSchema, SPEC_COMPONENTS } from './schema';
import { validateFormat, validateSpec } from './validate';

const line = { component: 'LineChart', data: 'daily', x: 'date', y: 'revenue' };

function messages(spec: unknown) {
  return validateSpec(spec).errors.map((e) => `${e.path} ${e.message}`);
}

describe('quartileSchema', () => {
  it('is a 2020-12 document with a def per component, Spec and Dashboard', () => {
    expect(quartileSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    for (const name of SPEC_COMPONENTS) {
      const def = quartileSchema.$defs[name] as Record<string, unknown>;
      expect(def.additionalProperties).toBe(false);
      expect((def.properties as Record<string, { const?: string }>).component.const).toBe(name);
    }
    expect(quartileSchema.$defs.Spec).toBeDefined();
    expect(quartileSchema.$defs.Dashboard).toBeDefined();
    expect(quartileSchema.oneOf).toHaveLength(2);
  });

  it('serializes to JSON without loss', () => {
    expect(JSON.parse(JSON.stringify(quartileSchema))).toEqual(quartileSchema);
  });

  it('only references defs that exist', () => {
    const refs = JSON.stringify(quartileSchema).match(/#\/\$defs\/[A-Za-z]+/g) ?? [];
    for (const r of refs) expect(quartileSchema.$defs[r.slice('#/$defs/'.length)]).toBeDefined();
  });
});

describe('validateSpec', () => {
  it('exposes the same validation for standalone format editors', () => {
    expect(
      validateFormat({ type: 'number', notation: 'engineering', maximumSignificantDigits: 4 }),
    ).toEqual({ valid: true, errors: [] });
    expect(validateFormat({ type: 'date', timeZone: 'Mars/Olympus' }).errors[0].path).toBe(
      '/timeZone',
    );
    expect(
      validateFormat({ type: 'number', minimumFractionDigits: 5, maximumFractionDigits: 2 })
        .errors[0].path,
    ).toBe('');
    expect(validateFormat(() => 'custom').valid).toBe(false);
  });
  it('accepts serializable formats at component, field and column boundaries', () => {
    const formats = [
      'scientific',
      'engineering',
      'bytes',
      'bytes-binary',
      'duration',
      { style: 'currency', currency: 'JPY' },
      {
        type: 'number',
        style: 'currency',
        locale: 'fr-FR',
        currency: 'EUR',
        currencySign: 'accounting',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        missing: 'Unavailable',
        prefix: '≈ ',
        suffix: ' net',
        scale: 0.001,
      },
      { type: 'number', style: 'currency' },
      { type: 'number', notation: 'engineering', maximumSignificantDigits: 4 },
      { type: 'number', style: 'unit', unit: 'meter-per-second' },
      {
        type: 'number',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        roundingIncrement: 5,
        roundingMode: 'halfEven',
      },
      {
        type: 'date',
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/New_York',
        locale: 'en-GB',
      },
      { type: 'bytes', base: 1024, maximumFractionDigits: 1 },
      { type: 'duration', unit: 'second', maximumFractionDigits: 3 },
    ];
    for (const format of formats) {
      expect(validateSpec({ ...line, format }).errors).toEqual([]);
      expect(
        validateSpec({
          ...line,
          y: {
            field: 'revenue',
            format,
            axisFormat: format,
            tooltipFormat: format,
            description: 'Net revenue',
            currency: 'EUR',
            unit: 'EUR',
            timeZone: 'UTC',
          },
        }).errors,
      ).toEqual([]);
      expect(
        validateSpec({
          component: 'DataTable',
          data: 'daily',
          columns: [{ field: 'revenue', format, description: 'Net revenue after refunds' }],
        }).errors,
      ).toEqual([]);
    }
    expect(validateSpec({ ...line, tooltipNote: 'Provisional observations' }).valid).toBe(true);
    expect(
      validateSpec({ component: 'Sparkline', data: 'daily', y: 'revenue', tooltipNote: 'Unused' })
        .valid,
    ).toBe(false);
  });

  it('rejects invalid format shapes with precise paths', () => {
    const cases: [unknown, string][] = [
      [{ type: 'number', scale: Infinity }, '/format/scale'],
      [{ type: 'number', scale: '100' }, '/format/scale'],
      [{ type: 'number', notation: 'exponential' }, '/format/notation'],
      [{ type: 'number', precision: 3 }, '/format/precision'],
      [{ type: 'number', roundingIncrement: 3 }, '/format/roundingIncrement'],
      [{ type: 'bytes', base: 2 }, '/format/base'],
      [{ type: 'bytes', maximumFractionDigits: 21 }, '/format/maximumFractionDigits'],
      [{ type: 'duration', unit: 'hour' }, '/format/unit'],
      [{ type: 'duration', maximumFractionDigits: -1 }, '/format/maximumFractionDigits'],
      [{ type: 'duration', maximumFractionDigits: 1.5 }, '/format/maximumFractionDigits'],
      [{ type: 'date', hour12: 'yes' }, '/format/hour12'],
      [{ type: 'date', fractionalSecondDigits: 4 }, '/format/fractionalSecondDigits'],
      [{ type: 'number', style: 1n }, '/format/style'],
    ];
    for (const [format, path] of cases) {
      const result = validateSpec({ ...line, format });
      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.path === path)).toBe(true);
    }
    expect(validateSpec({ ...line, format: () => 'callback' }).valid).toBe(false);
  });

  it('validates Intl constructor constraints before a spec can render', () => {
    const formats = [
      { style: 'currency', currency: 'US dollars' },
      { minimumFractionDigits: 4, maximumFractionDigits: 2 },
      { type: 'number', minimumSignificantDigits: 5, maximumSignificantDigits: 3 },
      { type: 'number', style: 'unit', unit: 'bananas' },
      { type: 'number', style: 'unit' },
      { type: 'number', locale: 'not_a_locale' },
      { type: 'number', roundingIncrement: 5, maximumSignificantDigits: 3 },
      { type: 'date', timeZone: 'Mars/Olympus' },
      { type: 'date', dateStyle: 'long', year: 'numeric' },
      { type: 'date', locale: 'not_a_locale' },
      { type: 'bytes', locale: 'not_a_locale' },
      { type: 'duration', locale: 'not_a_locale' },
    ];
    for (const format of formats) {
      const result = validateSpec({ layout: [{ ...line, format }] });
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toMatch(/^\/layout\/0\/format/);
    }
    const field = validateSpec({ ...line, x: { field: 'date', timeZone: 'Mars/Olympus' } });
    expect(field.errors[0].path).toBe('/x/timeZone');
  });

  it('accepts a minimal component spec', () => {
    expect(validateSpec(line)).toEqual({ valid: true, errors: [] });
  });

  it('accepts encoding objects, arrays of fields and enums', () => {
    expect(
      validateSpec({
        ...line,
        x: { field: 'date', type: 'temporal', format: 'date-short' },
        y: { field: 'revenue', aggregate: 'sum', label: 'Revenue' },
        curve: 'step',
        points: 'hover',
        brush: true,
        height: 220,
      }).valid,
    ).toBe(true);
    expect(validateSpec({ ...line, y: ['revenue', 'previous'] }).valid).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(messages(null)).toEqual([
      ' Expected a component spec or a dashboard object, got a null.',
    ]);
    expect(messages([line])).toEqual([
      ' Expected a component spec or a dashboard object, got an array.',
    ]);
  });

  it('reports a missing component', () => {
    expect(messages({ data: 'daily' })).toEqual([' Missing required property "component".']);
  });

  it('reports an unknown component with the valid names', () => {
    const errors = validateSpec({ component: 'PieChart', data: 'x' }).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('/component');
    expect(errors[0].message).toMatch(/^Unknown component "PieChart"\. Expected one of LineChart/);
  });

  it('reports missing required fields per component', () => {
    expect(messages({ component: 'LineChart', data: 'daily', x: 'date' })).toEqual([
      ' Missing required property "y" for LineChart.',
    ]);
    expect(messages({ component: 'KPI', data: 'orders' })).toEqual([
      ' Missing required property "label" for KPI.',
      ' Missing required property "value" for KPI.',
    ]);
  });

  it('reports unknown props', () => {
    expect(messages({ ...line, colour: 'region' })).toEqual([
      '/colour Unknown property "colour" for LineChart.',
    ]);
  });

  it('reports wrong types', () => {
    expect(messages({ ...line, brush: 'yes' })).toEqual([
      '/brush Expected a boolean, got a string.',
    ]);
    expect(messages({ ...line, height: '240' })).toEqual([
      '/height Expected a number, got a string.',
    ]);
    expect(messages({ ...line, x: 3 })).toEqual([
      '/x Expected a string or an object, got an integer.',
    ]);
    expect(messages({ ...line, data: 42 })).toEqual(['/data Expected a string, got an integer.']);
  });

  it('reports enum mismatches', () => {
    expect(messages({ ...line, curve: 'bezier' })).toEqual([
      '/curve Expected one of "linear", "monotone", "step"; got "bezier".',
    ]);
    expect(messages({ ...line, y: { field: 'revenue', aggregate: 'avg' } })).toEqual([
      '/y/aggregate Expected one of "sum", "count", "mean"; got "avg".',
    ]);
  });

  it('validates inside encoding objects', () => {
    expect(messages({ ...line, x: { type: 'temporal' } })).toEqual([
      '/x Missing required property "field".',
    ]);
    expect(messages({ ...line, x: { field: 'date', scale: 'log' } })).toEqual([
      '/x/scale Unknown property "scale".',
    ]);
    expect(messages({ ...line, x: '' })).toEqual(['/x Expected a non-empty string.']);
  });

  it('checks numeric ranges and integers', () => {
    expect(messages({ ...line, height: 10 })).toEqual(['/height Expected a value ≥ 40, got 10.']);
    expect(messages({ ...line, span: 13 })).toEqual(['/span Expected a value ≤ 12, got 13.']);
    expect(messages({ component: 'BarList', data: 'o', category: 'c', limit: 2.5 })).toEqual([
      '/limit Expected an integer, got a number.',
    ]);
  });

  it('rejects nonfinite numbers that cannot be represented in JSON', () => {
    for (const height of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(messages({ ...line, height })).toEqual(['/height Expected a finite number.']);
    }
  });

  it('validates only own schema properties and requires own values', () => {
    expect(messages({ ...line, toString: 'bad' })).toEqual([
      '/toString Unknown property "toString" for LineChart.',
    ]);
    expect(
      messages(
        JSON.parse(
          '{"component":"LineChart","data":"daily","x":"date","y":"amount","__proto__":{}}',
        ),
      ),
    ).toEqual(['/__proto__ Unknown property "__proto__" for LineChart.']);
    const inherited = Object.assign(Object.create({ y: 'amount' }), {
      component: 'LineChart',
      data: 'daily',
      x: 'date',
    });
    expect(messages(inherited)).toEqual([' Missing required property "y" for LineChart.']);
  });

  it('validates nested objects: KPI target and DataTable columns', () => {
    expect(
      validateSpec({
        component: 'KPI',
        data: 'orders',
        label: 'Revenue',
        value: { field: 'amount', aggregate: 'sum' },
        target: { value: 500000, expected: 0.9 },
      }).valid,
    ).toBe(true);
    expect(
      messages({
        component: 'KPI',
        data: 'orders',
        label: 'Revenue',
        value: 'amount',
        target: { expected: 2 },
      }),
    ).toEqual([
      '/target Missing required property "value".',
      '/target/expected Expected a value ≤ 1, got 2.',
    ]);
    expect(
      messages({
        component: 'DataTable',
        data: 'orders',
        columns: [{ field: 'product' }, { field: 'amount', cell: 'sparkle' }, { label: 'x' }],
      }),
    ).toEqual([
      '/columns/1/cell Expected one of "text", "number", "bar", "sparkline", "delta", "badge", "status"; got "sparkle".',
      '/columns/2 Missing required property "field".',
    ]);
    expect(messages({ component: 'DataTable', data: 'orders', columns: [] })).toEqual([
      '/columns Expected at least 1 item.',
    ]);
  });

  it('validates map-like objects through additionalProperties schemas', () => {
    expect(
      messages({
        component: 'DataTable',
        data: 'orders',
        columns: [{ field: 'status', cell: 'status', tones: { Paid: 'positive', Late: 'red' } }],
      }),
    ).toEqual([
      '/columns/0/tones/Late Expected one of "neutral", "signal", "positive", "warning", "negative"; got "red".',
    ]);
  });

  it('accepts multi-type props', () => {
    const cols = (width: unknown) => ({
      component: 'DataTable',
      data: 'orders',
      columns: [{ field: 'product', width }],
    });
    expect(validateSpec(cols(120)).valid).toBe(true);
    expect(validateSpec(cols('minmax(160px, 2fr)')).valid).toBe(true);
    expect(messages(cols(true))).toEqual([
      '/columns/0/width Expected a number or a string, got a boolean.',
    ]);
  });

  it('checks string patterns', () => {
    expect(
      messages({ component: 'DataTable', data: 'o', columns: [{ field: 'a' }], sort: '--a' }),
    ).toEqual(['/sort "--a" does not match ^-?[^-].*$.']);
  });

  it('lets FilterBar omit data', () => {
    expect(validateSpec({ component: 'FilterBar', fields: [{ field: 'region' }] }).valid).toBe(
      true,
    );
  });

  it('validates dashboards and prefixes item paths', () => {
    expect(
      validateSpec({
        title: 'Orders',
        selection: 'orders',
        layout: [line, { component: 'KPI', data: 'orders', label: 'Orders', value: 'id' }],
      }).valid,
    ).toBe(true);
    expect(
      messages({
        layout: [line, { component: 'LineChart', data: 'daily', x: 'date', y: 'revenue', z: 1 }],
      }),
    ).toEqual(['/layout/1/z Unknown property "z" for LineChart.']);
    expect(messages({ layout: [] })).toEqual(['/layout Expected at least 1 item.']);
    expect(messages({ layout: line })).toEqual(['/layout Expected an array, got an object.']);
    expect(messages({ layout: [line], theme: 'dark' })).toEqual([
      '/theme Unknown property "theme".',
    ]);
    expect(messages({ layout: [line], selection: '1 bad' })).toEqual([
      '/selection "1 bad" does not match ^[A-Za-z][\\w-]*$.',
    ]);
    expect(messages({ layout: ['LineChart'] })).toEqual([
      '/layout/0 Expected an object, got a string.',
    ]);
  });

  it('collects every error in one pass', () => {
    const { valid, errors } = validateSpec({
      component: 'BarChart',
      data: 1,
      x: 'region',
      stack: 'no',
      orientation: 'diagonal',
    });
    expect(valid).toBe(false);
    expect(errors.map((e) => e.path).sort()).toEqual(['', '/data', '/orientation', '/stack']);
  });

  it('escapes JSON Pointer segments', () => {
    expect(messages({ ...line, 'a/b': 1 })[0]).toBe('/a~1b Unknown property "a/b" for LineChart.');
  });
});
