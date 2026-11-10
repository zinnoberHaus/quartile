# Quartile with dbt

Three ways to put interactive charts next to a dbt project, using dbt's own artifacts. The files under `target/` are **hand-written fixtures** shaped like dbt's output (`manifest.json` schema v12 and `dbt show --output json`); this example does not run dbt or query a warehouse.

Build the library first (`pnpm install && pnpm build:lib` from the repository root). In your own project, install `@quartile/react` and `markdown-it` instead of the paths in `quartile.mjs`.

## 1. Charts inside dbt docs

dbt docs renders model and column descriptions as Markdown but has no plugin system. Put a ```quartile fence in a description (see `models/marts/fct_orders.md`), export the rows it should show, and add the embed script to the generated site:

```sh
dbt docs generate
dbt show --select fct_orders --limit 500 --output json > target/show_fct_orders.json
node examples/dbt/export-show.mjs target/show_fct_orders.json target/quartile/fct_orders.json
node examples/dbt/inject-docs.mjs target
dbt docs serve
```

`inject-docs.mjs` copies `quartile.global.js` into `target/` and adds one `<script>` tag before `</body>`; running it again changes nothing. The script upgrades code blocks as dbt docs renders them, and loads `src: quartile/fct_orders.json` because the tag allows same-origin data. Rerun the injection after each `dbt docs generate`, which rewrites `index.html`. `dbt show` returns 5 rows unless you pass `--limit`; aggregate in a model when the chart needs more than a few thousand rows.

## 2. A static report from dbt results

`reports/revenue.md` is a Markdown report whose blocks read `data: fct_orders`. `build-report.mjs` builds that dataset from the `dbt show` rows and the manifest, so the model's column labels, descriptions (shown in tooltips and table headers) and `meta.quartile` formats apply, then renders the page with real SVG charts that the embed script makes interactive:

```sh
node examples/dbt/build-report.mjs examples/dbt/reports/revenue.md examples/dbt/site
```

Column settings live with the model:

```yaml
- name: revenue
  description: Order value after discounts and returns, before tax.
  config:
    meta:
      quartile: { label: Net revenue, format: currency USD }
```

## 3. Lineage

`build-report.mjs` also writes `site/exposures.yml` with `dbtExposureYaml`, declaring the report as a dashboard that depends on `ref('fct_orders')`. Copy it into your project so the report appears in dbt lineage and docs.

## dbt Charts YAML

Quartile reads the single-chart YAML of [dbt Charts](https://docs.dbtcharts.com) (`type`, `x`, `y`, `color`, and `query` with inline `columns`/`values` or a query name) in a ```quartile fence. A named query renders when the host passes its rows as a dataset of the same name. See the [dbt guide](../../docs/guides/dbt.md).

## Test

```sh
node --test examples/dbt/dbt.test.mjs
```
