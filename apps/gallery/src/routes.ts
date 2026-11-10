/**
 * Every public route of the examples app. App.tsx renders from this table, the index page lists
 * it and scripts/prerender.mjs writes one HTML file per entry (titles, descriptions, sitemap), so
 * they cannot drift apart.
 */

import type { ScienceKind } from './examples/science/ScienceWorkbench';
import type { WorkbenchKind } from './examples/workbench/Workbench';

/**
 * Everything the app serves lives under this path: pages, static files and built assets. The
 * documentation site proxies /examples/* to this app, so the same URLs work on both hosts.
 */
export const EXAMPLES_PATH = '/examples';

/** Sections of the index page, in order. */
export const GROUPS = [
  {
    id: 'embed',
    title: 'Embed',
    description:
      'A quartile block is a sentence and CSV rows. These pages render such blocks in an editor, in a streamed answer, in a Markdown document and on a plain HTML page.',
  },
  {
    id: 'apps',
    title: 'Dashboards and data apps',
    description:
      'React pages where charts, KPIs, filters and tables follow one selection, plus a dashboard rendered from JSON and one that queries a database in a browser worker.',
  },
  {
    id: 'science',
    title: 'Data science',
    description:
      'Workspaces for profiling a dataset, comparing cohorts, evaluating a classifier and reviewing proposed analysis steps before they are applied.',
  },
  {
    id: 'tools',
    title: 'Tools',
    description:
      'A formatting lab for numbers, dates and units, and a visual editor that exports a React starter.',
  },
] as const;

export type ExampleGroup = (typeof GROUPS)[number]['id'];

/** Which page component renders a route; `kind` selects one view of a multi-route page. */
export type RoutePage =
  | {
      page:
        | 'index'
        | 'playground'
        | 'ai-answer'
        | 'markdown-report'
        | 'storefront'
        | 'scale'
        | 'assistant'
        | 'formatting'
        | 'studio';
    }
  | { page: 'workbench'; kind: WorkbenchKind }
  | { page: 'science'; kind: ScienceKind };

export type PageId = RoutePage['page'];

export type GalleryRoute = RoutePage & {
  path: string;
  /** The index section that lists the page. The index itself has none. */
  group?: ExampleGroup;
  /** Sub-paths render the same page, e.g. /examples/storefront/anything. */
  prefix?: boolean;
  /** Short page name: the card title on the index and the headline in structured data. */
  name: string;
  title: string;
  description: string;
  /** The page's h1 text, as rendered; the prerender fails if the page says otherwise. */
  heading: string;
  /**
   * Every route is prerendered in full. `hydrate`: the browser hydrates that markup. `mount`: the
   * first render depends on the reader's time zone or locale, which a build cannot know, so the
   * browser renders the page again with createRoot instead of hydrating mismatched markup.
   */
  render: 'hydrate' | 'mount';
  /** Repository paths whose last commit dates the page in the sitemap. */
  sources: string[];
};

/** A plain static file listed with the routes: on the index, in the sitemap and in llms.txt. */
export interface StaticPage {
  path: string;
  group: ExampleGroup;
  name: string;
  description: string;
  /** Repository paths whose last commit dates the page in the sitemap. */
  sources: string[];
}

// The pages are published at docs.usequartile.com/examples, which proxies them from this app.
const DEFAULT_SITE_URL = 'https://docs.usequartile.com';
/** Absolute origin for canonical URLs, Open Graph and the sitemap. Override with VITE_SITE_URL. */
export const SITE_URL = String(import.meta.env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(
  /\/+$/,
  '',
);
export const SITE_NAME = 'Quartile';
export const REPOSITORY_URL = 'https://github.com/zinnoberHaus/quartile';

const gallery = 'apps/gallery/src';

export const routes: readonly GalleryRoute[] = [
  {
    path: EXAMPLES_PATH,
    page: 'index',
    name: 'Quartile examples',
    title: 'Quartile examples: charts and dashboards in Markdown, AI answers and web pages',
    description:
      'Runnable examples of Quartile, an open-source chart block for Markdown, AI answers and web pages: a playground, a streamed AI answer, a Markdown report, a script-tag embed, dashboards, data-science workspaces and App Studio. A 0.1 preview, not on npm yet.',
    heading: 'Examples',
    render: 'hydrate',
    sources: [`${gallery}/examples/index`, `${gallery}/routes.ts`],
  },
  {
    path: '/examples/playground',
    page: 'playground',
    group: 'embed',
    name: 'Markdown chart playground',
    title: 'Playground: charts and dashboards in Markdown · Quartile',
    description:
      'Write a quartile Markdown block: a sentence such as “bar sum(revenue) by region”, then CSV rows. Pages render an interactive, accessible chart; anywhere else it stays readable text.',
    heading: 'Charts and dashboards in Markdown',
    render: 'hydrate',
    sources: [`${gallery}/examples/markdown`],
  },
  {
    path: '/examples/ai-answer',
    group: 'embed',
    page: 'ai-answer',
    name: 'Charts inside a streamed answer',
    title: 'AI answer: charts inside a streamed answer · Quartile',
    description:
      'Ordinary Markdown with quartile blocks, as a model writes it. Streamdown renders the prose and Quartile renders each chart as the answer streams. A local replay; no model is called.',
    heading: 'Charts inside a streamed answer',
    render: 'hydrate',
    sources: [`${gallery}/examples/markdown`],
  },
  {
    path: '/examples/markdown-report',
    group: 'embed',
    page: 'markdown-report',
    name: 'A dashboard written in Markdown',
    title: 'A dashboard written in Markdown · Quartile',
    description:
      'One Markdown file: prose, four Quartile blocks and a dataset defined once. Blocks that read the same dataset share a selection, so the document behaves like a dashboard.',
    heading: 'A dashboard written in Markdown',
    render: 'hydrate',
    sources: [`${gallery}/examples/markdown`],
  },
  {
    path: '/examples/storefront',
    group: 'apps',
    page: 'storefront',
    prefix: true,
    name: 'Storefront analytics',
    title: 'Storefront analytics · Quartile example',
    description:
      'A revenue overview for a fictional online store: KPIs, trends, filters and tables on one linked selection, with shareable view links and CSV export.',
    heading: 'Revenue overview',
    render: 'hydrate',
    sources: [`${gallery}/examples/storefront`, `${gallery}/data/storefront.ts`],
  },
  {
    path: '/examples/saas',
    group: 'apps',
    page: 'workbench',
    kind: 'saas',
    prefix: true,
    name: 'Subscription portfolio',
    title: 'Subscription portfolio · Quartile example',
    description:
      'Find the accounts behind your recurring revenue. Select a plan, brush a revenue range, or inspect an individual workspace.',
    heading: 'Subscription portfolio',
    render: 'hydrate',
    sources: [`${gallery}/examples/workbench`],
  },
  {
    path: '/examples/operations',
    group: 'apps',
    page: 'workbench',
    kind: 'operations',
    prefix: true,
    name: 'Service health',
    title: 'Service health · Quartile example',
    description:
      'Investigate a simulated service incident. Select a service, isolate errors or brush the slow tail, then inspect the matching requests.',
    heading: 'Service health',
    render: 'hydrate',
    sources: [`${gallery}/examples/workbench`],
  },
  {
    path: '/examples/ai-dashboard',
    group: 'apps',
    page: 'workbench',
    kind: 'ai-dashboard',
    prefix: true,
    name: 'A dashboard from JSON',
    title: 'A dashboard from JSON · Quartile example',
    description:
      'Edit a component spec, validate it, and render a linked dashboard. This playground uses local sample data; it does not call a model.',
    heading: 'A dashboard from JSON',
    render: 'hydrate',
    sources: [`${gallery}/examples/workbench`],
  },
  {
    path: '/examples/scale',
    group: 'apps',
    page: 'scale',
    name: 'Worker query explorer',
    title: 'Worker queries: explore more rows, return fewer · Quartile',
    description:
      'A real Arrow dataset, a DuckDB database in a browser worker, and linked views with explicit result limits. Change a filter and inspect the work behind the update.',
    heading: 'Explore more rows. Return fewer.',
    render: 'hydrate',
    sources: [`${gallery}/examples/scale`],
  },
  {
    path: '/examples/explore',
    group: 'science',
    page: 'science',
    kind: 'explore',
    prefix: true,
    name: 'Dataset explorer',
    title: 'Dataset explorer: get to know your data · Quartile',
    description:
      'Inspect missing values, compare distributions, refine a table view, and follow the records behind a pattern.',
    heading: 'Get to know your data.',
    // Table dates are formatted in the reader's time zone.
    render: 'mount',
    sources: [`${gallery}/examples/science`],
  },
  {
    path: '/examples/cohorts',
    group: 'science',
    page: 'science',
    kind: 'cohorts',
    prefix: true,
    name: 'Retention cohorts',
    title: 'Retention cohorts: who comes back? · Quartile',
    description:
      'Compare signup cohorts over complete calendar months. Inspect the eligible users and return activity behind each retention rate.',
    heading: 'Who comes back?',
    render: 'hydrate',
    sources: [`${gallery}/examples/science`],
  },
  {
    path: '/examples/model-evaluation',
    group: 'science',
    page: 'science',
    kind: 'model-evaluation',
    prefix: true,
    name: 'Model evaluation',
    title: 'Model evaluation: understand the tradeoffs · Quartile',
    description:
      'Change a binary classifier’s threshold, compare customer slices, and investigate false positives and missed positives.',
    heading: 'Understand the tradeoffs.',
    render: 'hydrate',
    sources: [`${gallery}/examples/science`],
  },
  {
    path: '/examples/assistant',
    group: 'science',
    page: 'assistant',
    name: 'AI workbench',
    title: 'AI workbench: ask, inspect, apply · Quartile',
    description:
      'Give an assistant the schema, selection and bounded profile of your data. Review its proposed filters, charts and table changes before they reach the workspace.',
    heading: 'Ask. Inspect. Apply.',
    render: 'hydrate',
    sources: [`${gallery}/examples/science`],
  },
  {
    path: '/examples/formatting',
    group: 'tools',
    page: 'formatting',
    name: 'Number formatting',
    title: 'Number formatting: make every number mean something · Quartile',
    description:
      'One field definition, from a compact axis to a detailed tooltip and an exported table. Explore a synthetic laboratory dataset without changing the underlying measurements.',
    heading: 'Make every number mean something.',
    render: 'hydrate',
    sources: [`${gallery}/examples/formatting`],
  },
  {
    path: '/examples/studio',
    page: 'studio',
    group: 'tools',
    name: 'App Studio',
    title: 'App Studio: a working analysis, your way of building · Quartile',
    description:
      'Start with a real API. Shape the view, inspect the records, then take the React code with you.',
    heading: 'A working analysis. Your way of building.',
    // The formatting preview shows a timestamp in the reader's time zone.
    render: 'mount',
    sources: [`${gallery}/examples/studio`],
  },
];

/** The script-tag embed demo is a static HTML file, not a React route. */
export const staticPages: readonly StaticPage[] = [
  {
    path: '/examples/embed/demo',
    group: 'embed',
    name: 'Charts on a plain HTML page',
    description:
      'A plain HTML page with one script tag: Quartile turns quartile code blocks into interactive charts that take the page’s own colors and fonts.',
    sources: [
      'apps/gallery/public/examples/embed/demo.html',
      'apps/gallery/public/examples/embed/tickets.json',
    ],
  },
];

/** The pages of one index section: its routes in table order, then its static pages. */
export function pagesInGroup(group: ExampleGroup): (GalleryRoute | StaticPage)[] {
  return [
    ...routes.filter((route) => route.group === group),
    ...staticPages.filter((page) => page.group === group),
  ];
}

/**
 * Where the paths this app served before it moved under /examples went. vercel.json redirects
 * them on the deployment (scripts/prerender.mjs fails the build when the two disagree); main.tsx
 * applies the same moves on hosts without those rules, such as `vite preview`.
 */
export const LEGACY_REDIRECTS: readonly { from: string; to: string; subpaths?: boolean }[] = [
  { from: '/', to: EXAMPLES_PATH },
  { from: '/language', to: '/examples/playground' },
  { from: '/studio', to: '/examples/studio' },
  { from: '/embed', to: '/examples/embed', subpaths: true },
  { from: '/starter', to: '/examples/starter', subpaths: true },
];

/** "/examples/saas/" and "/examples/saas" are the same route. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

/** The new location of a path from before the move under /examples, if it is one. */
export function legacyRedirect(pathname: string): string | undefined {
  const path = normalizePath(pathname);
  for (const { from, to, subpaths } of LEGACY_REDIRECTS) {
    if (path === from) return to;
    if (subpaths && path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  }
  return undefined;
}

/** The route for a path; undefined when no example lives there. */
export function matchRoute(pathname: string): GalleryRoute | undefined {
  const path = normalizePath(pathname);
  return (
    routes.find((r) => r.path === path) ??
    routes.find((r) => r.prefix && path.startsWith(`${r.path}/`))
  );
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}
