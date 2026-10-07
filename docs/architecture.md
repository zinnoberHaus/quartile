# Architecture and conventions

Quartile is one React package, `@quartile/react`, plus a gallery app that renders the design system and an example app from source. Read this before adding or changing a component.

## Layout

```
packages/react/            @quartile/react
  src/styles/              tokens.css (every --q-* variable) and base.css (scoped base, type scale)
  src/provider/            QuartileProvider: theme, density, locale, portal layer
  src/data/                data model: schema inference, formats, predicates
  src/selection/           <Selection>, useSelection, useLinkedRows: the shared selection store
  src/lib/                 cx, useControllable, useElementSize, floating (Portal, useFloating, useDismiss)
  src/icons/               16px stroke icons
  src/components/          interface components (buttons, inputs, navigation, feedback, overlays)
  src/data-display/        KPI, FilterBar, DataTable: the layer between charts and UI
  src/charts/              charts and the chart core (frame, states, scales, guides, a11y)
  src/spec/                JSON Schema for components and the spec renderer
apps/gallery/              design system page (/), example app (/examples/storefront)
```

`npm run build` in `packages/react` writes `dist/index.js`, `dist/index.d.ts`, `dist/styles.css` (every `src/**/*.css`, foundations first) and `dist/schema.json`.

## Styling

- Plain CSS with custom properties. No Tailwind or CSS-in-JS dependency; consumers import `@quartile/react/styles.css` once.
- Every color, radius, shadow, space and control size comes from a `--q-*` token in `src/styles/tokens.css`. Never hard-code a hex value in component CSS unless the design specifies a one-off (disabled fills, for instance) and no token fits.
- Class names: `q-<component>` for the root, `q-<component>-<part>` for parts. Variants, sizes and states are data attributes: `data-variant`, `data-size`, `data-state`, `data-tone`. Use ARIA attributes (`aria-selected`, `aria-pressed`, `aria-current`, `aria-invalid`) as styling hooks where they exist.
- Each component keeps its stylesheet next to it (`button/button.css`). The build concatenates them; there is no shared CSS index to edit.
- Density: read `--q-control-h`, `--q-control-h-sm`, `--q-control-h-lg`, `--q-control-px`, `--q-control-font`, `--q-row-h` and `--q-card-pad`. Compact density remaps them; components should not branch on density in JS.
- Dark theme: tokens are remapped under `[data-theme='dark']`. If a component looks wrong in dark, fix the token usage, not the component.
- SVG colors go through `style={{ fill, stroke }}` so CSS variables resolve; presentation attributes do not reliably accept `var()`.
- Numbers use `.q-num` or `font-family: var(--q-font-mono)` with tabular figures.

## Components

- Function components with `forwardRef` where a DOM ref is useful. Spread remaining props onto the root.
- Controlled and uncontrolled: `value`/`defaultValue`/`onChange` via `useControllable`.
- Accessible by default: native elements first (`button`, `input`), correct roles otherwise, a visible `:focus-visible` ring using `var(--q-focus-ring)`, full keyboard support, labels associated with inputs.
- Overlays render through `<Portal>` and position with `useFloating`; dismiss with `useDismiss`. They share one elevation (`--q-shadow-1`) and tooltips and toasts share the dark inverse surface.
- Export from your workstream's barrel (`*.exports.ts`), never from `src/index.ts` directly.

## Data components

Every chart and data-display component follows the same contract:

1. Accept `data: DataInput` (rows, or `dataset(rows, fields)` with a schema) and field names as strings.
2. `resolveData(data)` gives rows and a schema; `fieldOf(schema, name, rows)` gives a field with its type, label and format.
3. `useLinkedRows(rows, { selection, source })` returns rows filtered by every predicate in the nearest `<Selection>` except the ones this component published. `source` comes from `useSourceId(props.id)`.
4. Publish with `selection.set(field, value, { op, source })` (brush: `op: 'between'`; click: `selection.toggle(field, value, { source })`). Clear with `selection.clear(field)`.
5. Format values with `makeFormatter(field.format, { currency, locale })` and axis ticks with `tickFormatter(field)`.
6. Built-in states: accept `ChartStateProps` (`loading`, `error`, `errorCode`, `onRetry`, `empty`) and render through `ChartFrame`, which keeps the size so layouts never jump.
7. Accessibility: `useChartKeyboard` for arrow-key navigation, an `aria-live` announcement for the focused point, an auto-written summary via `summarizeSeries` or an equivalent, and a formatted `ChartTable` passed to `ChartFrame` as `table`. Screen readers always get the table; `view="table"` shows it at the chart's size.

`LineChart` is the reference implementation of this contract.

## Honesty rules

Docs, gallery copy and component descriptions describe only what the code does. Do not claim renderers, data sources, sizes, performance numbers, adoption numbers or compatibility that have not been built and measured.
