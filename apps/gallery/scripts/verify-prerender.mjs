/**
 * Checks the prerendered gallery the way crawlers and browsers receive it:
 *   node apps/gallery/scripts/verify-prerender.mjs http://127.0.0.1:4188 [evidence-dir]
 *
 * For every page in sitemap.xml, the HTML alone (no JavaScript) must carry a unique title and
 * description, a canonical URL, Open Graph and Twitter tags, JSON-LD, the page's h1 and, where
 * the page draws charts, their SVG. With JavaScript, each page must hydrate that same markup
 * (the server's h1 node survives) without console errors, in two locales and time zones that
 * differ from the build's UTC. Client navigation must update the head, and the discovery files
 * must point at the same origin as the canonical URLs.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:4188').replace(/\/+$/, '');
const output = process.argv[3] ? resolve(process.argv[3]) : undefined;
const VISITORS = [
  { locale: 'en-US', timezoneId: 'America/Los_Angeles', colorScheme: 'light' },
  { locale: 'de-DE', timezoneId: 'Asia/Tokyo', colorScheme: 'dark' },
];
const NOT_REACT = new Set(['/embed/demo']);
// First renders without charts: the worker explorer draws after "Load sample data", Studio after
// its public API responds. Every other page must ship its charts as SVG in the HTML.
const CHARTS_AFTER_LOAD = new Set(['/examples/scale', '/studio']);

async function get(path) {
  const response = await fetch(`${base}${path}`, { headers: { accept: 'text/html,*/*' } });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}
const decode = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
function attribute(html, pattern, name) {
  const tags = html.match(new RegExp(`<(?:meta|link)\\b[^>]*${pattern}[^>]*>`, 'g')) ?? [];
  assert.equal(tags.length, 1, `expected one tag matching ${pattern}, found ${tags.length}`);
  const value = tags[0].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  assert.ok(value, `${pattern} has no ${name}`);
  return decode(value);
}
const normalize = (text) => text.replace(/\s+/g, ' ').trim();

/** Third-party network failures are not the page's errors; everything else is. */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const url = message.location()?.url ?? '';
    if (message.text().startsWith('Failed to load resource') && !url.startsWith(base)) return;
    errors.push(`console: ${message.text()}${url ? ` (${url})` : ''}`);
  });
  return errors;
}
/** Keeps runs hermetic: no Vercel analytics endpoint or web fonts outside Vercel. */
async function stubThirdParty(context) {
  await context.route('**/_vercel/insights/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
}
/** React owns the page h1: hydrated from the server markup or rendered by createRoot. */
const reactOwnsHeading = () => {
  const h1 = document.querySelector('#root h1');
  return !!h1 && Object.keys(h1).some((key) => key.startsWith('__reactFiber$'));
};

const browser = await chromium.launch({ headless: true });
const report = { base, pages: {}, navigation: {}, discovery: {} };
try {
  // --- Discovery files ------------------------------------------------------------------------
  const sitemap = await get('/sitemap.xml');
  assert.equal(sitemap.status, 200, 'sitemap.xml');
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
  assert.ok(locs.length > 1, 'sitemap.xml lists pages');
  const origin = new URL(locs[0]).origin;
  for (const loc of locs) assert.equal(new URL(loc).origin, origin, `${loc} uses the site origin`);
  const robots = await get('/robots.txt');
  assert.equal(robots.status, 200, 'robots.txt');
  assert.match(robots.body, /^User-agent: \*$/m);
  assert.match(robots.body, /^Allow: \/$/m);
  assert.ok(robots.body.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt names the sitemap');
  const llms = await get('/llms.txt');
  assert.equal(llms.status, 200, 'llms.txt');
  assert.match(llms.body, /^# Quartile\n\n> \S/);
  assert.match(llms.body, /^## /m);
  assert.match(llms.body, /not published to npm/);
  report.discovery = { sitemapUrls: locs.length, origin, robots: true, llms: true };

  // --- Raw HTML, as a crawler without JavaScript receives it ------------------------------------
  const pages = [];
  for (const loc of locs) {
    const path = new URL(loc).pathname;
    const response = await get(path);
    assert.equal(response.status, 200, `${path} status`);
    assert.match(response.type, /text\/html/, `${path} content type`);
    if (NOT_REACT.has(path)) {
      report.pages[path] = { status: response.status, staticPage: true };
      continue;
    }
    const html = response.body;
    const titles = html.match(/<title>([^<]*)<\/title>/g) ?? [];
    assert.equal(titles.length, 1, `${path} has one <title>`);
    const title = decode(titles[0].replace(/<\/?title>/g, ''));
    const description = attribute(html, 'name="description"', 'content');
    const canonical = attribute(html, 'rel="canonical"', 'href');
    assert.equal(canonical, loc, `${path} canonical`);
    assert.equal(attribute(html, 'property="og:url"', 'content'), loc, `${path} og:url`);
    assert.equal(attribute(html, 'property="og:title"', 'content'), title, `${path} og:title`);
    assert.equal(attribute(html, 'property="og:description"', 'content'), description);
    for (const property of ['og:type', 'og:site_name', 'og:image', 'og:image:alt']) {
      attribute(html, `property="${property}"`, 'content');
    }
    const image = attribute(html, 'property="og:image"', 'content');
    assert.ok(image.startsWith(`${origin}/`), `${path} og:image is absolute`);
    const imageResponse = await fetch(`${base}${new URL(image).pathname}`);
    assert.equal(imageResponse.status, 200, `${path} og:image is served`);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.equal(attribute(html, 'name="twitter:card"', 'content'), 'summary_large_image');
    const scripts = [
      ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ];
    assert.equal(scripts.length, 1, `${path} has one JSON-LD block`);
    const data = JSON.parse(scripts[0][1]);
    assert.equal(data['@context'], 'https://schema.org');
    if (path === '/') {
      assert.equal(data['@type'], 'WebSite');
      assert.equal(data.url, loc);
    } else {
      assert.equal(data['@type'], 'TechArticle', `${path} JSON-LD type`);
      assert.equal(data.url, loc);
      assert.equal(data.about?.['@type'], 'SoftwareSourceCode');
      assert.equal(data.about?.codeRepository, 'https://github.com/zinnoberHaus/quartile');
      assert.equal(data.about?.programmingLanguage, 'TypeScript');
    }
    assert.ok(!html.includes('"SoftwareApplication"'), `${path} avoids SoftwareApplication`);
    const root = html.match(
      /<div id="root" data-prerendered-path="([^"]*)" data-prerender="(hydrate|mount)">/,
    );
    assert.ok(root, `${path} root names its path and render mode`);
    assert.equal(decode(root[1]), path, `${path} root path`);
    pages.push({ path, loc, title, description, mode: root[2] });
  }
  const unique = (key) => {
    const values = pages.map((page) => page[key]);
    assert.equal(new Set(values).size, values.length, `every page has a unique ${key}`);
  };
  unique('title');
  unique('description');

  const offline = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  await stubThirdParty(offline);
  const raw = await offline.newPage();
  for (const page of pages) {
    await raw.goto(`${base}${page.path}`);
    // The page's own h1 comes first (a rendered Markdown document may add its own).
    const h1 = raw.locator('#root h1').first();
    assert.ok(await h1.count(), `${page.path} has an h1 without JavaScript`);
    page.heading = normalize(await h1.innerText());
    assert.ok(page.heading.length > 0, `${page.path} h1 has text`);
    page.charts = await raw.locator('#root .q-chart svg').count();
    if (!CHARTS_AFTER_LOAD.has(page.path)) {
      assert.ok(page.charts > 0, `${page.path} has no chart SVG without JavaScript`);
    }
    page.words = normalize(await raw.locator('#root').innerText()).split(' ').length;
  }
  await offline.close();

  // --- Hydration, as visitors in other locales and time zones receive it -----------------------
  // `hydrate` pages must keep the server's DOM; `mount` pages (first render depends on the
  // reader's locale or time zone) are rendered again with createRoot. Neither may log errors or
  // flash the loading skeleton over the prerendered markup.
  for (const visitor of VISITORS) {
    const context = await browser.newContext({
      ...visitor,
      viewport: { width: 1440, height: 1000 },
    });
    await stubThirdParty(context);
    // Tag the server's h1 after parsing and before any module runs; hydration keeps that node.
    await context.addInitScript(() => {
      window.__verifySkeleton = false;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof Element && node.matches('.g-route-loading, :has(.g-route-loading)'))
              window.__verifySkeleton = true;
          }
        }
      }).observe(document, { childList: true, subtree: true });
      document.addEventListener('readystatechange', () => {
        const h1 = document.readyState === 'interactive' && document.querySelector('#root h1');
        if (h1) h1.dataset.verifyServerNode = '';
      });
    });
    for (const page of pages) {
      const tab = await context.newPage();
      tab.setDefaultTimeout(30_000);
      const errors = collectErrors(tab);
      await tab.goto(`${base}${page.path}`);
      await tab.waitForFunction(reactOwnsHeading);
      await tab.waitForLoadState('networkidle').catch(() => {});
      await tab.waitForTimeout(500);
      const result = await tab.evaluate(() => {
        const h1 = document.querySelector('#root h1');
        return {
          serverNode: h1?.hasAttribute('data-verify-server-node') ?? false,
          skeleton: window.__verifySkeleton,
          heading: h1?.innerText ?? '',
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
          charts: document.querySelectorAll('#root .q-chart svg').length,
        };
      });
      const label = `${page.path} (${visitor.locale}, ${visitor.timezoneId})`;
      assert.deepEqual(errors, [], `${label} logged errors`);
      assert.equal(
        result.serverNode,
        page.mode === 'hydrate',
        page.mode === 'hydrate'
          ? `${label} replaced the prerendered markup instead of hydrating it`
          : `${label} kept markup that should have been rendered again`,
      );
      assert.equal(result.skeleton, false, `${label} showed the loading skeleton`);
      assert.equal(normalize(result.heading), page.heading, `${label} h1`);
      assert.equal(result.title, page.title, `${label} document.title`);
      assert.equal(result.description, page.description, `${label} description`);
      report.pages[page.path] = {
        mode: page.mode === 'hydrate' ? 'prerendered + hydrateRoot' : 'prerendered + createRoot',
        title: page.title,
        heading: page.heading,
        wordsWithoutJavaScript: page.words,
        chartSvgWithoutJavaScript: page.charts,
        chartSvgAfterLoad: result.charts,
        cleanIn: [
          ...(report.pages[page.path]?.cleanIn ?? []),
          `${visitor.locale} ${visitor.timezoneId}`,
        ],
      };
      await tab.close();
    }
    await context.close();
  }

  // --- Client navigation and fresh mounts -------------------------------------------------------
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await stubThirdParty(context);
  const tab = await context.newPage();
  tab.setDefaultTimeout(30_000);
  const errors = collectErrors(tab);
  const byPath = Object.fromEntries(pages.map((page) => [page.path, page]));
  const routeIs = (path) =>
    tab.waitForFunction(
      (expected) =>
        document.querySelector('.g-route-content')?.getAttribute('data-route') === expected,
      path,
    );
  const headIs = async (path) => {
    const head = await tab.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      h1: document.querySelector('#root h1')?.innerText ?? '',
    }));
    assert.equal(head.title, byPath[path].title, `${path} title after navigation`);
    assert.equal(
      head.description,
      byPath[path].description,
      `${path} description after navigation`,
    );
    assert.equal(head.canonical, byPath[path].loc, `${path} canonical after navigation`);
    assert.equal(normalize(head.h1), byPath[path].heading, `${path} h1 after navigation`);
  };
  await tab.goto(`${base}/`);
  await tab.waitForFunction(reactOwnsHeading);
  await tab.evaluate(() => {
    window.__sameDocument = true;
  });
  await tab.locator('.g-header-nav a[href="/examples/storefront"]').click();
  await routeIs('/examples/storefront');
  await tab.locator('#root h1').waitFor();
  await headIs('/examples/storefront');
  await tab.goBack();
  await routeIs('/');
  await headIs('/');
  await tab.locator('.g-header-nav a[href="/examples/formatting"]').click();
  await routeIs('/examples/formatting');
  await tab.locator('#root h1').waitFor();
  await headIs('/examples/formatting');
  assert.equal(
    await tab.evaluate(() => window.__sameDocument),
    true,
    'navigation stayed client-side',
  );
  report.navigation.clientSide = [
    '/ → /examples/storefront',
    'back → /',
    '/ → /examples/formatting',
  ];

  // Paths without their own file get the home page's markup; the client mounts the real page.
  await tab.goto(`${base}/examples/saas/accounts`);
  await routeIs('/examples/saas/accounts');
  await tab.getByRole('heading', { level: 1, name: byPath['/examples/saas'].heading }).waitFor();
  assert.equal(await tab.title(), byPath['/examples/saas'].title);
  // A query changes the first render, so the prerendered page is mounted fresh rather than hydrated.
  await tab.goto(`${base}/examples/storefront?region=Europe`);
  await tab.locator('.sf-trend .q-chart svg').first().waitFor();
  await tab
    .getByRole('heading', { level: 1, name: byPath['/examples/storefront'].heading })
    .waitFor();
  await tab.waitForTimeout(500);
  assert.deepEqual(errors, [], 'navigation logged errors');
  report.navigation.fallbackSubPath = '/examples/saas/accounts mounted the SaaS workbench';
  report.navigation.queryMount = '/examples/storefront?region=Europe mounted without hydration';
  await context.close();

  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'prerender.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
