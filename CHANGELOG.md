# Changelog

## Unreleased — the chart block: command line, data sources and preview builds

- The project is now described as the open-source chart block for Markdown, AI answers and web pages. The README, the package description, the guides index and the agent skill lead with the block; the React component library is documented as the engine underneath. No API was removed.
- A `quartile` command (package `bin`). `quartile check <file.md …>` compiles each `quartile` block in Markdown files and prints `file:line: severity: message`; it exits 1 on errors (and on warnings with `--strict`) and 2 when it cannot run. Options: `--dataset name=rows.csv`, `--dataset name`, `--lang`, `--nested`, `--notes`, `--json`, and `-` for standard input. `quartile prompt` prints the `quartilePrompt()` text.
- Data sources. `path:` (also `rowspath`, `datapath`, `jsonpath`) names where the rows are in a JSON response or in inline JSON, as dot-separated keys and positions; the JSONPath spellings `$.data.items`, `results[0].series` and `data['items']` are read with a note. Without a path, an object with one list of rows is unwrapped, a key named `rows`, `data`, `results`, `items` or `records` is preferred when several keys hold lists, and bare arrays take their column names from a neighbouring `columns`, `cols`, `fields` or `schema` key. `{ "rows": [...] }` and `{ "data": [...] }` were previously read as one column of objects.
- `refresh:` (`30s`, `5m`, `1h`, seconds) reloads a block's `src:` while the page is visible and the block is mounted, keeping the last rows when a reload fails. Hosts set the shortest interval with `QuartileDocument minRefresh` or `data-min-refresh` (10 seconds by default).
- `createSourceLoader({ origins, base, headers, maxBytes, timeoutMs, fetch })`, exported from `@quartile/react` and `@quartile/react/lang`: a loader for `QuartileDocument loadSource` and the server renderers that reads exact origins only, http(s) only, omits credentials off the page's origin, limits a response to 5 MB and 15 seconds by default, and takes request headers from host code only.
- Embed: `data-sources` accepts `none`, `same-origin` and exact origins (`data-sources="same-origin https://api.example.com"`); `Quartile.reload(url?)`; `configure({ sources, minRefresh, maxBytes, timeoutMs, loadSource })`. A refused URL says what the page allows.
- `QuartileDocument` loads each URL once, retries a failed source instead of caching the failure, and offers `reload(url?)` on its ref. A `data` block's field settings now reach other blocks when its rows come from `src:`. Server `loadSource` results go through the block's `path:`, and a source that cannot be read fails the render.
- Fixed: a `filters` block failed to compile; its fields are now written as the field objects `FilterBar` expects. A test compiles and server-renders one block per documented kind.
- The examples app is served under `/examples` (`/examples/playground`, `/examples/studio`, `/examples/embed/demo`; other example paths are unchanged) and published at `https://docs.usequartile.com/examples`. The former paths redirect. The component catalog is available in development only.
- A manually run workflow, `.github/workflows/preview-build.yml`, tests, builds and packs the package and attaches the tarball, `quartile.global.js`, `quartile.js` and their SHA-256 checksums to a GitHub pre-release tagged `vX.Y.Z-preview.N`. A preview build is not a release of 0.1.0 and nothing is published to npm.
- Documentation: new guides for [data sources](docs/guides/data-sources.md) and [AI coding agents](docs/guides/coding-agents.md); the installation guide leads with the preview build; the server rendering guide states which entry runs where, including that `@quartile/react/server` does not run inside React Server Components; the skill in `skills/quartile` is rewritten as the file a coding agent follows.

## Unreleased — Markdown language, static rendering and embedding

- A Markdown chart language: ```` ```quartile ```` blocks with a sentence header (`bar sum(revenue) by region`), `key: value` settings and CSV, TSV, Markdown-table or JSON rows, compiled to the existing validated spec. Typed coercion of written values (`$1,200`, `12%`, `1.2M`, `2026-03`, `2026-Q1`), tolerant field matching with line-numbered diagnostics, inferred encodings, default aggregation, ordered categories on line charts, dashboards with automatic layout, named `data` blocks and document-wide linked selection. Specification in `docs/language.md`; decision in ADR 0007.
- `QuartileBlock`, `QuartileDocument` and adapters for react-markdown (`QuartilePre`, `QuartileCode`) and Streamdown (`quartileRenderer`), with incremental rendering of streaming answers.
- `@quartile/react/lang` (parser, compiler, `quartilePrompt`, strict-mode tool schemas, dbt manifest and `dbt show` helpers) and `@quartile/react/server` (`renderBlockToHTML`, `remarkQuartile`, `markdownItQuartile`), both without the client directive.
- `@quartile/react/embed` and a standalone script defining `<quartile-chart>`, upgrading Quartile code blocks on any page, sharing datasets and selections page-wide, and loading `src:` data only under an explicit same-origin policy.
- Charts render SVG during server rendering and on the first client render at `QuartileProvider initialWidth`, scaled by `viewBox` until measured.
- `theme="system"` is resolved by generated CSS before any script runs; `theme="auto"` matches the surrounding page; `host` presets map ten design systems' CSS variables; `accent` sets a brand color.
- Spec additions: arrays of aggregated measures, aggregated `Funnel.value` and `Sparkline.y`, and `SpecView linked`.
- Gallery: the Markdown language playground, a streamed AI answer rendered with Streamdown, a Markdown report and a plain-HTML embed demo. A dbt example under `examples/dbt`.

## Unreleased — worker queries and scatter renderers

- Optional query and DuckDB entry points: Arrow ingestion, bounded aggregate/detail/histogram plans, source-excluding selection, result generation checks, cancellation, and explicit resource ownership.
- Query KPI, category totals, and remote table pages; external table sorting preserves worker ordering and exact matching totals.
- Canvas and WebGL scatter marks with shared selection, keyboard interaction, theme/DPR updates, capability fallback, and paged exact-data access.
- A deterministic worker explorer and public setup, renderer, and measurement guidance. These APIs remain experimental in the unpublished preview.

## Unreleased preview

- Added SaaS subscription analytics, service-health investigation, and an editable validated JSON dashboard to the gallery.
- Added public installation, data/selection, use-case, integration, generated-dashboard, accessibility, performance, and brand guides.
- Split gallery routes into separately loaded modules and added a reproducible filtering/artifact benchmark.
- Fixed negative-value domains and mixed-sign stacked chart geometry while keeping net totals in accessible tables.
- Fixed linked spec aggregation reapplying already-consumed filters to collapsed rows.
- Kept line, area, and bar series discoverable when linked filtering leaves a previously hidden series.
- Validated the JSON playground's dataset and field references before replacing its working view.
- Hardened malformed specs, nonfinite numeric values, and inherited dataset-name lookups.
- Fixed equivalent date values toggling incorrectly in selections.
- Added clean packed-package consumer checks, license/readme metadata, required declaration dependencies, and warning-free DataTable server rendering.
- Contained command-menu scrolling to its own list so inline palettes do not move the whole page on mount.

This is an unpublished preview. No npm release or stable API is implied by this changelog.
