# Install the preview

Quartile is a 0.1 preview. The package is not on the npm registry, so `npm install @quartile/react` is not an installation path yet. Install a preview build from its GitHub release, or build the package from source. The block language and the APIs can change between preview builds.

## Install the preview build

```sh
npm install https://github.com/zinnoberHaus/quartile/releases/download/v0.1.0-preview.1/quartile-react-0.1.0-preview.1.tgz
```

- This is a preview build attached to a GitHub pre-release. It is not a release of 0.1.0.
- The import name stays `@quartile/react`. Your `package.json` records the URL as the version.
- pnpm, Yarn and Bun accept the same URL: `pnpm add <url>`, `yarn add <url>`, `bun add <url>`.
- React and React DOM are peer dependencies; keep both on the same compatible version (React 18.2+ or 19).
- The package manifest inside the build says `0.1.0`, so `npm ls` and `npx quartile --version` print that number. Identify a preview build by the release tag in its URL. To move to a newer build, install its URL.
- The [release page](https://github.com/zinnoberHaus/quartile/releases/tag/v0.1.0-preview.1) lists `SHA256SUMS.txt` with the checksum of each file.

The package ships ESM, type declarations, one stylesheet, a JSON Schema and the `quartile` command. Import the stylesheet once, near your app root:

```tsx
import '@quartile/react/styles.css';
```

Then pick the path that matches your project:

- Markdown in a React app, MDX, remark or markdown-it: [Markdown and documentation sites](markdown.md)
- A chat or answer feature: [charts in AI answers](ai-responses.md)
- React components without Markdown: [the first chart](#a-first-chart-in-react) below
- With a coding agent: [AI coding agents](coding-agents.md)

To confirm the install, check a Markdown file that contains a `quartile` block:

```sh
npx quartile check README.md
```

## The script, for pages without a build step

Download `quartile.global.js` from the same release and serve it from your own site:

```sh
curl -L -o public/assets/quartile.global.js \
  https://github.com/zinnoberHaus/quartile/releases/download/v0.1.0-preview.1/quartile.global.js
```

```html
<script src="/assets/quartile.global.js" data-theme="auto"></script>
```

The file bundles React, the components and the stylesheet, and it makes no network requests of its own. `quartile.js` in the same release is the same build as an ES module. Both files are also inside the npm package, under `node_modules/@quartile/react/dist/embed/`. Link the copy on your site, not the release URL. See [embedding and styling](embedding.md).

## A first chart in React

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

## Build from source

Use this when you need a commit that has no preview build yet. Use Node 22.12 or newer and pnpm 10 (the workspace pins its pnpm version in `package.json`). Build and pack from the repository root:

```sh
git clone https://github.com/zinnoberHaus/quartile.git
cd quartile
pnpm install --frozen-lockfile
pnpm build:lib
mkdir -p artifacts
pnpm --dir packages/react pack --pack-destination ../../artifacts
```

In your application, install the resulting file using its absolute path:

```sh
npm install /absolute/path/to/quartile/artifacts/quartile-react-0.1.0.tgz
```

The standalone script is then at `packages/react/dist/embed/quartile.global.js`. Pin the Git commit you built from.

## Run the examples

The examples are published at <https://docs.usequartile.com/examples>. To run them from source, clone and install as above, then:

```sh
pnpm dev
```

Open `http://localhost:5173/examples`. The index lists each page:

- `/examples/playground` is the block playground, `/examples/ai-answer` replays a streamed answer with charts (no model is called), `/examples/markdown-report` is a dashboard written as one Markdown file, and `/examples/embed/demo` is a plain HTML page that uses the standalone script.
- `/examples/storefront`, `/examples/saas`, `/examples/operations` and `/examples/ai-dashboard` use fictional deterministic rows.
- [Studio](studio.md) at `/examples/studio` makes real public API requests and supports custom public JSON. [API data](api-data.md) documents its sources and normalization.

To explore your own rows without writing an application, open `/examples/explore` and import a CSV/JSON file or load a bounded data URL. [Connecting data](connecting-data.md) distinguishes this snapshot workflow from Studio. The [use-case walkthroughs](use-cases.md#walk-through-the-examples) cover the example routes and what their controls change.

## Start visually

[Open Studio](https://docs.usequartile.com/examples/studio) to arrange a view and download a runnable Vite starter. The ZIP includes native React source, its data helper and the built preview tarball. Use Node 22.12 or newer, unzip, run `npm install`, then `npm run dev`. Other dependencies still install from npm; Quartile resolves from the bundled local file. See [the export contract](studio.md#export-and-continue-in-react).

## Diagnose setup problems

- `npm install @quartile/react` fails with a 404: the package is not on the registry. Use the preview-build URL above.
- Unstyled components: import `@quartile/react/styles.css` and ensure your global reset does not override its classes.
- No chart: give the parent a measurable width; avoid mounting it in an element with `display: none`.
- A `quartile` block stays a code block: the Markdown renderer is not wired. See [Markdown and documentation sites](markdown.md).
- A block shows an error instead of a chart: read the message, or run `npx quartile check` on the file. Errors carry a line number and, for a missing column, the real columns.
- Filters do nothing: put publishers and subscribers under the same `Selection`, and keep the selected field on the rows they receive.
- Missing dataset in a spec: register the exact name in `SpecView`'s `data` map.
- Next.js hook error: import the built package in a client boundary; see [integration](integration.md).
- `createContext is not a function` in Next.js: `@quartile/react/server` was imported from a server component or a route handler. See [server rendering](server-rendering.md#react-and-nextjs).

## Validate a contribution

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @quartile/react test:package  # clean packed React 18/19 consumer checks
```

A passing build verifies a build, not a stable release or accessibility certification. See the [release limitations](../../README.md#what-is-not-built-yet).
