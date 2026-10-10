import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:5177';
const output = resolve(process.argv[3] ?? '/tmp/quartile-studio-evidence');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const weather = {
  timezone: 'GMT',
  utc_offset_seconds: 0,
  hourly_units: {
    time: 'iso8601',
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    precipitation: 'mm',
    wind_speed_10m: 'km/h',
  },
  hourly: {
    time: [
      '2026-10-10T00:00',
      '2026-10-10T01:00',
      '2026-10-10T02:00',
      '2026-10-10T03:00',
      '2026-10-10T04:00',
      '2026-10-10T05:00',
    ],
    temperature_2m: [12, 14, null, 18, 16, 13],
    relative_humidity_2m: [70, 80, 50, 55, 60, 70],
    precipitation: [0, 0, 0, 1, 2, 0],
    wind_speed_10m: [0, 5, null, 9, 12, 7],
  },
};
const earthquakes = {
  type: 'FeatureCollection',
  metadata: { count: 3 },
  features: [1, 2, 3].map((n) => ({
    type: 'Feature',
    id: `event-${n}`,
    properties: {
      time: 1791590400000 + n * 1000,
      mag: n,
      magType: 'ml',
      place: `Region ${n}`,
      type: 'earthquake',
    },
    geometry: { type: 'Point', coordinates: [-73 + n, 40 + n, n * 5] },
  })),
};
const countries = [
  { id: 'US', value: 'United States', code: 'USA' },
  { id: 'CA', value: 'Canada', code: 'CAN' },
];
const development = [
  { page: 1, pages: 1, per_page: 5000, total: 4 },
  countries.flatMap((country) =>
    [2022, 2023].map((year) => ({
      indicator: { id: 'SP.DYN.LE00.IN', value: 'Life expectancy at birth, total (years)' },
      country: { id: country.id, value: country.value },
      countryiso3code: country.code,
      date: String(year),
      value: year === 2022 ? 80 : 81,
      unit: '',
      obs_status: '',
      decimal: 1,
    })),
  ),
];
let weatherBehavior = 'success';
let finishPending;
await context.route('https://api.open-meteo.com/**', async (route) => {
  if (weatherBehavior === 'pending')
    await new Promise((resolve) => {
      finishPending = resolve;
    });
  if (weatherBehavior === 'error') return route.fulfill({ status: 503, body: '{}' });
  await route
    .fulfill({ contentType: 'application/json', body: JSON.stringify(weather) })
    .catch(() => {});
});
await context.route('https://earthquake.usgs.gov/**', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(earthquakes) }),
);
await context.route('https://api.worldbank.org/**', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(development) }),
);
try {
  await page.goto(`${base}/studio?source=weather`);
  await page.getByText('6 records', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-block-id]').count(), 5);
  await page.getByRole('button', { name: 'Configure Temperature · °C', exact: true }).click();
  await page.getByLabel('Y axis', { exact: true }).selectOption('humidityPct');
  await page.getByLabel('Title', { exact: true }).fill('Humidity · %');
  await page.getByRole('heading', { name: 'Humidity · %', exact: true }).waitFor();
  await page.getByLabel('Width', { exact: true }).selectOption('6');
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  assert.equal(await page.locator('[data-block-id]').nth(1).getAttribute('data-block-id'), 'trend');
  await page.getByLabel('Add component', { exact: true }).selectOption('scatter');
  await page.getByRole('button', { name: 'Add +', exact: true }).click();
  await page.getByLabel('Add component', { exact: true }).selectOption('bar');
  await page.getByRole('button', { name: 'Add +', exact: true }).click();
  assert.equal(await page.locator('[data-block-id]').count(), 7);
  await page.getByRole('button', { name: 'Save local draft', exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('quartile-studio-project-v1')),
  );
  assert.equal(saved.blocks.length, 7);
  assert(!('rows' in saved));
  await page.getByLabel('Project name', { exact: true }).fill('Temporary title');
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await page.getByText('6 records', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Project name', { exact: true }).inputValue(), saved.name);
  const jsonEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project JSON', exact: true }).click();
  const jsonDownload = await jsonEvent;
  await jsonDownload.saveAs(`${output}/project.json`);
  assert.deepEqual(JSON.parse(await readFile(`${output}/project.json`, 'utf8')), saved);
  await page.getByRole('button', { name: 'React source', exact: true }).click();
  assert.match(await page.locator('.st-code code').innerText(), /<DataExplorer/);
  assert.match(await page.locator('.st-code code').innerText(), /<ScatterPlot/);
  assert.match(await page.locator('.st-code code').innerText(), /<BarChart/);
  const archiveEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download React starter ↓', exact: true }).click();
  const archive = await archiveEvent;
  await archive.saveAs(`${output}/quartile-react-starter.zip`);
  const bytes = await readFile(`${output}/quartile-react-starter.zip`);
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert(bytes.length > 100000);
  await page.getByRole('button', { name: 'Visual canvas', exact: true }).click();
  await page.locator('.st-provenance summary').click();
  await page.screenshot({ path: `${output}/studio-desktop.png`, fullPage: true });
  // JSON imports validate before mutation; malformed imports leave the current app intact.
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await page.getByText(/Import failed: Unsupported project version/).waitFor();
  assert.equal(await page.locator('[data-block-id]').count(), 7);
  const altered = { ...saved, name: 'Imported analysis', blocks: saved.blocks.slice(0, 3) };
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(altered)),
  });
  await page.getByText('6 records', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-block-id]').count(), 3);
  await page.getByRole('link', { name: /Event monitoring/ }).click();
  await page.getByText('3 records', { exact: true }).waitFor();
  await page.getByRole('link', { name: /Development research/ }).click();
  await page.getByText('4 records', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Configure Life expectancy · years', exact: true })
    .click();
  await page.getByLabel('Series', { exact: true }).selectOption('');
  await page.getByText(/Multiple records share an X \/ series value/).waitFor();
  assert(
    await page.getByRole('button', { name: 'Download React starter ↓', exact: true }).isDisabled(),
  );
  await page.getByLabel('Series', { exact: true }).selectOption('country');
  assert(
    await page.getByRole('button', { name: 'Download React starter ↓', exact: true }).isEnabled(),
  );
  // Custom API data connects to the native table; source config never stores response rows.
  await context.route('https://example.org/data.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        records: [
          { category: 'A', value: 2 },
          { category: 'B', value: 4 },
        ],
      }),
    }),
  );
  await page.getByRole('button', { name: '+ Connect a public JSON API', exact: true }).click();
  await page.getByLabel('Public HTTPS URL', { exact: true }).fill('https://example.org/data.json');
  await page.getByLabel('Records path (optional)', { exact: true }).fill('records');
  await page.getByRole('button', { name: 'Load public JSON', exact: true }).click();
  await page.getByText('2 records', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-block-id]').count(), 2);
  weatherBehavior = 'error';
  await page.getByRole('link', { name: /Weather & operations/ }).click();
  await page.getByText('Source returned HTTP 503.').waitFor();
  assert.equal(await page.locator('[data-block-id]').count(), 0);
  weatherBehavior = 'success';
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText('6 records', { exact: true }).waitFor();
  weatherBehavior = 'pending';
  await page.getByRole('button', { name: 'Reload source', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await page.getByText('Request cancelled.', { exact: true }).waitFor();
  finishPending?.();
  await page.getByRole('link', { name: /Event monitoring/ }).click();
  await page.getByText('3 records', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-block-id]').count(), 5);
  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(160);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `No document overflow at ${width}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('.st-block')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    '0s',
  );
  await page.screenshot({ path: `${output}/studio-mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        passed: true,
        checks: [
          '3 public-source adapters',
          'field/title/width editing',
          'add/reorder',
          'local draft roundtrip',
          'project JSON roundtrip/rejection',
          'native source and ZIP download',
          'duplicate line grain',
          'custom API',
          'failure/retry/cancel/stale result',
          '320/375/768 responsive',
          'reduced motion',
          'no page errors',
        ],
        archiveBytes: bytes.length,
      },
      null,
      2,
    ),
  );
  console.log(`Studio browser verification passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  await writeFile(`${output}/failure.txt`, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
