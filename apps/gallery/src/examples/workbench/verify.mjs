import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? process.env.QUARTILE_WORKBENCH_BASE_URL ?? 'http://127.0.0.1:4173';
const output = resolve(process.argv[3] ?? '/tmp/quartile-workbench-verification');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const summary = () => page.locator('.q-filterbar-summary').first();
async function expectSummary(text) {
  await page.waitForFunction(
    (expected) => document.querySelector('.q-filterbar-summary')?.textContent === expected,
    text,
  );
}
async function filter(label, value) {
  await page
    .locator('.q-filterbar')
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .first()
    .click();
  await page.getByRole('menuitemcheckbox', { name: new RegExp(`^${value}`) }).click();
  await page.keyboard.press('Escape');
}
async function noOverflow() {
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
}
try {
  await page.goto(`${base}/examples/storefront`);
  const plot = page.locator('.sf-trend [role="application"]');
  await plot.waitFor();
  const box = await plot.boundingBox();
  assert.ok(box && box.width > 100);
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () => location.search.includes('dateFrom=') && document.querySelector('.q-chart-brush'),
  );
  const brushedSummary = await summary().innerText();
  const sharedUrl = page.url();
  await page.locator('.sf-header').getByRole('button', { name: 'Share', exact: true }).click();
  assert.equal(await page.locator('.sf-toast-url').innerText(), sharedUrl);
  await page.goto(sharedUrl);
  await page.locator('.sf-trend .q-chart-brush').waitFor();
  assert.equal(await summary().innerText(), brushedSummary);
  await page.goto(
    `${base}/examples/storefront?region=Europe&dateFrom=2026-09-10&dateTo=2026-09-17`,
  );
  await page.locator('.sf-trend .q-chart-brush').waitFor();
  const selectedSummary = await summary().innerText();
  assert.match(page.url(), /dateFrom=2026-09-10/);
  await page.reload();
  await page.locator('.sf-trend .q-chart-brush').waitFor();
  assert.equal(await summary().innerText(), selectedSummary);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download CSV' }).click();
  const csv = await fs.readFile(await (await downloaded).path(), 'utf8');
  const lines = csv.trim().split('\n');
  assert.equal(lines.length - 1, 8 * 4 * 12);
  const headings = lines[0].split(',');
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    assert.equal(cells[headings.indexOf('region')], 'Europe');
    assert.ok(cells[0] >= '2026-09-10' && cells[0] <= '2026-09-17');
  }
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.q-chart-brush') && !location.search);
  for (const [label, section] of [
    ['Products', 'products'],
    ['Channels & conversion', 'conversion'],
    ['Revenue & markets', 'revenue'],
    ['Overview', 'overview'],
  ]) {
    await page.locator('.sf-side').getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(
      (value) =>
        document.activeElement?.closest('[data-sf-section]')?.getAttribute('data-sf-section') ===
        value,
      section,
    );
  }
  await page.setViewportSize({ width: 375, height: 850 });
  await noOverflow();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sf-side').getByRole('button', { name: 'Products', exact: true }).click();
  await page.waitForFunction(
    () =>
      !document.querySelector('.sf-side[data-open]') &&
      document.activeElement?.closest('[data-sf-section="products"]'),
  );
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Component gallery ↗', exact: true }).click();
  await page.locator('.g-route-content[data-route="/"]').waitFor();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/examples/saas`);
  await expectSummary('96 accounts');
  await page
    .locator('.w-panel')
    .filter({ has: page.getByRole('heading', { name: 'Revenue by plan' }) })
    .getByRole('button', { name: /^Enterprise/ })
    .click();
  await expectSummary('32 accounts');
  const accountTable = page
    .locator('.w-panel')
    .filter({ has: page.getByRole('heading', { name: 'The accounts behind the numbers' }) });
  await accountTable.locator('.q-dt-row[data-interactive]').first().click();
  await expectSummary('1 account');
  await filter('Plan', 'Enterprise');
  await filter('Plan', 'Starter');
  await expectSummary('0 accounts');
  assert.equal(await page.locator('.w-kpis .q-kpi-value').nth(1).innerText(), '0');
  assert.equal(await page.locator('.w-kpis .q-kpi-value').nth(2).innerText(), '—');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expectSummary('96 accounts');
  await page.getByRole('button', { name: 'View charts as tables', exact: true }).click();
  await page.getByText('Exact plan totals.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'View charts', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'View charts', exact: true }).click();
  await accountTable.getByRole('button', { name: 'Next', exact: true }).click();
  await accountTable.getByText(/9–16 of 96/).waitFor();
  await page.setViewportSize({ width: 375, height: 850 });
  await noOverflow();

  await page.goto(`${base}/examples/operations`);
  await expectSummary('360 requests');
  await filter('Status', 'Error');
  await expectSummary('40 requests');
  assert.equal(
    Number.parseFloat(await page.locator('.w-kpis .q-kpi-value').nth(1).innerText()),
    100,
  );
  await page.getByRole('button', { name: 'View charts as tables', exact: true }).click();
  await page.getByText('Exact distribution statistics by service.', { exact: false }).waitFor();
  const matrix = page
    .locator('.w-panel')
    .filter({ has: page.getByRole('heading', { name: 'Failed requests by service and region' }) });
  const matrixCells = await matrix.locator('tbody td').allTextContents();
  assert.equal(
    matrixCells
      .map(Number)
      .filter(Number.isFinite)
      .reduce((sum, value) => sum + value, 0),
    40,
  );
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expectSummary('360 requests');
  await noOverflow();

  await page.goto(`${base}/examples/ai-dashboard`);
  const editor = page.getByRole('textbox', { name: 'Dashboard JSON', exact: true });
  const original = await editor.inputValue();
  await editor.fill('{');
  await page.getByRole('status').filter({ hasText: 'Unvalidated edits' }).waitFor();
  await page.getByRole('button', { name: 'Validate and render', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Invalid JSON' }).waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'Subscription portfolio', exact: true }).count(),
    1,
  );
  await editor.fill(original.replace('"field": "mrr"', '"field": "missing"'));
  await page.getByRole('button', { name: 'Validate and render', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Unknown field "missing"' }).waitFor();
  await editor.fill(original.replace('Subscription portfolio', 'My reviewed portfolio'));
  await page.getByRole('button', { name: 'Validate and render', exact: true }).click();
  await page.getByRole('heading', { name: 'My reviewed portfolio', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reset example', exact: true }).click();
  await page.getByRole('heading', { name: 'Subscription portfolio', exact: true }).waitFor();
  assert.equal(await editor.inputValue(), original);
  await noOverflow();
  assert.deepEqual(errors, []);
  const result = {
    storefrontSharedBrush: true,
    filteredCsv: true,
    realSectionNavigation: true,
    mobileDrawer: true,
    galleryExit: true,
    linkedAccountDrilldown: true,
    emptySelectionReset: true,
    chartTableGuidance: true,
    errorCounts: true,
    invalidSpecPreservesDashboard: true,
    specReset: true,
    mobileOverflow: false,
    errors,
  };
  await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  await page.screenshot({ path: `${output}/json-dashboard-mobile.png`, fullPage: true });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  await fs.writeFile(`${output}/failure.txt`, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
