// Browser verification for the playground, the Markdown pages and the plain-HTML embed demo.
// Usage: node apps/gallery/src/examples/markdown/verify.mjs [base-url] [output-dir]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { watchRequests } from '../../../scripts/examples-only.mjs';

const base = process.argv[2] ?? process.env.QUARTILE_MARKDOWN_BASE_URL ?? 'http://127.0.0.1:4173';
const output = resolve(process.argv[3] ?? '/tmp/quartile-markdown-verification');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
// The embed demo loads its script and its data from next to itself, under /examples/embed.
const watched = [];

async function open(path, viewport = { width: 1280, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(20_000);
  const errors = [];
  watched.push(watchRequests(page, base));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // Vercel Web Analytics exists only on Vercel deployments; local previews answer 404.
    if (message.location()?.url?.includes('/_vercel/insights/')) return;
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  return { page, errors };
}

/** Clicks a button that saves a file and returns the download. */
async function save(page, button) {
  const download = page.waitForEvent('download');
  await button.click();
  return download;
}
const csvLines = async (download) =>
  (await fs.readFile(await download.path(), 'utf8')).trim().split(/\r?\n/);

try {
  // Playground: every example compiles to a chart without errors.
  {
    const { page, errors } = await open('/examples/playground');
    const preset = (label) => page.getByRole('button', { name: label, exact: true });
    const preview = page.locator('.md-preview');
    for (const label of [
      'Bar chart',
      'Line over quarters',
      'Dashboard',
      'Forgiving input',
      'dbt Charts YAML',
      'JSON spec',
      'Tune the details',
      'Source and rows',
      'From a JSON API',
      'JSON from a URL',
      'Explorer',
    ]) {
      await preset(label).click();
      await preview.locator('.q-block').first().waitFor();
      assert.equal(await preview.locator('.q-block-error').count(), 0, `${label} renders`);
    }
    // The forgiving example reports what it corrected.
    await preset('Forgiving input').click();
    await page.getByText(/Used column “region” for “Regoin”/).waitFor();

    // Presentation settings: the reference line is labelled and each line is named at its end.
    await preset('Tune the details').click();
    await preview.locator('.q-chart-reference text').waitFor();
    assert.equal(await preview.locator('.q-chart-reference text').textContent(), 'Target');
    assert.equal(await preview.locator('.q-chart-end-labels text').count(), 2);
    assert.equal(await preview.locator('.q-legend').count(), 0, '“legend: none” hides the legend');
    assert.equal(await page.locator('.md-notes [data-severity="warning"]').count(), 0);

    // Provenance and actions: the source line, the rows behind the chart and their CSV.
    await preset('Source and rows').click();
    assert.equal(
      await preview.locator('.q-spec-source').innerText(),
      'Source: Kestrel Goods finance export (fictional) · As of Sep 30, 2026',
    );
    await preview.getByRole('button', { name: 'Rows', exact: true }).click();
    assert.equal(await preview.locator('.q-spec-rows-count').innerText(), '9 rows');
    const rows = await save(page, preview.getByRole('button', { name: 'Download CSV' }));
    assert.equal(rows.suggestedFilename(), 'revenue-by-region-q3-2026.csv');
    assert.equal((await csvLines(rows)).length, 10, 'a header and nine rows');

    // A pasted API response: `path:` finds the rows inside the envelope.
    await preset('From a JSON API').click();
    await preview.getByRole('figure', { name: 'Support tickets opened per week' }).waitFor();
    assert.equal(await preview.locator('.q-bar-marks path').count(), 6, '3 weeks × 2 priorities');

    // `src:` loads through the page's loader: its own origin, and nothing else.
    const elsewhere = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'example.org') elsewhere.push(request.url());
    });
    await preset('JSON from a URL').click();
    await preview.getByRole('figure', { name: 'Support tickets opened per week' }).waitFor();
    assert.equal(await preview.locator('.q-bar-marks path').count(), 12, '4 weeks × 3 priorities');
    const editor = page.locator('.md-editor textarea');
    const source = await editor.inputValue();
    assert.match(source, /^src: \/examples\/embed\/tickets\.json$/m);
    await editor.fill(
      source.replace('/examples/embed/tickets.json', 'https://example.org/tickets.json'),
    );
    await preview
      .getByText('This page allows data from: same-origin; `https://example.org` is not allowed.')
      .waitFor();
    assert.deepEqual(elsewhere, [], 'a refused origin is never requested');

    // The explorer searches its own rows.
    await preset('Explorer').click();
    await preview.getByText('12 of 12 source rows').waitFor();
    await preview.getByRole('textbox', { name: 'Search rows' }).fill('lamp');
    await preview.getByText('2 of 12 source rows').waitFor();

    // The settings table documents the keys the presets use.
    const documented = await page.locator('.md-settings tbody th[scope="row"]').allInnerTexts();
    for (const key of ['margin', 'colors', 'reference, reference.label', 'path', 'actions']) {
      assert.ok(documented.includes(key), `the settings table lists ${key}`);
    }
    await preset('Tune the details').click();
    await page.screenshot({ path: `${output}/playground.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Markdown report: blocks over one dataset share a selection, and the dashboard's toolbar
  // opens the rows behind it.
  {
    const { page, errors } = await open('/examples/markdown-report');
    const kpi = page.locator('.q-kpi').first();
    assert.match(await kpi.textContent(), /\$2,593,000/);
    assert.equal(
      await page.locator('.q-spec-dashboard > .q-spec-source').innerText(),
      'Source: Kestrel Goods sales ledger (fictional) · As of Sep 30, 2026',
    );
    // One toolbar for the dashboard, none on its views.
    const toolbar = page.getByRole('group', { name: 'Quarter at a glance actions' });
    assert.deepEqual(
      (await toolbar.getByRole('button').allTextContents()).map((text) => text.trim()),
      ['Rows', 'Download CSV'],
    );
    assert.equal(await page.getByRole('group', { name: /actions$/ }).count(), 1);
    await toolbar.getByRole('button', { name: 'Rows' }).click();
    const panel = page.getByRole('group', { name: 'Rows behind Quarter at a glance' });
    assert.equal(await panel.locator('.q-spec-rows-count').innerText(), '18 rows');

    await page.getByRole('button', { name: /APAC/ }).first().click();
    await page.waitForFunction(() =>
      document.querySelector('.q-kpi')?.textContent?.includes('$639,000'),
    );
    // The rows narrow to the selection, and the download is those rows.
    assert.equal(await panel.locator('.q-spec-rows-count').innerText(), '6 of 18 rows');
    const file = await save(page, toolbar.getByRole('button', { name: 'Download CSV' }));
    assert.equal(file.suggestedFilename(), 'quarter-at-a-glance.csv');
    const lines = await csvLines(file);
    assert.equal(lines.length, 7, 'a header and the six APAC rows');
    assert.ok(lines.slice(1).every((line) => line.includes('"APAC"')));
    assert.equal(await page.locator('.q-block-error').count(), 0);
    await page.screenshot({ path: `${output}/markdown-report.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Streamed answer: charts draw while streaming, every block completes without errors, and a
  // selection in the finished answer suggests a follow-up question.
  {
    const { page, errors } = await open('/examples/ai-answer');
    await page.getByRole('button', { name: 'Stream faster' }).click();
    await page.locator('.md-turn-assistant[aria-busy="true"]').waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll('.md-turn-assistant .q-block').length >= 1,
    );
    await page.screenshot({ path: `${output}/ai-answer-streaming.png` });
    await page.waitForFunction(
      () => !document.querySelector('.md-turn-assistant[aria-busy="true"]'),
      null,
      {
        timeout: 60_000,
      },
    );
    assert.equal(await page.locator('.md-turn-assistant .q-block').count(), 3);
    assert.equal(await page.locator('.md-turn-assistant .q-block-error').count(), 0);
    const legend = await page
      .locator('.md-turn-assistant .q-chart-legend-top')
      .first()
      .textContent();
    assert.match(legend, /Starter.*Team.*Enterprise/);
    assert.equal(
      await page.locator('.md-turn-assistant .q-spec-source').innerText(),
      'Source: Billing export (fictional sample) · As of Sep 30, 2026',
    );

    // Nothing is suggested until the reader selects a mark.
    const suggestion = page.getByRole('button', { name: /^Ask about/ });
    const enterprise = page.locator('.md-turn-assistant .q-bar-list-row', {
      hasText: 'Enterprise',
    });
    assert.equal(await suggestion.count(), 0);
    await enterprise.click();
    await page.getByRole('button', { name: 'Ask about plan Enterprise', exact: true }).click();
    const sent = page.locator('.md-turn-demo');
    assert.match(await sent.innerText(), /Tell me more about plan Enterprise\./);
    // The question is shown, not sent: the page says so.
    assert.match(await sent.innerText(), /local demo, nothing is sent/i);
    assert.match(await sent.innerText(), /This page calls no model/);
    await page.screenshot({ path: `${output}/ai-answer.png`, fullPage: true });
    // Deselecting withdraws the suggestion and the question.
    await enterprise.click();
    await page.waitForFunction(() => !document.querySelector('.md-turn-demo'));
    assert.equal(await suggestion.count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Plain HTML embed: same-origin data, shared selection without a setting, the rows behind a
  // chart, selection events for the page, host theme and the root part.
  {
    const { page, errors } = await open('/examples/embed/demo', { width: 900, height: 1200 });
    await page.waitForFunction(() => document.querySelectorAll('quartile-chart').length === 6);
    const shadowText = (index) =>
      page.evaluate(
        (i) => document.querySelectorAll('quartile-chart')[i]?.shadowRoot?.textContent ?? '',
        index,
      );
    const shadowIncludes = (index, text) =>
      page.waitForFunction(
        ([i, expected]) =>
          document
            .querySelectorAll('quartile-chart')
            [i]?.shadowRoot?.textContent?.includes(expected),
        [index, text],
      );
    const clickIn = (index, label) =>
      page.evaluate(
        ([i, text]) => {
          const root = document.querySelectorAll('quartile-chart')[i].shadowRoot;
          [...root.querySelectorAll('button')].find((b) => b.textContent.includes(text)).click();
        },
        [index, label],
      );
    await shadowIncludes(3, '$2,593,000');
    // The API-shaped file is read through `path:`.
    await shadowIncludes(5, 'Sep 28');
    const states = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('quartile-chart')].map((el) => ({
          theme: el.shadowRoot?.querySelector('.q-root')?.getAttribute('data-theme'),
          errors: el.shadowRoot?.querySelectorAll('.q-block-error').length ?? 0,
        })),
      );
    assert.deepEqual(
      (await states()).map((s) => s.errors),
      [0, 0, 0, 0, 0, 0],
    );
    // No block on the page writes `select:`; a named dataset links its views by default.
    assert.equal(await page.locator('code.language-quartile', { hasText: 'select:' }).count(), 0);
    assert.match(
      await shadowText(1),
      /Source: sales\.csv, fictional sample data · As of Sep 30, 2026/,
    );
    const heard = page.locator('#heard');
    assert.equal(await heard.innerText(), 'Nothing selected yet.');
    await clickIn(1, 'Rows');
    await shadowIncludes(1, '18 rows');

    await clickIn(1, 'APAC');
    await shadowIncludes(3, '$639,000');
    // The rows behind the chart narrow, the CSV is offered, and the page hears the selection.
    await shadowIncludes(1, '6 of 18 rows');
    assert.match(await shadowText(1), /Download CSV/);
    assert.equal(await heard.innerText(), 'Reader, in "sales": region in APAC');
    // The page clears the selection through Quartile.selection('sales').
    await page.locator('#clear').click();
    await shadowIncludes(3, '$2,593,000');
    assert.equal(await heard.innerText(), 'Page script, in "sales": nothing selected');
    // The script the page shows is the script it runs.
    const shown = page.locator('script.shown');
    assert.ok(await shown.isVisible(), 'the page script is displayed');
    assert.match(await shown.textContent(), /Quartile\.selection\('sales'\)\s*;/);

    await clickIn(1, 'APAC');
    await shadowIncludes(3, '$639,000');
    await page.click('#mode');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('quartile-chart')].every(
        (el) => el.shadowRoot?.querySelector('.q-root')?.getAttribute('data-theme') === 'dark',
      ),
    );
    const signal = await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'quartile-chart::part(root) { --q-signal: rgb(225, 29, 72); }';
      document.head.append(style);
      const root = document
        .querySelectorAll('quartile-chart')[1]
        .shadowRoot.querySelector('.q-root');
      return getComputedStyle(root).getPropertyValue('--q-signal').trim();
    });
    assert.equal(signal, 'rgb(225, 29, 72)');
    await page.screenshot({ path: `${output}/embed-demo-dark.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  assert.deepEqual(
    watched.flatMap((outsideExamples) => outsideExamples()),
    [],
    'requests outside /examples',
  );
  console.log(`Markdown, AI answer and embed verification passed. Evidence: ${output}`);
} finally {
  await browser.close();
}
