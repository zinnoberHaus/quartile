# Browser integration measurement

Recorded 2026-10-09T20:28:53.296Z using the [reproducible browser harness](verify.mjs). [Raw reports](measurements.chromium.json) contain all 93 measurements, request IDs, setup timings, exact IPC bytes, active renderer, predicates, environment, and loaded production asset filenames.

This is one local run on Apple M3 Max, darwin 25.5.0 arm64, headless Chromium 153.0.8010.12, at 1440 × 1100 with DPR 1. The browser reported 14 logical processors. Vite served a production build over local HTTP; no CPU or network throttling was applied. Chromium's `--enable-precise-memory-info` flag was enabled. Browser assets were already warm from the integration checks; the setup values are not cold-network download measurements.

## Linked view updates

Each size received one unreported warm-up sequence and five measured sequences. Values below are median (minimum–maximum) milliseconds from the React render initiating the changed view to two animation-frame callbacks after all current query results are ready. This estimates a rendering opportunity, not confirmed screen presentation. It includes the affected query work, result conversion, React updates and chart work.

Canvas plotted at most 2,000 first matching IDs. Service totals return at most four rows, metrics one row, and the raw table one 25-row page. Selecting Search at 10K source rows leaves 833 matches and therefore fewer scatter marks; other measured filter cases retain the 2,000-mark bound.

| Source rows | Region → eu-west | Service → Search | Next raw table page | Clear filters |
| --- | ---: | ---: | ---: | ---: |
| 10,000 | 41.2 (30.6–52.7) | 47.8 (47.0–49.5) | 47.5 (46.3–48.5) | 48.7 (47.4–50.1) |
| 100,000 | 55.9 (48.4–58.9) | 64.3 (62.9–65.8) | 48.0 (44.7–48.5) | 65.4 (46.3–65.7) |
| 1,000,000 | 100.5 (95.6–108.3) | 98.0 (97.6–113.6) | 65.5 (63.4–66.4) | 80.6 (79.2–81.5) |

The 1,000,000-row source returned 2,030 rows across the unfiltered current views, rather than transferring every source record into React. Filters run in DuckDB before aggregation. The service view preserves its alternatives by excluding its own published predicate. Query durations in the raw reports include queueing, execution, transfer and decoding. An unchanged view reuses its earlier query result and timing; request IDs make that reuse visible.

## Switching the scatter renderer

Source size stayed at 1,000,000 with no active filters. One warm-up cycle preceded five measured SVG → Canvas → WebGL cycles for each mark bound. These switches reuse fetched rows. Values include renderer initialization and the same two-frame endpoint; they do not measure sustained animation FPS or GPU hardware throughput. Headless WebGL can use software rendering. All measured switches reached the requested renderer; the separate forced-failure check verified WebGL → Canvas fallback.

| Plotted marks | SVG, ms | Canvas, ms | WebGL, ms |
| --- | ---: | ---: | ---: |
| 2,000 | 42.8 (39.5–44.0) | 41.6 (39.6–44.4) | 105.8 (78.7–110.9) |
| 10,000 | 77.0 (73.1–94.2) | 56.5 (55.0–71.3) | 142.1 (125.8–376.7) |

## Memory and setup scope

IPC byte counts are exact; they are neither the DuckDB relation size nor total application memory. Heap readings below are the minimum–maximum Chromium main-thread JavaScript estimates during the 20 linked updates per source size. No garbage collection was forced. These values can include objects awaiting collection and exclude the database worker, WebAssembly, GPU and browser-managed blob storage. They do not establish a total-memory budget or a leak result. The WASM preload also creates a temporary host-side blob before engine startup.

| Source rows | Arrow IPC bytes | Main-thread JS heap range, MiB | Setup generation / startup / ingestion, ms |
| --- | ---: | ---: | ---: |
| 10,000 | 291,344 | 9.63–21.96 | 6.9 / 287.0 / 36.9 |
| 100,000 | 2,901,344 | 9.32–32.93 | 16.1 / 278.6 / 55.5 |
| 1,000,000 | 29,001,344 | 12.54–32.90 | 90.0 / 263.9 / 223.5 |

## Behavior checked

The same harness verified exact region/service counts, source-excluding category alternatives, stable page IDs, resetting pagination when revisiting a filter, latest-result behavior under rapid changes, keyboard point selection, empty results, all three renderer choices, an accessible table view, responsive layouts at 320/375/768px, cancellation and unmount disposal, visible blocked-WASM errors, and truthful renderer fallback. No uncaught page errors occurred in the main flow.

These observations demonstrate the bounded integration on this environment. They do not establish a universal row-count limit, production capacity, screen-reader conformance, or the fastest renderer for another device.
