# Markdown and documentation sites

Write charts and dashboards as ```` ```quartile ```` blocks in a Markdown file, then pick the renderer that matches your site. The block syntax is specified in the [language reference](../language.md); try it in the [playground](https://docs.usequartile.com/examples/playground). To install the package or the script, see [installation](installation.md).

````markdown
# Q3 review

Online grew in every region.

```quartile
bar sum(revenue) by region and channel
data: sales
stacked: yes
```

```quartile
data sales
---
month,region,channel,revenue
2026-07,EMEA,Online,182000
2026-07,EMEA,Retail,96000
```
````

| Site or toolchain | Use | Server HTML | Interactive |
|---|---|---|---|
| React, Next.js, Remix with react-markdown | `QuartilePre` in `components` | Yes, with server rendering | Yes |
| MDX (Docusaurus, Nextra, Next.js MDX) | `pre: QuartilePre` in MDX components | Yes | Yes |
| unified/remark pipelines (Astro, Eleventy, custom) | `remarkQuartile` | Yes | Add the embed script |
| markdown-it (VitePress, many generators) | `markdownItQuartile` | Yes | Add the embed script |
| An HTML page (MkDocs, Hugo, Jekyll, dbt docs, a CMS) | The embed script | No (charts appear after the script runs) | Yes |
| GitHub, GitLab, stock viewers | Nothing to install | The block shows as text | No |

## React

Wrap the rendered Markdown in `QuartileDocument` and replace `pre`:

```tsx
import Markdown from 'react-markdown';
import { QuartileDocument, QuartilePre } from '@quartile/react';
import '@quartile/react/styles.css';

export function Page({ markdown }: { markdown: string }) {
  return (
    <QuartileDocument markdown={markdown} theme="system">
      <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
    </QuartileDocument>
  );
}
```

- `markdown` lets every block use `data` blocks defined anywhere in the document from the first render, including on the server. Without it, blocks register their datasets as they mount.
- `data={{ orders }}` provides datasets your application already authorized. Blocks read them with `data: orders`. While your app is still fetching a dataset, pass `pending={['orders']}`: blocks over it show a placeholder instead of an error.
- `loadSource={createSourceLoader({ origins: ['same-origin', 'https://api.example.com'] })}` lets blocks load `src:` URLs from the origins you list. Without `loadSource` nothing is fetched. Create the loader once, outside the component. A block's `path:` and `refresh:` then work as described in [data sources](data-sources.md), and a ref to `QuartileDocument` offers `reload()`.
- `theme`, `host`, `accent`, `density`, `locale` and `timeZone` are `QuartileProvider` props; see [embedding and styling](embedding.md#styling).
- `actions={['rows', 'download']}` gives each view a toolbar for the rows behind it by default, and `actions={false}` shows none whatever a block asks. `onSelectionChange` reports what readers select. See [interaction](interaction.md).
- `blockColors={false}` keeps each chart on your page's palette when a block sets `colors:`. See [styling](styling.md#4-colors-a-block-may-set).
- `languages={['quartile', 'chart']}` also treats other fence names as Quartile blocks.

Renderers that only let you replace `code` can use `QuartileCode`; `quartileComponents()` returns a ready `components` object.

Your page's prose styles stop at the block. Each block carries `not-prose`, which Tailwind Typography skips, and keeps its own titles, source lines, buttons and lists against rules written for bare elements, such as `.markdown-body h2` or `article p`. The package checks this against Tailwind Typography, GitHub's `markdown-body` and bare `article` rules (`packages/react/scripts/verify-prose.mjs`).

## MDX sites

MDX renders through React, so register the same component:

```tsx
// Docusaurus: src/theme/MDXComponents.tsx
import MDXComponents from '@theme-original/MDXComponents';
import { QuartilePre } from '@quartile/react';
import '@quartile/react/styles.css';

export default { ...MDXComponents, pre: QuartilePre };
```

Docusaurus and Next.js render MDX on the server, so the charts are in the built HTML (see [server rendering](server-rendering.md)). Use `host="docusaurus"` on a surrounding `QuartileDocument` (or the provider) to take Infima's colors.

## remark and markdown-it

The static renderers write each block's chart as SVG plus a data table into the HTML, with the block source kept in `data-quartile-source` so the embed script can make it interactive:

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { createSourceLoader } from '@quartile/react/lang';
import { remarkQuartile } from '@quartile/react/server';

// Optional: let blocks load `src:` URLs at build time, from the origins you list.
const loadSource = createSourceLoader({ origins: ['https://api.example.com'] });

const html = String(
  await unified()
    .use(remarkParse)
    .use(remarkQuartile, { timeZone: 'UTC', loadSource })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown),
);
```

```ts
import MarkdownIt from 'markdown-it';
import { markdownItQuartile } from '@quartile/react/server';

const md = new MarkdownIt();
markdownItQuartile(md, { datasets: { sales } });
```

remark plugins may be asynchronous, so `remarkQuartile` can load `src:` data at build time through `loadSource`. To read files next to the page instead of URLs, pass your own function; [the loader on a server](data-sources.md#8-the-loader-on-a-server) shows one. markdown-it renders synchronously, so pass datasets in. Include `@quartile/react/styles.css` on the page, and add the embed script if readers should be able to click and filter. In VitePress, register the plugin in `markdown.config` and import the stylesheet in your theme.

Both plugins come from `@quartile/react/server`, which runs in Node build code: a static-site generator, a Markdown pipeline or a build script. It does not run inside React Server Components; in a Next.js App Router project use the React components above. See [server rendering](server-rendering.md#react-and-nextjs).

`onDiagnostics` receives every block's errors, so a docs build can fail on a misspelt column:

```ts
markdownItQuartile(md, {
  onDiagnostics: (diagnostics, source) => {
    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length) throw new Error(`${errors[0].message}\n${source}`);
  },
});
```

## Other HTML pages

Sites you cannot extend with React or a Markdown plugin can include the [embed script](embedding.md). It finds ```` ```quartile ```` code blocks as Markdown renderers emit them (`pre > code.language-quartile`, highlighter wrappers such as `div.language-quartile`) and draws each as an interactive chart next to it, keeping the original in place but hidden. See the [plain-HTML demo](https://docs.usequartile.com/examples/embed/demo).

## Hosts that run no scripts

GitHub, GitLab and most repository viewers render Quartile blocks as code. The block is still the data: a reader sees the kind, the settings and the rows. A pre-rendered image for these hosts is not built yet.

## Check blocks before publishing

`quartile check` compiles the blocks in Markdown files and prints each problem with its line, without rendering:

```sh
npx --no-install quartile check docs/*.md --dataset sales=data/sales.csv
```

It exits with status 1 on errors, so it can gate a docs build or a pull request. The options are in [`quartile check`](coding-agents.md#quartile-check).

## Write blocks that read well as text

- One idea per block; name it with `title:`.
- Keep inline rows short. Aggregate before charting; reuse a `data` block instead of repeating rows.
- Use snake_case column names. Labels are written for you, and `revenue.description:` explains a field in tooltips and table headers.
- Write units into formats (`format: currency EUR`) and titles, not into numbers.
- Say where the numbers came from with `source:` and `asof:`. They are readable in the code block too.
- Leave colors to the page unless a color carries meaning. When it does, prefer the palette names (`positive`, `negative`, `warning`), which follow the page's theme.
