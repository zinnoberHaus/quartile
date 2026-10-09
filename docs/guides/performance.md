# Performance and scale

The preview renders SVG charts and filters JavaScript rows in memory. It has no Canvas/WebGL renderer, Arrow input, DuckDB query backend, worker query engine, or measured million-row interaction guarantee. Choose it for a bounded analytic surface and measure your actual workload.

## Reproduce a narrow benchmark

```sh
pnpm build:lib
pnpm benchmark
```

The [benchmark](../../scripts/benchmark.mjs) reports the Node/runtime/CPU, three-predicate filtering at 1k/10k/100k rows, and built JS/CSS/schema byte sizes. It warms each case, records 50 samples, and reports median/p95. It is a synchronous filtering microbenchmark, **not** a browser render, network, memory-limit, or end-to-end interaction benchmark. Results vary by machine. The all-exports JS file is not a per-component tree-shaken application bundle.

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

Use browser performance tools to determine whether time is spent fetching, filtering, aggregating, rendering, or laying out. A fast predicate function does not imply fast SVG rendering. If your target is large raw-event exploration, evaluate a server/query backend before extending this preview's renderer.
