# Performance and scale

The preview has two data paths: synchronous JavaScript rows and optional [Arrow/DuckDB worker queries](worker-queries.md). Scatter points can use [SVG, Canvas or WebGL](renderers.md); other chart marks remain SVG. Querying many source records and drawing many marks are different workloads. Measure both in your actual application; neither path supplies a universal scale guarantee.

## Reproduce a narrow benchmark

```sh
pnpm build:lib
pnpm benchmark
```

The [benchmark](../../scripts/benchmark.mjs) reports the Node/runtime/CPU, three-predicate filtering at 1k/10k/100k rows, built JS/CSS/schema byte sizes, and the reachable local JS files for each entry point. It warms each case, records 50 samples, and reports median/p95. It is a synchronous filtering microbenchmark, **not** a browser render, network, memory-limit, or end-to-end interaction benchmark. Results vary by machine. Entry graph sizes include shared chunks but exclude external dependencies and worker/Wasm assets; they are not per-component tree-shaken application bundles.

A [recorded run from 2026-10-09](../research/benchmark-2026-10-09.json) includes the inputs, matching row counts, hardware/runtime, and measured timings. Rerun on your target environment; do not treat that machine's results as product limits.

## Reduce work deliberately

- Bound the data window and columns returned from the server. Enforce access rules before sending rows.
- Filter raw rows before aggregation when a selected dimension would otherwise disappear.
- Group categorical tails and pre-bin high-cardinality data. Do not draw one SVG mark for every raw event without measuring.
- Use `DataTable` pagination or its default virtualization. Virtualization reduces DOM rows; it does not reduce filtering/sorting cost or browser data exposure.
- Keep data references stable between unrelated UI updates. Replace arrays when new data arrives.
- Mount only the views the user needs. The gallery loads its design system and example routes separately.

## Measure a product workload

Record browser/device, row count, column count, mark count, number of linked views, data shape, and production build. Measure cold load, first chart paint, filter-to-paint latency, rapid repeated changes, and memory across navigation. Test both typical and worst-case cardinality. Include accessible table views and empty/error states.

Use browser performance tools to determine whether time is spent fetching, filtering, aggregating, rendering, or laying out. A fast predicate function does not imply fast SVG rendering. Browser-side DuckDB still needs to ingest and store the source; use an authorized server query API when sending the entire source to the browser is inappropriate.

## Worker explorer measurements

The [scale explorer](https://quartile-design.vercel.app/examples/scale) generates deterministic Arrow records in a separate sample worker, imports them into DuckDB, and queries four linked views. It exposes source size, bounded result/mark counts, setup timings, each query's request-to-result duration, and a downloadable environment/report snapshot.

Query durations include serialized queueing, worker execution, transfer and decoding. The view measurement starts when a React render requests a changed view and ends after two animation-frame callbacks once its queries are ready; it is a next-frame estimate, not proof of when pixels reached the display. Main-thread heap estimates exclude the database worker, Wasm and GPU allocations. They are **not total memory usage**. Use browser/OS profiling for those allocations and repeated mount/unmount checks for leaks.

Keep production and development results separate, record requested and actual renderer after fallback, test cold initialization separately from warm selection changes, and publish the fixture seed, browser, machine, viewport and device-pixel ratio with every result. The original mockup's million-row and bundle-size claims are not adopted as product guarantees.

The [recorded production-preview run](../../apps/gallery/src/examples/scale/MEASUREMENTS.md) publishes 93 observations across 10K, 100K, and 1M source rows, with raw JSON and five warm sequences per size. Its 1M-record unfiltered dashboard returns 2,030 rows across four views. The report separates setup, queries, next-frame estimates, and main-thread heap limitations. Renderer comparisons did not establish a universal winner; use the reported environment and ranges when interpreting them. A [current entry-graph/filtering run](../research/benchmark-worker-preview-2026-10-09.json) separately records package artifacts.
