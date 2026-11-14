---
name: quartile
description: Add Quartile charts to a project. Quartile is an open-source chart block. A fenced quartile code block (a sentence, optional settings, a few rows) becomes an interactive chart, KPI, table or dashboard in Markdown, in streamed AI answers and on web pages. Use when asked to add charts, KPIs or dashboards to Markdown content, a docs site, a chat or AI answer UI, or an HTML page, when the user says "use Quartile", or when editing files that contain quartile code blocks. Covers installing the preview build, wiring react-markdown, Streamdown, MDX, remark, markdown-it or a script tag, writing valid blocks, data sources, and validating with the quartile check command.
license: Apache-2.0
metadata:
  version: "3"
  status: preview
---

# Quartile

Quartile is an open-source chart block. A fenced `quartile` code block (a sentence, optional settings, a few rows) becomes an interactive chart, KPI, table or dashboard: in Markdown, in AI answers while they stream, and on a web page with one script tag.

Status: 0.1 preview, Apache-2.0, not on the npm registry. Follow the steps below in order. Prefer this file and the linked docs over what you remember: the syntax is new and can change between preview builds.

## When to use

- The user asks for charts, KPIs, tables or dashboards in Markdown content, a docs site, a chat or AI answer UI, or an HTML page.
- The user says "use Quartile", or the project already contains `quartile` blocks or depends on `@quartile/react`.

Quartile draws data. Do not use it for diagrams such as flowcharts or sequence diagrams.

## 1. Install

In a project with React, use the project's package manager:

```sh
npm install https://github.com/zinnoberHaus/quartile/releases/download/v0.1.0-preview.1/quartile-react-0.1.0-preview.1.tgz
```

- Do not run `npm install @quartile/react`. The package is not on the npm registry and the command fails.
- `pnpm add`, `yarn add` and `bun add` accept the same URL.
- The import name is `@quartile/react`. React 18.2 or newer and React DOM are peer dependencies.
- If `package.json` already lists `@quartile/react`, keep that build unless the user asks to change it.
- This is a preview build. Do not describe it as a release of 0.1.0 or as available on npm.

For a site without React or without a build step, download the standalone script into the folder the site serves static files from, and add it to the page template:

```sh
curl -L -o public/assets/quartile.global.js https://github.com/zinnoberHaus/quartile/releases/download/v0.1.0-preview.1/quartile.global.js
```

```html
<script src="/assets/quartile.global.js" data-theme="auto"></script>
```

Serve the file from the site itself. Do not link the release URL or a CDN from the page.

## 2. Detect the host and wire it

Read `package.json` and the code that renders Markdown. Use the first row that matches, and do not add a second Markdown renderer.

| The project has | Use |
|---|---|
| `streamdown` | A |
| `react-markdown` | B |
| MDX (`@mdx-js/*`, `@next/mdx`, Docusaurus, Nextra) | C |
| a unified or remark pipeline that writes HTML (a static-site generator, a build script) | D |
| `markdown-it` (VitePress and other generators) | E |
| none of these (plain HTML, MkDocs, Hugo, Jekyll, a CMS) | F |

For A, B and C: import `@quartile/react/styles.css` once at the app root. In the Next.js App Router, put the wiring in a file that starts with `'use client'`. Do not import `@quartile/react/server` from a server component or a route handler; it fails at build.

### A. Streamdown (streamed AI answers)

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

Passing `plugins` replaces the project's existing plugin set, so keep the plugins it already uses next to `renderers`.

### B. react-markdown

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

If the project already passes `components`, add `pre: QuartilePre` to that object. For a message that is still streaming, also pass `streaming` to `QuartileDocument`.

### C. MDX

Register `QuartilePre` as the `pre` component where the project defines its MDX components, and keep the existing entries. In Docusaurus:

```tsx
// src/theme/MDXComponents.tsx
import MDXComponents from '@theme-original/MDXComponents';
import { QuartilePre } from '@quartile/react';
import '@quartile/react/styles.css';

export default { ...MDXComponents, pre: QuartilePre };
```

In Next.js, return `{ ...components, pre: QuartilePre }` from `useMDXComponents` in `mdx-components.tsx`. Elsewhere, pass `components={{ pre: QuartilePre }}` to the MDX content or its provider. Wrap the page layout in `<QuartileDocument theme="system">` so blocks share datasets, selections and the theme.

### D. remark

```ts
import { remarkQuartile } from '@quartile/react/server';

// in the unified pipeline, before remark-rehype:
//   .use(remarkQuartile, { timeZone: 'UTC' })
//   .use(remarkRehype, { allowDangerousHtml: true })
//   .use(rehypeStringify, { allowDangerousHtml: true })
```

This writes each chart as SVG and a table into the HTML at build time. Add `@quartile/react/styles.css` to the page. Add the script from step 1 if readers should be able to hover, click and filter.

### E. markdown-it

```ts
import MarkdownIt from 'markdown-it';
import { markdownItQuartile } from '@quartile/react/server';

const md = new MarkdownIt();
markdownItQuartile(md, { timeZone: 'UTC' });
```

In VitePress, call `markdownItQuartile(md)` inside `markdown.config` in `.vitepress/config` and import the stylesheet in the theme. The stylesheet and script notes from D apply.

### F. Plain HTML

Add the script from step 1 to the page template. It draws `quartile` code blocks that the site's Markdown renderer already emits (`pre > code.language-quartile`) and `<quartile-chart>` elements:

```html
<quartile-chart>
  <script type="text/quartile">
    bar sum(revenue) by region
    ---
    region,revenue
    EMEA,1200000
    APAC,860000
  </script>
</quartile-chart>
```

If code blocks are not drawn, check that the generated HTML has a `language-quartile` class on the block.

## 3. Write blocks

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

1. First line: `<kind> <measures> by <field> [and <field>]`.
2. Optional `key: value` settings, one per line.
3. A line `---`, then rows as CSV with a header row (or a Markdown table, TSV or JSON).

**Kinds.** `line`, `area`, `bar` (`hbar` for horizontal), `barlist`, `donut` (`pie`), `scatter` (`scatter y vs x`), `histogram`, `box`, `heatmap`, `calendar`, `funnel`, `sankey`, `sparkline`, `kpi`, `table`, `explorer` (a table with search, sorting and export), `filters`, plus `data <name>` (a named dataset) and `dashboard <title>` (several views that share rows and filter each other).

**Measures.** `sum(x)`, `mean(x)` or `avg(x)`, `count`, or a plain column. `as "Label"` renames one. Several measures draw several series: `line revenue, cost by month`. After `by`, the first field is the x axis or category and the second splits series.

**Settings.** `title`, `subtitle`, `format` (`currency USD`, `percent`, `compact`, `integer`, `1 decimal`, `month`, or a d3 specifier such as `$,.0f`), `sort`, `limit`, `stacked`, `horizontal`, `smooth`, `height`, `x.label`, `y.label`, `<column>.label`, `<column>.format`, `<column>.description`, `data`, `span` (width in a dashboard, 1 to 12).

**Looks.** The page chooses colors and fonts, so add these only when asked or when they help: `colors: signal, #f26b3a` (only `signal`, `positive`, `negative`, `warning`, `muted`, `1` to `8`, or hex; other colors are refused), `y.min` and `y.max` (bars always start at zero), `y.ticks`, `grid: none`, `x axis: no`, `legend: top|bottom|left|right|none`, `labels: yes`, `reference: 1000000` with `reference.label: Target`, `margin: 16 24 32 48`, `y.scale: log`. Not each chart takes each setting: see the styling guide.

**Interaction.** Views over the same named dataset, or with the same `link: name`, filter each other without further settings; a block with its own rows publishes a selection only with `select: yes` (`brush: yes` on a line). `actions: table, rows, download` adds buttons for the view's table, the rows behind it and a CSV download; before the first view of a dashboard, `actions: rows, download` is one toolbar for the dashboard. `source:`, `source.url:` and `asof:` say where the numbers came from; `source:` is not a dataset name, so name a dataset with `data:`.

**A dashboard** is one block with several views over the rows after `---`:

```quartile
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
```

Writing rules:

- Name each field exactly as a column. Use snake_case column names; labels are written from them.
- Dates as `2026-03-15`, months as `2026-03`, quarters as `2026-Q1`. Numbers may be written as `$1,200`, `12%` or `1.2M`.
- Keep inline rows short: aggregate first, and reuse a `data <name>` block instead of repeating rows.
- Give each block a `title:`. Put units in `format:` or the title, not in the numbers.
- Keep blocks at the top level of the Markdown document, not inside lists or block quotes.

## 4. Data

A block gets rows in one of four ways. Choose the first that fits what the project already has.

1. **Inline rows** after `---`, for small data that is in front of you.
2. **A `data` block**: `data sales`, optional field settings, `---`, rows. Other blocks in the document read it with `data: sales`.
3. **A dataset the app passes**: `<QuartileDocument data={{ orders: rows }}>` in React, `datasets: { orders: rows }` in the static renderers. Blocks read it with `data: orders`. Use this for data that needs a query or authorization.
4. **A URL**: `src: /data/orders.csv` or a JSON API. It loads only where the host has allowed it.

```text
line sum(visitors) by day
src: https://api.example.com/v1/analytics/visitors?range=7d
path: data.results
refresh: 5m
```

- `path:` says where the rows are in a JSON response: keys and positions separated by dots (`data.items`, `results.0.series`). No wildcards or filters.
- `refresh:` reloads the URL: `30s`, `5m`, `1h`. The host sets the shortest interval.
- A host allows URLs with `loadSource={createSourceLoader({ origins: ['same-origin', 'https://api.example.com'] })}` on `QuartileDocument`, or `data-sources="same-origin https://api.example.com"` on the script tag. Exact origins only.
- Request headers such as an API key are set in the host's loader (`createSourceLoader({ origins, headers })`), never in a block. Keep secret keys on the server.

If the project has no loader or allowlist, use ways 1 to 3. Ask the user before you add an origin.

## 5. AI answer features

When the project's own model should answer with charts:

- Add `quartilePrompt()` from `@quartile/react/lang` to the system prompt. With `quartilePrompt({ datasets })` the model writes `data: name` for data the app supplies.
- Render answers with A or B and pass `streaming` while a message is in progress. `onSelectionChange` on `QuartileDocument` reports what the reader selects, for example to suggest a follow-up question.
- To validate a finished answer, run `compileBlock(block.source)` over `findFencedBlocks(answer)` (both from `@quartile/react/lang`) and feed errors back for at most one repair turn.
- For tool calls, `quartileBlockTool()` and `quartileChartTool()` return strict-mode schemas; `chartToolInputToBlock()` converts the typed input to block text.

## 6. Validate

After writing or editing blocks in Markdown files, run:

```sh
npx --no-install quartile check <files.md>
```

- Keep `--no-install`: without it, in a project where Quartile is not installed, `npx` would download whatever package is named `quartile` on the registry. With pnpm, run `pnpm exec quartile check <files.md>`.
- Each problem prints as `file:line: severity: message`. Exit status 1 means errors.
- Fix each error and run it again until it reports 0 errors. Read the warnings: a corrected spelling or an ignored setting usually means the block is not what you meant.
- An error such as `There is no column “profit”. Columns: region, revenue.` lists the real columns. Use one of them; do not rename the data to match.
- For a dataset the app supplies at run time, pass `--dataset orders=rows.csv` to check field names against real rows, or `--dataset orders` if no rows are at hand.
- For blocks held in strings in code, call `compileBlock(text)` from `@quartile/react/lang` in a test and assert that no diagnostic has the severity `error`.

Then run the project's own typecheck, tests and build, and load a page that shows a chart if you can.

## NEVER

- Never invent a kind or a setting. Use the ones in this file and in the language reference. An unknown setting, or a setting the kind does not have, is ignored with a warning, so the chart silently differs from what you wrote.
- Never replace Quartile with another chart library, or with a hand-written SVG or image, because a block failed. Read the diagnostic, fix the block, and tell the user if something is not supported.
- Never fetch data for a chart outside the host's loader or allowlist, and never add an origin, a `loadSource` or `data-sources` without the user's agreement. On pages that show model output, do not allow origins the project does not control.
- Never write numbers that were not given to you or computed from data you were given, and never state a `source:` you do not know. Do not fill a chart with sample values unless the user asked for sample data, and then say so in the title.
- Never put scripts, HTML, CSS, SQL or secrets in a block. Blocks are data. Do not turn off a host's `blockColors` or `actions` setting to make a block's line take effect.
- Never run `npm install @quartile/react`, and never tell the user the package is on npm or that this is a stable release.

## Docs

Each page has a Markdown rendition at the same URL with `.md` added.

- Syntax reference: https://docs.usequartile.com/docs/language.md
- Data sources (`src:`, `path:`, `refresh:`, loaders, security): https://docs.usequartile.com/docs/data-sources.md
- Styling and settings (which chart takes which setting): https://docs.usequartile.com/docs/styling.md
- Interaction (linking, actions, provenance, selection events): https://docs.usequartile.com/docs/interaction.md
- Markdown, MDX, remark, markdown-it: https://docs.usequartile.com/docs/markdown.md
- AI answers: https://docs.usequartile.com/docs/ai-answers.md
- Script tag, `<quartile-chart>`, theming and host presets: https://docs.usequartile.com/docs/embedding.md
- Server rendering: https://docs.usequartile.com/docs/server-rendering.md
- Installation: https://docs.usequartile.com/docs/installation.md
- Coding agents (this skill, the AGENTS.md snippet, the check command): https://docs.usequartile.com/docs/ai-coding-agents.md
- Index of pages: https://docs.usequartile.com/llms.txt
- Source and issues: https://github.com/zinnoberHaus/quartile
