/**
 * Teaching a model the language: a compact system prompt generated from the kind table, and
 * tool schemas that also satisfy strict structured-output modes (no oneOf, no numeric bounds,
 * every property required, nullable where optional).
 */
import { FORMAT_NAMES } from './formats';

export interface PromptDataset {
  /** Name the model writes after `data:`. */
  name: string;
  columns: { name: string; type?: string; description?: string }[];
  description?: string;
}

export interface PromptOptions {
  /** Datasets the host already has, so the model references them instead of pasting rows. */
  datasets?: readonly PromptDataset[];
  /** Fence language. Default `quartile`. */
  fence?: string;
  /** Upper bound on inline rows to ask for. Default 60. */
  maxRows?: number;
}

const KIND_LINES = [
  ['line', 'trend over time: `line revenue, cost by month`'],
  ['area', 'filled trend; add `stacked: yes` for parts of a total'],
  ['bar', 'compare categories: `bar sum(revenue) by region` (`hbar` for horizontal)'],
  ['barlist', 'ranked list with inline bars: `barlist sum(revenue) by product`'],
  ['donut', 'share of a whole, ≤6 categories: `donut share by browser` (alias `pie`)'],
  ['scatter', 'relation of two measures: `scatter price vs rating` (y vs x)'],
  ['histogram', 'distribution of one measure: `histogram latency_ms`'],
  ['box', 'distribution per category: `box latency_ms by service`'],
  ['heatmap', 'value across two categories: `heatmap count by weekday and hour`'],
  ['calendar', 'one cell per day: `calendar commits by date`'],
  ['funnel', 'conversion through ordered steps: `funnel users by step`'],
  ['sankey', 'flows between stages: `sankey users by source and target`'],
  ['sparkline', 'tiny trend: `sparkline price by day`'],
  ['kpi', 'headline number: `kpi sum(revenue) as "Revenue"`; `kpi revenue vs last_year`'],
  ['table', 'rows: `table region, revenue`; grouped: `table sum(revenue), count by region`'],
] as const;

/** The system-prompt text that teaches the block syntax. Roughly 900 tokens without datasets. */
export function quartilePrompt(options: PromptOptions = {}): string {
  const fence = options.fence ?? 'quartile';
  const maxRows = options.maxRows ?? 60;
  const f = '```';
  const datasets = options.datasets?.length
    ? `\n## Data you can reference\nUse \`data: <name>\` instead of pasting rows. Use only these columns.\n${options.datasets
        .map(
          (d) =>
            `- \`${d.name}\`${d.description ? ` — ${d.description}` : ''}: ${d.columns
              .map(
                (c) =>
                  `${c.name}${c.type ? ` (${c.type})` : ''}${c.description ? ` — ${c.description}` : ''}`,
              )
              .join('; ')}`,
        )
        .join('\n')}\n`
    : '';
  return `# Charts in answers

When a chart, table or dashboard helps answer, write a fenced ${fence} block. The page renders it as an interactive chart; elsewhere it stays readable text. Never invent numbers: chart only data you were given or computed.

## Block shape
1. First line: \`<kind> <measures> by <dimension> [and <dimension>]\`.
2. Optional \`key: value\` lines (title, format, sort, limit …).
3. A line \`---\`, then the data as CSV with a header row (or a Markdown table).

${f}${fence}
bar sum(revenue) by region
title: Revenue by region, Q3 2026
format: currency USD
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
${f}

## Kinds
${KIND_LINES.map(([k, d]) => `- \`${k}\` — ${d}`).join('\n')}

## Measures and fields
- Aggregate with \`sum(x)\`, \`mean(x)\` (or \`avg\`), \`count\`. Rows sharing a position are summed automatically; rates are averaged.
- \`by a and b\`: first is the x axis or category, second splits series (colors).
- Name columns in snake_case; labels are written for you. Use \`as "Label"\` to rename a measure.
- Dates as \`2026-03-15\`; months as \`2026-03\`; quarters as \`2026-Q1\`. Numbers may include $, %, or 1.2M.

## Useful keys
title, subtitle, format (${['currency USD', 'percent', 'compact', 'integer', '1 decimal', 'month'].join(', ')}; also ${FORMAT_NAMES.slice(0, 6).join(', ')} …), sort (desc, asc, or \`-column\` in tables), limit, stacked, horizontal, smooth, height, x.label, y.label, \`<column>.description\`.

## Dashboards and shared data
Several views in one block form a dashboard; they share the rows after \`---\` and filter each other when clicked.

${f}${fence}
dashboard Orders, September 2026
kpi sum(amount) as "Revenue"
format: currency USD
kpi count as "Orders"
line sum(amount) by day
bar sum(amount) by channel
---
day,channel,amount
2026-09-01,Web,1200
2026-09-01,Store,800
2026-09-02,Web,1350
2026-09-02,Store,760
${f}

A \`data <name>\` block defines rows once; other blocks use \`data: <name>\`.
${datasets}
## Rules
- At most ${maxRows} data rows; aggregate before charting larger data.
- Every field you name must be a column in the data. Keep units in titles or formats.
- One idea per chart. Prefer bar for categories, line for time, kpi for single numbers, table for exact values.
- Do not add JavaScript, HTML, URLs or styling; the page chooses colors and fonts.
`;
}

/**
 * Tool schema whose single argument is block text. Strict-mode compatible everywhere; the host
 * compiles the text with `compileBlock` and returns its diagnostics for one repair turn.
 */
export function quartileBlockTool(name = 'render_chart') {
  return {
    name,
    description:
      'Render a chart, table, KPI or dashboard for the user. `block` is Quartile block text: a first line like "bar sum(revenue) by region", optional "key: value" lines, a "---" line, then CSV rows with a header.',
    input_schema: {
      type: 'object' as const,
      properties: {
        block: { type: 'string' as const, description: 'The Quartile block text.' },
      },
      required: ['block'],
      additionalProperties: false,
    },
  };
}

const TOOL_KINDS = [
  'line',
  'area',
  'bar',
  'barlist',
  'donut',
  'scatter',
  'histogram',
  'box',
  'heatmap',
  'funnel',
  'sankey',
  'kpi',
  'table',
] as const;

export interface ChartToolInput {
  kind: (typeof TOOL_KINDS)[number];
  title: string | null;
  /** Measures, optionally aggregated: "sum(revenue)", "count". */
  measures: string[];
  /** The x axis or category first, then a series split. */
  by: string[];
  format: string | null;
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

/**
 * A structured alternative for providers that prefer typed arguments. Every property is
 * required and nullable where optional, with no unions or numeric bounds, so it is accepted by
 * strict structured-output modes. Convert with `chartToolInputToBlock`.
 */
export function quartileChartTool(name = 'render_chart') {
  const cell = { type: ['string', 'number', 'boolean', 'null'] as const };
  return {
    name,
    description:
      'Render one chart from rows the conversation already contains. Name measures like "sum(revenue)" or "count"; "by" lists the x axis or category, then an optional series split.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string' as const, enum: [...TOOL_KINDS], description: 'Chart kind.' },
        title: { type: ['string', 'null'] as const, description: 'Short title, or null.' },
        measures: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Measures, e.g. ["sum(revenue)"].',
        },
        by: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Dimensions, e.g. ["month", "region"].',
        },
        format: {
          type: ['string', 'null'] as const,
          description: 'Value format such as "currency USD", "percent" or "compact", or null.',
        },
        columns: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Column names of the rows.',
        },
        rows: {
          type: 'array' as const,
          items: { type: 'array' as const, items: cell },
          description: 'Data rows, one value per column.',
        },
      },
      required: ['kind', 'title', 'measures', 'by', 'format', 'columns', 'rows'],
      additionalProperties: false,
    },
  };
}

function csvCell(v: string | number | boolean | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Turns `quartileChartTool` arguments into block text for `compileBlock`. */
export function chartToolInputToBlock(input: ChartToolInput): string {
  const head = [
    input.kind,
    input.measures.join(', '),
    input.by.length ? `by ${input.by.join(' and ')}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const lines = [head];
  if (input.title) lines.push(`title: ${input.title}`);
  if (input.format) lines.push(`format: ${input.format}`);
  lines.push('---', input.columns.map(csvCell).join(','));
  for (const row of input.rows) lines.push(row.map(csvCell).join(','));
  return `${lines.join('\n')}\n`;
}
