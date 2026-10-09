# Design coverage and verification

This maps the supplied Quartile design's product claims to the implemented public preview. A rendered mockup, a scaffold, and a passing build are not interchangeable with a verified feature. Website sources remain in the separate private repositories.

| Design area | Current implementation | Evidence and limits |
| --- | --- | --- |
| Quarter-disc identity, paper/ink/signal palette, typography | Public logo, tokens, gallery, and brand guide | [Brand](brand.md), [tokens](../packages/react/src/styles/tokens.css); fonts have system fallbacks |
| Light/dark and comfortable/compact density | Provider and token remapping | [Provider](../packages/react/src/provider/QuartileProvider.tsx); live example controls exercise both |
| Actions, inputs, dates, navigation, overlays, feedback | React component families | [Components](../packages/react/src/components); controls render in the design gallery |
| KPI, FilterBar, detail tables | Shared schema/selection, sorting, grouping, pagination and virtualization | [Data display](../packages/react/src/data-display); clean consumer SSR and unit checks |
| Trends, comparisons, distributions, parts, flows | SVG line, area, bars, bar list, donut, scatter, histogram, box plot, calendar heatmap, heatmap, funnel and Sankey, plus sparklines | [Charts](../packages/react/src/charts); mixed-sign and selection regressions covered |
| Loading, empty, error, retry | Shared chart state contract | [ChartFrame](../packages/react/src/charts/core/ChartFrame.tsx) |
| Linked selection | In-memory predicates with source exclusion | [Selection](../packages/react/src/selection), [guide](guides/data-and-selection.md); not server authorization |
| Storefront/dashboard pattern | Functional storefront with period/comparison controls, filters, linked panels, URL state and exports | [Source](../apps/gallery/src/examples/storefront) |
| Broader analytic use cases | Subscription portfolio, operations, and declarative dashboard workbenches | [Recipes](guides/use-cases.md); samples are fictional, not provisioned backends |
| Machine-readable components | JSON Schema, validator, and spec renderer | [Spec](../packages/react/src/spec); no bundled model or arbitrary-code execution |
| Accessibility features | Keyboard models, generated summaries, chart table fallbacks | [Guide](guides/accessibility.md); manual screen-reader compatibility audit remains open |
| Performance evidence | Reproducible filtering/entry-size benchmark and 93 production-browser observations | [Filtering/artifacts](research/benchmark-worker-preview-2026-10-09.json), [browser report](../apps/gallery/src/examples/scale/MEASUREMENTS.md); frame opportunities are not guaranteed screen presentation, and JS heap excludes worker/Wasm/GPU memory |
| Canvas/WebGL renderer switching | Implemented for scatter points; other chart marks remain SVG | [Renderer contract](decisions/0003-accelerated-scatter.md), [guide](guides/renderers.md), capability fallback and paged exact data; no automatic scale threshold |
| Arrow/DuckDB and worker query execution | Optional Arrow 17 / DuckDB-Wasm 1.32 adapter, bounded linked views and remote pages | [Worker guide](guides/worker-queries.md), [decision](decisions/0002-worker-query-sources.md), [runnable explorer](../apps/gallery/src/examples/scale); active cancellation suppresses results but does not guarantee engine interruption |
| Million-row application behavior | Verified for the deterministic, bounded worker example | [Measured fixture](../apps/gallery/src/examples/scale/MEASUREMENTS.md) returns 2,030 rows across four views; this does not establish arbitrary million-mark rendering, total-memory limits or universal product capacity |
| Package publication and stable release | Locally packed source preview | Clean React 18/19 consumers verified; npm publication/name clearance and stable API gate remain open |

The mockup's adoption figures, sponsor/community links, version 1.0, and fixed bundle-size claims are not factual release metadata and are not used as evidence. The actual repository license is Apache-2.0.

## Reproduce the present verification

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @quartile/react test:package
pnpm benchmark
```

The browser acceptance flow is: select a SaaS plan and confirm the account count/KPI/table update while the source list retains alternatives; clear filters; switch chart/table, theme, and density; select an operations service using the keyboard; edit a spec through invalid JSON, unknown component, and valid resubmission; verify every example on a narrow viewport. These verify the named flows, not all browser/assistive-technology combinations.
