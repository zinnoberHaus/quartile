# Architecture and conventions

Quartile is one package, `@quartile/react`, plus an examples app that renders runnable examples from source. The package holds the Markdown block language, the React component library it compiles to, the static and script-tag renderers, and the `quartile` command. Read this before adding or changing a component.

## Layout

```
packages/react/            @quartile/react
  src/styles/              tokens.css (every --q-* variable) and base.css (scoped base, type scale)
  src/provider/            QuartileProvider: theme, density, locale, time zone, portal layer
  src/data/                data model: schema inference, formats, predicates
  src/selection/           <Selection>, useSelection, useLinkedRows: the shared selection store, and the handle hosts use to read and set a group
  src/lib/                 cx, useControllable, useElementSize, floating (Portal, useFloating, useDismiss)
  src/icons/               16px stroke icons
  src/components/          interface components (buttons, inputs, navigation, feedback, overlays)
  src/data-display/        KPI, FilterBar, DataTable, DataExplorer and local table state
  src/charts/              charts and the chart core (frame, states, scales, guides, a11y, presentation options, colors, brush and click selection)
  src/spec/                JSON Schema for components, the spec renderer, view actions (toolbar, rows panel) and provenance
  src/lang/                Markdown chart language: parser, compiler, data parsing, JSON paths, source loader, presentation, actions and provenance settings, prompt and dbt helpers (no React)
  src/markdown/            QuartileBlock, QuartileDocument, Markdown renderer adapters and the source store (loading, refresh)
  src/server/              static HTML rendering, remark and markdown-it plugins (no 'use client')
  src/embed/               <quartile-chart>, code-block upgrading, page scope, source policy, page selections and the quartile-select event
  src/cli/                 the `quartile` command: check blocks in Markdown files, print the model prompt (Node)
  src/query/               optional bounded query protocol, React hook and prepared view boundary
  src/duckdb/              optional Arrow/DuckDB adapter, typed plan compiler and ownership
  src/ai/                  optional bounded profiling/context, proposal validation and review/apply
apps/gallery/              the examples app, served under /examples: block playground, AI answer, Markdown report, script-tag demo, data apps, science workspaces, Studio
skills/quartile/           SKILL.md, the file a coding agent follows to add Quartile to a project
```

`npm run build` in `packages/react` writes the default entry, optional `query/index`, `duckdb/index` and `ai/index` entries, shared chunks and declarations, `dist/styles.css` (every `src/**/*.css`, foundations first), and `dist/schema.json`. The same run writes `lang/index`, `server/index` and `embed/index` without the `'use client'` banner, and `dist/cli.js` for Node. A last build writes the standalone `embed/quartile.js` and `embed/quartile.global.js` with React and the minified stylesheet bundled. After editing color tokens, run `node scripts/build-system-theme.mjs`; a test fails while `styles/system-theme.css` is stale. Keep shared contexts in shared chunks: bundling separate copies would disconnect selection across entries. The default import must not load Arrow, DuckDB, or the optional AI integration. Package checks exercise entries in clean consumers.

## Entries

| Entry | Holds | Runs in |
|---|---|---|
| `@quartile/react` | Components, `QuartileBlock`, `QuartileDocument`, Markdown adapters, `createSourceLoader`, spec validation and rendering. Carries `'use client'`. | Client components; frameworks still render them on the server. |
| `@quartile/react/lang` | Parser, compiler, table and path reading, `createSourceLoader`, `quartilePrompt`, tool schemas, dbt helpers. No React. | Browsers, workers, server components, route handlers, build scripts. |
| `@quartile/react/server` | `renderBlockToHTML`, `renderMarkdownBlocks`, `remarkQuartile`, `markdownItQuartile`. Needs React and `react-dom/server`. | Node code outside a React Server Components graph: build scripts, static-site generators, Markdown pipelines. |
| `@quartile/react/embed` | `<quartile-chart>`, block upgrading, the page scope. | Browsers, in an application with its own bundler and React. |
| `dist/embed/quartile.global.js`, `quartile.js` | The same embed with React and the stylesheet bundled; the global is `Quartile`. | A script tag on an HTML page. |
| `@quartile/react/query`, `/duckdb`, `/ai` | Optional bounded queries, the Arrow/DuckDB adapter, reviewed analysis assistance. | Browsers; the database and Arrow peers are opt-in. |
| `dist/cli.js` (`bin`: `quartile`) | `quartile check` and `quartile prompt`. | Node 20 or newer. |
| `styles.css`, `schema.json` | One stylesheet; the JSON Schema of the spec. | Imported once; read by validators. |

Keep `lang` free of React and of the DOM. Do not import `server` from code that must run in a React Server Components graph: it fails there because that graph has no `createContext`.

## Styling

- Plain CSS with custom properties. No Tailwind or CSS-in-JS dependency; consumers import `@quartile/react/styles.css` once.
- Every color, radius, shadow, space and control size comes from a `--q-*` token in `src/styles/tokens.css`. Never hard-code a hex value in component CSS unless the design specifies a one-off (disabled fills, for instance) and no token fits.
- Class names: `q-<component>` for the root, `q-<component>-<part>` for parts. Variants, sizes and states are data attributes: `data-variant`, `data-size`, `data-state`, `data-tone`. Use ARIA attributes (`aria-selected`, `aria-pressed`, `aria-current`, `aria-invalid`) as styling hooks where they exist.
- Each component keeps its stylesheet next to it (`button/button.css`). The build concatenates them; there is no shared CSS index to edit.
- Density: read `--q-control-h`, `--q-control-h-sm`, `--q-control-h-lg`, `--q-control-px`, `--q-control-font`, `--q-row-h` and `--q-card-pad`. Compact density remaps them; components should not branch on density in JS.
- Dark theme: tokens are remapped under `[data-theme='dark']`. If a component looks wrong in dark, fix the token usage, not the component.
- SVG colors go through `style={{ fill, stroke }}` so CSS variables resolve; presentation attributes do not reliably accept `var()`.
- Numbers use `.q-num` or `font-family: var(--q-font-mono)` with tabular figures.

## Components

- Function components with `forwardRef` where a DOM ref is useful. Spread remaining props onto the root.
- Controlled and uncontrolled: `value`/`defaultValue`/`onChange` via `useControllable`.
- Accessible by default: native elements first (`button`, `input`), correct roles otherwise, a visible `:focus-visible` ring using `var(--q-focus-ring)`, full keyboard support, labels associated with inputs.
- Overlays render through `<Portal>` and position with `useFloating`; dismiss with `useDismiss`. They share one elevation (`--q-shadow-1`) and tooltips and toasts share the dark inverse surface.
- Export from your workstream's barrel (`*.exports.ts`), never from `src/index.ts` directly.

## Data components

Every chart and data-display component follows the same contract:

1. Accept `data: DataInput` (rows, or `dataset(rows, fields)` with a schema) and field names as strings. Row generics extend `Row` (`Record<string, unknown>`), so callers describe row shapes with `type` aliases; a TypeScript `interface` lacks an index signature and is rejected.
2. `resolveData(data)` gives rows and a schema; `fieldOf(schema, name, rows)` gives a field with its type, label and format.
3. `useLinkedRows(rows, { selection, source })` returns rows filtered by every predicate in the nearest `<Selection>` except the ones this component published. `source` comes from `useSourceId(props.id)`.
4. Publish with `selection.set(field, value, { op, source })` (brush: `op: 'between'`; click: `selection.toggle(field, value, { source })`). Clear with `selection.clear(field)`.
5. Format values with `makeFieldFormatter(field, { locale, timeZone, surface })`; use `surface: 'axis'` or `'tooltip'` where appropriate and pass explicit component overrides as its third argument. Axis ticks go through `tickFormatter`. Field-specific formats and time zones are preserved; full exact-table values use the base field format. `makeRangeFormatter` and `formatParts` support ranges and rich presentation. See [formatting](guides/formatting.md).
6. Built-in states: accept `ChartStateProps` (`loading`, `error`, `errorCode`, `onRetry`, `empty`) and render through `ChartFrame`, which keeps the size so layouts never jump.
7. Accessibility: `useChartKeyboard` for arrow-key navigation, an `aria-live` announcement for the focused point, an auto-written summary via `summarizeSeries` or an equivalent, and a formatted `ChartTable` passed to `ChartFrame` as `table`. Smaller charts expose a hidden table; ScatterPlot above 200 visible points exposes exact values through a lazy table in pages of 50, avoiding an unbounded hidden DOM. `view="table"` opens the table directly.

`LineChart` is the reference implementation of this contract.

## Markdown blocks

The [language](language.md) compiles to the same `QuartileSpec` that `SpecView` renders; it never adds a second rendering path. Add a chart kind by adding a component to the spec schema and a row to `src/lang/kinds.ts` (its sentence mapping and dashboard defaults); settings are coerced from the component's JSON Schema automatically. Compiler choices (inferred encodings, default aggregation, ordinal x, synthetic counts) must report a diagnostic, and unknown fields must stay errors. Every rendering path (React, server, embed) must keep a block readable without JavaScript.

## Data sources

A block names where its rows come from; it never fetches. The pieces:

- `src/lang/table.ts` reads inline text and loaded responses: CSV, TSV, Markdown tables and JSON, including API envelopes. `src/lang/path.ts` follows a `path:` setting. Both report what they chose as notes and what they could not read as errors that name the keys present. A path is a lookup with no wildcards or expressions; keep it that way.
- The compiler records each `src:` in `CompiledBlock.sources` as `{ name, url, path, refresh }` and treats the dataset as pending. It makes no request.
- `src/lang/source.ts` holds the packaged loader. `createSourceLoader` reads exact origins only, http(s) only, omits credentials off the page's origin, bounds size and time, and refuses redirects that leave the list. Request headers come from host code. New loading behavior belongs here, behind the host's opt-in, and must keep "nothing is fetched by default".
- `src/markdown/sourceStore.ts` loads each URL once per document or page, retries failures instead of caching them, and reloads on a block's `refresh:` while the page is visible and a mounted block holds the source. `QuartileDocument` owns one; the embed's page scope shares one across the elements of a page.
- The server renderers call the host's `loadSource` once per source and fail the render when a source cannot be read.

The reader-facing description is [data sources](guides/data-sources.md); update it with the code.

## Presentation settings

Margins, colors, axis bounds and ticks, gridlines, legend placement, value labels, reference lines, the log scale, line width, bar corners and annotations are plain values (numbers, booleans, a few words, validated color tokens), so one setting can be a React prop, a JSON spec property and a line in a block.

- `src/charts/core/options.ts` holds the shared helpers (`marginSides`, `valueAxis`, `gridLines`, `legendPlacement`, `referenceLines`) and `ChartPresentationProps`. With no setting, each helper returns what the chart drew before the setting existed. A chart adds a setting by adding the prop, the schema property and its use of the helper; `packages/react/test/docs-guides.test.tsx` then requires the table in the [styling guide](guides/styling.md) to say so.
- `src/charts/core/colors.ts` serves two kinds of author. A React prop is developer code: `chartColor` maps a palette name or `1` to `8` to its token and uses another string as a CSS color. Text from a block or a JSON spec is not trusted: `isChartColor` allows a palette name, `1` to `8` or hex, and nothing else, so such text cannot carry `url()` or a second declaration into the page. That rule is enforced at each place text becomes a spec or props: the schema pattern (`validateSpec`), the block compiler, and `SpecView` (`specColors`). A new path from text to a chart must pass one of these gates; `src/spec/color-gates.test.tsx` checks the existing ones.
- `src/lang/style.ts` reads the forms the generic schema coercion cannot (`margin: 16 24`, `y.min: 2%`, `reference.label: Target`, `color: #2f45e8`). A refused color is a warning, not an error. `blockColors: false` (document, block, compiler, static renderer, embed) drops block colors with a note.
- Marks measured from zero keep their baseline: a bar chart or a stacked area ignores a minimum above zero, in the compiler with a warning and in the chart itself. Keep that rule when adding a chart whose marks encode length.
- Custom charts use the same exports. `packages/react/test/custom-chart.test.tsx` builds two from the public entry only; a new chart-core export belongs in that test.

## Interaction

- **Groups.** A view's selection group is its `link:` name, else the name of the dataset it reads, else it stands alone (`block-<n>` inside a document). `compileBlock` returns it as `link`. Views in a dashboard or in a named group publish by default (`select` or `brush`, per `KINDS[kind].link`); a block with its own rows publishes only when it asks. `QuartileDocument` keeps one `SelectionStore` per group, or asks the host's `stores` function.
- **Reporting.** `SelectionWatch` reports a store's changes; `QuartileDocument`, `QuartileBlock` and `SpecView` pass them to `onSelectionChange({ group, predicates })`, once per change. `selectionHandle` (`src/selection/handle.ts`) is the read/write surface behind `QuartileDocumentHandle.selection(group)` and the embed's `Quartile.selection(group)`. The embed element dispatches `quartile-select`, with `origin` true where the reader acted.
- **Actions.** `src/spec/actions.ts` decides which component can show `table`, `rows` and `download`, and how a host default and a host `false` combine with a view's own list. `ViewActions.tsx` renders the toolbar and the rows panel. Rows and downloads are the dataset's rows under the group's whole selection, the view's own included. A dashboard over one dataset has one toolbar and one panel. Static rendering passes `actions: false`, because buttons need script.
- **Provenance.** `source`, `sourceUrl` and `asOf` are spec properties of each component and of a dashboard. `src/spec/provenance.ts` is the one check for what may become a link (absolute http or https, no credentials); text is rendered as text. `source:` in a block states provenance; `src/lang/provenance.ts` keeps the former meaning (a dataset name) only for a view with no other data, with a warning.
- **Explorer.** The `explorer` kind compiles to `DataExplorer` with a bounded set of spec properties; it follows its group's selection and publishes none.

The reader-facing descriptions are the [styling](guides/styling.md) and [interaction](guides/interaction.md) guides; update them with the code.

## The `quartile` command

`src/cli/` builds to `dist/cli.js`, the package's `bin`. `quartile check <files>` runs `compileBlock` over the fenced blocks of each Markdown file in two passes (first the `data` blocks, which define datasets for the whole file, then every block) and prints `file:line: severity: message`. It exits 1 on errors and 2 when it cannot run. `quartile prompt` prints `quartilePrompt()`. The command reads files and standard input only; it makes no network request and does not load `src:` URLs. `packages/react/test/docs-blocks.test.ts` applies the same check to this repository's documentation in the test suite.

## The examples app

`apps/gallery` is a Vite app that renders the library from source. `src/routes.ts` is the single table of its pages: the router, the index page, the prerender script and the sitemap all read it. Each page, static file and built asset is served under `/examples`, because the documentation site proxies that path to the app; `scripts/prerender.mjs` fails the build when a route or a deployed file falls outside it. `pnpm build` prerenders each route to static HTML ([how](guides/server-rendering.md#how-the-examples-app-is-prerendered)). A component catalog used as a test bed during development is available only from the dev server and is excluded from production builds.

## Local table state and reviewed analysis

`DataExplorer` composes DataTable with local typed filters/search, grouping, multi-sort, column controls, view JSON and CSV export. Shared Selection filters run first; explorer filters remain local. `TableViewState` stores configuration, not records or permissions. Editing is a controlled callback with stable row identity; the caller owns persistence and authorization. See [tables](guides/tables.md).

The optional AI entry separates a bounded metadata/profile context from `AnalysisPlan` proposals. Validation checks fields, types and action limits. The hook cancels/invalidates stale proposals and requires explicit Apply; the pure reducer returns view state without querying, mutating Selection, or executing code. An adapter may call an application-owned server, but provider credentials and model execution stay outside the library. See [AI assistance](guides/ai-assistance.md).

Scientist examples keep retention and classification calculations in `apps/gallery/src/examples/science`, with unit tests under `packages/react/test`. They illustrate application math rather than enlarging the component package into a training engine. Python snapshot and local model-server examples live under `examples/` and have separate runtime requirements.

## Honesty rules

Docs, example copy and component descriptions describe only what the code does. Do not claim renderers, data sources, sizes, performance numbers, adoption numbers or compatibility that have not been built and measured.
