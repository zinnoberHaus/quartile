/**
 * The documentation site proxies /examples/* to this app and nothing else. A page that asks its
 * own origin for anything outside that path works on this app's origin and breaks behind the
 * proxy, so the browser checks record such requests and fail on them.
 *
 * Vercel Web Analytics is the one exception: its script and beacon live at /_vercel/insights/ on
 * whichever origin serves the page.
 */
const INSIDE = [/^\/examples(?:\/|$)/, /^\/_vercel\/insights\//];

/**
 * Watches every request a Playwright browser context (or page) makes to the app's origin,
 * including those from workers.
 * @param {{ on(event: 'request', listener: (request: any) => void): unknown }} target
 * @param {string} base The app's origin, e.g. http://127.0.0.1:4188.
 * @param {string[]} [allow] Paths a check opens on purpose, such as "/" to follow its redirect.
 * @returns {() => string[]} The requests outside /examples seen so far, as "METHOD /path".
 */
export function watchRequests(target, base, allow = []) {
  const origin = new URL(base).origin;
  const outside = new Set();
  target.on('request', (request) => {
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    // blob: and data: URLs carry the page's origin but never reach the server.
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== origin || allow.includes(url.pathname)) return;
    if (!INSIDE.some((pattern) => pattern.test(url.pathname))) {
      outside.add(`${request.method()} ${url.pathname}`);
    }
  });
  return () => [...outside].sort();
}
