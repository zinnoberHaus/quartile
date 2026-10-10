import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2] || 'http://127.0.0.1:4178';
const output = resolve(process.argv[3] || '/tmp/quartile-science-verification');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const checks = [];
let slowResponse;
let notifySlow;
const slowRequested = new Promise((resolve) => {
  notifySlow = resolve;
});
let slowAnalysis;
let notifyAnalysis;
const analysisRequested = new Promise((resolve) => {
  notifyAnalysis = resolve;
});
const sourceRequests = [];
const snapshot = JSON.stringify({
  label: 'Connected orders',
  rows: [
    { region: 'East', amount: 10 },
    { region: 'West', amount: 20 },
    { region: 'East', amount: null },
  ],
  fields: { amount: { type: 'quantitative', format: 'currency', currency: 'USD' } },
});
const sourceServer = createServer((request, response) => {
  sourceRequests.push(request.headers);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
  } else if (request.url === '/analysis-slow') {
    slowAnalysis = response;
    notifyAnalysis();
  } else if (request.url === '/slow') {
    slowResponse = response;
    response.writeHead(200);
    response.write('[');
    notifySlow();
  } else if (request.url === '/failure') {
    response.writeHead(503);
    response.end('Unavailable');
  } else response.end(snapshot);
});
await new Promise((resolve) => sourceServer.listen(0, '127.0.0.1', resolve));
const sourceOrigin = `http://127.0.0.1:${sourceServer.address().port}`;
page.on('pageerror', (error) => errors.push(error.message));
const checked = (message) => {
  checks.push(message);
  console.log(`Passed: ${message}`);
};
const metric = (name) =>
  page
    .locator('.sc-metrics > div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .locator('dd');
async function equalText(locator, value) {
  await locator.filter({ hasText: new RegExp(`^${value}$`) }).waitFor();
  assert.equal(await locator.innerText(), value);
}
async function open(route) {
  await page.goto(`${origin}/examples/${route}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
}
try {
  await open('explore');
  const records = page.getByRole('grid', { name: 'Dataset records' });
  await records.waitFor();
  await equalText(metric('Records in focus'), '180');
  await page.locator('.q-bar-list-row').filter({ hasText: 'Batch 01' }).click();
  await equalText(metric('Records in focus'), '30');
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('material');
  await equalText(metric('Records in focus'), '180');
  await page.locator('.q-bar-list-row').filter({ hasText: 'Alloy' }).click();
  await equalText(metric('Records in focus'), '60');
  const distribution = page.getByRole('application', { name: /^Temperature distribution\./ });
  await distribution.focus();
  await distribution.press('ArrowRight');
  await distribution.press('Enter');
  await page.getByText('2 linked selections', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Measure', exact: true }).selectOption('pressureKpa');
  await equalText(metric('Records in focus'), '60');
  await page.getByText('1 linked selections', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('batch');
  await equalText(metric('Records in focus'), '180');
  await page.getByRole('combobox', { name: 'Measure', exact: true }).selectOption('temperatureC');
  checked(
    'Changing a chart mapping removes its obsolete selection and preserves the other chart filter.',
  );
  await records
    .getByRole('button', { name: /^Edit Temperature, row/ })
    .nth(1)
    .click();
  await page.getByRole('spinbutton', { name: 'Temperature', exact: true }).fill('39.2');
  await page.getByRole('button', { name: 'Save change', exact: true }).click();
  await records
    .getByRole('button', { name: /^Edit Temperature, row/ })
    .nth(1)
    .filter({ hasText: '39.2' })
    .waitFor();
  checked('Cell editing updates the caller dataset and returns the new value.');

  const search = page.getByRole('textbox', { name: 'Search rows' });
  await search.fill('sample-002');
  await equalText(metric('Records in focus'), '1');
  assert.equal(await records.getByRole('row').count(), 2);
  await page.getByText('Saved table views', { exact: false }).click();
  await page.getByRole('textbox', { name: 'View name' }).fill('One sample');
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await search.fill('');
  await equalText(metric('Records in focus'), '180');
  await page.getByRole('button', { name: 'One sample', exact: true }).click();
  await equalText(metric('Records in focus'), '1');
  checked('Table search updates linked analysis; saved views restore the matching record.');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.match(csv, /sample-002/);
  assert.match(csv, /39\.2/);
  assert.doesNotMatch(csv, /sample-003/);
  checked('CSV downloads contain the filtered, edited records.');

  await page.locator('input[type=file]').setInputFiles({
    name: 'snapshot.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        label: 'Notebook result',
        rows: [
          { sample: '001', score: 0.2 },
          { sample: '002', score: 0.8 },
        ],
        fields: { sample: { type: 'nominal' }, score: { type: 'quantitative', format: 'percent' } },
      }),
    ),
  });
  await equalText(metric('Records in focus'), '2');
  await page.getByText('Notebook result', { exact: true }).first().waitFor();
  await page
    .getByRole('grid', { name: 'Dataset records' })
    .getByText('001', { exact: true })
    .waitFor();
  checked(
    'Typed dataframe JSON imports preserve string identifiers and replace the analysis dataset.',
  );
  await page.locator('input[type=file]').setInputFiles({
    name: 'sparse.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[{"toString":"first","amount":1},{"amount":2}]'),
  });
  await page.getByText('sparse.json', { exact: true }).first().waitFor();
  await equalText(metric('Missing cells'), '1');
  assert.doesNotMatch(await records.innerText(), /native code/);
  await page.locator('input[type=file]').setInputFiles({
    name: 'empty.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[]'),
  });
  await page.getByText(/Import failed:.*non-empty row array/).waitFor();
  await equalText(metric('Records in focus'), '2');
  checked(
    'Sparse imported fields render as missing cells; a rejected empty import retains the previous snapshot.',
  );
  await page.getByText('Load from a data URL', { exact: true }).click();
  const sourceURL = page.getByRole('textbox', { name: 'Data URL', exact: true });
  await context.addCookies([{ name: 'source-secret', value: 'must-not-send', url: sourceOrigin }]);
  await sourceURL.fill(`${sourceOrigin}/orders`);
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  await page.getByText('Connected orders', { exact: true }).first().waitFor();
  await equalText(metric('Records in focus'), '3');
  await equalText(metric('Missing cells'), '1');
  await page.locator('.q-bar-list-row').filter({ hasText: 'East' }).click();
  await equalText(metric('Records in focus'), '2');
  assert.equal(await records.getByRole('row').count(), 3);
  await page.getByRole('button', { name: 'Clear chart selection' }).click();
  await equalText(metric('Records in focus'), '3');
  assert.ok(
    sourceRequests.every(
      (headers) => !headers.cookie && !headers.authorization && !headers.referer,
    ),
  );
  checked(
    'A real CORS data URL feeds linked charts, null-aware profiles and records without cookies or referrer.',
  );

  await sourceURL.fill(`${sourceOrigin}/failure`);
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  await page.getByText(/Load failed:.*HTTP 503/).waitFor();
  await equalText(metric('Records in focus'), '3');
  checked('A failed source request preserves the last successfully loaded dataset.');

  await sourceURL.fill(`${sourceOrigin}/slow`);
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  await slowRequested;
  await page.getByRole('button', { name: 'Restore sample' }).click();
  slowResponse.end(snapshot);
  await page.getByText('Restored 180 fictional measurements.', { exact: true }).waitFor();
  await equalText(metric('Records in focus'), '180');
  checked(
    'Restoring the sample cancels a pending source; its late response cannot replace the sample.',
  );

  await page.clock.install();
  const stalled = page.waitForResponse(`${sourceOrigin}/slow`);
  await sourceURL.fill(`${sourceOrigin}/slow`);
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  await stalled;
  await page.clock.fastForward(15_001);
  await page.getByText(/Load failed: The source did not finish within 15 seconds/).waitFor();
  await equalText(metric('Records in focus'), '180');
  slowResponse.end(']');
  checked('A stalled streaming response times out with the current dataset intact.');

  const cancelled = page.waitForResponse(`${sourceOrigin}/slow`);
  await page.getByRole('button', { name: 'Load data', exact: true }).click();
  await cancelled;
  await page.getByRole('button', { name: 'Cancel load', exact: true }).click();
  slowResponse.end(']');
  await page.getByText('Load cancelled. Current data is unchanged.', { exact: true }).waitFor();
  await equalText(metric('Records in focus'), '180');
  checked('Explicit cancellation stops a streaming source without losing the current dataset.');

  await page.setViewportSize({ width: 375, height: 900 });
  // ResizeObserver updates chart dimensions after the viewport change is acknowledged.
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, null, {
    timeout: 5000,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  await page.screenshot({ path: `${output}/connection-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Restore sample' }).click();
  await equalText(metric('Records in focus'), '180');
  await page.screenshot({ path: `${output}/explorer-desktop.png`, fullPage: true });

  await open('cohorts');
  await equalText(metric('Selected users'), '240');
  await page.getByRole('combobox', { name: 'Inspect interval' }).selectOption('5');
  await page.getByText('28 eligible users', { exact: false }).first().waitFor();
  await page.getByText('Not yet observed', { exact: true }).first().waitFor();
  checked('Cohort inspection changes the observation interval and keeps immature users distinct.');
  await page.screenshot({ path: `${output}/cohorts-desktop.png`, fullPage: true });

  await open('model-evaluation');
  const initial = await page.locator('.sc-metrics').innerText();
  await page.getByRole('slider', { name: 'Decision threshold' }).fill('0.8');
  assert.notEqual(await page.locator('.sc-metrics').innerText(), initial);
  await page.locator('[data-outcome="FP"]').click();
  const modelRows = page.getByRole('table', { name: 'Model prediction records' });
  await modelRows.waitFor();
  assert.match(await modelRows.innerText(), /FP|No rows/);
  await page.getByRole('button', { name: 'All outcomes', exact: true }).click();
  checked(
    'Threshold changes recalculate evaluation; confusion cells drill into prediction records.',
  );
  await page.screenshot({ path: `${output}/model-desktop.png`, fullPage: true });

  await open('assistant');
  const prompt = page.getByRole('textbox', { name: 'Analysis request' });
  await prompt.fill('Show failed samples');
  await page.getByRole('button', { name: 'Propose changes', exact: true }).click();
  await page.getByRole('button', { name: 'Apply changes', exact: true }).waitFor();
  await page.getByText('180 samples', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await page.getByText('66 samples', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Undo last plan', exact: true }).click();
  await page.getByText('180 samples', { exact: true }).waitFor();
  checked(
    'AI proposals leave data unchanged until explicit Apply; Undo restores the previous view.',
  );
  await prompt.fill('Plot temperature against yield');
  await page.getByRole('button', { name: 'Propose changes', exact: true }).click();
  await page.getByRole('button', { name: 'Apply changes', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: 'Include field quality and range summaries' }).uncheck();
  assert.equal(await page.getByRole('button', { name: 'Apply changes', exact: true }).count(), 0);
  checked('Changing disclosed context invalidates a pending AI proposal.');
  await page.getByRole('button', { name: 'Reset analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Show failed samples', exact: true }).click();
  await page.getByRole('button', { name: 'Apply changes', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reset analysis', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Apply changes', exact: true }).count(), 0);
  checked('Reset analysis discards a proposal even when the original view has not changed.');
  const assistantChart = page.getByRole('application', { name: /^Assistant analysis chart\./ });
  await assistantChart.focus();
  await assistantChart.press('ArrowRight');
  await assistantChart.press('Enter');
  assert.equal(await page.locator('.q-histogram-brush').count(), 1);
  const selectedBeforePlan = await page.locator('.q-filterbar').innerText();
  await page.getByRole('button', { name: 'Compare temperature and yield', exact: true }).click();
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await page.getByRole('button', { name: 'Undo last plan', exact: true }).click();
  assert.equal(await page.locator('.q-histogram-brush').count(), 1);
  assert.equal(await page.locator('.q-filterbar').innerText(), selectedBeforePlan);
  checked(
    'Undo after a chart-type change restores the previous brush and its crossfilter publisher.',
  );

  await page.getByRole('button', { name: 'Reset analysis', exact: true }).click();
  await page.getByText('Model connection', { exact: true }).click();
  const endpoint = page.getByRole('textbox', { name: 'Backend endpoint' });
  await endpoint.fill(`${sourceOrigin}/failure`);
  await page.getByRole('button', { name: 'Use backend', exact: true }).click();
  await prompt.fill('Show failed samples');
  await page.getByRole('button', { name: 'Propose changes', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'HTTP 503' }).waitFor();
  await page.getByText('180 samples', { exact: true }).waitFor();
  await endpoint.fill(`${sourceOrigin}/analysis-slow`);
  await page.getByRole('button', { name: 'Use backend', exact: true }).click();
  await page.getByRole('button', { name: 'Propose changes', exact: true }).click();
  await analysisRequested;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  slowAnalysis.end(
    JSON.stringify({
      version: 1,
      title: 'Cancelled backend fixture',
      summary: 'A protocol test response that must never become an applicable proposal.',
      actions: [{ type: 'filter', field: 'passed', op: 'eq', value: false }],
    }),
  );
  await page.getByText('Cancelled. No pending proposal.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Apply changes', exact: true }).count(), 0);
  await page.getByText('180 samples', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Use local rules', exact: true }).click();
  checked('Backend failure and a cancelled delayed proposal leave the current analysis unchanged.');
  await page.screenshot({ path: `${output}/assistant-desktop.png`, fullPage: true });

  for (const route of ['explore', 'cohorts', 'model-evaluation', 'assistant']) {
    await page.setViewportSize({ width: 375, height: 900 });
    await open(route);
    await page.locator('.q-dt:visible').first().waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, `${route}: document must fit mobile width`);
    await page.screenshot({ path: `${output}/${route}-mobile.png`, fullPage: true });
  }
  checked('All four workflows fit a 375px viewport with contained table scrolling.');
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    `${JSON.stringify({ origin, checks, errors }, null, 2)}\n`,
  );
} finally {
  await browser.close();
  sourceServer.closeAllConnections();
  await new Promise((resolve) => sourceServer.close(resolve));
}
