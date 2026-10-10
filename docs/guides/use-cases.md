# Data-app recipes

These are runnable patterns using the public package API. They use fictional data, with no authentication, persistence, or external service implied.

| Use case | Live example | Source |
| --- | --- | --- |
| Storefront revenue, acquisition, conversion | [Storefront](https://quartile-design.vercel.app/examples/storefront) | [StorefrontExample](../../apps/gallery/src/examples/storefront/StorefrontExample.tsx) |
| Customer subscription portfolio | [SaaS analytics](https://quartile-design.vercel.app/examples/saas) | [Workbench](../../apps/gallery/src/examples/workbench/Workbench.tsx) |
| Operations and incident investigation | [Service health](https://quartile-design.vercel.app/examples/operations) | [Workbench](../../apps/gallery/src/examples/workbench/Workbench.tsx) |
| Model-generated component specs | [JSON dashboard](https://quartile-design.vercel.app/examples/ai-dashboard) | [Spec editor](../../apps/gallery/src/examples/workbench/Workbench.tsx) |
| Dataset profiling and analytical tables | [Dataset explorer](https://quartile-design.vercel.app/examples/explore) | [Science workspace](../../apps/gallery/src/examples/science) |
| Exact return activity by acquisition cohort | [Cohort retention](https://quartile-design.vercel.app/examples/cohorts) | [Calculations](../../apps/gallery/src/examples/science/analysis.ts) |
| Threshold and slice evaluation | [Model evaluation](https://quartile-design.vercel.app/examples/model-evaluation) | [Predictions and calculations](../../apps/gallery/src/examples/science) |
| Reviewed analysis proposals | [Analysis assistant](https://quartile-design.vercel.app/examples/assistant) | [Assistant workspace](../../apps/gallery/src/examples/science/AssistantWorkbench.tsx) |

## Storefront analytics

Question: which region, channel, and product explain a change in revenue?

Keep order facts at a consistent grain. The example coordinates period controls, comparison values, regional/channel breakdowns, a revenue trend, a conversion funnel, and a product table. Selecting a breakdown updates the other views. The standalone example supports a shareable URL and data exports.

Adapt [model.ts](../../apps/gallery/src/examples/storefront/model.ts) for your definitions: net revenue versus gross, returns, time zones, comparison windows, and zero denominators. The funnel's stages are aggregated counts; they are not a substitute for user-level event sequence analysis. Export only data your server has already authorized the user to read.

## Customer-facing SaaS analytics

Question: which accounts drive recurring revenue, and where is adoption low?

The example has 96 accounts and one row per account at one point in time. MRR is summed across accounts, account count counts rows, and adoption is the unweighted mean of each account's adoption ratio. The scatter plot relates licensed seats to MRR. A plan list and revenue histogram segment the detail table.

For weighted adoption, compute active seats divided by licensed seats; do not average percentages unless each account should carry equal weight. For historical MRR, take one snapshot per account per period and choose one period before summing: summing daily MRR snapshots would overstate revenue.

For embedding, scope a provider and selection to the widget, map brand tokens, and load authorized tenant data on the server. Pass a different data array when the tenant or reporting period changes. Theme variables enable visual branding; they do not create tenant isolation.

## Operations and observability

Question: which services and regions explain slow or failed requests?

The example has 360 request records. `BoxPlot` compares latency distributions by service; `Histogram` allows brushing the slow tail; `Heatmap` counts requests by service and region. The table lists the slowest matching requests. The error-rate KPI is the mean of a binary error field, equivalent to errors divided by requests.

On real telemetry, bound the time window and sample/aggregate server-side. Keep denominators explicit: filtering to `status = Error` makes the selected subset's error rate 100%, which is correct but different from the service's unfiltered overall error rate. If an overall reference KPI is needed, render it with `selection={false}` and label it clearly. Means do not reveal tail latency; use distributions or a separately computed percentile.

## Generated analytic interfaces

The JSON playground registers one named dataset, validates an edited layout, and renders supported components. Clicking a plan filters the resulting table, KPI, and aggregated regional chart. An invalid spec leaves the last valid dashboard visible and reports validation errors.

Use the [generated dashboard guide](generated-dashboards.md) to connect your own model or authoring system. The example does not contain an LLM, network calls, or a text-to-SQL service.

## Common production work

For scientist workflows, follow [Data science](data-science.md): profile the 180-row lab fixture or an imported snapshot; compute unique-user retention with explicit calendar maturity; evaluate 360 supplied binary predictions by threshold and segment. Inspect exact records with [DataExplorer](tables.md). The [Python handoff](../../examples/python) exports pandas/Polars snapshots; it does not execute a notebook in the browser.

The [analysis assistant](ai-assistance.md) proposes bounded filter/sort/chart/table changes for review. Its initial local mode is deterministic and clearly labeled; the optional [application-owned server](../../examples/ai-server) connects a real model using server credentials. Neither mode silently applies proposals or provisions a hosted service.

Before adapting any recipe: define the row grain, field units, time zone, metric denominator, authorization boundary, error/empty states, and appropriate dataset size. Verify chart/table agreement after every filter. Offer a reset action, a textual summary, and a table view. Test your actual records, including missing values, zero totals, negative measures, and categories with no matching rows.
