/**
 * The words a block can start with, and how each chart kind reads the sentence after it:
 * `<kind> <measures> by <dimension> [and <dimension>]`.
 */
import type { SpecComponentName } from '../spec/schema';

export type ViewKind =
  | 'line'
  | 'area'
  | 'bar'
  | 'barlist'
  | 'donut'
  | 'funnel'
  | 'sparkline'
  | 'histogram'
  | 'scatter'
  | 'heatmap'
  | 'calendar'
  | 'sankey'
  | 'box'
  | 'kpi'
  | 'table'
  | 'filters';

export type BlockKind = ViewKind | 'data' | 'dashboard';

export interface KindDef {
  kind: ViewKind;
  component: SpecComponentName;
  /** Prop receiving the sentence's measure list, e.g. `y` or `value`. */
  measure: string;
  /**
   * `measure`: one field with an optional aggregate; `measures`: several (one series each);
   * `field`: one plain field; `columns`: table columns; `fields`: filter chips.
   */
  measureType: 'measure' | 'measures' | 'field' | 'columns' | 'fields';
  /** Props for the fields after `by`, in order. */
  dims: string[];
  /** Prop for the field after `vs`, when it differs from the first dimension. */
  versus?: string;
  /** The component aggregates raw rows itself through an `aggregate` prop. */
  native?: boolean;
  /** Interaction a view gets inside a dashboard, unless it says otherwise. */
  link?: 'select' | 'brush';
  /** Requires a quantitative or temporal x; categories need an explicit order. */
  continuousX?: boolean;
}

export const KINDS: Record<ViewKind, KindDef> = {
  line: {
    kind: 'line',
    component: 'LineChart',
    measure: 'y',
    measureType: 'measures',
    dims: ['x', 'color'],
    link: 'brush',
    continuousX: true,
  },
  area: {
    kind: 'area',
    component: 'AreaChart',
    measure: 'y',
    measureType: 'measures',
    dims: ['x', 'color'],
    link: 'brush',
    continuousX: true,
  },
  bar: {
    kind: 'bar',
    component: 'BarChart',
    measure: 'y',
    measureType: 'measures',
    dims: ['x', 'group'],
    link: 'select',
  },
  barlist: {
    kind: 'barlist',
    component: 'BarList',
    measure: 'value',
    measureType: 'measure',
    dims: ['category'],
    native: true,
    link: 'select',
  },
  donut: {
    kind: 'donut',
    component: 'DonutChart',
    measure: 'value',
    measureType: 'measure',
    dims: ['category'],
    native: true,
    link: 'select',
  },
  funnel: {
    kind: 'funnel',
    component: 'Funnel',
    measure: 'value',
    measureType: 'field',
    dims: ['step'],
  },
  sparkline: {
    kind: 'sparkline',
    component: 'Sparkline',
    measure: 'y',
    measureType: 'field',
    dims: ['x'],
  },
  histogram: {
    kind: 'histogram',
    component: 'Histogram',
    measure: 'x',
    measureType: 'field',
    dims: [],
    link: 'brush',
  },
  scatter: {
    kind: 'scatter',
    component: 'ScatterPlot',
    measure: 'y',
    measureType: 'field',
    dims: ['x', 'color'],
    link: 'select',
  },
  heatmap: {
    kind: 'heatmap',
    component: 'Heatmap',
    measure: 'value',
    measureType: 'measure',
    dims: ['x', 'y'],
    native: true,
  },
  calendar: {
    kind: 'calendar',
    component: 'CalendarHeatmap',
    measure: 'value',
    measureType: 'measure',
    dims: ['date'],
    native: true,
    link: 'select',
  },
  sankey: {
    kind: 'sankey',
    component: 'Sankey',
    measure: 'value',
    measureType: 'field',
    dims: ['from', 'to'],
    link: 'select',
  },
  box: {
    kind: 'box',
    component: 'BoxPlot',
    measure: 'value',
    measureType: 'field',
    dims: ['category'],
    link: 'select',
  },
  kpi: {
    kind: 'kpi',
    component: 'KPI',
    measure: 'value',
    measureType: 'measure',
    dims: ['trendBy'],
    versus: 'compareValue',
    native: true,
  },
  table: {
    kind: 'table',
    component: 'DataTable',
    measure: 'columns',
    measureType: 'columns',
    dims: ['groupBy'],
  },
  filters: {
    kind: 'filters',
    component: 'FilterBar',
    measure: 'fields',
    measureType: 'fields',
    dims: [],
  },
};

/** Normalized alias → kind, plus props the alias implies. */
const ALIASES: Record<string, { kind: BlockKind; props?: Record<string, unknown> }> = {};
function alias(kind: BlockKind, names: string[], props?: Record<string, unknown>) {
  for (const n of names) ALIASES[n] = { kind, props };
}
alias('line', ['line', 'lines', 'trend', 'timeseries', 'linegraph']);
alias('area', ['area', 'areas']);
alias('area', ['stackedarea'], { stack: true });
alias('bar', ['bar', 'bars', 'column', 'columns', 'vbar', 'verticalbar', 'groupedbar']);
alias('bar', ['stackedbar', 'stackedcolumn'], { stack: true });
alias('bar', ['hbar', 'horizontalbar', 'horizontalbars'], { orientation: 'horizontal' });
alias('barlist', ['barlist', 'ranking', 'rank', 'leaderboard', 'toplist']);
alias('donut', ['donut', 'doughnut', 'pie', 'ring']);
alias('funnel', ['funnel']);
alias('sparkline', ['sparkline', 'spark']);
alias('histogram', ['histogram', 'hist', 'distribution']);
alias('scatter', ['scatter', 'scatterplot', 'points', 'dots', 'bubble', 'xy']);
alias('heatmap', ['heatmap', 'heat', 'matrix']);
alias('calendar', ['calendar', 'calendarheatmap', 'contributions']);
alias('sankey', ['sankey', 'flow', 'flows', 'alluvial']);
alias('box', ['box', 'boxplot', 'boxes', 'boxandwhisker', 'whisker']);
alias('kpi', ['kpi', 'kpis', 'metric', 'stat', 'number', 'bignumber', 'bigvalue', 'scorecard']);
alias('table', ['table', 'datatable', 'grid']);
alias('filters', ['filters', 'filter', 'filterbar']);
alias('data', ['data', 'dataset']);
alias('dashboard', ['dashboard', 'board', 'report']);

/** "Line chart", "bar-chart", "Scatter plot", "PIE" → the canonical kind. */
export function normalizeKindWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/(chart|graph|plot|diagram)$/, '');
}

export function lookupKind(
  word: string,
): { kind: BlockKind; props?: Record<string, unknown> } | undefined {
  const key = normalizeKindWord(word);
  return Object.hasOwn(ALIASES, key) ? ALIASES[key] : undefined;
}

/** Every recognized kind word, for hints and the language reference. */
export function kindWords(): string[] {
  return Object.keys(ALIASES);
}

/**
 * Property names people and models use for the same idea. Keys are normalized (lowercase, no
 * separators); values are the canonical property or an encoding path such as `x.label`.
 */
export const PROPERTY_ALIASES: Record<string, string> = {
  subtitle: 'description',
  caption: 'description',
  desc: 'description',
  summary: 'description',
  note: 'tooltipNote',
  footnote: 'tooltipNote',
  tooltip: 'tooltipNote',
  tooltipnote: 'tooltipNote',
  series: 'color',
  splitby: 'color',
  split: 'color',
  colour: 'color',
  colorby: 'color',
  groupby: 'groupBy',
  stacked: 'stack',
  xaxis: 'x',
  yaxis: 'y',
  xlabel: 'x.label',
  xtitle: 'x.label',
  ylabel: 'y.label',
  ytitle: 'y.label',
  xformat: 'x.format',
  yformat: 'format',
  valueformat: 'format',
  numberformat: 'format',
  top: 'limit',
  maxrows: 'limit',
  rows: 'limit',
  order: 'sort',
  sortby: 'sort',
  smooth: 'curve',
  interpolate: 'curve',
  fill: 'area',
  filled: 'area',
  compareto: 'compare',
  previous: 'compare',
  goal: 'target',
  name: 'label',
  trend: 'trendBy',
  trendby: 'trendBy',
  sparkline: 'trendBy',
  type: 'kind',
  chart: 'kind',
  charttype: 'kind',
  kind: 'kind',
  mark: 'kind',
  view: 'kind',
  cols: 'span',
  columnspan: 'span',
  colspan: 'span',
  dataset: 'data',
  source: 'data',
};

/** Normalized property key: "X-Axis Label" → "xaxislabel". Dots are kept for paths. */
export function normalizeKey(key: string): string {
  return key
    .split('.')
    .map((part) => part.toLowerCase().replace(/[\s_-]+/g, ''))
    .join('.');
}
