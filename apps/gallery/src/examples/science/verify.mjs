import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, checks, errors }, null, 2));
} finally {
  await browser.close();
}
