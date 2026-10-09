# Scatter renderers

`ScatterPlot` supports `renderer="svg"`, `renderer="canvas"` and `renderer="webgl"`. SVG remains the default, including when a dashboard spec omits the prop. Every other chart currently renders SVG. These are preview APIs; the package is not published to npm.

```tsx
import { ScatterPlot, type ScatterRendererState } from '@quartile/react';

function reportRenderer(state: ScatterRendererState) {
  console.log(state.requested, state.active, state.reason);
}

<ScatterPlot
  data={measurements}
  x="latency"
  y="cost"
  color="region"
  label="id"
  renderer="webgl"
  onRendererChange={reportRenderer}
  aria-label="Cost against latency"
/>;
```

Choose a renderer explicitly and measure your application's workload. There is no automatic row threshold or universal supported row count. Canvas and WebGL avoid creating one SVG circle per point. Data inference, linked filtering, sorting, summaries, projection, hit-test indexing and buffer uploads still consume CPU and memory. Bound or aggregate data before plotting when appropriate. The [worker query guide](worker-queries.md) explains how to query a larger source and pass a bounded result to the chart.

## Shared behavior

All three modes use the same quantitative axes, point coordinates, bubble sizing, series colors, radius-based draw order and distance-to-circle picking. Missing or nonfinite coordinates are omitted; negative and zero coordinates remain valid. Theme tokens, light/dark mode, container resize and device pixel ratio update the drawing surface. SVG still renders the axes, grid and focus indicator; tooltips remain HTML. Raster marks do not have individual DOM elements.

The plot is one keyboard stop: arrows move through points in x/y order, Home/End reach the first/last point, Enter selects, and Shift+Enter extends the selection. The summary and focused point values remain available to assistive technology. Selection retains the source-excluding behavior of the SVG chart: selecting a point does not remove the chart's own unselected points. A different view's filter changes the plotted rows. For physically typed query results, `typedSelection` preserves nominal strings and null identities when highlighting and publishing selected values; declare the field types in the dataset schema and use query consumers for matching physical-type filtering. The default retains the in-memory selection semantics. Legends, loading, empty and error states follow the existing ScatterPlot API.

For more than 200 visible points, a **View data table** button opens the exact chart values in pages of 50 rows. This avoids constructing a full hidden table. Previous/next controls reach every row, and the table exposes its total row count. `view="table"` opens this view directly. Smaller plots retain the existing hidden table. Paging does not sample or aggregate values; it lists the plotted fields with their configured formatters, in keyboard order.

## Fallback and lifecycle

WebGL uses actual WebGL point sprites and a vertex buffer. Canvas uses Canvas2D arcs. If WebGL initialization, shader compilation, supported point size or context availability fails, the chart replaces the surface with Canvas. If Canvas is unavailable or fails, it falls back to SVG. Context loss follows the same sequence. The fallback remains until `renderer` changes or the chart remounts, avoiding repeated retries against an unstable context.

`onRendererChange` reports `{ requested, active, reason? }` when the active renderer is established or changes. Record `active` in measurements: requesting WebGL does not prove a device used it. The marks layer also exposes `data-renderer` and `data-fallback-reason` for inspection. The callback reports renderer status, not GPU completion or a paint timing. It is a React callback and cannot be serialized into a dashboard spec.

Contexts, GPU resources, observers and event listeners are released when the surface changes or unmounts. Server rendering does not initialize browser contexts. There is no raster animation loop; reduced-motion mode requires no animated raster transition. SVG continues to use the library's reduced-motion styles.

## Coverage and limitations

Accelerated rendering currently covers ScatterPlot and its size-encoded bubbles. It does not add Canvas/WebGL to other charts, GPU filtering, a worker renderer, progressive drawing, automatic downsampling, per-point DOM customization or an image export API. Device GPU limits, browser context quotas and software rendering can trigger fallback or affect performance. CSS token changes on provider/ancestor style, class, theme or density attributes redraw the surface; stylesheet replacement outside that mechanism may require a rerender.

The [runnable scale workbench](https://quartile-design.vercel.app/examples/scale) separates source rows, matched rows and bounded rendered marks, with renderer selection and downloadable observations. See its [source and measurement notes](../../apps/gallery/src/examples/scale/README.md). Treat results as browser/device observations rather than guarantees. Automated keyboard, table and renderer tests do not substitute for manual screen-reader validation, which remains a preview limitation.

The architecture and tradeoffs are recorded in [ADR 0003](../decisions/0003-accelerated-scatter.md).

## Reproduce browser correctness checks

Run the gallery with `pnpm dev`, then run the optional Playwright fixture from the repository root. It requires a local development server, because it imports source modules through Vite.

```sh
npm install --prefix /tmp/quartile-browser-verification playwright@1.63.0
/tmp/quartile-browser-verification/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/quartile-browser-verification/node_modules/playwright \
  node packages/react/src/charts/renderers/scatter.browser.mjs
```

`GALLERY_URL` overrides `http://127.0.0.1:5173/`; `SCATTER_EVIDENCE_DIR` overrides the system temporary output directory. The script writes screenshots and `quartile-scatter-browser.json`, checks actual colored pixels at the shared SVG positions, theme colors, DPR changes, resize, keyboard/pointer interaction, forced WebGL loss, paged values and unmount. The [recorded correctness run](../research/scatter-renderer-verification-2026-10-09.json) on 2026-10-09 used Chromium 153.0.8010.12 on macOS arm64 with reduced motion enabled. The 10,000-point Canvas fixture used 38 DOM elements in chart mode and 50 exact rows per table page. This is correctness/DOM evidence, not a frame-rate benchmark or GPU throughput guarantee.
