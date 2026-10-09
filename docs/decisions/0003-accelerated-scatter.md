# 0003: Explicit Canvas and WebGL scatter rendering

Date: 2026-10-09 · Status: accepted for the preview · Issue: #9

## Decision

`ScatterPlot` accepts `renderer="svg" | "canvas" | "webgl"`; SVG remains the default. This revises the SVG-only renderer portion of ADR 0001 for ScatterPlot only. All other charts remain SVG. There is no automatic row-count threshold and no universal million-row claim.

The three renderers consume the same projected, radius-ordered marks. Canvas uses actual Canvas2D drawing; WebGL uses a vertex buffer and circle point-sprite shaders. Axes, grid, focus indicator, tooltip, summary, keyboard navigation and selection stay in React/SVG. Picking uses a screen-space grid and the same distance-to-circle rule for all renderers. Coordinates and radii remain CSS pixels; the backing store and WebGL point sizes use the current device pixel ratio.

Colors are resolved from the chart's inherited CSS tokens. Provider theme changes, ancestor theme/class/style changes, resizing and pixel-ratio changes redraw the surface. Renderer objects own their contexts, listeners and GPU buffers/programs and release resources on replacement or unmount. There is no continuous animation loop, so reduced-motion mode has no renderer animation to suppress.

A failed WebGL initialization, unsupported point size or lost WebGL context falls back to a new Canvas2D surface. A failed Canvas2D context falls back to SVG. The `onRendererChange({ requested, active, reason? })` callback reports the effective renderer after a successful draw (it is not a GPU/paint timer). The marks layer also exposes `data-renderer`; `data-fallback-reason` records why an explicit request was downgraded. A context-loss downgrade remains in place until the renderer prop changes or the component remounts, rather than repeatedly trying an unstable context. The lost canvas is replaced because a canvas cannot switch context types in place.

## Exact data access with bounded DOM

Scatter plots with more than 200 visible points expose a “View data table” button instead of constructing a hidden table row for every point. The visible table formats 50 rows at a time, retains the full row count, and provides previous/next controls; every exact value remains reachable. Keyboard point navigation and spoken summaries remain available in chart mode. Smaller plots preserve the existing hidden-table behavior. `view="table"` directly opens the exact paginated data view.

The shared `ChartTable` contract gains optional lazy row access and pagination while preserving the existing `rows` array contract. The 200-row DOM boundary is a UI implementation bound, not an automatic renderer choice or supported input-count claim.

## Limits and verification

Raw row processing, schema inference, sorting, correlation summaries, selection filtering, projection and GPU uploads still have CPU/memory cost. Acceleration removes one DOM circle per point; it does not make those costs disappear or query a remote dataset. WebGL limits and software rendering vary by device. Applications should aggregate or bound data independently.

Tests cover rendering calls, failure/cleanup, radius-aware picking, invalid coordinates, selection and exact lazy-table paging. Browser evidence must verify actual Canvas/WebGL pixels, DPR, resize, theme changes, interaction and forced context loss. Comparative measurements report input rows and drawn marks separately from processing and paint timings, together with browser/device conditions; they are observations, not performance guarantees.

Primary references: [WebGL contexts](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext), [context loss](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event), and [device pixel ratio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).
