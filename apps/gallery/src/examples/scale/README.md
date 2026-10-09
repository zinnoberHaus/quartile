# Worker query and renderer workbench

This example uses the optional `@quartile/react/query` and `@quartile/react/duckdb` APIs. Its source data is fictional and generated from seed `20261009`. Load 10,000, 100,000, or 1,000,000 requests; changing sizes preserves the existing prefix.

The sample generator runs in a dedicated worker. It creates typed columns and Apache Arrow IPC; only that transferable buffer crosses the main thread on its way into DuckDB-WASM. The generator is terminated when it finishes or is cancelled. The database has a separate worker and explicit disposal on reload or unmount. The dataset never becomes a full JavaScript row array in React.

Vite imports the packaged DuckDB worker scripts and WebAssembly modules with `?url`, serving both from the gallery's own origin. No CDN URL, database service, API key, or cross-origin isolation setting is required for the selected single-thread MVP/EH bundles. The first load downloads the WebAssembly engine. Do not compare its setup time to a warmed query. The surrounding gallery currently loads its display fonts from Google Fonts; the data and database assets do not use that service.

The host fetches the WASM asset with an abort signal, checks its HTTP status, and passes a temporary blob URL to the engine. This makes failed downloads observable: DuckDB-WASM 1.32.0 can leave `instantiate()` pending after a rejected fetch inside its worker. The blob adds a temporary host-side allocation beyond the Arrow IPC buffer and requires blob fetching to be permitted by any custom Content Security Policy. The URL is revoked when initialization finishes or fails. Initialization has a visible 90-second deadline and a cancel control. On reload/unmount, graceful backend cleanup is allowed one second before this example terminates its owned worker independently; it does not retain a dead worker while awaiting an unresponsive connection.

## Bounds and selection semantics

Every query states a result bound:

| View | Returned result |
| --- | --- |
| Service totals | Up to 4 aggregate rows |
| Metrics | 1 aggregate row |
| Table | 25 raw records, with exact matching total |
| Scatter | First 2,000 or 10,000 matching records in request-ID order |

The scatter is a deterministic ordered subset, not a random sample or a visualization of every source row. The raw table requests its next window from the worker; header sorting is disabled so a single page cannot pretend to represent a global sort. Source predicates are applied before aggregation. The service bar list excludes predicates it publishes itself, preserving the alternatives. `QueryResultView` keeps the already-consumed filters from being applied to prepared aggregate rows a second time.

## Reproduce the measurements

From the public repository, run `pnpm install`, then `pnpm dev` and open `/examples/scale`. Production measurements should use `pnpm build` and the gallery preview server, not Vite development mode.

1. Record browser/version, OS/device, viewport, device-pixel ratio, renderer and row count. The measurement download includes browser-reported environment details.
2. Load one size. Keep generation, database startup and Arrow ingestion separate from query timings.
3. With a fixed mark limit, repeat the same sequence: all rows → `eu-west` → `Search` → next table page → clear filters. Wait for the measurement download to become available after each step.
4. Repeat each sequence at least five times after the first warm-up run. Report median and range together with the raw JSON, not one best run.
5. Repeat with the other source sizes while keeping the mark limit fixed. Then keep the source size fixed and compare SVG, Canvas and WebGL with the same bounded points. If a renderer falls back, report the renderer actually used.
6. Test rapid filter changes, cancellation while loading, unmount/revisit, empty results and a deliberate blocked WASM request separately. A failure is displayed as a failure; it is not a completed measurement.

`Query → result` includes backend queueing, worker execution, transfer and decoding, measured by `useDataQuery`. It is not an engine-only CPU measurement. `View request → next frame` begins during the React render initiating a changed view, waits for every current query result and two animation-frame callbacks, and ends before the second callback returns. It estimates a rendering opportunity; it does not prove a frame reached the screen. Renderer switches reuse the bounded data already fetched.

The Arrow IPC byte size is exact for the generated buffer. Optional `performance.memory.usedJSHeapSize` values are Chromium estimates of main-thread JavaScript heap; they can include objects awaiting garbage collection and **exclude database worker, WebAssembly and GPU memory**. They must not be labeled total application memory. Browsers without that non-standard API display an unavailable state. Measure total process memory with browser profiling tools for a full memory study.

## Automated browser verification

`verify.mjs` checks real worker initialization, exact linked counts and stable page IDs, stale-result suppression, keyboard point selection, empty values, renderer switching, mobile layout, cancellation/unmount disposal, a blocked WASM request, and forced WebGL fallback. Add `--benchmark` to collect five warm sequences at each source size and five switches per renderer at each mark bound. It saves screenshots and raw measurement JSON to the output directory. It does not install dependencies itself.

Use a production gallery build and a separate Playwright installation:

```sh
pnpm build
pnpm --filter @quartile/gallery preview --host 127.0.0.1 --port 4173 --strictPort
# In another terminal:
npm install --prefix /tmp/quartile-browser-check --no-save playwright@1.63.0
/tmp/quartile-browser-check/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/quartile-browser-check/node_modules/playwright/index.mjs \
  node apps/gallery/src/examples/scale/verify.mjs \
  http://127.0.0.1:4173 /tmp/quartile-scale-verification --benchmark
```

The checked-in measurement artifact records one local production-preview run. The harness uses Chromium's [`--enable-precise-memory-info` flag](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md) to obtain less coarse heap readings; ordinary browsers can return heavily bucketed estimates. This still does not include worker, WASM, GPU, or browser-managed blob storage. Headless Chromium may use software WebGL; its results are not GPU hardware benchmarks. Compare recorded active renderers rather than the requested menu option alone.

This workbench demonstrates bounded integration behavior. It does not establish a universal row-count limit, throughput guarantee, or production service capacity.
