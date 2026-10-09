# Quartile brand

**Build data apps, not just charts.** Quartile coordinates the analytic surface: charts, tables, filters, and KPIs sharing a data contract and a selection state. Its current audience is React teams building customer analytics and internal operational tools.

## Identity

The mark is a disc with one quarter displaced down and right. The separated quarter carries the signal color and suggests the tail of a Q. Use the [public SVG](../apps/gallery/public/favicon.svg) or the [React mark](../apps/gallery/src/shell/Logo.tsx). Preserve the aspect ratio, geometry, and separation. The wordmark is lowercase `quartile` in Schibsted Grotesk, with close tracking. The package name is `@quartile/react`.

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

Write specific, verifiable claims. Say what a selection changes, what a metric measures, and what an empty result means. State the preview status and link to runnable source. Never reuse the design mockup's fictional stars, downloads, contributors, stable release, bundle size, or future renderer claims. The actual license is Apache-2.0.

The current name and scope are provisional until the maintainer completes name/scope clearance for publication. This guide records design usage; it does not establish trademark clearance or grant rights beyond the repository's applicable license.
