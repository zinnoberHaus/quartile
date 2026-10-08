# Quartile

**Build data apps, not just charts.** Quartile is an open-source React toolkit of charts, tables and interface controls that share one theme, one data model and one selection state. Brush a chart or click a bar, and the table, the KPIs and the filters follow.

> **Status: 0.1 preview.** The library builds, is tested and renders the gallery and example app, but it is not yet published to npm and its API may change before 0.1.0 is released. See [what is not built yet](#what-is-not-built-yet).

- **Design system and component gallery:** every component, rendered live from this repository (`apps/gallery`).
- **Example app:** a storefront analytics dashboard built only from `@quartile/react` (`/examples/storefront` in the gallery).

## Why another data-viz library

Chart libraries stop at the chart. UI kits stop at the form. Teams glue the two together and then spend weeks reconciling themes, tooltips and filter state. Quartile ships the layers as one system:

- **One theme.** Charts, tables, inputs and overlays read the same `--q-*` CSS custom properties. Light and dark themes and two densities are token remaps. No Tailwind or CSS-in-JS runtime is required, and it sits inside a Tailwind or shadcn/ui app.
- **One data model.** Pass rows and name the fields. Types, labels and formats are inferred (or declared once with `dataset()`), and axes, tooltips, tables and KPIs all use them.
- **One selection.** Wrap views in `<Selection>`. Brushes, clicks and filter chips publish predicates to a shared store; every other view re-filters, and a view is never filtered by its own selection (crossfilter semantics).
- **Accessible charts by default.** Every chart has a keyboard model, an auto-written screen-reader summary and a table fallback (`view="table"`).
- **Machine-readable.** Components are described by JSON Schema (`@quartile/react/schema.json`). `validateSpec` checks a generated dashboard spec and `<SpecView>` renders it.

How this compares with Recharts, ECharts, Observable Plot, Unovis, shadcn/ui charts, Tremor, MUI X, Mosaic and others, with sources: [docs/research/landscape-2026-10.md](docs/research/landscape-2026-10.md).

## Quick look

```tsx
import { QuartileProvider, Selection, LineChart, BarList, DataTable } from '@quartile/react';
import '@quartile/react/styles.css';

export function OrdersExplorer({ orders, daily }) {
  return (
    <QuartileProvider theme="system">
      <Selection id="orders">
        <LineChart data={daily} x="date" y="revenue" compare="previous" area brush />
        <BarList data={orders} category="region" value="amount" select />
        <DataTable data={orders} columns={[{ field: 'product' }, { field: 'amount' }]} sort="-amount" limit={5} />
      </Selection>
    </QuartileProvider>
  );
}
```

## Develop

Requires Node 20.19+ and pnpm 10.

```sh
pnpm install
pnpm dev          # gallery at http://localhost:5173 (design system at /, example app at /examples/storefront)
pnpm test         # library unit tests
pnpm typecheck
pnpm lint
pnpm build        # library (dist/) and gallery
```

Read [docs/architecture.md](docs/architecture.md) before adding a component, and [docs/decisions](docs/decisions) for the decisions so far.

## What is not built yet

- **npm release.** `@quartile/react` is not published. The name, npm scope and domain need clearance first.
- **Renderers and data sources.** Charts render SVG. There is no Canvas or WebGL renderer, and no Arrow or DuckDB input; the selection store filters in-memory rows.
- **Scale.** No row-count limits have been measured and published yet.
- **Screen-reader testing.** The keyboard model, summaries and table fallbacks exist, but they have not been tested with NVDA, JAWS or VoiceOver yet.

## Contributing

Issues and proposals are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and follow the [code of conduct](CODE_OF_CONDUCT.md) and [governance](GOVERNANCE.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not public issues.

## License

[Apache-2.0](LICENSE)
