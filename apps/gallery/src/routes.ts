/**
 * Every public gallery route. App.tsx renders from this table and scripts/prerender.mjs writes
 * one HTML file per entry (titles, descriptions, sitemap), so the two cannot drift apart.
 */

import type { ScienceKind } from './examples/science/ScienceWorkbench';
import type { WorkbenchKind } from './examples/workbench/Workbench';

/** Which page component renders a route; `kind` selects one view of a multi-route page. */
export type RoutePage =
  | {
      page:
        | 'design-system'
        | 'language'
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
  /** Sub-paths render the same page, e.g. /examples/storefront/anything. */
  prefix?: boolean;
  /** Short page name for structured data. */
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

const DEFAULT_SITE_URL = 'https://quartile-design.vercel.app';
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
    path: '/',
    page: 'design-system',
    name: 'Quartile design system',
    title: 'Quartile Design System: React charts, tables and controls',
    description:
      'Foundations, interface components, data components, charts and patterns of Quartile, an open-source React toolkit for data apps.',
    heading: 'Quartile design system',
    render: 'hydrate',
    sources: [`${gallery}/design-system`, `${gallery}/data`],
  },
  {
    path: '/language',
    page: 'language',
    name: 'Charts and dashboards in Markdown',
    title: 'Charts and dashboards in Markdown · Quartile',
    description:
      'Write a quartile Markdown block: a sentence such as “bar sum(revenue) by region”, then CSV rows. Pages render an interactive, accessible chart; anywhere else it stays readable text.',
    heading: 'Charts and dashboards in Markdown',
    render: 'hydrate',
    sources: [`${gallery}/examples/markdown`],
  },
  {
    path: '/examples/ai-answer',
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
    path: '/studio',
    page: 'studio',
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

/** "/examples/saas/" and "/examples/saas" are the same route. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

/** The route for a path. Unknown paths render the design system, as they always have. */
export function matchRoute(pathname: string): GalleryRoute {
  const path = normalizePath(pathname);
  return (
    routes.find((r) => r.path === path) ??
    routes.find((r) => r.prefix && path.startsWith(`${r.path}/`)) ??
    routes[0]
  );
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}
