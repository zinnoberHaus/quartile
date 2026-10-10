import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.QUARTILE_NAV_BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const releases = [];
async function holdChunk(name) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  releases.push(release);
  const pattern = new RegExp(`${name}[^/]*\\.(?:js|tsx)(?:\\?|$)`);
  await page.route(pattern, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}
async function routeIs(path) {
  await page.waitForFunction(
    (expected) =>
      document.querySelector('.g-route-content')?.getAttribute('data-route') === expected,
    path,
  );
}
try {
  const releaseInitial = await holdChunk('ScienceWorkbench');
  await page.goto(`${base}/examples/explore`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('status', { name: 'Loading Quartile workspace' }).waitFor();
  assert.equal(await page.locator('.g-route-loading').count(), 1);
  releaseInitial();
  await routeIs('/examples/explore');
  await page.evaluate(() => {
    window.__navigationProof = 'same document';
  });

  const releaseAssistant = await holdChunk('AssistantWorkbench');
  const oldHeading = await page.locator('h1').innerText();
  await page.locator('a[href="/examples/assistant"]').click();
  await page.locator('.g-route-progress[data-pending]').waitFor();
  assert.equal(await page.locator('h1').innerText(), oldHeading);
  assert.equal(await page.locator('.g-route-loading').count(), 0);
  await page.locator('a[href="/examples/model-evaluation"]').click();
  await routeIs('/examples/model-evaluation');
  releaseAssistant();
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator('.g-route-content').getAttribute('data-route'),
    '/examples/model-evaluation',
  );
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H1');
  await page.goBack();
  await routeIs('/examples/assistant');
  await page.goForward();
  await routeIs('/examples/model-evaluation');
  assert.equal(await page.evaluate(() => window.__navigationProof), 'same document');

  await page.locator('a[href="/examples/explore"]').click();
  await routeIs('/examples/explore');
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForFunction(() => window.scrollY === 500);
  await page.locator('a[href="/examples/cohorts"]').evaluate((link) => link.click());
  await routeIs('/examples/cohorts');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.goBack();
  await routeIs('/examples/explore');
  await page.waitForFunction(() => Math.abs(window.scrollY - 500) < 2);

  await page.locator('a[href="/"]').first().click();
  await routeIs('/');
  await page.locator('a[href="#charts"]').click();
  await page.waitForFunction(
    () => location.hash === '#charts' && document.activeElement?.id === 'charts',
  );
  assert.ok(await page.evaluate(() => window.scrollY > 0));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('a[href="/examples/explore"]').focus();
  await page.keyboard.press('Enter');
  await routeIs('/examples/explore');
  assert.equal(
    await page
      .locator('.g-route-content')
      .evaluate((element) => getComputedStyle(element).animationName),
    'none',
  );
  await page.setViewportSize({ width: 375, height: 850 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
  assert.deepEqual(errors, []);
  const recovery = await context.newPage();
  recovery.setDefaultTimeout(20_000);
  await recovery.goto(`${base}/examples/explore`);
  await recovery.locator('.g-route-content[data-route="/examples/explore"]').waitFor();
  await recovery.evaluate(() => window.scrollTo(0, 500));
  await recovery.waitForFunction(() => window.scrollY === 500);
  await recovery.route(/AssistantWorkbench[^/]*\.(?:js|tsx)(?:\?|$)/, (route) => route.abort());
  await recovery.locator('a[href="/examples/assistant"]').evaluate((link) => link.click());
  await recovery.getByRole('heading', { name: 'This workspace could not be opened.' }).waitFor();
  assert.equal(await recovery.evaluate(() => document.activeElement?.tagName), 'H1');
  assert.equal(await recovery.evaluate(() => window.scrollY), 0);
  await recovery.goBack();
  await recovery.locator('.g-route-content[data-route="/examples/explore"]').waitFor();
  await recovery.waitForFunction(() => Math.abs(window.scrollY - 500) < 2);
  await recovery.close();
  console.log(
    JSON.stringify(
      {
        initialSkeleton: true,
        outgoingContentPreserved: true,
        rapidNavigation: true,
        sameDocument: true,
        backForward: true,
        restoredScroll: true,
        hashFocus: true,
        headingFocus: true,
        keyboardActivation: true,
        failedImportBackRecovery: true,
        reducedMotion: true,
        mobileOverflow: false,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  for (const release of releases) release();
  await browser.close();
}
