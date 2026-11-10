# Charts in Markdown, in AI answers and on any page (November 2026)

Checked 2026-11-09 against the primary sources linked inline: official documentation, source files, release notes, papers and the npm/PyPI registries. It extends the [October landscape](landscape-2026-10.md) and the [product-direction note](product-direction-2026-10-09.md), which covered chart libraries in general. Sentences marked **Opinion** are our judgement. Measurements marked **Measured** were run locally and are described with their method. The decisions this research led to are in [ADR 0007](../decisions/0007-markdown-language-and-embedding.md); the language itself is specified in [docs/language.md](../language.md).

## The question

Can one small, data-driven chart language let people and models put charts and dashboards directly into Markdown, so that:

- a website showing AI answers renders them without choosing a chart library per answer;
- documentation sites, reports and dbt projects can write dashboards as text;
- the same block renders on a server (for search engines and readers without JavaScript), in React, and on any HTML page;
- the result looks like the page it lands in?

## 1. How charts are written in Markdown today

| Approach | Example | Data | Where it renders | In a renderer that does not know it |
|---|---|---|---|---|
| Mermaid ([xychart](https://github.com/mermaid-js/mermaid/blob/develop/docs/syntax/xyChart.md), [pie](https://github.com/mermaid-js/mermaid/blob/develop/docs/syntax/pie.md), [sankey](https://github.com/mermaid-js/mermaid/blob/develop/docs/syntax/sankey.md)) | ```` ```mermaid ```` + `xychart` / `pie` statements | Inline values only | Browser; [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) at build time | A code block |
| Evidence ([components](https://docs.evidence.dev/core-concepts/components), [migration guide](https://docs.evidence.dev/migration-guide)) | `{% line_chart data="demo.daily_orders" x="date" y="sum(sales)" %}` | Named SQL queries or tables; the component "writes its own SQL" | Server | Literal tag text |
| Observable Framework ([plot](https://github.com/observablehq/framework/blob/main/docs/lib/plot.md)) | ```` ```js ```` with `Plot.rectY(…)` | Build-time data loaders | Browser JavaScript | Code blocks |
| Quarto ([OJS](https://quarto.org/docs/interactive/ojs/), [dashboards](https://quarto.org/docs/dashboards/)) | ```` ```{ojs} ````, `format: dashboard` | Executed Python/R/OJS cells | Static pages or Shiny | Code blocks |
| Vega-Lite fences ([HedgeDoc](https://github.com/hedgedoc/hedgedoc/blob/develop/frontend/src/extensions/external-lib-app-extensions/vega-lite/vega-lite-markdown-extension.ts), [mkdocs-charts-plugin](https://github.com/timvink/mkdocs-charts-plugin)) | ```` ```vega-lite ```` + JSON (fence name varies by host) | Inline `values` or `data.url` | Browser ([vega-embed](https://github.com/vega/vega-embed)) | A code block of JSON |
| GPT-Vis ([README](https://github.com/antvis/GPT-Vis)), markdown-ui ([npm](https://www.npmjs.com/package/@markdown-ui/react)), AntV Infographic ([README](https://github.com/antvis/Infographic)) | ```` ```vis bar ```` + indented data; `chart-line` + CSV | Inline | Browser, designed to render while streaming | A code block |
| **dbt Charts** ([docs](https://docs.dbtcharts.com/boards/content/), [repo](https://github.com/dbt-labs/dbt-charts)) | ```` ```charts ```` with YAML `type`, `query`, `x`, `y`, `color` | Inline `columns`/`values`, named SQL, or `{{ ref() }}` from the manifest | Python CLI renders SVG/PNG/PDF/HTML; a static mode swaps fences for SVG images | "Readable YAML" |

- GitHub renders only `mermaid`, `geojson`, `topojson`, `stl` and math fences ([docs](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)), sanitizes `script` tags and `class`/`id` attributes ([github/markup](https://github.com/github/markup)), and proxies images through Camo. Third-party charts reach a README only as images.
- dbt Charts (Apache-2.0, 0.11.1 on [PyPI](https://pypi.org/project/dbt-charts/), beta, announced 2026-09-16) is the closest prior art for dbt projects: charts as YAML inside dbt Markdown pages, rendered server-side.
- Evidence moved from JSX-like components (`<LineChart data={q} …/>`) to Markdoc tags, with aggregation written inside the attribute (`y="sum(sales)"`), and states that "JS is not executed" ([migration guide](https://docs.evidence.dev/migration-guide)).
- MDX "is a programming language… If you don't [trust your authors], it's unsafe" ([MDX security](https://mdxjs.com/docs/getting-started/#security)); model output is untrusted.

**Fence names.** CommonMark 0.31.2 §4.5 treats the first word of the info string as the language by convention only, keeps the rest as free text, and runs an unclosed fence to the end of the document ([spec](https://spec.commonmark.org/0.31.2/#fenced-code-blocks)). mdast exposes `lang` and `meta` ([mdast](https://github.com/syntax-tree/mdast#code)); conversion to HTML sets `class="language-<first word>"` ([mdast-util-to-hast](https://github.com/syntax-tree/mdast-util-to-hast/blob/main/lib/handlers/code.js)) and appends a newline to the code text; markdown-it exposes `token.info` ([token.ts](https://github.com/markdown-it/markdown-it/blob/master/src/token.ts)). `chart` and `charts` are taken (Obsidian Charts, markdown-it-chart, dbt Charts); the common react-markdown pattern `/language-(\w+)/` ([README](https://github.com/remarkjs/react-markdown#use-custom-components-syntax-highlight)) truncates hyphenated names. GitHub Linguist has no `quartile` entry and maps `.qmd` to RMarkdown ([languages.yml](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml)).

**Opinion:** a fenced code block is the only syntax that every CommonMark renderer keeps as readable text and that every Markdown toolchain exposes as a hook. A one-word, hyphen-free fence name avoids collisions.

## 2. How AI answers are rendered

- Vercel **Streamdown** 2.7.1 ([README](https://github.com/vercel/streamdown/blob/main/packages/streamdown/README.md)) is a react-markdown replacement for streamed output. Custom fence renderers (`plugins.renderers: [{ language, component }]`) receive `{ code, language, isIncomplete, meta }` ([custom renderers](https://github.com/vercel/streamdown/blob/main/apps/website/content/docs/custom-renderers.mdx)); it ships code, math, Mermaid and CJK plugins and no chart plugin ([packages](https://github.com/vercel/streamdown/tree/main/packages)). Vercel's AI Elements `MessageResponse` is a memoised Streamdown ([source](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx)).
- react-markdown 10.1.0 overrides `components.code`/`pre`; assistant-ui offers `componentsByLanguage` ([docs](https://github.com/assistant-ui/assistant-ui/blob/main/apps/docs/content/elements/markdown-text.mdx)); markdown-it overrides `renderer.rules.fence`; marked overrides `renderer.code`.
- Large chat products are adding their own built-in visual formats (ChatGPT's interactive charts and "Intelligent UI", Claude's custom visuals, Gemini's in-chat visualizations); their formats are not public ([OpenAI release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes), [Claude help](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork), [Gemini blog](https://blog.google/innovation-and-ai/products/gemini-app/3d-models-charts/)). Their exact rendering details could not be verified beyond these pages.
- Generative-UI protocols express a chart as a component in a validated catalog: json-render (Zod catalog, JSONL patch streaming, [README](https://github.com/vercel-labs/json-render)), A2UI v1.0 (JSONL envelopes, JSON Schema catalogs, a `VegaChart` catalog, [protocol](https://github.com/a2ui-project/a2ui/blob/main/specification/v1_0/docs/a2ui_protocol.md)), MCP Apps (`ui://` resources, best-effort partial tool input, [spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)), AG-UI (transport events, [docs](https://docs.ag-ui.com/concepts/events)), and AI SDK 7 tool parts that stream a partial input ([guide](https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/04-generative-user-interfaces.mdx)). A2UI v1.0 and MCP Apps both take theme and fonts from the host.

**Opinion:** third-party AI chat sites are the open niche: they need a renderer that works with the Markdown pipeline they already use, starts drawing before the fence closes, and takes their styling.

## 3. What models get right and wrong

- LIDA: 3.5% of generated charts failed to run overall, 95.8–99.3% with no data summary in the prompt and 7.0–9.5% with field names only ([ACL 2023](https://aclanthology.org/2023.acl-demo.11.pdf)).
- VisEval: GPT-4's matplotlib code failed to run 3.3% of the time, but 21.4% of its charts were wrong; non-existent columns, wrong transformations and wrong chart types were the error classes ([paper](https://arxiv.org/html/2407.00981)).
- Small open models writing Vega-Lite chose the mark type correctly about 96% of the time; "77.69% of the incorrect outputs are due to Vega-Lite format errors" ([arXiv 2401.11255](https://arxiv.org/html/2401.11255v2)).
- Compact semantic specs compiled deterministically beat writing Vega-Lite directly: Flint won 41–45% / lost 34–38% against direct Vega-Lite across three models ([arXiv 2607.20775](https://arxiv.org/html/2607.20775v1)); Raiven compiled 100% of 100 tasks with a DSL plus deterministic compiler ([abs](https://arxiv.org/abs/2604.10008)).
- Repair loops help only with real feedback: MatPlotAgent rose from 48.86 to 61.16 with visual feedback ([paper](https://arxiv.org/html/2402.11453v3)).

**Opinion:** models choose chart types well and fail on grammar and on matching the data. Keep what the model writes small, check every field against the data, fill defaults deterministically, and return line-numbered errors for at most one repair turn.

## 4. Tokens and streaming

- **Measured** (o200k_base tokenizer; one 12-row, two-series line chart with its data inline): pretty-printed Vega-Lite JSON 595 tokens, minified Vega-Lite 354, YAML 341, minified compact chart JSON 292, a TOON-style encoding 216, a line-based header with CSV rows 191, CSV alone 162. The data rows dominate the cost.
- TOON's own benchmark measures reading, not writing, with overlapping confidence intervals ([repo](https://github.com/toon-format/toon)); independent studies found plain JSON most accurate for generation and TOON's teaching prompt cancelling its savings on short outputs ([arXiv 2603.03306](https://arxiv.org/abs/2603.03306)).
- Formats that complete at each newline (CSV and Markdown-table rows, JSONL, line statements) render incrementally; JSON and YAML need repair or re-parsing (AI SDK `parsePartialJson`, [source](https://github.com/vercel/ai/blob/main/packages/ai/src/util/parse-partial-json.ts)).

**Opinion:** a short header of named settings followed by CSV rows is about 1.5× smaller than minified JSON, needs no positional arguments or declared counts, and every newline completes a renderable unit.

## 5. Structured outputs

OpenAI strict mode requires every property to be required and an object root; Anthropic strict tools do not support numeric or length bounds and limit optional and union parameters; Gemini ignores unsupported keywords ([OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs), [Anthropic](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Gemini](https://aistudio.google.com/docs/structured-output?generate-content=true)). Quartile's existing `schema.json` has a `oneOf` root, 9 `oneOf`, 108 `$ref`, 314 optional properties and many numeric bounds, so it cannot be used as a strict schema as is.

**Opinion:** keep `schema.json` as the validator, and offer separate tool schemas that satisfy every strict mode — one string argument holding the block text, and one typed form with every property required and nullable.

## 6. Embedding, server rendering and style matching

- **Measured** with Playwright 1.63 (Chromium 153, Firefox 155, WebKit 26.6): server-rendered Declarative Shadow DOM hydrated with React 19.3 `hydrateRoot(shadowRoot)` without warnings; the page's `color`, `font-family` and custom properties reached SVG inside the shadow root; a `@property` rule inside a shadow root was ignored in all three engines. Declarative Shadow DOM is Baseline widely available since 2026-08-20 ([web status](https://webstatus.dev/features/declarative-shadow-dom)).
- Inherited properties cross a shadow boundary; page selectors do not ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM), [web.dev](https://web.dev/articles/shadowdom-v1)).
- **Measured:** `var(--background, red)` does not fall back when `--background` holds bare HSL channels (Tailwind v3-era shadcn/ui); the value is invalid at computed time in all three engines, as the spec's guaranteed-invalid rule implies ([css-variables-1](https://www.w3.org/TR/css-variables-1/)). Host variables must be mapped per design system or validated in script.
- `color-mix()` and OKLCH are Baseline widely available since 2025-11-09; `light-dark()` becomes widely available on 2026-11-13 ([web status](https://webstatus.dev/features/color-mix)).
- Host variable names were verified for shadcn/ui, Tailwind v4, Radix Themes, Open Props, Pico, GitHub Primer, Docusaurus (Infima), VitePress, Starlight and Material for MkDocs (sources in the [embedding guide](../guides/embedding.md#host-presets)).
- **Measured:** Recharts 3.10.1 emitted no `<svg>` under `renderToString`, with fixed sizes, `responsive` or `initialDimension` ([issue](https://github.com/recharts/recharts/issues/5997)); ECharts' SSR needs explicit width and height ([handbook](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/)); Observable Plot renders with a supplied `document` at a nominal width with `viewBox`, `max-width: 100%`, `height: auto` ([getting started](https://github.com/observablehq/plot/blob/main/docs/getting-started.md)).
- **Measured** gzip sizes for plain-HTML use: Vega + Vega-Lite + Vega-Embed ≈ 283 KB, ECharts full ≈ 368 KB, React 19.3 + react-dom/client ≈ 78.5 KB, Preact 11 core + hooks + compat ≈ 10.7 KB.

## 7. Search engines and AI crawlers

- Google renders JavaScript but recommends server-side or static rendering because "not all bots can run JavaScript", and calls dynamic rendering a workaround ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [dynamic rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)). It flattens shadow and light DOM and indexes what is visible after rendering.
- Vercel's December 2024 analysis found that "none of the major AI crawlers currently render JavaScript" (GPTBot, ClaudeBot, PerplexityBot), apart from Gemini and Applebot ([Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)).
- Vercel serves files before applying rewrites, and `cleanUrls` serves `about.html` at `/about` ([vercel.json](https://vercel.com/docs/project-configuration/vercel-json)).
- `SoftwareApplication` rich results require offers and ratings ([Google](https://developers.google.com/search/docs/appearance/structured-data/software-app)); `WebSite` sets the site name ([Google](https://developers.google.com/search/docs/appearance/site-names)). llms.txt is a proposal with weak evidence of use ([llmstxt.org](https://llmstxt.org/), [Ahrefs study](https://ahrefs.com/blog/llmstxt-study/)); Google says no special files are needed for its AI features ([Google](https://developers.google.com/search/docs/appearance/ai-features)).

**Opinion:** charts that exist only after client JavaScript are invisible to most AI crawlers. Static SVG plus an HTML data table in the served HTML is the dependable route to being read, quoted and indexed.

## 8. dbt

- dbt v2 (a Rust rewrite, Apache-2.0 source) is generally available since 2026-09; the Python line continues as dbt v1 (dbt-core 1.12.6) ([dbt Summit post](https://www.getdbt.com/blog/dbt-summit-2026-product-announcements), [repo](https://github.com/dbt-labs/dbt), [PyPI](https://pypi.org/project/dbt-core/)). dbt Labs and Fivetran completed their merger on 2026-06-01 ([post](https://www.getdbt.com/blog/fivetran-dbt-labs-complete-merger-to-create-the-data-infrastructure-for-trusted-ai-agents)).
- Model and column descriptions are Markdown; the docs site has no plugin or script extension point (v1 renders with marked, v2 with react-markdown and rehype-raw) ([docs](https://docs.getdbt.com/docs/build/documentation), [v1 source](https://github.com/dbt-labs/dbt-docs/blob/main/src/app/index.module.js), [v2 source](https://github.com/dbt-labs/dbt/blob/main/crates/dbt-docs-server/dbt-docs-lib/lib/shared/components/DescriptionDisplay.tsx)).
- `manifest.json` (schema v12, dbt 1.8 to v2.0) holds `nodes`, `sources`, `metrics`, `semantic_models`, `saved_queries` and `exposures` ([schema](https://schemas.getdbt.com/dbt/manifest/v12.json)); `dbt show --output json` prints result rows, and `--inline` cannot guarantee the query does not modify the warehouse ([docs](https://docs.getdbt.com/reference/commands/show)); exposures declare dashboards that depend on models ([docs](https://docs.getdbt.com/docs/build/exposures)).
- MetricFlow moved to Apache-2.0 from version 0.209.0 ([announcement](https://www.getdbt.com/blog/dbt-labs-affirms-commitment-to-open-semantic-interchange-by-open-sourcing-metricflow), [PyPI](https://pypi.org/project/metricflow/)); the Open Semantic Interchange became Apache Ossie (incubating), with spec 0.1.1 and a 0.3.0 draft ([repo](https://github.com/apache/ossie)).

**Opinion:** for dbt users Quartile should reuse what dbt already documents (column descriptions, types, metric labels), accept dbt Charts' single-chart YAML so existing fences render interactively, and leave query execution to dbt.

## Not verified

GitHub's exact Mermaid version; ChatGPT, Gemini and Copilot rendering internals; whether ChatGPT forwards partial tool input to widgets; how screen readers support the WAI-ARIA graphics roles; whether non-rendering crawlers read declarative-shadow-root `<template>` content; email-client SVG support; Hex or Steep chart-as-code formats.
