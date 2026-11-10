# Changelog

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
