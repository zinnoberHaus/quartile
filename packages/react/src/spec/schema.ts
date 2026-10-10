/**
 * The JSON Schema (draft 2020-12) for every component a model may generate. A spec names a
 * component, a dataset and fields; SpecView validates it against this schema and renders it.
 */
import type { SerializableFormatter } from '../data/types';

type JsonSchema = Record<string, unknown>;

const FORMATS = [
  'text',
  'number',
  'integer',
  'compact',
  'scientific',
  'engineering',
  'bytes',
  'bytes-binary',
  'duration',
  'currency',
  'currency-compact',
  'percent',
  'pt',
  'date',
  'date-short',
  'month',
  'weekday',
  'datetime',
  'time',
] as const;

const ref = (name: string): JsonSchema => ({ $ref: `#/$defs/${name}` });
const str = (description: string): JsonSchema => ({ type: 'string', description });
const bool = (description: string): JsonSchema => ({ type: 'boolean', description });
const int = (description: string, minimum = 1, maximum?: number): JsonSchema => ({
  type: 'integer',
  minimum,
  ...(maximum != null ? { maximum } : {}),
  description,
});
const oneOfEnum = (values: readonly (string | number | boolean)[], description: string) => ({
  enum: [...values],
  description,
});
const field = (description: string): JsonSchema => ({ ...ref('Field'), description });
const fieldRef = (description: string): JsonSchema => ({ ...ref('FieldRef'), description });
const measure = (description: string): JsonSchema => ({ ...ref('Measure'), description });
const format = (description: string): JsonSchema => ({ ...ref('Format'), description });
const measures = (description: string): JsonSchema => ({
  description,
  oneOf: [ref('Measure'), { type: 'array', items: ref('Field'), minItems: 1 }],
});

const LOCALE = { type: 'string', minLength: 1, description: 'BCP 47 locale identifier.' };
const TIME_ZONE = {
  type: 'string',
  minLength: 1,
  description: 'Intl time zone identifier. Changes display, not data bucketing.',
  'x-quartile-time-zone': true,
};
const CURRENCY = {
  type: 'string',
  pattern: '^[A-Za-z]{3}$',
  description: 'Three-letter currency code, e.g. USD or JPY.',
};
const NUMBER_OPTIONS = {
  localeMatcher: oneOfEnum(['lookup', 'best fit'], 'Locale matching algorithm.'),
  numberingSystem: str('Unicode numbering system identifier.'),
  style: oneOfEnum(['decimal', 'currency', 'percent', 'unit'], 'Numeric display style.'),
  currency: CURRENCY,
  currencyDisplay: oneOfEnum(['symbol', 'narrowSymbol', 'code', 'name'], 'Currency label.'),
  currencySign: oneOfEnum(['standard', 'accounting'], 'Negative currency convention.'),
  unit: str('Intl sanctioned unit, optionally compounded with -per-.'),
  unitDisplay: oneOfEnum(['short', 'narrow', 'long'], 'Unit label length.'),
  notation: oneOfEnum(['standard', 'scientific', 'engineering', 'compact'], 'Numeric notation.'),
  compactDisplay: oneOfEnum(['short', 'long'], 'Compact suffix length.'),
  useGrouping: oneOfEnum([true, false, 'auto', 'always', 'min2'], 'Digit grouping.'),
  signDisplay: oneOfEnum(['auto', 'always', 'exceptZero', 'negative', 'never'], 'Sign policy.'),
  minimumIntegerDigits: int('Minimum integer digits.', 1, 21),
  minimumFractionDigits: int('Minimum fractional places.', 0, 100),
  maximumFractionDigits: int('Maximum fractional places.', 0, 100),
  minimumSignificantDigits: int('Minimum significant digits.', 1, 21),
  maximumSignificantDigits: int('Maximum significant digits.', 1, 21),
  roundingPriority: oneOfEnum(['auto', 'morePrecision', 'lessPrecision'], 'Precision precedence.'),
  roundingIncrement: oneOfEnum(
    [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000],
    'Rounding increment. Subject to Intl precision constraints.',
  ),
  roundingMode: oneOfEnum(
    [
      'ceil',
      'floor',
      'expand',
      'trunc',
      'halfCeil',
      'halfFloor',
      'halfExpand',
      'halfTrunc',
      'halfEven',
    ],
    'Rounding rule.',
  ),
  trailingZeroDisplay: oneOfEnum(['auto', 'stripIfInteger'], 'Trailing fractional zeros.'),
};
const DATE_OPTIONS = {
  localeMatcher: oneOfEnum(['lookup', 'best fit'], 'Locale matching algorithm.'),
  calendar: str('Unicode calendar identifier.'),
  numberingSystem: str('Unicode numbering system identifier.'),
  timeZone: TIME_ZONE,
  hour12: bool('Use a 12-hour clock.'),
  hourCycle: oneOfEnum(['h11', 'h12', 'h23', 'h24'], 'Hour cycle.'),
  formatMatcher: oneOfEnum(['basic', 'best fit'], 'Date component matching algorithm.'),
  dateStyle: oneOfEnum(
    ['full', 'long', 'medium', 'short'],
    'Date style; excludes component options.',
  ),
  timeStyle: oneOfEnum(
    ['full', 'long', 'medium', 'short'],
    'Time style; excludes component options.',
  ),
  weekday: oneOfEnum(['long', 'short', 'narrow'], 'Weekday label.'),
  era: oneOfEnum(['long', 'short', 'narrow'], 'Era label.'),
  year: oneOfEnum(['numeric', '2-digit'], 'Year label.'),
  month: oneOfEnum(['numeric', '2-digit', 'long', 'short', 'narrow'], 'Month label.'),
  day: oneOfEnum(['numeric', '2-digit'], 'Day label.'),
  dayPeriod: oneOfEnum(['long', 'short', 'narrow'], 'Day-period label.'),
  hour: oneOfEnum(['numeric', '2-digit'], 'Hour label.'),
  minute: oneOfEnum(['numeric', '2-digit'], 'Minute label.'),
  second: oneOfEnum(['numeric', '2-digit'], 'Second label.'),
  fractionalSecondDigits: int('Fractional second places.', 1, 3),
  timeZoneName: oneOfEnum(
    ['long', 'short', 'shortOffset', 'longOffset', 'shortGeneric', 'longGeneric'],
    'Time-zone label.',
  ),
};
const FORMAT_META = {
  locale: LOCALE,
  missing: str('Text for missing or invalid values; defaults to an em dash.'),
};

function formatObject(
  kind: 'number' | 'date' | 'bytes' | 'duration' | 'bare-number',
  properties: Record<string, JsonSchema>,
): JsonSchema {
  return {
    type: 'object',
    properties: kind === 'bare-number' ? properties : { type: { const: kind }, ...properties },
    ...(kind === 'bare-number' ? {} : { required: ['type'] }),
    additionalProperties: false,
    'x-quartile-format': kind,
  };
}

const META = {
  title: str('Card title. Charts render it above the plot and use it as their accessible name.'),
  description: str('One line under the title.'),
  span: int('Columns this item spans in a Dashboard layout (12-column grid).', 1, 12),
};
const DATA = { data: str('Name of a dataset passed to SpecView in `data`.') };
const CHART = {
  height: { type: 'number', minimum: 40, maximum: 2000, description: 'Plot height in px.' },
};
const SORT = oneOfEnum(['desc', 'asc', 'none'], 'Ranking order.');
const CURVE = oneOfEnum(['linear', 'monotone', 'step'], 'Interpolation between points.');

function component(
  name: string,
  description: string,
  props: Record<string, JsonSchema>,
  required: string[],
  { data = true, chart = true } = {},
): JsonSchema {
  return {
    title: name,
    description,
    type: 'object',
    properties: {
      component: { const: name },
      ...(data ? DATA : { data: str('Optional dataset name, used for derived options.') }),
      ...META,
      ...(chart ? CHART : {}),
      ...(chart && name !== 'Sparkline'
        ? {
            tooltipNote: str(
              'Plain-text chart context, included in accessible descriptions and supported hover tooltips.',
            ),
          }
        : {}),
      ...props,
    },
    required: ['component', ...(data ? ['data'] : []), ...required],
    additionalProperties: false,
  };
}

const COMPONENT_DEFS: Record<string, JsonSchema> = {
  LineChart: component(
    'LineChart',
    'Trends over a continuous x. One line per measure, or per value of `color`.',
    {
      x: fieldRef('Continuous field for the horizontal axis; dates are detected.'),
      y: measures('A measure, or several fields for several lines.'),
      color: field('Splits rows into one line per value of this field.'),
      compare: field('Field with comparison values, drawn dashed.'),
      compareLabel: str('Label for the comparison line.'),
      curve: CURVE,
      area: bool('Fill under the line.'),
      points: oneOfEnum([true, false, 'hover'], 'Mark every point, none, or only the hovered one.'),
      brush: bool('Drag to select a range of x and publish it to the selection.'),
      format: format('Value format.'),
      xFormat: format('Axis format for x.'),
      legend: bool('Show a legend above the plot.'),
    },
    ['x', 'y'],
  ),
  AreaChart: component(
    'AreaChart',
    'Filled trends; stack several series to show a total and its parts.',
    {
      x: fieldRef('Continuous field for the horizontal axis.'),
      y: measures('A measure, or several fields for several areas.'),
      color: field('Splits rows into one area per value of this field.'),
      stack: bool('Stack series on top of each other.'),
      curve: CURVE,
      brush: bool('Drag to select a range of x and publish it to the selection.'),
      format: format('Value format.'),
      xFormat: format('Axis format for x.'),
      legend: bool('Show a legend.'),
    },
    ['x', 'y'],
  ),
  BarChart: component(
    'BarChart',
    'Compares values across categories or dates. Rows sharing an x are summed.',
    {
      x: fieldRef('Category or date field, one bar per value.'),
      y: measures('A measure, or several fields for grouped bars.'),
      group: field('Splits each bar by this field.'),
      color: field('Alias of `group`.'),
      stack: bool('Stack groups into one bar.'),
      orientation: oneOfEnum(['vertical', 'horizontal'], 'Bar direction.'),
      sort: SORT,
      select: bool('Click a bar to toggle its x value in the selection.'),
      format: format('Value format.'),
      xFormat: format('Category label format.'),
      legend: bool('Show a legend.'),
    },
    ['x', 'y'],
  ),
  BarList: component(
    'BarList',
    'A ranked list with inline bars; raw rows are aggregated per category.',
    {
      category: fieldRef('Field whose values become the rows.'),
      value: measure('Measure to aggregate; omit to count rows.'),
      sort: SORT,
      limit: int('Show at most this many rows.'),
      format: format('Value format.'),
      delta: field('Field holding each row’s change as a ratio.'),
      invertDelta: bool('A fall in the delta is good.'),
      variant: oneOfEnum(['bar', 'fill'], 'Bar under the label, or a soft fill behind it.'),
      select: bool('Click a row to toggle its category in the selection.'),
    },
    ['category'],
  ),
  DonutChart: component(
    'DonutChart',
    'Parts of a whole, for a handful of categories.',
    {
      category: fieldRef('Field whose values become the slices.'),
      value: measure('Measure to aggregate; omit to count rows.'),
      sort: SORT,
      format: format('Value format.'),
      centerValue: str('Text in the middle; defaults to the total.'),
      centerLabel: str('Caption under the center value.'),
      legend: bool('Show a legend.'),
      size: { type: 'number', minimum: 40, description: 'Diameter in px.' },
      thickness: { type: 'number', minimum: 2, description: 'Ring thickness in px.' },
      select: bool('Click a slice to toggle its category in the selection.'),
    },
    ['category'],
  ),
  Funnel: component(
    'Funnel',
    'Conversion through ordered steps.',
    {
      step: field('Field naming each step, in order.'),
      value: field('Count at each step.'),
      format: format('Value format.'),
      align: oneOfEnum(['start', 'center'], 'Bar alignment.'),
      overall: bool('Show the overall conversion.'),
    },
    ['step', 'value'],
  ),
  Sparkline: component(
    'Sparkline',
    'A small line without axes.',
    {
      x: field('Field to order points by.'),
      y: field('Values to draw.'),
      compare: field('Comparison values, drawn dashed.'),
      area: bool('Fill under the line.'),
      curve: CURVE,
      format: format('Value format for the accessible summary.'),
    },
    ['y'],
  ),
  Histogram: component(
    'Histogram',
    'The distribution of a quantitative field, or counts per day, week or month.',
    {
      x: fieldRef('Field to bin.'),
      bins: int('Number of equal-width bins.'),
      interval: oneOfEnum(['day', 'week', 'month'], 'Calendar bucket for a date x.'),
      value: field('Sum this field per bin instead of counting rows.'),
      format: format('Format for x.'),
      valueFormat: format('Format for counts or sums.'),
      countLabel: str('Label for counts in the tooltip.'),
      brush: bool('Drag across bins to publish a range of x.'),
      median: bool('Mark the median.'),
    },
    ['x'],
  ),
  ScatterPlot: component(
    'ScatterPlot',
    'The relationship between two measures.',
    {
      renderer: {
        type: 'string',
        enum: ['svg', 'canvas', 'webgl'],
        description:
          'Scatter point renderer. Defaults to SVG; WebGL falls back to Canvas, then SVG when unavailable.',
      },
      x: fieldRef('Horizontal measure.'),
      y: fieldRef('Vertical measure.'),
      size: field('Point size by this field.'),
      color: field('Point color by this field.'),
      label: field('Field naming each point.'),
      format: format('Format for y.'),
      xFormat: format('Format for x.'),
      select: {
        description:
          'Click a point to toggle a value in the selection: true uses `color` (or `label`), a field name uses that field.',
        oneOf: [{ type: 'boolean' }, ref('Field')],
      },
      legend: bool('Show a legend.'),
      xTitle: str('Horizontal axis title.'),
      yTitle: str('Vertical axis title.'),
    },
    ['x', 'y'],
  ),
  Heatmap: component(
    'Heatmap',
    'A value across two categorical or time dimensions.',
    {
      x: fieldRef('Columns.'),
      y: fieldRef('Rows.'),
      value: measure('Measure per cell; omit to count rows.'),
      format: format('Value format.'),
      xFormat: format('Column label format.'),
      yFormat: format('Row label format.'),
      cellHeight: { type: 'number', minimum: 4, description: 'Row height in px.' },
      peak: bool('Mark the highest cell.'),
      countLabel: str('Label for counts in the tooltip when `value` is not set.'),
      legend: bool('Show the color legend.'),
    },
    ['x', 'y'],
  ),
  CalendarHeatmap: component(
    'CalendarHeatmap',
    'One cell per day, arranged by week.',
    {
      date: fieldRef('Date field.'),
      value: measure('Measure per day; omit to count rows.'),
      format: format('Value format.'),
      weeks: int('Number of weeks to show.'),
      weekStart: oneOfEnum([0, 1], 'First day of the week: 0 Sunday, 1 Monday.'),
      dayLabels: bool('Show weekday labels.'),
      countLabel: str('Label for counts in the tooltip when `value` is not set.'),
      legend: bool('Show the color legend.'),
      select: bool('Click a day to select it.'),
    },
    ['date'],
  ),
  Sankey: component(
    'Sankey',
    'Flows between stages; rows are aggregated per from → to pair.',
    {
      from: field('Where a flow starts.'),
      to: field('Where a flow ends. A name used in both fields links the stages.'),
      value: field('Flow size; counts rows when omitted.'),
      format: format('Flow size format.'),
      nodeWidth: { type: 'number', minimum: 2, description: 'Node bar width in px.' },
      nodePadding: { type: 'number', minimum: 0, description: 'Vertical gap between nodes in px.' },
      select: bool('Click a node to toggle it in the selection.'),
    },
    ['from', 'to'],
  ),
  BoxPlot: component(
    'BoxPlot',
    'Quartiles and outliers of a measure per category.',
    {
      category: fieldRef('One box per value of this field.'),
      value: field('Measure to summarize.'),
      orientation: oneOfEnum(['horizontal', 'vertical'], 'Box direction.'),
      whiskers: oneOfEnum(['tukey', 'minmax'], 'Whisker rule.'),
      zero: bool('Start the value axis at zero.'),
      format: format('Value format.'),
      select: bool('Click a box to select its category.'),
    },
    ['category', 'value'],
  ),
  KPI: component(
    'KPI',
    'A headline number with its comparison, aggregated from the rows the selection lets through.',
    {
      label: str('What the number is.'),
      value: measure('Measure to aggregate; `{ "field": …, "aggregate": "count" }` counts rows.'),
      compareValue: field('Field with comparison values; the delta is computed against it.'),
      trendBy: field('Draw a sparkline of the value per distinct value of this field.'),
      format: format('Value format.'),
      unit: str('Mono tag in the corner, e.g. "USD".'),
      currency: CURRENCY,
      comparison: str('What the delta is measured against, e.g. "vs. previous 30 days".'),
      deltaKind: oneOfEnum(['percent', 'pt'], 'Ratio change or percentage points.'),
      deltaDigits: int('Fraction digits for the displayed change.', 0, 20),
      invert: bool('Down is good.'),
      compare: bool('Show this period and the previous one as two bars.'),
      target: {
        type: 'object',
        description: 'Progress toward a goal.',
        properties: {
          value: { type: 'number', description: 'The goal.' },
          label: str('Name of the goal.'),
          expected: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Share of the goal expected by now.',
          },
        },
        required: ['value'],
        additionalProperties: false,
      },
    },
    ['label', 'value'],
    { chart: false },
  ),
  DataTable: component(
    'DataTable',
    'Rows with typed cells. Optionally grouped, sorted, limited and selectable.',
    {
      columns: {
        type: 'array',
        items: ref('Column'),
        minItems: 1,
        description: 'Columns in order.',
      },
      groupBy: field('One row per value of this field; columns aggregate.'),
      sort: {
        type: 'string',
        pattern: '^-?[^-].*$',
        description: 'Column key to sort by; prefix "-" for descending.',
      },
      limit: int('Keep the first N rows after sorting.'),
      pageSize: int('Rows per page.'),
      select: field('Field published to the selection when a row is clicked.'),
      multiple: bool('Allow several selected rows.'),
      rank: bool('Leading rank column.'),
      caption: str('Line under the title.'),
      noun: str('Plural noun for the page label.'),
      height: { type: 'number', minimum: 120, description: 'Scroller height in px.' },
    },
    ['columns'],
    { chart: false },
  ),
  FilterBar: component(
    'FilterBar',
    'Chips that mirror the selection, with menus to set values.',
    {
      fields: {
        type: 'array',
        minItems: 1,
        description: 'Fields offered as chips.',
        items: {
          type: 'object',
          properties: {
            field: field('Field to filter.'),
            label: str('Chip label.'),
            pinned: bool('Always show the chip.'),
            multiple: bool('Allow several values.'),
            options: {
              type: 'array',
              description: 'Values offered; derived from the dataset when omitted.',
              items: {
                type: 'object',
                properties: {
                  value: { type: ['string', 'number', 'boolean'] },
                  label: str('Display text.'),
                  meta: str('Right-aligned detail.'),
                },
                required: ['value'],
                additionalProperties: false,
              },
            },
          },
          required: ['field'],
          additionalProperties: false,
        },
      },
      label: str('Leading label; defaults to "Filters".'),
    },
    ['fields'],
    { data: false, chart: false },
  ),
};

/** Component names the schema describes, in schema order. */
export const SPEC_COMPONENTS = Object.keys(COMPONENT_DEFS) as SpecComponentName[];

export type SpecComponentName =
  | 'LineChart'
  | 'AreaChart'
  | 'BarChart'
  | 'BarList'
  | 'DonutChart'
  | 'Funnel'
  | 'Sparkline'
  | 'Histogram'
  | 'ScatterPlot'
  | 'Heatmap'
  | 'CalendarHeatmap'
  | 'BoxPlot'
  | 'Sankey'
  | 'KPI'
  | 'DataTable'
  | 'FilterBar';

/** A field name, or a field with display overrides. */
export type SpecFieldRef =
  | string
  | {
      field: string;
      type?: 'temporal' | 'quantitative' | 'nominal';
      label?: string;
      format?: SerializableFormatter;
      axisFormat?: SerializableFormatter;
      tooltipFormat?: SerializableFormatter;
      description?: string;
      timeZone?: string;
      currency?: string;
      unit?: string;
    };

/** A field, optionally aggregated across rows. */
export type SpecMeasure =
  | string
  | (Exclude<SpecFieldRef, string> & {
      aggregate?: 'sum' | 'count' | 'mean';
    });

export interface ComponentSpec {
  component: SpecComponentName;
  data?: string;
  title?: string;
  description?: string;
  span?: number;
  [prop: string]: unknown;
}

export interface DashboardSpec {
  title?: string;
  description?: string;
  selection?: string;
  layout: ComponentSpec[];
}

export type QuartileSpec = ComponentSpec | DashboardSpec;

const ENCODING_OVERRIDES = {
  type: oneOfEnum(['temporal', 'quantitative', 'nominal'], 'How the field behaves on a scale.'),
  label: str('Human label for axes, legends and headers.'),
  format: format('Display format.'),
  axisFormat: format('Axis-only format; table values retain format.'),
  tooltipFormat: format('Tooltip-only format; table values retain format.'),
  description: str('Plain-text field definition or caveat.'),
  timeZone: TIME_ZONE,
  currency: CURRENCY,
  unit: str('Short unit badge, not a numeric conversion.'),
};

const TONES = ['neutral', 'signal', 'positive', 'warning', 'negative'];

export const quartileSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/zinnoberHaus/quartile/schema.json',
  title: 'Quartile component spec',
  description:
    'A single component spec, or a Dashboard of them. Specs reference datasets by name and fields by column name; SpecView renders them.',
  oneOf: [ref('Spec'), ref('Dashboard')],
  $defs: {
    Field: { type: 'string', minLength: 1, description: 'A field (column) name.' },
    FieldRef: {
      description: 'A field name, or a field with display overrides.',
      oneOf: [
        ref('Field'),
        {
          type: 'object',
          properties: { field: ref('Field'), ...ENCODING_OVERRIDES },
          required: ['field'],
          additionalProperties: false,
        },
      ],
    },
    Measure: {
      description: 'A field, optionally aggregated across rows that share the other encodings.',
      oneOf: [
        ref('Field'),
        {
          type: 'object',
          properties: {
            field: ref('Field'),
            aggregate: oneOfEnum(['sum', 'count', 'mean'], 'How rows combine.'),
            ...ENCODING_OVERRIDES,
          },
          required: ['field'],
          additionalProperties: false,
        },
      ],
    },
    Format: {
      description:
        'A named format, Intl number options, or a typed format descriptor. Callbacks are React-only.',
      oneOf: [
        { enum: [...FORMATS] },
        ref('NumberOptions'),
        ref('NumberFormat'),
        ref('DateFormat'),
        ref('BytesFormat'),
        ref('DurationFormat'),
      ],
    },
    NumberOptions: formatObject('bare-number', NUMBER_OPTIONS),
    NumberFormat: formatObject('number', {
      ...FORMAT_META,
      ...NUMBER_OPTIONS,
      prefix: str('Literal prefix, outside the localized number.'),
      suffix: str('Literal suffix, outside the localized number.'),
      scale: {
        type: 'number',
        description: 'Finite display-only multiplier; percent already multiplies ratios by 100.',
      },
    }),
    DateFormat: formatObject('date', { ...FORMAT_META, ...DATE_OPTIONS }),
    BytesFormat: formatObject('bytes', {
      ...FORMAT_META,
      base: oneOfEnum([1000, 1024], 'Decimal kB/MB or binary KiB/MiB.'),
      maximumFractionDigits: int('Maximum fractional places.', 0, 20),
    }),
    DurationFormat: formatObject('duration', {
      ...FORMAT_META,
      unit: oneOfEnum(
        ['millisecond', 'second'],
        'Unit of the elapsed numeric observation; default millisecond.',
      ),
      maximumFractionDigits: int('Maximum fractional second places.', 0, 20),
    }),
    Column: {
      type: 'object',
      description: 'A DataTable column.',
      properties: {
        field: ref('Field'),
        key: str(
          'Unique column id; defaults to the field. Required when two columns share a field.',
        ),
        label: str('Header text.'),
        description: str('Plain-text field definition; overrides dataset field description.'),
        format: format('Value format.'),
        align: oneOfEnum(['left', 'center', 'right'], 'Alignment.'),
        width: {
          type: ['number', 'string'],
          description: 'Grid track: px, or a CSS track such as "minmax(160px, 2fr)".',
        },
        cell: oneOfEnum(
          ['text', 'number', 'bar', 'sparkline', 'delta', 'badge', 'status'],
          'How the value renders.',
        ),
        sortable: bool('Sort by clicking the header.'),
        secondary: field('Text cells: a second mono line from this field.'),
        tones: {
          type: 'object',
          description: 'Badge and status cells: tone per value.',
          additionalProperties: { enum: TONES },
        },
        deltaKind: oneOfEnum(['percent', 'pt', 'number'], 'Delta cells: unit of change.'),
        deltaDigits: int('Delta cells: fraction digits for the displayed change.', 0, 20),
        invert: bool('Delta cells: down is good.'),
        share: bool('Bar cells: label shows the share of the column total.'),
        aggregate: oneOfEnum(
          ['sum', 'count', 'mean', 'min', 'max'],
          'With groupBy: how the field combines.',
        ),
        over: field('With groupBy: sparkline and delta series over this field.'),
      },
      required: ['field'],
      additionalProperties: false,
    },
    ...COMPONENT_DEFS,
    Spec: {
      description: 'One component, chosen by `component`.',
      oneOf: SPEC_COMPONENTS.map((n) => ref(n)),
    },
    Dashboard: {
      type: 'object',
      description: 'Components laid out on a 12-column grid and linked by one selection.',
      properties: {
        title: str('Dashboard title.'),
        description: str('One line under the title.'),
        selection: {
          type: 'string',
          pattern: '^[A-Za-z][\\w-]*$',
          description: 'Selection id the components share.',
        },
        layout: { type: 'array', items: ref('Spec'), minItems: 1, description: 'Items in order.' },
      },
      required: ['layout'],
      additionalProperties: false,
    },
  } as Record<string, JsonSchema>,
};
