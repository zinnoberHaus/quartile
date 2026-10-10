# @quartile/react

**Build data apps, not just charts.** Charts, tables, controls and overlays share one theme,
one data model and one selection state.

This is the **0.1 preview**, built from the [Quartile repository](https://github.com/zinnoberHaus/quartile).
The package is not published to npm. APIs may change before a public release.

## Install from source

Use Node 20.19+ and pnpm 10 to build a tarball from the repository:

```sh
pnpm install
pnpm --dir packages/react pack --pack-destination ../..
```

Then install that tarball in your React 18.2+ or React 19 application:

```sh
npm install /path/to/quartile-react-0.1.0.tgz
```

Import the stylesheet once at your application's entry point. Quartile uses plain CSS custom
properties, with no Tailwind or CSS-in-JS runtime requirement.

```tsx
import {
  BarList,
  DataTable,
  KPI,
  LineChart,
  QuartileProvider,
  Selection,
  dataset,
} from '@quartile/react';
import '@quartile/react/styles.css';

const orders = dataset([
  { date: '2026-09-01', region: 'Europe', amount: 120 },
  { date: '2026-09-01', region: 'Asia', amount: 80 },
  { date: '2026-09-02', region: 'Europe', amount: 150 },
]);

export function OrdersExplorer() {
  return (
    <QuartileProvider theme="system">
      <Selection>
        <KPI data={orders} label="Revenue" value="amount" />
        <LineChart data={orders} x="date" y="amount" brush />
        <BarList data={orders} category="region" value="amount" select />
        <DataTable
          data={orders}
          columns={[{ field: 'date' }, { field: 'region' }, { field: 'amount' }]}
        />
      </Selection>
    </QuartileProvider>
  );
}
```

Click a region or brush a date range to filter the other views. The publishing view excludes its
own predicate, so other categories remain available. Rows sharing an x value are summed by
the trend charts. Use `dataset(rows, fields)` to override inferred field types, labels and formats.
The [formatting guide](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/formatting.md)
covers numeric precision and notation, time zones, exact display boundaries, field explanations,
separate axis/tooltip formats and optional FormatJS/math.js adapters.

## Included

- Charts for trends, comparisons, distributions, relationships, flows and activity.
- KPIs, data tables, filter chips, inputs, navigation and overlays.
- Light and dark themes, comfortable and compact density, and shared `--q-*` tokens.
- Keyboard navigation, chart summaries and table fallbacks (`view="table"`).
- `validateSpec`, `SpecView` and `@quartile/react/schema.json` for declarative dashboards.
- Optional `@quartile/react/query` views and `@quartile/react/duckdb` Arrow ingestion and worker queries. The database and Arrow peers are opt-in.
- SVG, Canvas and WebGL scatter plots, with capability fallback and paged exact-data access.
- `DataExplorer` for local search, typed filters, multi-sort, column visibility/order/width/pinning, grouping, view JSON and CSV export; DataTable supports caller-controlled cell edits.
- Optional `@quartile/react/ai` for bounded field profiles/context, validated analysis proposals, an HTTP adapter and explicit review/apply. No model SDK, credential, hosted service or automatic tool execution is included.

See the repository's [architecture guide](https://github.com/zinnoberHaus/quartile/blob/main/docs/architecture.md),
[examples](https://github.com/zinnoberHaus/quartile/tree/main/apps/gallery), and
[contributing guide](https://github.com/zinnoberHaus/quartile/blob/main/CONTRIBUTING.md).

Read the [worker query guide](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/worker-queries.md)
for the pinned DuckDB/Arrow pair, assets, bounded result plans and ownership. Canvas/WebGL currently
cover scatter points; other charts do not expose accelerated renderer selection. No universal production scale limit is claimed;
screen-reader testing with NVDA, JAWS and VoiceOver remains outstanding.

See [analytical tables](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/tables.md),
[AI assistance](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/ai-assistance.md), and
[data-science workflows](https://github.com/zinnoberHaus/quartile/blob/main/docs/guides/data-science.md)
for profiling, exact retention, prediction evaluation and pandas/Polars handoff examples.
The example calculations live in the gallery source; they are not model-training APIs.

## License

Apache-2.0. The full license is included in this package.
