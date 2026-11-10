/**
 * Draws the 1200×630 social preview image, public/og-image.png, with the repository's
 * Playwright Chromium. Run it by hand after changing the design below and commit the PNG:
 *   node apps/gallery/scripts/prerender-og-image.mjs
 * Builds do not run it (they have no browser); the prerendered pages link the committed file.
 * The chart is decorative and its values are not data.
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const target = fileURLToPath(new URL('../public/og-image.png', import.meta.url));
const bars = [34, 52, 41, 66, 58, 88, 72, 61, 79, 95, 84, 112];
const html = `<!doctype html>
<html>
<head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Schibsted+Grotesk:wght@500;700&display=block" />
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #f5f3ee; color: #16150f;
    font-family: 'Schibsted Grotesk', sans-serif; padding: 72px 80px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 40px; font-weight: 700; letter-spacing: -0.02em; }
  h1 { margin-top: 64px; font-size: 76px; line-height: 1.02; font-weight: 700; letter-spacing: -0.035em; max-width: 660px; }
  p { margin-top: 28px; font-size: 27px; line-height: 1.35; color: #58554c; max-width: 640px; }
  .tag { margin-top: auto; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: 20px; color: #58554c; }
  .panel { position: absolute; right: 80px; top: 176px; width: 380px; height: 330px; background: #fff;
    border: 1px solid #e5e1d8; border-radius: 14px; padding: 28px; display: flex; flex-direction: column; }
  .kpi { font-family: 'IBM Plex Mono', monospace; font-size: 15px; color: #6d6962; letter-spacing: 0.04em; }
  .plot { margin-top: auto; display: flex; align-items: flex-end; gap: 9px; height: 190px;
    border-bottom: 1px solid #d3cdc0; }
  .plot span { flex: 1; border-radius: 3px 3px 0 0; background: #d3cdc0; }
  .plot span.signal { background: #2f45e8; }
</style>
</head>
<body>
  <div class="brand">
    <svg width="49" height="49" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M14.5 14.5L25.5 14.5A11 11 0 1 0 14.5 25.5Z" fill="#16150f" />
      <path d="M17 17L28 17A11 11 0 0 1 17 28Z" fill="#2f45e8" />
    </svg>
    quartile
  </div>
  <h1>Build data apps, not just charts.</h1>
  <p>Open-source React charts, tables and controls on one theme, one data model and one selection.</p>
  <div class="tag">0.1 preview · Apache-2.0 · not yet on npm</div>
  <div class="panel" aria-hidden="true">
    <div class="kpi">SAMPLE CHART</div>
    <div class="plot">
      ${bars.map((h, i) => `<span class="${i === bars.length - 1 ? 'signal' : ''}" style="height:${h * 1.6}px"></span>`).join('')}
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() =>
    ['700 76px "Schibsted Grotesk"', '500 20px "IBM Plex Mono"'].filter(
      (font) => !document.fonts.check(font),
    ),
  );
  if (missing.length) throw new Error(`Fonts did not load: ${missing.join(', ')}`);
  await page.screenshot({ path: target, type: 'png' });
  console.log(`Wrote ${target}`);
} finally {
  await browser.close();
}
