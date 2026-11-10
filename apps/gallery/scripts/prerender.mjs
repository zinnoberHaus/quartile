/**
 * Prerenders the gallery after `vite build` (site + chunk manifest) and `vite build --ssr`
 * (dist/.server/entry-server.js). For every route in src/routes.ts it writes dist/<route>.html
 * (dist/index.html for /) with the page's markup, head tags and stylesheets; Vercel serves them
 * through cleanUrls. It also writes robots.txt, sitemap.xml and llms.txt, then removes the
 * server bundle and manifest so they are not deployed.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Identical output on every build machine: production React, dates in UTC.
process.env.NODE_ENV = 'production';
process.env.TZ = 'UTC';

const gallery = fileURLToPath(new URL('..', import.meta.url));
const repo = join(gallery, '../..');
const dist = join(gallery, 'dist');
const serverEntry = join(dist, '.server/entry-server.js');
const manifestFile = join(dist, '.vite/manifest.json');
const EMBED_DEMO = { path: '/embed/demo', file: 'apps/gallery/public/embed/demo.html' };

const server = await import(pathToFileURL(serverEntry).href);
const { routes, PAGE_MODULES, headTags, SITE_URL, SITE_NAME, REPOSITORY_URL } = server;

const site = new URL(SITE_URL);
if (!['http:', 'https:'].includes(site.protocol) || site.pathname !== '/' || site.search) {
  throw new Error(`VITE_SITE_URL must be an http(s) origin without a path, got "${SITE_URL}".`);
}
const absolute = (path) => `${SITE_URL}${path}`;

// --- Template and chunks -------------------------------------------------------------------

const template = await readFile(join(dist, 'index.html'), 'utf8');
const ROOT = '<div id="root"></div>';
const TITLE = /<title>[\s\S]*?<\/title>/;
const DESCRIPTION = /\s*<meta name="description"[^>]*>/;
for (const [label, pattern] of [
  ['empty #root', ROOT],
  ['<title>', TITLE],
  ['description meta', DESCRIPTION],
]) {
  const found = typeof pattern === 'string' ? template.includes(pattern) : pattern.test(template);
  if (!found) throw new Error(`dist/index.html has no ${label} to replace.`);
}

const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
/** A page module's own chunk, its static imports and their stylesheets, minus the entry's. */
function pageAssets(module) {
  if (!manifest[module]) throw new Error(`${module} is not a chunk in the Vite manifest.`);
  const scripts = [];
  const styles = [];
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (chunk.isEntry) return; // index.html already loads the entry and its imports
    scripts.push(chunk.file);
    for (const css of chunk.css ?? []) styles.push(css);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit(module);
  const fresh = (file) => !template.includes(`/${file}"`);
  return [
    ...[...new Set(styles)]
      .filter(fresh)
      .map((f) => `<link rel="stylesheet" crossorigin href="/${f}">`),
    ...[...new Set(scripts)]
      .filter(fresh)
      .map((f) => `<link rel="modulepreload" crossorigin href="/${f}">`),
  ];
}

// --- Last modified dates from git history ---------------------------------------------------

function git(args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}
let history = false;
try {
  // A shallow clone dates every untouched file at its oldest fetched commit, so skip lastmod.
  history = git(['rev-parse', '--is-shallow-repository']) === 'false';
} catch {
  history = false;
}
/** ISO date of the last commit touching these paths; undefined when history is unavailable. */
function lastModified(paths) {
  if (!history) return undefined;
  try {
    return git(['log', '-1', '--format=%cI', '--', ...paths]) || undefined;
  } catch {
    return undefined;
  }
}

// --- Pages ------------------------------------------------------------------------------------

const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const written = [];
const sitemap = [];
for (const route of routes) {
  const { html, errors } = await server.renderRoute(route.path);
  if (errors.length) {
    throw new AggregateError(
      errors,
      `Prerendering ${route.path} reported ${errors.length} error(s).`,
    );
  }
  const heading = html
    .match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (heading !== route.heading) {
    throw new Error(
      `${route.path} renders <h1> "${heading}"; src/routes.ts says "${route.heading}".`,
    );
  }
  const modified = lastModified(route.sources);
  // The page's stylesheets go last, after the entry's, in the order the browser would add them.
  const assets = pageAssets(PAGE_MODULES[route.page]).join('\n    ');
  // Replacer functions: page markup can contain "$&"-style sequences that a string would expand.
  const page = template
    .replace(DESCRIPTION, () => '')
    .replace(TITLE, () => headTags(route, { modified }))
    .replace('</head>', () => `  ${assets}\n  </head>`)
    .replace(
      ROOT,
      () =>
        `<div id="root" data-prerendered-path="${escapeAttr(route.path)}" data-prerender="${route.render}">${html}</div>`,
    );
  const file = route.path === '/' ? 'index.html' : `${route.path.slice(1)}.html`;
  await mkdir(dirname(join(dist, file)), { recursive: true });
  await writeFile(join(dist, file), page);
  written.push(file);
  sitemap.push({ loc: absolute(route.path), lastmod: modified });
}
// A plain static page, not a React route. With cleanUrls it is served at /embed/demo.
sitemap.push({ loc: absolute(EMBED_DEMO.path), lastmod: lastModified([EMBED_DEMO.file]) });

// --- Discovery files --------------------------------------------------------------------------

const xml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
await writeFile(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap
  .map(
    ({ loc, lastmod }) =>
      `  <url>\n    <loc>${xml(loc)}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>`,
  )
  .join('\n')}
</urlset>
`,
);
await writeFile(
  join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${absolute('/sitemap.xml')}\n`,
);

const link = (route) => `- [${route.name}](${absolute(route.path)}): ${route.description}`;
const byPage = (...pages) => routes.filter((r) => pages.includes(r.page));
const doc = (path) => `${REPOSITORY_URL}/blob/main/${path}`;
await writeFile(
  join(dist, 'llms.txt'),
  `# ${SITE_NAME}

> ${SITE_NAME} is an open-source React and TypeScript toolkit of charts, tables and interface controls that share one theme, one data model and one selection state. It is a 0.1 preview: it builds, is tested and renders this gallery, but it is not published to npm and its API may change before 0.1.0 is released.

This site is the design system and component gallery, rendered from the repository's source (Apache-2.0). Example pages start from fictional, deterministic sample data; App Studio loads public APIs. To use the preview in another app, build and pack it locally as the [installation guide](${doc('docs/guides/installation.md')}) describes; there is no npm release yet.

## Design system and Markdown

${byPage('design-system', 'language', 'ai-answer', 'markdown-report').map(link).join('\n')}

## Example apps

${byPage('storefront', 'workbench', 'scale', 'formatting').map(link).join('\n')}

## Data science and AI workbenches

${byPage('science', 'assistant').map(link).join('\n')}

## Studio

${byPage('studio').map(link).join('\n')}

## Docs

- [README](${doc('README.md')}): What Quartile is, its status, a code sample and what is not built yet.
- [Quartile language](${doc('docs/language.md')}): Reference for quartile Markdown blocks.
- [Implementation guides](${doc('docs/guides/README.md')}): Installation, data, selection, integration, accessibility and performance.

## Optional

- [Plain-HTML embed demo](${absolute(EMBED_DEMO.path)}): One script tag turns quartile code blocks on an ordinary HTML page into charts.
- [Source code](${REPOSITORY_URL}): The repository, Apache-2.0.
`,
);
written.push('sitemap.xml', 'robots.txt', 'llms.txt');

await rm(join(dist, '.server'), { recursive: true, force: true });
await rm(join(dist, '.vite'), { recursive: true, force: true });

const sizes = await Promise.all(written.map(async (file) => (await stat(join(dist, file))).size));
console.log(
  `Prerendered ${routes.length} routes for ${SITE_URL}${history ? '' : ' (no git history: sitemap without lastmod)'}:`,
);
for (const [i, file] of written.entries()) {
  console.log(`  dist/${file.padEnd(36)} ${(sizes[i] / 1024).toFixed(1).padStart(7)} kB`);
}
