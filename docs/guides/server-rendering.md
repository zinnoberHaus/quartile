# Server rendering, static output and SEO

Quartile charts render to real SVG and HTML tables on a server, at build time, and on the first client render. Pages therefore show charts before JavaScript runs, readers without JavaScript see them, and crawlers that do not execute JavaScript (most AI crawlers, per [Vercel's analysis](https://vercel.com/blog/the-rise-of-the-ai-crawler)) can read the numbers.

## How charts size themselves on a server

A chart cannot measure its container on a server. It draws at `QuartileProvider initialWidth` (640 px by default) with a `viewBox`, and CSS scales that drawing to the container (`data-width="assumed"`). After hydration it measures and redraws at the exact width. Heights are fixed by the chart's `height`, so the page does not shift when the redraw happens.

```tsx
<QuartileProvider theme="system" initialWidth={720} timeZone="UTC" locale="en-US">
```

- Use `theme="system"` (CSS-resolved) or a fixed theme on servers. `theme="auto"` renders as `system` until the page can be read in the browser.
- Pass `timeZone` and `locale` explicitly so server and client format dates identically and hydration matches.
- Choose `initialWidth` close to your content column to minimize scaling before the redraw.

## React and Next.js

The default entry `@quartile/react` is a client module (`'use client'`). Render charts, `QuartileBlock` and `QuartileDocument` from client components; they are still server-rendered by Next.js and other React frameworks. Fetch and authorize data on the server and pass rows down.

The language and static entries are plain modules without the client directive, so server components and route handlers can call them:

```ts
// app/report/page.tsx (a server component)
import { compileBlock } from '@quartile/react/lang';
import { renderBlockToHTML } from '@quartile/react/server';
```

## Static HTML

`@quartile/react/server` renders without a browser:

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

## Progressive enhancement

Static output is complete without JavaScript: the chart, its summary and its numbers are in the HTML. Adding the [embed script](embedding.md) draws the interactive chart (tooltips, keyboard navigation, linked selection) in place of each static block and keeps the static markup in the page, hidden. Both renderings use the same fixed height, so the swap does not move the page.

## What crawlers see

- The chart's accessible name (its title) and a generated summary, for example "3 bars. Highest Americas at $2,100,000; lowest APAC at $860,000.", are in the HTML.
- The plotted values are in a real `<table>`, visually hidden unless the reader asks for the table view.
- The SVG holds the axis labels as text.

Give every block a `title:` and keep `description:`/`note:` factual: they become the chart's name and description for search engines and assistive technology.

## The gallery site

The public gallery prerenders all 15 routes to static HTML at build time with React's `react-dom/static` `prerender`, injects per-route titles, descriptions, canonical URLs, Open Graph tags and JSON-LD, and writes `sitemap.xml`, `robots.txt` and `llms.txt`. Thirteen routes hydrate; the dataset explorer and Studio show times in the reader's time zone on their first render, so they are prerendered in full but mounted fresh in the browser. The setup is in the gallery's `src/routes.ts`, `src/ssr/`, `scripts/prerender.mjs`, `scripts/verify-prerender.mjs` and `vercel.json`.
