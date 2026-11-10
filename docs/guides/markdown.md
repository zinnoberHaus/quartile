# Markdown and documentation sites

Write charts and dashboards as ```` ```quartile ```` blocks in any Markdown file, then pick the renderer that matches your site. The block syntax is specified in the [language reference](../language.md); try it in the [playground](https://quartile-design.vercel.app/language).

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
| Any HTML page (MkDocs, Hugo, Jekyll, dbt docs, a CMS) | The embed script | No (charts appear after the script runs) | Yes |
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
- `loadSource={(url, signal) => fetch(url, { signal }).then((r) => r.text())}` lets blocks load `src:` URLs. Without it nothing is fetched. Check URLs against your own allowlist inside the function.
- `theme`, `host`, `accent`, `density`, `locale` and `timeZone` are `QuartileProvider` props; see [embedding and styling](embedding.md#styling).
- `languages={['quartile', 'chart']}` also treats other fence names as Quartile blocks.

Renderers that only let you replace `code` can use `QuartileCode`; `quartileComponents()` returns a ready `components` object.

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
import { remarkQuartile } from '@quartile/react/server';

const html = String(
  await unified()
    .use(remarkParse)
    .use(remarkQuartile, { timeZone: 'UTC', loadSource: (url) => readFile(join(dir, url), 'utf8') })
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

remark plugins may be asynchronous, so `remarkQuartile` can load `src:` files at build time; markdown-it renders synchronously, so pass datasets in. Include `@quartile/react/styles.css` on the page, and add the embed script if readers should be able to click and filter. In VitePress, register the plugin in `markdown.config` and import the stylesheet in your theme.

`onDiagnostics` receives every block's errors, so a docs build can fail on a misspelt column:

```ts
markdownItQuartile(md, {
  onDiagnostics: (diagnostics, source) => {
    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length) throw new Error(`${errors[0].message}\n${source}`);
  },
});
```

## Any HTML page

Sites you cannot extend with React or a Markdown plugin can include the [embed script](embedding.md). It finds ```` ```quartile ```` code blocks as Markdown renderers emit them (`pre > code.language-quartile`, highlighter wrappers such as `div.language-quartile`) and draws each as an interactive chart next to it, keeping the original in place but hidden. See the [plain-HTML demo](https://quartile-design.vercel.app/embed/demo).

## Hosts that run no scripts

GitHub, GitLab and most repository viewers render Quartile blocks as code. The block is still the data: a reader sees the kind, the settings and the rows. A pre-rendered image for these hosts is not built yet.

## Write blocks that read well as text

- One idea per block; name it with `title:`.
- Keep inline rows short. Aggregate before charting; reuse a `data` block instead of repeating rows.
- Use snake_case column names. Labels are written for you, and `revenue.description:` explains a field in tooltips and table headers.
- Write units into formats (`format: currency EUR`) and titles, not into numbers.
