# Install the preview

The package has not been released to npm. `npm install @quartile/react` is not an installation path yet. The source and locally packed artifact are usable for evaluation; pin the Git commit you evaluate because the API can change.

## Run the examples

Use Node 22 or newer and pnpm 10 (the workspace pins its pnpm version in `package.json`).

```sh
git clone https://github.com/zinnoberHaus/quartile.git
cd quartile
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173`. Routes include `/examples/storefront`, `/examples/saas`, `/examples/operations`, and `/examples/ai-dashboard`. All sample data is fictional and deterministic.

## Install into your React app

Build and pack from the repository root:

```sh
pnpm build:lib
mkdir -p artifacts
pnpm --dir packages/react pack --pack-destination ../../artifacts
```

In your application, install the resulting file using its absolute path:

```sh
npm install /absolute/path/to/quartile/artifacts/quartile-react-0.1.0.tgz
```

React and React DOM are peer dependencies; keep both on the same compatible version (React 18.2+ or 19). Quartile ships ESM, declarations, CSS, and a JSON Schema. Import its CSS once, near your app root:

```tsx
import { BarList, DataTable, KPI, QuartileProvider, Selection, dataset } from '@quartile/react';
import '@quartile/react/styles.css';

const orders = dataset([
  { order: 'A-101', region: 'Europe', amount: 120 },
  { order: 'A-102', region: 'Americas', amount: 85 },
  { order: 'A-103', region: 'Europe', amount: 60 },
], { amount: { format: 'currency', currency: 'USD' } });

export function App() {
  return <QuartileProvider>
    <Selection>
      <KPI data={orders} value="amount" label="Order value" />
      <BarList data={orders} category="region" value="amount" select />
      <DataTable data={orders} columns={[{ field: 'order' }, { field: 'amount' }]} />
    </Selection>
  </QuartileProvider>;
}
```

Select Europe: the KPI reads $180 and the table shows two orders. The region list keeps both regions visible because a view ignores its own predicate.

## Diagnose setup problems

- Unstyled components: import `@quartile/react/styles.css` and ensure your global reset does not override its classes.
- No chart: give the parent a measurable width; avoid mounting it in an element with `display: none`.
- Filters do nothing: put publishers and subscribers under the same `Selection`, and keep the selected field on the rows they receive.
- Missing dataset in a spec: register the exact name in `SpecView`'s `data` map.
- Next.js hook error: import the built package in a client boundary; see [integration](integration.md).

## Validate a contribution

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @quartile/react test:package  # clean packed React 18/19 consumer checks
```

A passing build verifies a build, not a stable release or accessibility certification. See the [release limitations](../../README.md#what-is-not-built-yet).
