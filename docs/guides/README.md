# Build a data app with Quartile

Quartile is an Apache-2.0 React preview. Start with a working example, then adapt the data contract and theme to your product.

| Task | Guide | Working source |
| --- | --- | --- |
| Try the library in an existing app | [Install the preview](installation.md) | [Gallery workspace](../../apps/gallery) |
| Model rows and coordinate views | [Data and linked selection](data-and-selection.md) | [Linked-selection demo](../../apps/gallery/src/design-system/sections/LinkedSelection.tsx) |
| Build revenue, SaaS, or operations analytics | [Use cases](use-cases.md) | [Storefront](../../apps/gallery/src/examples/storefront), [workbench](../../apps/gallery/src/examples/workbench) |
| Render a validated dashboard spec | [Generated dashboards](generated-dashboards.md) | [Editable spec playground](../../apps/gallery/src/examples/workbench/Workbench.tsx) |
| Fit an existing React/Next.js app | [Integration and theming](integration.md) | [Provider](../../packages/react/src/provider/QuartileProvider.tsx) |
| Ship an inclusive analytic surface | [Accessibility](accessibility.md) | [Chart core](../../packages/react/src/charts/core/a11y.ts) |
| Choose an appropriate data size | [Performance](performance.md) | [Reproducible benchmark](../../scripts/benchmark.mjs) |
| Query Arrow data in a browser worker | [Worker queries](worker-queries.md) | [Scale explorer](../../apps/gallery/src/examples/scale) |
| Choose SVG, Canvas or WebGL scatter points | [Renderers](renderers.md) | [Scatter renderers](../../packages/react/src/charts/renderers) |
| Search, filter, group, edit and export records | [Analytical tables](tables.md) | [Dataset explorer](../../apps/gallery/src/examples/science) |
| Profile data, compare cohorts and evaluate predictions | [Data-science workflows](data-science.md) | [Science calculations](../../apps/gallery/src/examples/science/analysis.ts) |
| Bring pandas or Polars results into React | [Dataframe handoff](data-science.md#pandas-polars-and-notebook-handoff) | [Python export utility and notebook](../../examples/python) |
| Review a model's proposed view changes | [AI assistance](ai-assistance.md) | [Assistant example](../../apps/gallery/src/examples/science/AssistantWorkbench.tsx), [local model backend](../../examples/ai-server) |

The public [architecture](../architecture.md), [decision record](../decisions/0001-react-typescript-css-variables.md), and [brand guide](../brand.md) describe the implementation choices. The generated declaration file in a built package is the exact TypeScript API; `schema.json` describes the supported declarative subset.

Public deployments: [design system](https://quartile-design.vercel.app), [documentation](https://quartile-docs.vercel.app), and [landing page](https://quartile-landing.vercel.app). Website sources are maintained separately from this public library.
