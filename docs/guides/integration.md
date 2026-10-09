# Integration and theming

Quartile uses React and plain CSS variables. It does not require Tailwind, shadcn/ui, or a CSS-in-JS provider. Import `@quartile/react/styles.css` once and wrap the analytic surface in `QuartileProvider`.

```tsx
<QuartileProvider theme="system" density="compact" locale="en-GB">
  <YourDashboard />
</QuartileProvider>
```

`theme` supports `light`, `dark`, and `system`. `density` supports `comfortable` and `compact`. Locale controls number/date display. Overlays use a provider-owned portal so they inherit the same theme. Font-family tokens name Schibsted Grotesk and IBM Plex Mono with system fallbacks; the library does not download fonts for you.

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

Pass `className="analytics-brand"` to the provider. For a shadcn/ui app, map fully formed CSS color values such as `var(--background)` to `--q-bg`, `var(--foreground)` to `--q-text`, and `var(--card)` to `--q-surface`. Some projects store HSL channels rather than complete colors: wrap those values in `hsl(...)` when needed. Review your actual tokens rather than assuming their format.

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

Charts measure their container in the browser. Server markup is not proof of final chart dimensions; verify after hydration and when opening hidden tabs/panels. `theme="system"` resolves after mount, so applications requiring a flash-free initial theme should resolve and pass an explicit theme themselves.

## Fetching and state

Keep networking in your application. Charts accept `loading`, `error`, `onRetry`, and `empty` state props; avoid replacing a failed query with zero-valued data. Memoize stable dataset construction when useful and replace arrays when results change. For multiple widgets, isolate selection contexts. For very large datasets, return bounded/aggregated results from the server; see [performance](performance.md).
