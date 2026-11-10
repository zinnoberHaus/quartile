# @quartile/react

**Write a sentence. Get a chart.** Quartile is an open-source chart block for Markdown, AI answers
and web pages. A few lines of text become an interactive chart, KPI, table or dashboard.

This is a **0.1 preview** build from the [Quartile repository](https://github.com/zinnoberHaus/quartile),
under Apache-2.0. The package is not on the npm registry. It is installed from a preview build on
GitHub Releases or from a tarball you build yourself; the
[installation guide](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/installation.md)
has both. The block language and the APIs may change before 0.1.0.

````markdown
```quartile
bar sum(revenue) by region
title: Revenue by region, Q3 2026
format: currency USD
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
```
````

The first line is the chart, the `key: value` lines are settings, and the rows come after `---`.
Where Quartile is not installed, the block stays a readable code block.

## Render blocks

In Markdown, with react-markdown:

```tsx
import Markdown from 'react-markdown';
import { QuartileDocument, QuartilePre } from '@quartile/react';
import '@quartile/react/styles.css';

export function Page({ markdown }: { markdown: string }) {
  return (
    <QuartileDocument markdown={markdown} theme="system">
      <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
    </QuartileDocument>
  );
}
```

In AI answers, add `quartilePrompt()` from `@quartile/react/lang` to the system prompt and render
the stream with `quartileRenderer()` for Streamdown, or with `QuartilePre` and the `streaming` prop.
Blocks draw while the answer streams. Quartile ships no model.

On a page without React, serve `dist/embed/quartile.global.js` from your own site:

```html
<script src="/assets/quartile.global.js" data-theme="auto"></script>
```

It draws `quartile` code blocks and `<quartile-chart>` elements, and takes the page's colors and font.

Guides: [Markdown and documentation sites](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/markdown.md),
[AI answers](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/ai-responses.md),
[embedding and styling](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/embedding.md),
[server rendering](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/server-rendering.md),
[language reference](https://github.com/zinnoberHaus/quartile/blob/main/docs/language.md).
The same pages are at <https://docs.usequartile.com>.

## Data

A block gets rows inline, from a `data` block in the same document, from a dataset your app passes
(`<QuartileDocument data={{ orders }}>`), or from a `src:` URL. Nothing is fetched unless the host
opts in: pass `loadSource={createSourceLoader({ origins: ['same-origin', 'https://api.example.com'] })}`
in React, or list origins in `data-sources` on the script tag. `path: data.items` reads rows out of
a JSON API response and `refresh: 30s` reloads them. See
[data sources](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/data-sources.md).

## Settings and interaction

A chart takes its colors and fonts from the page. Each further detail is one more line in the
block: `margin`, `colors` (palette names, `1` to `8` or hex), `y.min` and `y.max`, `y.ticks`,
`grid`, `legend: bottom`, `labels: yes`, `reference: 1000000` with `reference.label: Target`,
`y.scale: log`. A page can refuse block colors with `blockColors={false}` or
`data-block-colors="off"`. See
[styling and settings](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/styling.md).

Views over the same named dataset filter each other without a setting. `actions: table, rows,
download` adds buttons for a view's table, the rows behind it and a CSV download; `source:`,
`source.url:` and `asof:` put a source line under it; an `explorer` block is a table with search,
filters and sorting. `onSelectionChange` (React) and the `quartile-select` event (script) report
what a reader selects. See
[interaction](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/interaction.md).

## Check blocks

```sh
npx --no-install quartile check README.md docs/*.md
```

The `quartile` command compiles the blocks in Markdown files and prints each problem as
`file:line: severity: message`. It exits with status 1 on errors. `--no-install` makes `npx` run
only the copy in your project; with pnpm, write `pnpm exec quartile check`. `quartile prompt`
prints the `quartilePrompt()` text. See
[AI coding agents](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/coding-agents.md).

## React components

Blocks compile to a validated JSON spec that renders through React components. You can use the
components directly. Import the stylesheet once at your application's entry point; Quartile uses
plain CSS custom properties, with no Tailwind or CSS-in-JS runtime requirement.

```tsx
import { BarList, DataTable, KPI, LineChart, QuartileProvider, Selection, dataset } from '@quartile/react';
import '@quartile/react/styles.css';

const orders = dataset([
  { date: '2026-09-01', region: 'Europe', amount: 120 },
  { date: '2026-09-01', region: 'Asia', amount: 80 },
  { date: '2026-09-02', region: 'Europe', amount: 150 },
]);

export function OrdersExplorer() {
  return (
    <QuartileProvider theme="system">
      <Selection>
        <KPI data={orders} label="Revenue" value="amount" />
        <LineChart data={orders} x="date" y="amount" brush />
        <BarList data={orders} category="region" value="amount" select />
        <DataTable data={orders} columns={[{ field: 'date' }, { field: 'region' }, { field: 'amount' }]} />
      </Selection>
    </QuartileProvider>
  );
}
```

Click a region or brush a date range to filter the other views. The publishing view excludes its
own predicate, so other categories remain available. Rows sharing an x value are summed by
the trend charts. Use `dataset(rows, fields)` to override inferred field types, labels and formats.
The [formatting guide](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/formatting.md)
covers numeric precision and notation, time zones, exact display boundaries, field explanations,
separate axis/tooltip formats and optional FormatJS/math.js adapters.

## Included

- `@quartile/react`: charts for trends, comparisons, distributions, relationships, flows and
  activity; KPIs, data tables, filter chips, inputs, navigation and overlays; `QuartileBlock`,
  `QuartileDocument` and the adapters for react-markdown (`QuartilePre`, `QuartileCode`) and
  Streamdown (`quartileRenderer`); `createSourceLoader`; `validateSpec` and `SpecView`.
- The parts for a chart of your own: `ChartFrame`, the axes, gridlines, legend and tooltip,
  the scales (`valueAxis`, `bandScale`, `continuousX`), and the selection hooks (`useLinkedRows`,
  `useToggleSelect`, `useRangeBrush`, `useChartKeyboard`).
- `@quartile/react/lang`: the parser and compiler, `quartilePrompt`, strict tool schemas,
  `createSourceLoader` and dbt helpers. It has no React in it, so server components, route handlers
  and build tools can call it.
- `@quartile/react/server`: static SVG and HTML rendering (`renderBlockToHTML`,
  `renderMarkdownBlocks`) and the remark and markdown-it plugins. For Node code such as build
  scripts, static-site generators and Markdown pipelines; it does not run inside React Server
  Components.
- `@quartile/react/embed` and the standalone `dist/embed/quartile.global.js` (and `quartile.js`, an
  ES module) for `<quartile-chart>` on an HTML page, with `theme="auto"` and host presets that take
  the page's colors and fonts.
- `@quartile/react/styles.css` and `@quartile/react/schema.json`.
- The `quartile` command (`check`, `prompt`).
- Light and dark themes, comfortable and compact density, and shared `--q-*` tokens.
- Keyboard navigation, chart summaries and table fallbacks (`view="table"`).
- Optional `@quartile/react/query` views and `@quartile/react/duckdb` Arrow ingestion and worker
  queries. The database and Arrow peers are opt-in.
- SVG, Canvas and WebGL scatter plots, with capability fallback and paged exact-data access.
- `DataExplorer` for local search, typed filters, multi-sort, column visibility/order/width/pinning,
  grouping, view JSON and CSV export; DataTable supports caller-controlled cell edits.
- Optional `@quartile/react/ai` for bounded field profiles/context, validated analysis proposals,
  an HTTP adapter and explicit review/apply. No model SDK, credential, hosted service or automatic
  tool execution is included.

See the repository's [architecture guide](https://github.com/zinnoberHaus/quartile/blob/main/docs/architecture.md),
[examples](https://docs.usequartile.com/examples) and their
[source](https://github.com/zinnoberHaus/quartile/tree/main/apps/gallery), and the
[contributing guide](https://github.com/zinnoberHaus/quartile/blob/main/CONTRIBUTING.md).

## Limits

Read the [worker query guide](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/worker-queries.md)
for the pinned DuckDB/Arrow pair, assets, bounded result plans and ownership. Canvas/WebGL currently
cover scatter points; other charts do not expose accelerated renderer selection. No universal production scale limit is claimed;
screen-reader testing with NVDA, JAWS and VoiceOver remains outstanding. Blocks do not run SQL or
connect to a database: `src:` reads CSV, TSV and JSON over HTTP from origins the host allows.

See [analytical tables](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/tables.md),
[AI assistance](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/ai-assistance.md), and
[data-science workflows](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/data-science.md)
for profiling, exact retention, prediction evaluation and pandas/Polars handoff examples.
The example calculations live in the examples app's source; they are not model-training APIs.

## License

Apache-2.0. The full license is included in this package.
