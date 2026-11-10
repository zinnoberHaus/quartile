# Quartile

**Write a sentence. Get a chart.**

Quartile is an open-source chart block for Markdown, AI answers and web pages. A few lines of text become an interactive chart, KPI, table or dashboard: in Markdown docs and notes, in AI answers while they stream, and on a web page with one script tag.

> **Status: 0.1 preview · Apache-2.0 · not on npm yet.** Install the preview build from a GitHub release ([install](#install)). The block language and the APIs may change before 0.1.0. See [what is not built yet](#what-is-not-built-yet).

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

The first line is the chart: a kind (`bar`), a measure (`sum(revenue)`) and the field that splits it (`region`). The `key: value` lines are settings. The rows come after `---`.

A page with Quartile draws this block as a bar chart titled "Revenue by region, Q3 2026": three bars, values in US dollars, keyboard navigation, a written summary ("3 bars. Highest Americas at $2,100,000; lowest APAC at $860,000.") and a table of the same numbers for assistive technology. A page without Quartile, such as this README on GitHub, shows the block as the code above, so the data stays readable.

What a Mermaid block does for diagrams, a `quartile` block does for data. (Quartile is not affiliated with Mermaid.)

[Playground](https://docs.usequartile.com/examples/playground) · [Documentation](https://docs.usequartile.com) · [Examples](https://docs.usequartile.com/examples) · [Language reference](docs/language.md)

## Use it in

Each path needs the package or the script from [Install](#install).

### Markdown, in a React app

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

`QuartilePre` draws `quartile` code blocks and leaves other code blocks alone. For MDX, remark, markdown-it and static builds, see [Markdown and documentation sites](docs/guides/markdown.md).

### AI answers

Teach the model the syntax, then render its Markdown while it streams:

```ts
import { quartilePrompt } from '@quartile/react/lang';

const system = ['You are a data analyst.', quartilePrompt()].join('\n\n');
```

```tsx
import { Streamdown } from 'streamdown';
import { QuartileDocument, quartileRenderer } from '@quartile/react';
import '@quartile/react/styles.css';

const renderers = [quartileRenderer()];

export function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <QuartileDocument theme="auto" streaming={streaming}>
      <Streamdown isAnimating={streaming} plugins={{ renderers }}>
        {text}
      </Streamdown>
    </QuartileDocument>
  );
}
```

`quartilePrompt()` returns one system-prompt section. The model writes blocks inside its normal Markdown. A block draws once its first line and one complete row have arrived, and grows with each row. Quartile ships no model and calls none. [Charts in AI answers](docs/guides/ai-responses.md) covers react-markdown, tool calls, validation and repair.

### A web page

```html
<script src="/assets/quartile.global.js" data-theme="auto"></script>

<quartile-chart>
  <script type="text/quartile">
    bar sum(revenue) by region
    ---
    region,revenue
    EMEA,1200000
    APAC,860000
    Americas,2100000
  </script>
</quartile-chart>
```

One file that you host yourself, with no build step. The script also draws `quartile` code blocks that a Markdown renderer already put on the page (`pre > code.language-quartile`), including blocks added later. `data-theme="auto"` takes the page's background, text color and font. See [embedding and styling](docs/guides/embedding.md).

## Three reasons to use it

### 1. Data and AI first

Rows in, chart out. A block gets its rows in one of four ways:

- **Inline.** CSV, TSV, a Markdown table or JSON after `---`.
- **A `data` block.** Define rows once in a document; other blocks read them with `data: sales`.
- **A dataset your app provides.** `<QuartileDocument data={{ orders }}>` makes `data: orders` work, with rows your server already authorized.
- **A URL the page allows.** `src: /data/orders.csv` or a JSON API.

JSON APIs seldom return a bare list. `path:` says where the rows are, and `refresh:` reloads them on a timer:

```text
line sum(visitors) by day
title: Visitors, last 7 days
src: https://api.example.com/v1/analytics/visitors?range=7d
path: data.results
refresh: 5m
```

Nothing is fetched unless the host opts in. In React, pass a loader that lists the origins: `createSourceLoader({ origins: ['same-origin', 'https://api.example.com'] })`. On a plain page, list them on the script tag: `data-sources="same-origin https://api.example.com"`. Request headers, such as an API key, come only from your code. Responses are limited to 5 MB and 15 seconds by default. See [data sources](docs/guides/data-sources.md).

For models:

- `quartilePrompt()` teaches the syntax in one system-prompt section. `quartileBlockTool()` and `quartileChartTool()` are tool schemas that fit strict modes.
- The compiler checks each field name against the real columns. An unknown column is an error with a line number and the list of columns, which is what a model needs to repair the block.
- Blocks draw while the answer streams. Errors wait until the block is complete.

SQL is not executed, and Quartile does not connect to a database: your app runs the query and passes the rows.

### 2. One line to start. Every detail when you care.

- **Defaults come from the data.** Column types, labels (`net_revenue` reads "Net revenue") and number and date formats are inferred. Written values such as `$1,200`, `12%`, `1.2M` and `2026-Q1` are typed for you. When you leave out the fields, the compiler picks them from the column types and says so in a note.
- **Each setting is one more line.** `height: 300px`, `sort: desc`, `limit: 10`, `stacked: yes`, `legend: no`, `curve: step`, `bins: 20`. Dotted keys describe fields: `revenue.label`, `revenue.format`, `revenue.description`. The [language reference](docs/language.md#4-settings) lists them.
- **Colors and fonts follow your page.** `theme="auto"` reads the page's colors and font in light and dark. Ten `host` presets map the variables of shadcn/ui (two variable formats), VitePress, Docusaurus, Starlight, Material for MkDocs, Primer, Pico, Radix Themes and Open Props. `accent` sets a brand color, and each color, radius and size is a `--q-*` CSS custom property you can override.
- **A setting is a line of text.** A person, a model or a coding agent changes a chart by editing that line, not chart code.
- **The same charts are React components.** When a block is not enough, use `LineChart`, `BarChart`, `DataTable` and the rest directly. The chart frame, axes, grid, legend, tooltip and scales are exported to build your own.

### 3. More than a picture

- **Linked.** Charts over the same dataset share one selection. Click a bar and the KPIs, the other charts and the table follow, also across blocks that read the same named dataset in a document. A view is never filtered by its own selection.
- **Dashboards in prose.** A `dashboard` block is a small data app inside your text: filters, headline numbers, charts and a table on a 12-column grid.
- **In the HTML.** Charts render as SVG with a real table on a server or at build time, so they are on the page before JavaScript runs and crawlers can read the numbers. See [server rendering](docs/guides/server-rendering.md).
- **Keyboard and tables.** Charts have keyboard navigation, a generated summary and a table alternative. They have not been tested with NVDA, JAWS or VoiceOver yet. See the [accessibility scope](docs/guides/accessibility.md).
- **Readable when it fails.** An invalid block shows its errors and its source instead of a wrong chart. Where Quartile is not installed, the block is still a readable code block.

## Tell your coding agent

Paste this into your coding agent:

```text
Add Quartile charts to this project. Read https://usequartile.com/SKILL.md and follow it.
```

The skill is [skills/quartile/SKILL.md](skills/quartile/SKILL.md) in this repository. It tells the agent how to install the preview build, find the Markdown renderer your project uses, wire Quartile into it, write blocks and check them.

Check the blocks in your Markdown files from a terminal or in CI:

```sh
npx quartile check README.md docs/*.md
```

It compiles each `quartile` block, prints problems as `file:line: severity: message` and exits with status 1 when there are errors. `npx` runs the copy installed in your project; `npx --no-install quartile check` stops instead of looking on the npm registry when that copy is missing.

For ongoing work, add this to your project's `AGENTS.md` (or `CLAUDE.md`):

````markdown
## Charts: Quartile

This project draws charts with Quartile (`@quartile/react`, a 0.1 preview build).

- The package is not on the npm registry. Never run `npm install @quartile/react`. Install and upgrade steps: https://docs.usequartile.com/docs/installation.md
- A chart is a fenced `quartile` block in Markdown: one sentence, optional `key: value` settings, a `---` line, then rows.

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

- Prefer these docs over memory. The syntax is new and can change between preview builds.
  - Syntax: https://docs.usequartile.com/docs/language.md
  - Data sources: https://docs.usequartile.com/docs/data-sources.md
  - Markdown and React: https://docs.usequartile.com/docs/markdown.md
  - AI answers: https://docs.usequartile.com/docs/ai-answers.md
  - Web pages: https://docs.usequartile.com/docs/embedding.md
  - Index of pages: https://docs.usequartile.com/llms.txt
- Use only kinds and settings from the syntax reference. Chart only numbers you were given or computed.
- Do not swap Quartile for another chart library without asking.
- After editing blocks, run `npx quartile check <files>` and fix what it reports.
````

More in [AI coding agents](docs/guides/coding-agents.md).

## Install

```sh
npm install https://github.com/zinnoberHaus/quartile/releases/download/v0.1.0-preview.1/quartile-react-0.1.0-preview.1.tgz
```

This is a preview build attached to a GitHub pre-release. It is not a release of 0.1.0. The registry install does not exist yet: `npm install @quartile/react` fails. The import name stays `@quartile/react`. pnpm, Yarn and Bun accept the same URL. React 18.2 or newer and React DOM are peer dependencies.

For a page without a build step, download `quartile.global.js` from the [same release](https://github.com/zinnoberHaus/quartile/releases/tag/v0.1.0-preview.1) and serve it from your own site.

You can also [build the package from source](docs/guides/installation.md#build-from-source). The [installation guide](docs/guides/installation.md) has the details and setup checks.

## The React components underneath

A block compiles to a validated JSON spec, and the spec renders through a React component library. You can use that library directly: charts, KPIs, tables, filters and interface controls that share one theme, one data model and one selection.

```tsx
import { BarList, DataTable, Histogram, KPI, QuartileProvider, Selection } from '@quartile/react';
import '@quartile/react/styles.css';

type Order = { product: string; region: string; amount: number };

export function OrdersExplorer({ orders }: { orders: Order[] }) {
  return (
    <QuartileProvider theme="system">
      <Selection id="orders">
        <KPI data={orders} value="amount" label="Order value" format="currency" />
        <Histogram data={orders} x="amount" brush />
        <BarList data={orders} category="region" value="amount" select />
        <DataTable data={orders} columns={[{ field: 'product' }, { field: 'amount' }]} />
      </Selection>
    </QuartileProvider>
  );
}
```

Brush the histogram or click a region, and the KPI, the list and the table follow.

- **Data model.** Pass rows and name the fields. `dataset()` declares types, labels and formats once. [Data and linked selection](docs/guides/data-and-selection.md) · [Formatting](docs/guides/formatting.md)
- **Theming.** Plain CSS custom properties, light and dark, two densities. No Tailwind or CSS-in-JS runtime is required. [Integration and theming](docs/guides/integration.md)
- **Tables.** Search, typed filters, multi-sort, column controls, grouping, saved view JSON, CSV export and controlled cell edits. [Analytical tables](docs/guides/tables.md)
- **JSON specs.** `validateSpec` checks a dashboard spec against `@quartile/react/schema.json` and `<SpecView>` renders it. [Generated dashboards](docs/guides/generated-dashboards.md)
- **Optional worker queries.** Arrow input and DuckDB-backed bounded queries in a browser worker. [Worker queries](docs/guides/worker-queries.md)
- **Scatter renderers.** SVG, Canvas or WebGL for scatter points. [Renderers](docs/guides/renderers.md)
- **Optional analysis assistance.** Bounded context, typed proposals, validation and explicit Apply, with your own backend. [AI assistance](docs/guides/ai-assistance.md)

## Documentation and examples

- **Documentation:** <https://docs.usequartile.com>. The guides in this repository are the source of its embedding and language pages: [guide index](docs/guides/README.md).
- **Language:** [reference](docs/language.md) · [data sources](docs/guides/data-sources.md)
- **Embed:** [Markdown and documentation sites](docs/guides/markdown.md) · [AI answers](docs/guides/ai-responses.md) · [web pages](docs/guides/embedding.md) · [server rendering](docs/guides/server-rendering.md) · [dbt](docs/guides/dbt.md)
- **Examples:** <https://docs.usequartile.com/examples>, built from `apps/gallery` in this repository.
  - Blocks: [playground](https://docs.usequartile.com/examples/playground), [streamed AI answer](https://docs.usequartile.com/examples/ai-answer), [Markdown report](https://docs.usequartile.com/examples/markdown-report), [plain HTML page](https://docs.usequartile.com/examples/embed/demo)
  - Data apps: [storefront](https://docs.usequartile.com/examples/storefront), [SaaS analytics](https://docs.usequartile.com/examples/saas), [service health](https://docs.usequartile.com/examples/operations), [dashboard from JSON](https://docs.usequartile.com/examples/ai-dashboard), [worker query explorer](https://docs.usequartile.com/examples/scale)
  - Data science: [dataset explorer](https://docs.usequartile.com/examples/explore), [cohort retention](https://docs.usequartile.com/examples/cohorts), [model evaluation](https://docs.usequartile.com/examples/model-evaluation), [reviewed analysis assistance](https://docs.usequartile.com/examples/assistant)
  - Tools: [formatting lab](https://docs.usequartile.com/examples/formatting), [Studio](https://docs.usequartile.com/examples/studio), which loads a public API and exports a React starter ([Studio guide](docs/guides/studio.md))
- **In this repository:** [dbt example](examples/dbt), [pandas and Polars snapshot](examples/python), [local model backend](examples/ai-server)

## What is not built yet

The [design coverage audit](docs/design-coverage.md) maps the original design to implementation evidence and remaining gaps.

- **npm release.** `@quartile/react` is not on the npm registry. The name, npm scope and domain need clearance first. Until then there are preview builds on GitHub Releases.
- **Markdown hosts without scripts.** GitHub and stock repository viewers show Quartile blocks as text; a pre-rendered image route is not built. Semantic Layer metric queries and a Preact-sized standalone build are not built either.
- **Databases and SQL.** Blocks do not run SQL or connect to a warehouse. `src:` reads CSV, TSV and JSON over HTTP from origins the host allows.
- **Renderer coverage.** Canvas and WebGL currently cover scatter plots. Other charts do not expose accelerated renderer selection; automatic renderer thresholds are not established.
- **Scale.** The [worker explorer](https://docs.usequartile.com/examples/scale) reports actual bounded-query timings. [Measurement guidance](docs/guides/performance.md) describes their limits; no universal row-count or device-performance guarantee is claimed.
- **Screen-reader testing.** The keyboard model, summaries and table fallbacks exist, but they have not been tested with NVDA, JAWS or VoiceOver yet.
- **Managed platform services.** Quartile does not host notebooks, train models, persist records, provide multi-user authorization, or provision model accounts. The Python utility is a snapshot handoff; the model server is a local development example. [Workflow scope](docs/guides/data-science.md).

## Develop

Use Node 22.12 or newer and pnpm 10. The Vite toolchain also supports Node 20.19+; earlier Node 22 releases are not supported.

```sh
pnpm install
pnpm dev          # examples app at http://localhost:5173/examples
pnpm test         # library unit tests, including each documented example block
pnpm typecheck
pnpm lint
pnpm build        # library (dist/) and examples app
pnpm benchmark    # filtering microbenchmark and artifact sizes; build the library first
```

After `pnpm build:lib`, `node packages/react/dist/cli.js check README.md docs/language.md docs/guides/*.md --nested` checks the example blocks in the documentation the same way `quartile check` does in a project.

Read [docs/architecture.md](docs/architecture.md) before adding a component, and [docs/decisions](docs/decisions) for the decisions so far.

## Contributing

Issues and proposals are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and follow the [code of conduct](CODE_OF_CONDUCT.md) and [governance](GOVERNANCE.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not public issues.

## License

[Apache-2.0](LICENSE)

## Hosted-site analytics

The hosted examples app uses Vercel Web Analytics for page views, including client-side navigation. Query strings and fragments are removed from page-view URLs before sending. No custom data events are collected. Enable Web Analytics in the Vercel project before deploying. This integration is confined to the examples app (`apps/gallery`); the library and exported Studio starters do not include it.
