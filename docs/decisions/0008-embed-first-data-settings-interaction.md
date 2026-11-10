# 0008: The chart block first: data sources, presentation settings and interaction

Date: 2026-11-10 · Status: accepted for the preview

## Context

ADR 0007 added the block language, static rendering and the standalone script. Using blocks in documents, AI answers and plain pages showed what it had left out or decided narrowly:

- **Data.** 0007 point 4 let `src:` load through a host loader or a same-origin policy. Rows inside a JSON API envelope, APIs on another origin, request headers and data that changes were not covered. Hosts wrote the same fetch-and-check function each time.
- **Presentation.** 0007 points 4 and 9 accepted no styling in a block: the host decided everything. An author or a model could not set a margin, an axis range, a legend position, a reference line or a series color without leaving the block for React.
- **Interaction.** Blocks over a named dataset shared a selection store (0007 point 5), but only views that set `select:` or `brush:` published to it. A reader could not get from a chart to its rows. A chart could not say where its numbers came from. A host could not observe or set a selection from outside.
- **Tooling and delivery.** Blocks could be checked only by rendering them. Installing meant building from source. The examples app served a component catalog at its root, on its own host.
- **Scope.** The repository described itself as a React toolkit for data apps. The first thing a new reader needs is the block.

## Decision

1. **The block leads; the React components are the engine.** Documentation, the package description and the agent skill present Quartile as the chart block for Markdown, AI answers and web pages. Nothing is removed: there is still one package (ADR 0001), a block still compiles to the JSON spec and renders through `SpecView` (0007 point 2), and the components, including the chart core for custom charts, remain public API.
2. **Data sources stay the host's decision, with a packaged way to say yes.** A block still only names a URL, and the default is still that nothing is fetched. This amends 0007 point 4:
   - `path:` names where the rows are in JSON as dot-separated keys and positions. It is a lookup: no wildcards, filters or expressions. JSONPath spellings of the same lookup are read with a note. Common envelopes are read without a path (one list of rows; a key named `rows`, `data`, `results`, `items` or `records`; bare arrays with column names beside them), each choice reported as a note, and the block does not guess between unnamed candidates.
   - `refresh:` reloads a `src:` on a timer, above a floor the host sets (10 seconds by default), while the page is visible and a mounted block uses the source. A failed reload keeps the last rows.
   - The script's `data-sources` takes `none`, `same-origin` and exact origins. Origins are matched whole; there are no wildcards.
   - `createSourceLoader({ origins, base, headers, maxBytes, timeoutMs, fetch })` is the packaged loader for React and for the server renderers: http(s) only, credentials only on the page's own origin, bounded size and time, redirects out of the list refused. Request headers come from host code; a block cannot set one.
3. **A block may carry presentation settings.** This amends 0007 points 4 and 9. Styling still follows the host by default, and a block still cannot carry CSS, a class name, HTML or a URL into the page. What changes:
   - Margins, axis bounds and ticks, gridlines, hidden axes, legend placement, value labels, reference lines, a log scale, line width, bar corners and annotations are settings. Each is a number, a boolean, one of a few words or a small JSON value, so the same setting is a React prop, a spec property and a line in a block.
   - **Colors are a closed list.** A block or a JSON spec may name a palette role (`signal`, `positive`, `negative`, `warning`, `muted`), a categorical index (`1` to `8`) or a hex color. One function is the only path from a color setting to a `style`; anything else is dropped with a warning. Palette names read the page's tokens, so they follow the host's theme.
   - **The host can refuse block colors.** `blockColors: false` on the document, the block, the compiler, the static renderer or the script drops color settings with a note and keeps the rest.
   - **Fonts, backgrounds and everything outside the plot are not settable from a block.**
   - **Length-encoded marks keep their baseline.** A bar chart and a stacked area ignore an axis minimum above zero, with a warning.
4. **Views in a named group publish by default.** This amends 0007 point 5. A view that reads a named dataset or sets `link: name` publishes its selection as views in a dashboard do, so blocks over one dataset filter each other without settings. A block with its own rows still publishes only when asked. A group is named by `link:`, else by the dataset, else `block-<n>`.
5. **A view can show its rows.** `actions: table, rows, download` adds a toolbar: the view's table, the rows it is drawn from, and those rows as CSV. Rows and downloads follow the group's whole selection, the view's own included, so a mark traces to its rows. A dashboard over one dataset has one toolbar and one rows panel. No toolbar appears unless a block or the host asks, and a host's `false` wins over a block. Static HTML has no toolbar.
6. **A view can state its provenance.** `source:`, `source.url:` and `asof:` render as one line under a view or a dashboard. The text is rendered as text, the link is shown only for an absolute http(s) address without credentials, and it is never fetched.
7. **`source:` changes meaning.** It formerly named a dataset, as an alias of `data:`. It now states provenance. For blocks already written, a view with no rows, no `data:` and no `src:`, whose `source:` is exactly the name of a known dataset, still reads that dataset, with a warning.
8. **Hosts can observe and set selections.** `onSelectionChange({ group, predicates })` on `QuartileDocument`, `QuartileBlock` and `SpecView`; `selection(group)` and `groups()` on the document's ref; a `quartile-select` DOM event and `Quartile.selection(group)` on the script. What follows a selection is the host's code: the library performs no action on data.
9. **An `explorer` kind.** It compiles to `DataExplorer` with a bounded set of spec properties (columns, sort, page size, grouping, search and export switches). It follows its group and publishes nothing.
10. **A `quartile` command.** `quartile check` compiles the blocks of Markdown files with the renderers' compiler and prints `file:line: severity: message`; `quartile prompt` prints the model prompt. It reads files only and makes no network request. Documentation writes it as `npx --no-install quartile`, so `npx` cannot fetch another package of that name.
11. **The model prompt teaches a few optional lines.** `quartilePrompt()` lists colors, axis range, legend, labels, a reference line and the source, to be added when asked or when they help, and tells the model to set colors only when asked. Teaching `actions:` is an option that is off by default.
12. **The examples app lives under `/examples`.** Pages, static files and assets are served under that one path, so the documentation site can proxy it. The component catalog is available from the development server only.
13. **Preview builds on GitHub pre-releases.** While the npm name waits on the clearance in ADR 0001, a manually run workflow tests, builds and packs the package, stamps the preview version into it, and attaches the tarball, the standalone script and their checksums to a pre-release. A preview build is not a release of 0.1.0.

## Consequences

- Blocks written for 0007 keep working, with two visible differences: views over a named dataset now publish selections, and `source: name` warns where it still names a dataset.
- The schema grows by additive properties: the presentation settings per chart, `actions`, `view`, `source`, `sourceUrl`, `asOf`, and the `DataExplorer` component. `packages/react/test/docs-guides.test.tsx` holds the documentation's table of settings to the schema.
- A color that is not on the list is refused in blocks and specs, including CSS color names. Authors who need a brand color that is not hex set a token on the page and name it.
- A host that shows untrusted blocks has three switches with safe defaults: no data source unless listed, no toolbar unless asked (and `false` to refuse), and `blockColors: false` to refuse colors.
- The standalone script carries the toolbar, the rows panel and the settings; its size is stated in the [embedding guide](../guides/embedding.md) from a measurement, not here.
- Server components and route handlers can call `@quartile/react/lang`. `@quartile/react/server` needs the full React build and runs in Node code outside a React Server Components graph.
- Not built: write-back or any action on data from a block; shared selection groups across documents unless the host shares its stores; selections stored in the URL; download formats other than CSV; request headers on the script's built-in loader; a registry release; and the items 0007 lists (images for hosts that run no scripts, Semantic Layer queries, a smaller standalone build, screen-reader testing).
