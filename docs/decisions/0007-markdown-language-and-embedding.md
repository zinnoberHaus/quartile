# 0007: A Markdown chart language, static rendering and embedding

Date: 2026-11-09 · Status: accepted for the preview

## Context

Quartile renders linked charts, tables and KPIs in React and validates JSON dashboard specs (ADR 0001, guides/generated-dashboards). Three uses were not served: authors writing dashboards in Markdown (documentation, reports, dbt projects); websites showing AI answers, where a model writes the chart inside its Markdown; and pages that are not React apps. Charts also rendered nothing on the server, because they waited to measure their container, so search engines and AI crawlers that do not run JavaScript saw no chart. The [November research](../research/markdown-ai-embedding-2026-11.md) records the evidence behind each decision below.

## Decision

1. **One language, written in a fenced code block.** A block starts with a sentence, `<kind> <measures> by <dimension> [and <dimension>]`, followed by optional `key: value` settings and, after `---`, data as CSV, TSV, a Markdown table or JSON. The fence language is `quartile`; hosts may add aliases. The specification is [docs/language.md](../language.md). JSON specs are accepted in the same fence. A block degrades to readable text in any Markdown renderer.
2. **It compiles to the existing contract.** `compileBlock` turns a block into a `QuartileSpec` plus datasets, validated by the existing `validateSpec`, and every block renders through `SpecView`. The language adds no second rendering path, and anything the JSON schema accepts is reachable from the language.
3. **The compiler, not the author, supplies defaults.** Field names are matched case-, separator- and typo-tolerantly with a reported note; unknown fields are errors that list the real columns, never silently replaced. Rows sharing a position are summed and rates averaged. Categories on a line keep their written order instead of being dropped. Missing encodings are inferred from column types. Diagnostics carry block line numbers.
4. **Data stays data.** No JavaScript, HTML, SQL or styling is accepted. `src:` names a URL, but nothing is fetched unless the host supplies a loader (React) or allows a source policy (embed: off by default, `same-origin` opt-in), so a prompt-injected block cannot send data to an arbitrary URL.
5. **Documents link by dataset.** Blocks over the same named dataset share one selection store; `data <name>` blocks define rows once per document; a dashboard block links its own views.
6. **Streaming is first-class.** While a block streams, its last line is held back (renderers append a newline to code blocks, so a newline is not proof of completion), errors wait until the block is complete, and rows draw as they arrive.
7. **Charts render on the server.** `ChartFrame` draws at `QuartileProvider initialWidth` (default 640) with a `viewBox` until it can measure, then redraws at the measured width. `theme="system"` and `theme="auto"` render `data-theme="system"`, resolved by CSS generated from the token file.
8. **Entries.** In the existing package (ADR 0001 keeps one package): `@quartile/react` adds `QuartileBlock`, `QuartileDocument` and Markdown renderer adapters; `@quartile/react/lang` (no React, no `'use client'`) holds the parser, compiler, prompt and dbt helpers; `@quartile/react/server` renders static HTML and provides remark and markdown-it plugins; `@quartile/react/embed` defines `<quartile-chart>`; `dist/embed/quartile(.global).js` is a standalone script with React and the stylesheet bundled. A separate npm name for the standalone build waits on the naming clearance in ADR 0001.
9. **Styling follows the host.** `host` presets map known design systems' CSS variables (shadcn/ui, VitePress, Docusaurus, Starlight, Material for MkDocs, Primer, Pico, Radix Themes, Open Props); `theme="auto"` reads the page's background and text colors in script; derived neutrals are mixed with `color-mix()` so light and dark modes follow the host. The embed renders in a shadow root: inherited color, font and `--q-*` variables cross it, page rules for tables, SVG and buttons do not.
10. **Models are taught, not trusted.** `quartilePrompt()` generates the system prompt from the language's tables; `quartileBlockTool()` and `quartileChartTool()` are tool schemas that satisfy OpenAI and Anthropic strict modes; compiler diagnostics serve one repair turn.
11. **dbt reuses dbt.** Helpers read `manifest.json` (column descriptions, types, `meta.quartile` display settings, metric labels) and `dbt show --output json`, and write exposure YAML. dbt Charts' single-chart YAML (`type`, `x`, `y`, `color`, `query` with inline `columns`/`values` or a query name) is accepted. Quartile does not run dbt or SQL.

## Consequences

- Every chart now renders SVG during server rendering and on the first client render. Tests that assumed an empty server render still pass; layout uses the assumed width until measurement.
- `SpecView` accepts several measures with aggregates, `Funnel.value` and `Sparkline.y` accept aggregated measures, and dashboards can join an outer selection (`linked`). These are additive schema changes.
- The standalone embed measures about 209 kB gzip (gzip -9) including React 19 and the stylesheet. A Preact build could cut React's share but needs the full test suite under `preact/compat` before it is offered.
- Static output cannot match an unknown host's colors without script; it uses the chosen or system theme until the embed upgrades it.
- The language and its tool schemas are a preview contract. Blocks may declare `version: 1`; an incompatible change would use a new version or fence name, not silently reinterpret existing blocks.
- Not built: images for hosts that cannot run scripts (GitHub READMEs, stock dbt docs without injection), Semantic Layer queries by metric name, a Preact standalone build, screen-reader testing of the new surfaces.
