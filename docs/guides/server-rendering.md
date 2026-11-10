# Server rendering, static output and SEO

Quartile charts render to real SVG and HTML tables on a server, at build time, and on the first client render. Pages therefore show charts before JavaScript runs, readers without JavaScript see them, and crawlers that do not execute JavaScript (most AI crawlers, per [Vercel's analysis](https://vercel.com/blog/the-rise-of-the-ai-crawler)) can read the numbers.

## Which entry runs where

| Entry | Holds | Runs in |
|---|---|---|
| `@quartile/react` | Charts, `QuartileBlock`, `QuartileDocument` and the Markdown adapters. A client module (`'use client'`). | Client components. React frameworks still render them on the server, so the SVG is in the HTML. |
| `@quartile/react/lang` | The parser and compiler, `quartilePrompt`, the tool schemas, `createSourceLoader`, the dbt helpers. No React. | Server components, route handlers, workers, build scripts and browsers. |
| `@quartile/react/server` | `renderBlockToHTML`, `remarkQuartile`, `markdownItQuartile`, `renderMarkdownBlocks`. Uses React and `react-dom/server` to write static HTML. | Node code outside a React Server Components graph: build scripts, static-site generators and Markdown pipelines. |

## How charts size themselves on a server

A chart cannot measure its container on a server. It draws at `QuartileProvider initialWidth` (640 px by default) with a `viewBox`, and CSS scales that drawing to the container (`data-width="assumed"`). After hydration it measures and redraws at the exact width. Heights are fixed by the chart's `height`, so the page does not shift when the redraw happens.

```tsx
<QuartileProvider theme="system" initialWidth={720} timeZone="UTC" locale="en-US">
```

- Use `theme="system"` (CSS-resolved) or a fixed theme on servers. `theme="auto"` renders as `system` until the page can be read in the browser.
- Pass `timeZone` and `locale` explicitly so server and client format dates identically and hydration matches.
- Choose `initialWidth` close to your content column to minimize scaling before the redraw.

## React and Next.js

The default entry `@quartile/react` is a client module. Render charts, `QuartileBlock` and `QuartileDocument` from client components. Next.js and other React frameworks still render client components on the server, so the chart's SVG, its summary and its table are in the HTML response. Fetch and authorize data on the server and pass rows down.

```tsx
// app/report/page.tsx (a server component)
import { Report } from './report';

export default async function Page() {
  const [markdown, orders] = await Promise.all([loadReportMarkdown(), loadOrdersForUser()]);
  return <Report markdown={markdown} orders={orders} />;
}
```

```tsx
// app/report/report.tsx
'use client';
import Markdown from 'react-markdown';
import { QuartileDocument, QuartilePre, type Row } from '@quartile/react';
import '@quartile/react/styles.css';

export function Report({ markdown, orders }: { markdown: string; orders: Row[] }) {
  return (
    <QuartileDocument markdown={markdown} data={{ orders }} theme="system" timeZone="UTC" locale="en-US">
      <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
    </QuartileDocument>
  );
}
```

`@quartile/react/lang` has no React in it, so server components and route handlers can call it: compile or validate a block, find the blocks in a document, or build the model prompt.

```ts
// app/api/check/route.ts (a route handler)
import { compileBlock, findFencedBlocks } from '@quartile/react/lang';

export async function POST(request: Request) {
  const { markdown } = await request.json();
  const problems = findFencedBlocks(markdown).flatMap((block) =>
    compileBlock(block.source).diagnostics.filter((d) => d.severity === 'error'),
  );
  return Response.json({ ok: problems.length === 0, problems });
}
```

`@quartile/react/server` is different. Its static renderer needs the full React build and `react-dom/server`, which the React Server Components module graph does not provide. Importing it from a server component or a route handler in the Next.js App Router fails at build with `TypeError: createContext is not a function` (tested with Next.js 16; listing the package in `serverExternalPackages` does not help). In a Next.js project, use the client components above for pages, and keep `@quartile/react/server` for Node code that runs outside that graph, such as a script that runs before `next build`.

## Static HTML

`@quartile/react/server` renders without a browser. Call it from a Node build script, a static-site generator or a Markdown pipeline (Astro, Eleventy, VitePress):

```ts
import { renderBlockToHTML } from '@quartile/react/server';

const html = renderBlockToHTML('bar sum(revenue) by region\n---\nregion,revenue\nEMEA,1200\n', {
  theme: 'light',
  timeZone: 'UTC',
  initialWidth: 720,
  datasets: { sales },
  onDiagnostics: (diagnostics, source) => {/* fail a build on errors */},
});
```

The result is a `<div class="quartile-static" data-quartile-source="…">` containing the chart's SVG, its accessible summary and an HTML table of the plotted values. Include `@quartile/react/styles.css` on the page. `remarkQuartile` and `markdownItQuartile` apply the same rendering to whole Markdown documents, and `renderMarkdownBlocks` returns one rendering per block; see [Markdown and documentation sites](markdown.md).

Blocks that name a `src:` URL are loaded once, at render time, through the `loadSource` function you pass to `remarkQuartile` or `renderMarkdownBlocks`. `createSourceLoader` from `@quartile/react/lang` builds one that reads only the origins you list:

```ts
import { createSourceLoader } from '@quartile/react/lang';
import { renderMarkdownBlocks } from '@quartile/react/server';

const loadSource = createSourceLoader({ origins: ['https://api.example.com'] });
const blocks = await renderMarkdownBlocks(markdown, { loadSource, timeZone: 'UTC' });
```

A source that cannot be read stops the render with an error, and `refresh:` has no effect in static output. See [the loader on a server](data-sources.md#8-the-loader-on-a-server).

## Progressive enhancement

Static output is complete without JavaScript: the chart, its summary and its numbers are in the HTML. Adding the [embed script](embedding.md) draws the interactive chart (tooltips, keyboard navigation, linked selection) in place of each static block and keeps the static markup in the page, hidden. Both renderings use the same fixed height, so the swap does not move the page.

## What crawlers see

- The chart's accessible name (its title) and a generated summary, for example "3 bars. Highest Americas at $2,100,000; lowest APAC at $860,000.", are in the HTML.
- The plotted values are in a real `<table>`, visually hidden unless the reader asks for the table view.
- The SVG holds the axis labels as text.

Give each block a `title:` and keep `description:`/`note:` factual: they become the chart's name and description for search engines and assistive technology.

## How the examples app is prerendered

The examples at <https://docs.usequartile.com/examples> are the app in `apps/gallery`, built as static HTML with the approach on this page.

- **One table of routes.** `src/routes.ts` lists each page with its path, title, description and h1. The app renders from it, the index page lists it, and the prerender script writes one HTML file per entry, so they cannot drift apart. It has 15 React routes and one plain HTML page, the script-tag demo.
- **Build.** `vite build` writes the site, `vite build --ssr` writes a server entry, and `scripts/prerender.mjs` renders each route with React's `react-dom/static` `prerender`. It sets `progressiveChunkSize: Infinity`, so each chart stays where it belongs in the HTML instead of being moved to the end and swapped in by a script.
- **Head tags.** Each file gets its own title, description, canonical URL, Open Graph and Twitter tags and JSON-LD. The script also writes `examples/sitemap.xml` and `examples/llms.txt`.
- **Hydration.** Thirteen routes hydrate the prerendered markup. The dataset explorer and Studio show times in the reader's time zone on their first render, which a build cannot know, so they are prerendered in full and then rendered again in the browser.
- **One path.** Pages, static files and built assets all live under `/examples` (assets in `/examples/_assets`). The documentation site proxies `/examples/*` to the app, which is why the same paths work on both hosts. The app's own origin answers `robots.txt` with `Disallow: /`, so the pages are indexed at the documentation site's URLs, and it redirects the paths from before the move (`/language`, `/studio`, `/embed/…`) to their new locations.
- **Checks.** `scripts/verify-prerender.mjs` loads each page from the sitemap without JavaScript and checks its head tags, its h1 and its chart SVG, then checks that each page hydrates without console errors in two locales and time zones.

The setup is in `apps/gallery`: `src/routes.ts`, `src/ssr/`, `scripts/prerender.mjs`, `scripts/verify-prerender.mjs` and `vercel.json`.
