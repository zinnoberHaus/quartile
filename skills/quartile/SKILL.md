---
name: quartile
description: Write Quartile Markdown chart blocks (```quartile fences that turn a sentence and CSV rows into interactive charts and dashboards) and integrate Quartile into React apps, AI chat UIs, static docs sites, plain HTML pages and dbt projects. Use when adding charts to Markdown, rendering charts in streamed AI answers, server-rendering charts for SEO, embedding charts in non-React pages, or matching chart styling to a host design system.
license: Apache-2.0
metadata:
  version: "1"
  status: preview
---

# Quartile

Quartile is a React library of linked charts, tables and KPIs plus a Markdown chart language. The package `@quartile/react` is an unpublished preview; install it from a local tarball as described in `docs/guides/installation.md`. Never claim it is on npm.

## Writing a block

A block is a fenced code block with the language `quartile`:

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

1. First line: `<kind> <measures> by <dimension> [and <dimension>]`.
2. Optional `key: value` settings.
3. `---`, then rows as CSV with a header (or a Markdown table, TSV or JSON).

Kinds: `line`, `area`, `bar` (`hbar`), `barlist`, `donut` (`pie`), `scatter` (`y vs x`), `histogram`, `box`, `heatmap`, `calendar`, `funnel`, `sankey`, `sparkline`, `kpi`, `table`, `filters`, plus `data <name>` (a named dataset) and `dashboard` (several views sharing rows, filtering each other).

Measures: `sum(x)`, `mean(x)`/`avg(x)`, `count`, or a plain column. `as "Label"` renames. Rows sharing a position are summed and rates averaged automatically.

Useful settings: `title`, `subtitle`, `format` (`currency EUR`, `percent`, `compact`, `integer`, `1 decimal`, `month`, d3 specifiers like `$,.0f`), `sort`, `limit`, `stacked`, `horizontal`, `smooth`, `height`, `x.label`, `<column>.description`, `data: <name>`, `span` (dashboards).

Rules:

- Only chart data you have. Name every field exactly as a column; snake_case columns get readable labels automatically.
- Keep inline rows short (aggregate first). Reuse a `data <name>` block instead of repeating rows.
- No JavaScript, HTML, styling or URLs in blocks; the page chooses colors and fonts. `src:` URLs load only if the host page allows them.
- Dates as `2026-03-15`, months `2026-03`, quarters `2026-Q1`; numbers may include `$`, `%`, `1.2M`.

The full reference is `docs/language.md`; `compileBlock(text)` from `@quartile/react/lang` returns the spec and line-numbered diagnostics for any block.

## Integrating

| Context | Use |
|---|---|
| React + react-markdown | `<QuartileDocument markdown={md}><Markdown components={{ pre: QuartilePre }}>{md}</Markdown></QuartileDocument>` |
| Streamed AI answers (Streamdown / AI Elements) | `<Streamdown isAnimating={streaming} plugins={{ renderers: [quartileRenderer()] }}>` inside `<QuartileDocument streaming={streaming}>` |
| MDX (Docusaurus, Next.js) | MDX components `{ pre: QuartilePre }` |
| remark / markdown-it builds | `remarkQuartile` (needs `allowDangerousHtml`) or `markdownItQuartile` from `@quartile/react/server` |
| Any HTML page | `<script src="quartile.global.js" data-theme="auto"></script>` (file from `dist/embed/`) |
| Server components, build scripts | `@quartile/react/lang` and `@quartile/react/server` (no `'use client'`) |
| dbt | `dbtDataset(showJson, { manifest, model })`, `dbtFields`, `dbtExposureYaml`; see `examples/dbt` |

Import `@quartile/react/styles.css` once in React apps. Pass authorized rows as `data={{ orders }}`; blocks read them with `data: orders`. Blocks over the same dataset share a selection.

## Teaching a model

- `quartilePrompt({ datasets })` returns the system-prompt section; with `datasets`, the model references them by name.
- `quartileBlockTool()` (one `block` string) and `quartileChartTool()` (typed arguments, convert with `chartToolInputToBlock`) satisfy OpenAI and Anthropic strict modes.
- Compile model output with `compileBlock`; feed back errors (they list real columns) for at most one repair turn.

## Styling

`theme`: `light`, `dark`, `system` (CSS-resolved, SSR-safe) or `auto` (reads the host page's colors). `host`: `shadcn`, `shadcn-hsl`, `vitepress`, `docusaurus`, `starlight`, `mkdocs`, `primer`, `pico`, `radix`, `open-props`. `accent`: a brand color. Override tokens with `--q-*` variables (React: on a provider class; embed: `quartile-chart::part(root)`).

## Verify

From the repository: `pnpm test` (library, including every documented example block), `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `node --test examples/dbt/dbt.test.mjs` after a build.
