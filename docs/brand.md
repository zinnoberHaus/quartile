# Quartile brand

**Write a sentence. Get a chart.** Quartile is the open-source chart block for Markdown, AI answers and web pages. A few lines of text become an interactive chart, KPI, table or dashboard: in Markdown docs and notes, in AI answers while they stream, and on a web page with one script tag.

It is written for four readers: people who write data-driven documents (docs, notes, reports, READMEs, dbt projects); teams that build AI answers and chat, where the model writes the block inside its Markdown; site owners who want a chart on a page without a build step; and coding agents that are asked to add charts and need to get the install, the block and the wiring right on the first try. React teams that build full data apps are still served: the component library is the engine underneath, with charts, tables, filters and KPIs that share a data contract and a selection state.

The first example, wherever one is needed, is this block:

````markdown
```quartile
bar sum(revenue) by region
title: Revenue by region, Q3 2026
format: currency USD
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
```
````

## Identity

The mark is a disc with one quarter displaced down and right. The separated quarter carries the signal color and suggests the tail of a Q. Use the [public SVG](../apps/gallery/public/examples/favicon.svg) or the [React mark](../apps/gallery/src/shell/Logo.tsx). Preserve the aspect ratio, geometry, and separation. The wordmark is lowercase `quartile` in Schibsted Grotesk, with close tracking. The package name is `@quartile/react`.

| Role | Light value | Purpose |
| --- | --- | --- |
| Paper | `#f5f3ee` | Canvas |
| Surface | `#ffffff` | Data panels |
| Ink | `#16150f` | Text and primary actions |
| Hairline | `#e5e1d8` | Structure |
| Signal | `#2f45e8` | Selection and analytic emphasis |
| Secondary text | `#58554c` | Supporting explanation |

Use the actual [tokens](../packages/react/src/styles/tokens.css) for dark mode and interaction states. Schibsted Grotesk serves interface and display; IBM Plex Mono serves values, axes, and code. Numbers use tabular figures. The layout uses a 4px spacing grid, restrained radii, and borders before shadows. Reserve shadows for floating surfaces.

Neutral structure lets the data carry color. Use one signal for the primary measure, ordered categorical colors for categories, and a sequential palette for magnitude. Put context, filters, headline metrics, trend/breakdowns, and detail in a clear reading order. Comfortable and compact density must preserve the same behavior.

## Voice and evidence

Write plainly: short sentences, concrete nouns and working examples. Write specific, verifiable claims. Say what a block renders, what a selection changes, what a metric measures, and what an empty result means. State the preview status and link to runnable source. Never reuse the design mockup's fictional stars, downloads, contributors, stable release, bundle size, or future renderer claims. The actual license is Apache-2.0.

- **Words to use.** Chart block, Markdown, AI answers, streamed answers, web page, script tag, self-hosted, dashboard, linked, rows, readable as text, open source, preview. "Embed" is a verb ("embed a dashboard in a paragraph"), not the name of the product.
- **Words to avoid.** Absolutes such as "every", "any" and "all"; "comprehensive"; "production-ready"; "AI-powered" (Quartile ships no model); "BI"; "secure" or "accessible" without saying what was built and tested; "connect any data source", and SQL as something Quartile runs (blocks read rows, CSV and JSON; SQL is not executed).
- **Status.** Show "0.1 preview" and "not on npm yet" wherever a reader first meets the project. Call a build from GitHub Releases a "preview build", never a release of 0.1.0, and do not write a registry install command.
- **Rendering.** Do not say a block renders on GitHub: it stays readable text there.
- **Numbers.** Sizes, counts and timings come from a script or a test, not from memory.

The current name and scope are provisional until the maintainer completes name/scope clearance for publication. This guide records design usage; it does not establish trademark clearance or grant rights beyond the repository's applicable license.
