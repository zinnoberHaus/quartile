# Quartile guides

Quartile turns a fenced `quartile` block (a sentence, optional settings, a few rows) into an interactive chart, KPI, table or dashboard where Markdown or HTML is rendered. It is an Apache-2.0 preview, and the package is not on npm yet. Start with a working example, then adapt the data and the theme to your product.

## Start

| Task | Guide | Working source |
| --- | --- | --- |
| Install the preview build, the script, or build from source | [Install the preview](installation.md) | [Package](../../packages/react) |
| Have a coding agent add Quartile to a project, and check blocks from the command line | [AI coding agents](coding-agents.md) | [Skill](../../skills/quartile/SKILL.md), [`quartile` command](../../packages/react/src/cli/index.ts) |
| Try blocks without installing anything | [Playground](https://docs.usequartile.com/examples/playground) | [Playground source](../../apps/gallery/src/examples/markdown) |

## Embed

| Task | Guide | Working source |
| --- | --- | --- |
| Render blocks in Markdown: react-markdown, MDX, remark, markdown-it | [Markdown and documentation sites](markdown.md) | [Markdown report](https://docs.usequartile.com/examples/markdown-report), [its source](../../apps/gallery/src/examples/markdown) |
| Render charts inside AI answers, while they stream | [AI answers](ai-responses.md) | [Streamed answer](https://docs.usequartile.com/examples/ai-answer) |
| Put charts on an HTML page with one script and match its styling | [Embedding and styling](embedding.md) | [Plain-HTML demo](../../apps/gallery/public/examples/embed/demo.html) |
| Render charts on a server, at build time or for SEO | [Server rendering](server-rendering.md) | [Static renderer](../../packages/react/src/server/index.ts) |
| Chart dbt models with their documentation | [dbt](dbt.md) | [dbt example](../../examples/dbt) |

## Language

| Task | Guide | Working source |
| --- | --- | --- |
| Look up kinds, settings, formats and diagnostics | [Language reference](../language.md) | [One block per kind](../../packages/react/src/lang/every-kind.test.ts) |
| Give a block its rows: inline, a `data` block, an app dataset, a URL or a JSON API | [Data sources](data-sources.md) | [Examples run as tests](../../packages/react/src/markdown/source-examples.test.tsx), [loader](../../packages/react/src/lang/source.ts) |

## React

| Task | Guide | Working source |
| --- | --- | --- |
| Fit an existing React or Next.js app and theme it | [Integration and theming](integration.md) | [Provider](../../packages/react/src/provider/QuartileProvider.tsx) |
| Model rows and coordinate views | [Data and linked selection](data-and-selection.md) | [Selection store](../../packages/react/src/selection), [storefront example](../../apps/gallery/src/examples/storefront) |
| Format values, axes, tooltips and time zones | [Formatting](formatting.md), [live lab](https://docs.usequartile.com/examples/formatting) | [Shared formatters](../../packages/react/src/data/format.ts) |
| Search, filter, group, edit and export records | [Analytical tables](tables.md) | [Dataset explorer](../../apps/gallery/src/examples/science) |
| Render a validated dashboard spec | [Generated dashboards](generated-dashboards.md) | [Editable spec playground](../../apps/gallery/src/examples/workbench/Workbench.tsx) |
| Ship an inclusive analytic surface | [Accessibility](accessibility.md) | [Chart core](../../packages/react/src/charts/core/a11y.ts) |
| Choose SVG, Canvas or WebGL scatter points | [Renderers](renderers.md) | [Scatter renderers](../../packages/react/src/charts/renderers) |
| Query Arrow data in a browser worker | [Worker queries](worker-queries.md) | [Scale explorer](../../apps/gallery/src/examples/scale) |
| Review a model's proposed view changes | [AI assistance](ai-assistance.md) | [Assistant example](../../apps/gallery/src/examples/science/AssistantWorkbench.tsx), [local model backend](../../examples/ai-server) |

## Guides

| Task | Guide | Working source |
| --- | --- | --- |
| Build revenue, SaaS, or operations analytics | [Use cases](use-cases.md) | [Storefront](../../apps/gallery/src/examples/storefront), [workbench](../../apps/gallery/src/examples/workbench) |
| Connect a CSV/JSON file or data endpoint in the dataset explorer | [Bring your data](connecting-data.md) | [Source loading example](../../apps/gallery/src/examples/science/DatasetSource.tsx) |
| Fetch weather, earthquake or development data | [Connect API data](api-data.md) | [Standalone source adapter](../../apps/gallery/src/examples/studio/sources.ts) |
| Build visually and export a React starter | [Visual Studio](studio.md) | [Studio application](../../apps/gallery/src/examples/studio) |
| Choose an appropriate data size | [Performance](performance.md) | [Reproducible benchmark](../../scripts/benchmark.mjs) |
| Profile data, compare cohorts and evaluate predictions | [Data-science workflows](data-science.md) | [Science calculations](../../apps/gallery/src/examples/science/analysis.ts) |
| Bring pandas or Polars results into React | [Dataframe handoff](data-science.md#pandas-polars-and-notebook-handoff) | [Python export utility and notebook](../../examples/python) |

The public [architecture](../architecture.md), [decision record](../decisions/0001-react-typescript-css-variables.md), and [brand guide](../brand.md) describe the implementation choices. The generated declaration file in a built package is the exact TypeScript API; `schema.json` describes the supported declarative subset.

Public sites: [usequartile.com](https://usequartile.com), [documentation](https://docs.usequartile.com) and [examples](https://docs.usequartile.com/examples). The examples are built from `apps/gallery` in this repository; the other website sources are maintained separately from this public library.
