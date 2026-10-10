import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4184';
const output = process.argv[3] ?? '/tmp/quartile-formatting-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const checks = [];
const record = (name) => checks.push(name);
try {
  await page.goto(`${base}/examples/formatting`);
  await page.getByRole('heading', { name: 'Make every number mean something.' }).waitFor();
  const table = page.locator('.fm-records');
  assert.match(await table.innerText(), /1\.234E-5 mol\/L/);
  assert.match(await table.innerText(), /€123,456\.78/);
  assert.match(await table.innerText(), /Not observed/);
  record('Detailed values, units and missing observations render together');

  const plot = page.locator('.fm-chart [role="application"]');
  await plot.focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('.q-chart-tooltip').waitFor();
  assert.match(await page.locator('.q-chart-tooltip').innerText(), /mol\/L/);
  assert.match(await page.locator('.q-chart-tooltip').innerText(), /Molar concentration/);
  assert.match(
    await page.locator('.q-chart-tooltip').innerText(),
    /Synthetic laboratory observations/,
  );
  record('Keyboard tooltip includes detailed formatting, field definition and context note');

  await page.getByLabel('Locale', { exact: true }).selectOption('de-DE');
  assert.match(await table.innerText(), /123\.456,78\s*€/);
  assert.match(await table.innerText(), /1,234E-5 mol\/L/);
  assert.match(await page.locator('.fm-metrics').innerText(), /\+3,48 pt/);
  record('Locale updates currency placement, decimals and percentage-point deltas');
  await page.getByLabel('Concentration notation').selectOption('engineering');
  await page.getByLabel('Significant digits').selectOption('3');
  assert.match(await table.innerText(), /12,3E-6 mol\/L/);
  record('Explicit engineering notation and significant-digit precision reach table cells');

  await page.getByLabel('Locale', { exact: true }).selectOption('en-US');
  await page.getByLabel('Time zone', { exact: true }).selectOption('America/New_York');
  assert.match(await table.innerText(), /Oct 9, 2026/);
  await page.getByRole('button', { name: 'View exact data', exact: true }).click();
  assert.match(await page.locator('.fm-chart').innerText(), /Oct 9, 2026/);
  assert.match(await page.locator('.fm-chart').innerText(), /12.3E-6 mol\/L/);
  record('Time zone reaches both record cells and the chart data alternative');

  await page.getByLabel('Search rows', { exact: true }).fill('A-101');
  for (const mode of ['raw', 'formatted']) {
    await page.getByLabel('CSV values').selectOption(mode);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await pending;
    const destination = path.join(output, `laboratory-${mode}.csv`);
    await download.saveAs(destination);
    const csv = await readFile(destination, 'utf8');
    assert(csv.includes('A-101'));
    assert(!csv.includes('A-102'));
    assert(
      mode === 'raw'
        ? csv.includes('0.00001234') && csv.includes('2026-10-10T00:30:00Z')
        : csv.includes('12.3E-6 mol/L') && csv.includes('Oct 9, 2026'),
    );
  }
  record('Filtered raw CSV retains measurements; formatted CSV exports the chosen display');
  await page.getByRole('button', { name: 'Copy configuration' }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert(clipboard.includes('America/New_York'));
  assert(clipboard.includes('"notation": "engineering"'));
  record('Copied React configuration reflects the actual display settings');

  await page.getByRole('button', { name: 'Reset display' }).click();
  assert.equal(await page.getByLabel('Locale', { exact: true }).inputValue(), 'en-US');
  assert.equal(await page.getByLabel('Time zone', { exact: true }).inputValue(), 'UTC');
  assert.equal(await page.getByLabel('Concentration notation').inputValue(), 'scientific');
  await page.getByLabel('Search rows', { exact: true }).fill('');
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  for (const locale of ['fr-FR', 'hi-IN', 'ar-EG']) {
    await page.getByLabel('Locale', { exact: true }).selectOption(locale);
    assert.match(await table.innerText(), /A-101/);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  record('French, Indian and Arabic formatting render without runtime errors or page overflow');
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Reset display' }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.locator('.fm-chart [role="application"]').focus();
    for (const key of ['Home', 'ArrowRight', 'ArrowRight', 'End']) {
      await page.keyboard.press(key);
      const tooltip = page.locator('.q-chart-tooltip');
      await tooltip.waitFor();
      const bounds = await tooltip.boundingBox();
      assert(
        bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
        `Tooltip fits ${width}px after ${key}`,
      );
      assert.match(await tooltip.innerText(), /mol\/L/);
    }
    await page.screenshot({ path: path.join(output, `mobile-${width}.png`), fullPage: true });
  }
  record('Responsive layouts at 375px and 320px preserve a bounded scrollable data table');
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, errors };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  await writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
