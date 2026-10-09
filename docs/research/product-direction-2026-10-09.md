# Product direction: evidence and practical differentiation

Checked 2026-10-09 against the primary sources below. This supplements the broader [landscape survey](landscape-2026-10.md); it does not refresh that survey's historical version, star, or download counts. Product recommendations here are our inference, not independent evidence of demand or adoption.

## What the comparisons establish

| Primary evidence | Consequence for Quartile |
| --- | --- |
| [Mosaic](https://idl.uw.edu/mosaic/what-is-mosaic/) coordinates client data queries, linked selections, and database processing. Its optimizations include preaggregation and reducing a time series to a small number of samples per pixel. | Shared selection alone is not novel. A credible advantage needs dependable React composition, consistent controls/tables, and straightforward application integration. Scale requires a query/aggregation architecture, not just a faster mark renderer. |
| [Apache ECharts](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/) supports Canvas and SVG, and describes hardware-, workload-, and feature-dependent tradeoffs. It recommends experimentation when performance becomes a problem. | Do not repeat the mockup's fixed 5k/250k renderer thresholds as measured rules. Benchmark representative workloads first; compare the cost of data processing and marks independently. |
| [shadcn/ui charts](https://ui.shadcn.com/docs/components/base/chart) compose Recharts directly with chart configuration, tooltip, and legend components. The source is intended to be owned by the consuming app. | Coexistence is more useful than asking users to replace their UI system. Document token mapping and embed Quartile's linked analytic surface inside an existing product. A package must justify the extra dependency through coordinated behavior and a stable contract. |
| [AG Charts accessibility](https://www.ag-grid.com/charts/react/accessibility/) documents keyboard and screen-reader behavior and its testing expectations. | Generated summaries and keyboard handlers are only part of accessibility. A manual compatibility matrix and realistic task-based verification are necessary before making broad accessibility claims. |

## A useful product promise

**Inference:** the strongest near-term promise is “the same data, the same selection, across the whole analytic surface.” A user should be able to select a category, inspect a distribution, and read the records behind a KPI without application-specific glue in every view. This is testable, unlike a claim to be the fastest or a future industry standard.

The preview demonstrates that promise in four distinct tasks: storefront attribution, subscription segmentation, service-health investigation, and declarative dashboard authoring. Each has a runnable implementation and an explanation of row grain, denominators, and selection behavior. The examples are evidence of implemented workflows, not evidence of production adoption.

## What this research changes in the implementation

- Source installation now exercises an actual packed artifact in strict TypeScript consumers. Workspace-only builds had hidden declaration dependencies.
- Linked aggregation now preserves selection semantics when selected dimensions disappear during aggregation.
- Negative and mixed-sign data have regression coverage, rather than assuming every business measure is positive.
- Public integration guidance explains server authorization, metric grain, theme mapping, and the difference between schema validity and analytic correctness.
- The performance harness measures only what it actually does: synchronous filtering and artifact sizes. Rendering claims require separate browser measurements.

## Evidence still required for a broader launch

The design's Canvas/WebGL, Arrow/DuckDB, million-row, stable-release, and ecosystem claims are not established by the current implementation. Before those claims become product copy, each needs working code, an explicit compatibility contract, representative end-to-end benchmarks, and use-case validation. A documented preview with reproducible examples is the current deliverable; it does not substitute for those larger capabilities.

Adoption should be judged through real integration outcomes: time to a linked view, correctness after filters, compatibility with existing themes, keyboard task completion, and maintainers' ability to review/ship fixes. Star and download targets are not implementation acceptance criteria.
