# dbt

dbt defines and documents the data; Quartile draws it. The helpers in `@quartile/react/lang` read dbt's own artifacts, so charts reuse the column labels, descriptions, types and display settings your project already documents. Quartile does not run dbt, execute SQL or query a warehouse. A runnable example with fixtures lives in [examples/dbt](../../examples/dbt).

## Documentation that flows into charts

Column descriptions become field descriptions (shown in chart tooltips and table headers), `data_type` sets the field type, and `meta.quartile` sets display choices:

```yaml
models:
  - name: fct_orders
    columns:
      - name: revenue
        description: Order value after discounts and returns, before tax.
        data_type: numeric(12,2)
        config:
          meta:
            quartile:
              label: Net revenue
              format: currency USD   # any format from the language reference
              unit: USD
```

```ts
import { dbtDataset, dbtFields } from '@quartile/react/lang';

const manifest = JSON.parse(await readFile('target/manifest.json', 'utf8')); // schema v12
const fields = dbtFields(manifest, 'fct_orders');           // labels, descriptions, types, formats
const orders = dbtDataset(showJson, { manifest, model: 'fct_orders' }); // rows + those fields
```

`dbtFields` also applies Semantic Layer metric labels and descriptions to columns named like the metric. `meta.quartile` is read from a column's `config.meta` or its top-level `meta`.

## Getting rows

`dbtDataset` and `rowsFromDbtShow` accept the JSON printed by `dbt show --select <model> --output json` (`{ "node": …, "show": [...] }`) or a plain row array. `dbt show` returns 5 rows unless you pass `--limit`; for charts, prefer an aggregated model with a few hundred rows. dbt's documentation warns that `--inline` cannot guarantee a query does not modify the warehouse, so use a read-only profile.

In an application, query the model with your warehouse client and pass the rows as a dataset named after the model:

```tsx
<QuartileDocument data={{ fct_orders: dbtDataset(rows, { manifest, model: 'fct_orders' }) }}>
```

Blocks then write `data: fct_orders`.

## Charts in dbt docs

Model and column descriptions are Markdown, so they can contain ```` ```quartile ```` blocks. dbt docs has no plugin system; [examples/dbt](../../examples/dbt) shows the working route:

1. `dbt docs generate`.
2. Export the rows a block should show: `dbt show --select fct_orders --limit 500 --output json`, converted with `export-show.mjs` into `target/quartile/fct_orders.json`.
3. `inject-docs.mjs target` copies the standalone script into `target/` and adds one `<script … data-sources="same-origin">` tag to `index.html` (idempotent; rerun after each generate).
4. In the description, the block reads `src: quartile/fct_orders.json`.

The script upgrades code blocks as the docs site renders them, so it works with the client-rendered dbt docs pages. This route was verified against a stand-in page with the same code-block markup, not against every dbt docs version; if your version renders code blocks differently, check the `language-quartile` class in the page.

## Reports from dbt results

`build-report.mjs` in the example renders a Markdown report whose blocks read `data: fct_orders` to static HTML: SVG charts and tables labelled from the manifest, upgraded to interactive charts by the embed script. The same approach works in any static generator through `remarkQuartile` or `markdownItQuartile` with `datasets: { fct_orders }`.

## Lineage

Declare a Quartile dashboard as a dbt exposure so it appears in lineage and docs:

```ts
import { dbtExposureYaml } from '@quartile/react/lang';

await writeFile('models/exposures.yml', dbtExposureYaml({
  name: 'revenue_report',
  label: 'Revenue report',
  dependsOn: ['fct_orders'],
  url: 'https://analytics.example.com/revenue',
  owner: { name: 'Analytics' },
}));
```

## dbt Charts

[dbt Charts](https://docs.dbtcharts.com) writes single charts as YAML in ```` ```charts ```` fences and renders them server-side. Quartile reads the same single-chart shape in a ```` ```quartile ```` fence (or in ```` ```charts ```` when you add `charts` to the document's `languages`):

```yaml
type: line
title: Documents processed
query:
  columns: [month, documents]
  values:
    - [2026-06, 1180]
    - [2026-07, 1325]
x: month
y: documents
```

`query: <name>` reads a dataset of that name, so a host can run the named query and pass its rows. SQL in `query.sql` is not executed. Boards (`rows:` layouts) are not supported; write a Quartile dashboard block instead.

## Not built yet

Querying Semantic Layer metrics by name, reading v2's Parquet information schema, and a dbt command or package that runs these steps for you.
