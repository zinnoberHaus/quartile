# Quartile

**Build data apps, not just charts.** Quartile is an open-source React toolkit of charts, tables and interface controls that share one theme, one data model and one selection state. Brush a chart or click a bar, and the table, the KPIs and the filters follow.

> **Status: 0.1 preview.** The library builds, is tested and renders the gallery and example app, but it is not yet published to npm and its API may change before 0.1.0 is released. See [what is not built yet](#what-is-not-built-yet).

- **[Design system and component gallery](https://quartile-design.vercel.app):** components rendered live from this repository (`apps/gallery`).
- **[Documentation](https://quartile-docs.vercel.app)** and **[public implementation guides](docs/guides/README.md)**: installation, data, selection, integration, accessibility, and performance.
- **[Visual Studio](https://quartile-design.vercel.app/studio):** connect a real public API, arrange charts and tables, then export project JSON or a runnable React starter. [Studio guide](docs/guides/studio.md) · [API recipes](docs/guides/api-data.md).
- **Runnable examples:** [storefront](https://quartile-design.vercel.app/examples/storefront), [SaaS analytics](https://quartile-design.vercel.app/examples/saas), [service health](https://quartile-design.vercel.app/examples/operations), an [editable JSON dashboard](https://quartile-design.vercel.app/examples/ai-dashboard), and the [worker query explorer](https://quartile-design.vercel.app/examples/scale).
- **Data-science workspaces:** [dataset exploration](https://quartile-design.vercel.app/examples/explore), [cohort retention](https://quartile-design.vercel.app/examples/cohorts), [model evaluation](https://quartile-design.vercel.app/examples/model-evaluation), and [reviewed analysis assistance](https://quartile-design.vercel.app/examples/assistant). [Bring a pandas/Polars snapshot](examples/python) or [connect your own model backend](examples/ai-server).

## Why another data-viz library

Chart libraries stop at the chart. UI kits stop at the form. Teams glue the two together and then spend weeks reconciling themes, tooltips and filter state. Quartile ships the layers as one system:

- **One theme.** Charts, tables, inputs and overlays read the same `--q-*` CSS custom properties. Light and dark themes and two densities are token remaps. No Tailwind or CSS-in-JS runtime is required, and it sits inside a Tailwind or shadcn/ui app.
- **One data model.** Pass rows and name the fields. Types, labels and formats are inferred (or declared once with `dataset()`), and axes, tooltips, tables and KPIs all use them. [Formatting](docs/guides/formatting.md) supports explicit precision, scientific/engineering notation, locale, time zones, units and separate axis/tooltip presentation.
- **Bring your own data.** The local dataset explorer imports CSV/JSON files or bounded HTTP snapshots, then links charts, profiles and records. [Connection workflow and API shape](docs/guides/connecting-data.md).
- **One selection.** Wrap views in `<Selection>`. Brushes, clicks and filter chips publish predicates to a shared store; every other view re-filters, and a view is never filtered by its own selection (crossfilter semantics).
- **Accessible analytical views.** Charts provide keyboard navigation, generated summaries and table alternatives (`view="table"`). Sparkline is a compact image with a summary instead of interactive navigation or a table. [Accessibility scope](docs/guides/accessibility.md).
- **Machine-readable.** Components are described by JSON Schema (`@quartile/react/schema.json`). `validateSpec` checks a generated dashboard spec and `<SpecView>` renders it.
- **Optional worker queries.** Arrow input and DuckDB-backed bounded queries link metrics, category totals and remote table pages. [Setup and semantics](docs/guides/worker-queries.md).
- **Scatter renderer choice.** Use SVG, Canvas, or WebGL for scatter points, with shared selection, keyboard navigation and paged exact data. [Coverage and fallbacks](docs/guides/renderers.md).
- **Analytical tables.** Search, typed local filters, multi-sort, column controls, grouping, saved view JSON, CSV export and controlled cell edits. [Table contracts](docs/guides/tables.md).
- **Optional analysis assistance.** Bounded context and profiles, typed proposals, validation and explicit Apply. Bring your own backend; the local demo is deterministic, with no model inference. [AI integration](docs/guides/ai-assistance.md).

How this compares with Recharts, ECharts, Observable Plot, Unovis, shadcn/ui charts, Tremor, MUI X, Mosaic and others, with sources: [docs/research/landscape-2026-10.md](docs/research/landscape-2026-10.md).

The [product-direction follow-up](docs/research/product-direction-2026-10-09.md) connects primary-source research to the preview's use cases, integration choices, and remaining evidence gaps.

## Quick look

```tsx
import { QuartileProvider, Selection, KPI, Histogram, BarList, DataTable } from '@quartile/react';
import '@quartile/react/styles.css';

type Order = { product: string; region: string; amount: number };

export function OrdersExplorer({ orders }: { orders: Order[] }) {
  return (
    <QuartileProvider theme="system">
      <Selection id="orders">
        <KPI data={orders} value="amount" label="Order value" format="currency" />
        <Histogram data={orders} x="amount" brush />
        <BarList data={orders} category="region" value="amount" select />
        <DataTable data={orders} columns={[{ field: 'product' }, { field: 'amount' }]} sort="-amount" limit={5} />
      </Selection>
    </QuartileProvider>
  );
}
```

## Develop

To install the unpublished preview into another application, [build and pack it locally](docs/guides/installation.md). Do not use an npm registry install command until a release is announced.

To begin visually, open [Studio](https://quartile-design.vercel.app/studio). Its downloadable starter includes a built local preview package, normal React components and a real API helper. The [API guide](docs/guides/api-data.md) also supports copying that helper into an existing app. Studio is a bounded editor for public data; private requests, deployment and persistence stay in your application.

Use Node 22.12 or newer and pnpm 10. The Vite toolchain also supports Node 20.19+; earlier Node 22 releases are not supported.

```sh
pnpm install
pnpm dev          # gallery at http://localhost:5173 (design system at /, example app at /examples/storefront)
pnpm test         # library unit tests
pnpm typecheck
pnpm lint
pnpm build        # library (dist/) and gallery
pnpm benchmark    # filtering microbenchmark and artifact sizes; build the library first
```

Read [docs/architecture.md](docs/architecture.md) before adding a component, and [docs/decisions](docs/decisions) for the decisions so far.

## What is not built yet

The [design coverage audit](docs/design-coverage.md) maps the original design to implementation evidence and remaining gaps.

- **npm release.** `@quartile/react` is not published. The name, npm scope and domain need clearance first.
- **Renderer coverage.** Canvas and WebGL currently cover scatter plots. Other charts do not expose accelerated renderer selection; automatic renderer thresholds are not established.
- **Scale.** The [worker explorer](https://quartile-design.vercel.app/examples/scale) reports actual bounded-query timings. [Measurement guidance](docs/guides/performance.md) describes their limits; no universal row-count or device-performance guarantee is claimed.
- **Screen-reader testing.** The keyboard model, summaries and table fallbacks exist, but they have not been tested with NVDA, JAWS or VoiceOver yet.
- **Managed platform services.** Quartile does not host notebooks, train models, persist records, provide multi-user authorization, or provision model accounts. The Python utility is a snapshot handoff; the model server is a local development example. [Workflow scope](docs/guides/data-science.md).

## Contributing

Issues and proposals are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and follow the [code of conduct](CODE_OF_CONDUCT.md) and [governance](GOVERNANCE.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not public issues.

## License

[Apache-2.0](LICENSE)
