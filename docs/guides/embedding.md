# Embedding and styling

One script draws Quartile blocks on an HTML page, with no build step, and takes its colors and fonts from the page it lands on. React applications use the components directly; other pages use the script and the `<quartile-chart>` element.

## The script

```html
<script src="/assets/quartile.global.js" data-theme="auto"></script>
```

`quartile.global.js` is a standalone build: React, the components and the stylesheet in one file. Download it from the preview build's GitHub release, or copy it from `node_modules/@quartile/react/dist/embed/` after installing the package ([installation](installation.md)), and serve it from your own site. It makes no network requests of its own. An ES module build sits next to it as `quartile.js`. The [plain-HTML demo](https://docs.usequartile.com/examples/embed/demo) is a page with no build step.

On load the script:

1. defines `<quartile-chart>`;
2. upgrades Quartile code blocks as Markdown renderers emit them: `pre > code.language-quartile`, `pre > code.lang-quartile`, `pre.language-quartile` and highlighter wrappers such as `div.language-quartile` (VitePress, Shiki);
3. upgrades blocks pre-rendered by the [static renderers](server-rendering.md) (`[data-quartile-source]`);
4. keeps watching the page, so blocks added later (single-page docs, chat messages) are upgraded too.

Each original stays where it was, hidden, and the chart is inserted after it. Frameworks that own that markup (Vue, Svelte, a chat UI) keep working; readers without JavaScript and crawlers keep the code or the static chart. When the original's text changes, as in a streaming chat message, the chart follows it, drawing the block as streaming until the text has been still for a moment; when the original is removed, so is the chart.

| Script attribute | Values | Default |
|---|---|---|
| `data-theme` | `auto`, `system`, `light`, `dark` | `auto` |
| `data-host` | a [host preset](#host-presets) | none |
| `data-accent` | any CSS color | none |
| `data-sources` | `none`, `same-origin` and exact origins such as `https://api.example.com`, separated by spaces or commas | `none` |
| `data-min-refresh` | the shortest `refresh:` interval a block may ask for, in seconds | `10` |
| `data-languages` | fence names, separated by spaces or commas | `quartile` |
| `data-auto` | `false` to skip upgrading on load | upgrade |

The same options can be set before the script with `window.QuartileConfig = { sources: 'same-origin', host: 'vitepress' }`. Its keys are the attribute names above without `data-`, in camelCase: `theme`, `host`, `accent`, `sources`, `minRefresh`, `languages`, `auto`. After it has loaded, the script is the global `Quartile`: `Quartile.configure(options)`, `Quartile.upgrade(root)`, `Quartile.observe(root)`, `Quartile.reload(url?)` and `Quartile.QuartileChartElement`. The ES module `quartile.js` exports the same names.

## The element

```html
<quartile-chart theme="auto" accent="#0f766e">
  <script type="text/quartile">
    line sum(revenue) by month
    data: sales
  </script>
</quartile-chart>
```

The block text comes from, in order: the `source` property, the `source` attribute, a child `<script type="text/quartile">`, a child `[data-quartile-source]`, a child `pre`/`code`, or the element's text (indentation is removed). Attributes: `theme`, `host`, `accent`, `density`, `locale`, `time-zone`, `initial-width`, `data-display` (`summary`, `table`, `hidden` for `data` blocks). Setting `element.source = text` re-renders.

Elements on one page form one document: a `data` block in any element is available to all of them, and elements over the same dataset share a selection.

In an application with its own bundler and React, import the element instead of the standalone file and supply the stylesheet text yourself (in Vite: `import css from '@quartile/react/styles.css?inline'`):

```ts
import { defineQuartileElements, observeBlocks, setEmbedStyles } from '@quartile/react/embed';
setEmbedStyles(css);
defineQuartileElements();
observeBlocks(document);
```

## Loading data

A block's `src:` line names a URL. The page decides what is fetched, and by default nothing is:

```html
<script
  src="/assets/quartile.global.js"
  data-sources="same-origin https://api.example.com"
  data-min-refresh="30"
></script>
```

| `data-sources` value | Allows |
|---|---|
| `none` (default) | Nothing. The block explains that the page does not load remote data. |
| `same-origin` | Files and endpoints on the page's own origin, such as `src: data/sales.csv` next to a docs page. These requests send the page's cookies. |
| an exact origin | That origin: scheme, host and port, such as `https://api.example.com`. Cookies are not sent, and the API must allow your page with CORS headers. |

Origins are matched whole. There are no wildcards; a value that is not `none`, `same-origin` or an exact http(s) origin is ignored with a console warning.

- **Responses.** CSV, TSV and JSON are parsed like inline rows, up to 50,000 rows, 5 MB and 15 seconds per response. A block's `path:` says where the rows are in a JSON response.
- **Refresh.** A block's `refresh: 30s` reloads its URL while the page is visible. `data-min-refresh` sets the shortest interval a block may ask for (10 seconds by default).
- **Reload.** `Quartile.reload()` fetches the page's sources again; `Quartile.reload('/api/orders.json')` reloads one URL. Charts keep their rows until the new ones arrive.
- **Configure from JavaScript.** `Quartile.configure({ sources, minRefresh, maxBytes, timeoutMs, loadSource })`. `sources` is the same list as a string or an array, or a function `(url: URL) => boolean`. `loadSource: (url, signal) => myApi(url, signal)` replaces fetching with your own function, which may map your own names to authorized queries and return rows, text or parsed JSON.

```html
<script>
  Quartile.configure({ sources: ['same-origin', 'https://api.example.com'], timeoutMs: 8000 });
  document.querySelector('#refresh').addEventListener('click', () => Quartile.reload());
</script>
```

Do not allow origins you do not control on pages that display model output: a prompt-injected block could otherwise encode data into a URL. An allowlist limits the origin, not the path or the query a block writes. The [data sources guide](data-sources.md) covers `path:`, `refresh:`, authentication, the error messages and the [security model](data-sources.md#12-security-model).

## Styling

Every component reads `--q-*` custom properties ([tokens](../../packages/react/src/styles/tokens.css)). Five layers, from least to most work:

1. **`theme="system"`** follows the reader's light or dark preference. It is resolved by CSS, so it is correct on the server, on the first paint and without JavaScript.
2. **`theme="auto"`** matches the surrounding page: Quartile reads the page's background (the first opaque one up the tree) and text color, chooses light or dark from the background's lightness, and mixes every neutral (lines, grid, muted text, hover fills) from those two colors with `color-mix()`. Interface text uses the page's font; numbers stay in the tabular monospace face. It re-reads when the page switches themes (class, `style`, `data-theme`, `data-mode`, `data-color-mode`, `data-md-color-scheme` or `data-bs-theme` changes, and color-scheme changes). Before the page can be read (server, first render), it behaves like `system`.
3. **`host`** maps a known design system's CSS variables in plain CSS, so it also styles server-rendered and static output.
4. **`accent`** sets the brand color used for selection and the first series, with hover, soft and sequential shades mixed from it.
5. **Your own tokens**: in React, set `--q-*` variables on a class passed to the provider ([integration](integration.md#existing-design-systems)); on the embed, style the element's `root` part. Page rules on a part win over the shadow root's own rules.

```html
<style>
  quartile-chart::part(root) {
    --q-signal: var(--brand-600);
    --q-font-mono: "JetBrains Mono", ui-monospace, monospace;
  }
</style>
```

### Host presets

| `host` | Variables read | Sources |
|---|---|---|
| `shadcn` | `--background`, `--card`, `--foreground`, `--card-foreground`, `--muted-foreground`, `--border`, `--input`, `--primary`, `--primary-foreground`, `--chart-1` … `--chart-5` | [shadcn/ui theming](https://ui.shadcn.com/docs/theming) |
| `shadcn-hsl` | the same variables holding Tailwind v3 HSL channels (`0 0% 100%`), wrapped in `hsl()` | [Tailwind v4 migration](https://ui.shadcn.com/docs/tailwind-v4) |
| `vitepress` | `--vp-c-bg`, `--vp-c-text-1`, `--vp-c-text-2`, `--vp-c-divider`, `--vp-c-border`, `--vp-c-brand-1`, `--vp-font-family-base`, `--vp-font-family-mono` | [vars.css](https://github.com/vuejs/vitepress/blob/main/src/client/theme-default/styles/vars.css) |
| `docusaurus` | `--ifm-background-color`, `--ifm-background-surface-color`, `--ifm-font-color-base`, `--ifm-color-content-secondary`, `--ifm-color-emphasis-300`, `--ifm-color-primary`, `--ifm-font-family-base` | [Infima variables](https://github.com/facebookincubator/infima/blob/main/packages/core/styles/common/variables.pcss) |
| `starlight` | `--sl-color-bg`, `--sl-color-white`, `--sl-color-text`, `--sl-color-gray-3`, `--sl-color-hairline`, `--sl-color-accent`, `--sl-font-system` | [props.css](https://github.com/withastro/starlight/blob/main/packages/starlight/src/style/props.css) |
| `mkdocs` | `--md-default-bg-color`, `--md-typeset-color`, `--md-default-fg-color`, `--md-default-fg-color--light`, `--md-default-fg-color--lightest`, `--md-accent-fg-color` | [Material for MkDocs colors](https://github.com/squidfunk/mkdocs-material/blob/master/src/templates/assets/stylesheets/main/_colors.scss) |
| `primer` | `--bgColor-default`, `--fgColor-default`, `--fgColor-muted`, `--borderColor-default`, `--fgColor-accent` | [Primer color](https://primer.style/product/primitives/color/) |
| `pico` | `--pico-background-color`, `--pico-card-background-color`, `--pico-color`, `--pico-muted-color`, `--pico-muted-border-color`, `--pico-primary`, `--pico-font-family` | [Pico variables](https://picocss.com/docs/css-variables) |
| `radix` | `--color-background`, `--color-panel-solid`, `--gray-12`, `--gray-11`, `--gray-a6`, `--accent-9`, `--accent-contrast` | [Radix Themes color](https://www.radix-ui.com/themes/docs/theme/color) |
| `open-props` | `--surface-1`, `--surface-2`, `--text-1`, `--text-2`, `--brand`, `--link` | [Open Props theme](https://github.com/argyleink/open-props/blob/main/src/extra/theme.css) |

Combine a preset with `theme="auto"` (or the host's own dark-mode switch mapped to `theme`) so that Quartile's categorical and semantic colors also switch between their light and dark sets. A CSS variable that is defined but invalid (for example bare HSL channels read by `shadcn`) does not fall back to anything; that is why `shadcn-hsl` exists.

## Why a shadow root

The embed renders each chart in an open shadow root. Inherited properties (text color, font) and custom properties cross the boundary, so charts look native; page selectors do not, so prose themes that style every `table`, `svg` or `button` cannot distort a chart. The stylesheet is adopted with constructable stylesheets where supported and falls back to a `<style>` element. A strict Content Security Policy that disallows inline styles needs `style-src 'unsafe-inline'` for that fallback, or a browser with constructable stylesheets.

## Accessibility

Embedded charts keep the library's behavior: keyboard navigation, a generated summary, a data table alternative and `role="figure"` with the title as its name. See [accessibility](accessibility.md); screen-reader testing of the new surfaces has not been done yet.
