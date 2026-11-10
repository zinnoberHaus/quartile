# Integration and theming

Quartile uses React and plain CSS variables. It does not require Tailwind, shadcn/ui, or a CSS-in-JS provider. Import `@quartile/react/styles.css` once and wrap the analytic surface in `QuartileProvider`.

```tsx
<QuartileProvider theme="system" density="compact" locale="en-GB" timeZone="UTC">
  <YourDashboard />
</QuartileProvider>
```

`theme` supports `light`, `dark`, `system` (resolved by CSS, so it is correct before any script runs) and `auto` (matches the colors of the surrounding page; see [embedding and styling](embedding.md#styling)). `host` maps a known design system's variables (shadcn/ui, VitePress, Docusaurus, Starlight, Material for MkDocs, Primer, Pico, Radix Themes, Open Props) and `accent` sets a brand color. `density` supports `comfortable` and `compact`. Locale controls number/date display; `timeZone` controls timestamp display and defaults to the runtime's zone when omitted. Pass both explicitly for reproducible server/client output. Field and descriptor overrides, precision, notation and optional FormatJS/math.js callbacks are covered in [formatting](formatting.md). Overlays use a provider-owned portal so they inherit the same theme. Font-family tokens name Schibsted Grotesk and IBM Plex Mono with system fallbacks; the library does not download fonts for you.

## Existing design systems

Map tokens within the provider scope after importing the stylesheet. Override a complete semantic group, including foreground/soft states and dark values, rather than changing one accent and leaving illegible text.

```css
.analytics-brand {
  --q-signal: var(--brand-accent);
  --q-signal-hover: var(--brand-accent-hover);
  --q-signal-pressed: var(--brand-accent-pressed);
  --q-signal-soft: var(--brand-accent-soft);
  --q-signal-ink: var(--brand-accent-text);
  --q-on-signal: var(--brand-on-accent);
  --q-font-sans: var(--font-sans);
}
```

Pass `className="analytics-brand"` to the provider. For a shadcn/ui app, `host="shadcn"` maps `--background`, `--foreground`, `--card`, `--border`, `--primary` and `--chart-1` … `--chart-5` for you; projects that store bare HSL channels (Tailwind v3) use `host="shadcn-hsl"`, because a defined but invalid variable never falls back. Review your actual tokens rather than assuming their format.

The full token contract is [tokens.css](../../packages/react/src/styles/tokens.css). Charts use `--q-cat-*` for categories and sequential/diverging palettes for magnitude. Avoid assigning semantic success/failure colors to arbitrary categories.

## Next.js and server rendering

The built ESM bundle includes a `use client` directive. Import the CSS in your root layout and keep interactive composition inside a client component. Fetch and authorize data in your server code, then pass serializable rows into that boundary. Do not import the package source into a server component and assume the built bundle's directive still applies.

```tsx
// app/analytics/dashboard.tsx
'use client';
import { QuartileProvider, Selection, BarList } from '@quartile/react';

export function Dashboard({ rows }: { rows: { region: string; amount: number }[] }) {
  return <QuartileProvider><Selection>
    <BarList data={rows} category="region" value="amount" select />
  </Selection></QuartileProvider>;
}
```

Charts draw at the provider's `initialWidth` (640 px by default) until they can measure their container, so server markup contains the chart's SVG, scaled to the container, and the client redraws at the measured width after hydration. Verify layout after hydration and when opening hidden tabs/panels. `theme="system"` is resolved by CSS from the reader's preference, so server output and the first paint are already in the right theme. See [server rendering](server-rendering.md).

## Fetching and state

Keep networking in your application. Charts accept `loading`, `error`, `onRetry`, and `empty` state props; avoid replacing a failed query with zero-valued data. Memoize stable dataset construction when useful and replace arrays when results change. For multiple widgets, isolate selection contexts. For very large datasets, return bounded/aggregated results from the server; see [performance](performance.md).

The [API recipes](api-data.md) show real public requests, schema normalization, units, attribution and explicit failure handling. Copy the standalone helper into an existing app, or use [Studio](studio.md) to arrange the views and download a Vite starter with native React source and its matching helper. Studio's browser adapter supports public HTTPS JSON with CORS; keep authentication and private data access on your own server.

## Tables, analyst runtimes and AI

Use [DataExplorer](tables.md) for local table view state and controlled edit callbacks. Its filters/search refine its own table; shared chart predicates still live in `Selection`. Persist validated view JSON separately from source records and authorization. An edit callback must update caller data; the component has no database write capability.

The [Python snapshot example](../../examples/python) adapts pandas, Polars or row dictionaries to the gallery importer. It explicitly handles dates, missing cells, IDs and unsupported nested values. Import the written file or host its snapshot for [bounded URL loading](connecting-data.md). This is a one-way handoff; Jupyter kernels and Streamlit widgets are not bundled. See [data-science workflows](data-science.md) for input bounds and the Arrow type boundary.

Import optional assistance from `@quartile/react/ai`. `AssistantPanel` and its hook belong in the client boundary. A model SDK or REST call and provider credentials belong on the server. `createHttpAssistantAdapter` talks to an application-owned endpoint; it does not select or provision a model. [AI assistance](ai-assistance.md) documents context disclosure, request shape, stale-result handling and explicit Apply. The [local backend example](../../examples/ai-server) is a runnable development integration with its own authentication/deployment limitations.
