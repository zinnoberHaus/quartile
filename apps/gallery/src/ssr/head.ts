import { absoluteUrl, type GalleryRoute, REPOSITORY_URL, SITE_NAME } from '../routes';

/** Social preview image, committed at public/og-image.png (see scripts/prerender-og-image.mjs). */
export const OG_IMAGE = {
  path: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'The Quartile wordmark and the headline “Build data apps, not just charts.” beside a sample bar chart.',
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** schema.org data: WebSite for the home page, TechArticle about the source code elsewhere. */
export function structuredData(route: GalleryRoute, options: { modified?: string } = {}) {
  const url = absoluteUrl(route.path);
  const site = { '@type': 'WebSite', name: SITE_NAME, url: absoluteUrl('/') };
  if (route.path === '/') {
    return {
      '@context': 'https://schema.org',
      ...site,
      description: route.description,
      inLanguage: 'en',
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: route.name,
    description: route.description,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    image: absoluteUrl(OG_IMAGE.path),
    ...(options.modified ? { dateModified: options.modified } : {}),
    isPartOf: site,
    about: {
      '@type': 'SoftwareSourceCode',
      name: SITE_NAME,
      description:
        'Open-source React toolkit of charts, tables and interface controls. A 0.1 preview that is not published to npm.',
      codeRepository: REPOSITORY_URL,
      programmingLanguage: 'TypeScript',
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
    },
  };
}

/** The <head> tags of one prerendered route. */
export function headTags(route: GalleryRoute, options: { modified?: string } = {}): string {
  const url = absoluteUrl(route.path);
  const image = absoluteUrl(OG_IMAGE.path);
  const json = JSON.stringify(structuredData(route, options)).replace(/</g, '\\u003c');
  const meta = (key: 'name' | 'property', name: string, content: string | number) =>
    `<meta ${key}="${name}" content="${escapeHtml(String(content))}" />`;
  return [
    `<title>${escapeHtml(route.title)}</title>`,
    meta('name', 'description', route.description),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:type', route.path === '/' ? 'website' : 'article'),
    meta('property', 'og:title', route.title),
    meta('property', 'og:description', route.description),
    meta('property', 'og:url', url),
    meta('property', 'og:image', image),
    meta('property', 'og:image:type', 'image/png'),
    meta('property', 'og:image:width', OG_IMAGE.width),
    meta('property', 'og:image:height', OG_IMAGE.height),
    meta('property', 'og:image:alt', OG_IMAGE.alt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', route.title),
    meta('name', 'twitter:description', route.description),
    meta('name', 'twitter:image', image),
    meta('name', 'twitter:image:alt', OG_IMAGE.alt),
    `<script type="application/ld+json">${json}</script>`,
  ].join('\n    ');
}

/** Client navigation keeps the tab title and the page's head tags on the current route. */
export function applyRouteHead(route: GalleryRoute) {
  if (typeof document === 'undefined') return;
  const url = absoluteUrl(route.path);
  document.title = route.title;
  const updates: [string, string, string][] = [
    ['meta[name="description"]', 'content', route.description],
    ['link[rel="canonical"]', 'href', url],
    ['meta[property="og:title"]', 'content', route.title],
    ['meta[property="og:description"]', 'content', route.description],
    ['meta[property="og:url"]', 'content', url],
    ['meta[name="twitter:title"]', 'content', route.title],
    ['meta[name="twitter:description"]', 'content', route.description],
  ];
  for (const [selector, attribute, value] of updates) {
    document.head.querySelector(selector)?.setAttribute(attribute, value);
  }
}
