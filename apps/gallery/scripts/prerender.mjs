/**
 * Prerenders the examples app after `vite build` (site + chunk manifest) and `vite build --ssr`
 * (dist/.server/entry-server.js). For every route in src/routes.ts it writes dist/<route>.html
 * (dist/examples.html for /examples) with the page's markup, head tags and stylesheets; Vercel
 * serves them through cleanUrls. It also writes examples/sitemap.xml and examples/llms.txt, then
 * removes the server bundle and manifest so they are not deployed.
 *
 * Everything the app serves is under /examples, because the documentation site proxies that
 * path to this app. Two files sit outside it, for this app's own origin only: index.html, the
 * app shell that answers paths without a page of their own, and robots.txt, which keeps the
 * origin out of search indexes (the pages are indexed at the documentation site's URLs).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

const server = await import(pathToFileURL(serverEntry).href);
const {
  routes,
  staticPages,
  pagesInGroup,
  GROUPS,
  EXAMPLES_PATH,
  LEGACY_REDIRECTS,
  PAGE_MODULES,
  headTags,
  links,
  SITE_URL,
  SITE_NAME,
  REPOSITORY_URL,
} = server;

const site = new URL(SITE_URL);
if (!['http:', 'https:'].includes(site.protocol) || site.pathname !== '/' || site.search) {
  throw new Error(`VITE_SITE_URL must be an http(s) origin without a path, got "${SITE_URL}".`);
}
const absolute = (path) => `${SITE_URL}${path}`;

// --- The path contract ---------------------------------------------------------------------

for (const { path } of [...routes, ...staticPages]) {
  if (path !== EXAMPLES_PATH && !path.startsWith(`${EXAMPLES_PATH}/`)) {
    throw new Error(`${path} is outside ${EXAMPLES_PATH}; the documentation site proxies only it.`);
  }
}
const unlisted = routes.filter((route) => route.page !== 'index' && !route.group);
if (unlisted.length) {
  throw new Error(`No index section lists ${unlisted.map((route) => route.path).join(', ')}.`);
}
// The deployment's redirects for the pre-/examples paths, and the client's copy of them.
const vercel = JSON.parse(await readFile(join(gallery, 'vercel.json'), 'utf8'));
assert.deepEqual(
  vercel.redirects,
  LEGACY_REDIRECTS.map(({ from, to, subpaths }) => ({
    source: subpaths ? `${from}/:path*` : from,
    destination: subpaths ? `${to}/:path*` : to,
    permanent: false,
  })),
  'vercel.json redirects differ from LEGACY_REDIRECTS in src/routes.ts',
);

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
// The component catalog and the scratch page are for local development (see src/App.tsx).
const devOnly = Object.keys(manifest).filter((key) => /^src\/(design-system|dev)\//.test(key));
if (devOnly.length) {
  throw new Error(`Development-only modules are in the production build: ${devOnly.join(', ')}.`);
}
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
  const file = `${route.path.slice(1)}.html`;
  await mkdir(dirname(join(dist, file)), { recursive: true });
  await writeFile(join(dist, file), page);
  written.push(file);
  sitemap.push({ loc: absolute(route.path), lastmod: modified });
}
// Plain static pages, not React routes. With cleanUrls they are served without ".html".
for (const page of staticPages) {
  await stat(join(dist, `${page.path.slice(1)}.html`));
  sitemap.push({ loc: absolute(page.path), lastmod: lastModified(page.sources) });
}

// The app shell: answers /examples paths without a file of their own (vercel.json rewrites
// them here; `vite preview` falls back to it), then the client router renders the page or a
// not-found view. It carries no page markup and is not for search indexes.
await writeFile(
  join(dist, 'index.html'),
  template.replace(DESCRIPTION, () => '\n    <meta name="robots" content="noindex" />'),
);
written.push('index.html');

// --- Discovery files --------------------------------------------------------------------------

const xml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const examples = join(dist, EXAMPLES_PATH.slice(1));
await writeFile(
  join(examples, 'sitemap.xml'),
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
// For this app's own origin. Behind the documentation site, that site's robots.txt applies.
await writeFile(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

const doc = (path) => `${REPOSITORY_URL}/blob/main/${path}`;
await writeFile(
  join(examples, 'llms.txt'),
  `# ${SITE_NAME} examples

> Runnable example pages for ${SITE_NAME}, an open-source React and TypeScript toolkit of charts, tables and interface controls that share one theme, one data model and one selection state. ${SITE_NAME} is a 0.1 preview: it builds, is tested and renders these pages, but it is not published to npm and its API may change before 0.1.0 is released.

The pages render from the repository's source (Apache-2.0). They start from fictional, deterministic sample data; App Studio loads public APIs. To use the preview in another app, build and pack it locally as the [installation guide](${doc('docs/guides/installation.md')}) describes; there is no npm release yet.

${GROUPS.map(
  (group) =>
    `## ${group.title}\n\n${pagesInGroup(group.id)
      .map((page) => `- [${page.name}](${absolute(page.path)}): ${page.description}`)
      .join('\n')}`,
).join('\n\n')}

## Optional

- [Documentation](${links.docs}): Installation, guides and component reference. Its own index for language models is at ${links.docs}/llms.txt.
- [Quartile language](${doc('docs/language.md')}): Reference for quartile Markdown blocks.
- [Source code](${REPOSITORY_URL}): The repository, Apache-2.0.
`,
);
written.push('examples/sitemap.xml', 'robots.txt', 'examples/llms.txt');

await rm(join(dist, '.server'), { recursive: true, force: true });
await rm(join(dist, '.vite'), { recursive: true, force: true });

// Nothing else may be deployed outside /examples: behind the proxy it would not be reachable.
const expected = ['examples', 'examples.html', 'index.html', 'robots.txt'];
const stray = (await readdir(dist)).filter((entry) => !expected.includes(entry));
if (stray.length) {
  throw new Error(
    `dist has files outside ${EXAMPLES_PATH}: ${stray.join(', ')}. Public files belong in public/examples.`,
  );
}

const sizes = await Promise.all(written.map(async (file) => (await stat(join(dist, file))).size));
console.log(
  `Prerendered ${routes.length} routes for ${SITE_URL}${history ? '' : ' (no git history: sitemap without lastmod)'}:`,
);
for (const [i, file] of written.entries()) {
  console.log(`  dist/${file.padEnd(40)} ${(sizes[i] / 1024).toFixed(1).padStart(7)} kB`);
}
