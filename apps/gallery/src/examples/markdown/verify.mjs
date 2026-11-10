// Browser verification for the Markdown language pages and the plain-HTML embed demo.
// Usage: node apps/gallery/src/examples/markdown/verify.mjs [base-url] [output-dir]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? process.env.QUARTILE_MARKDOWN_BASE_URL ?? 'http://127.0.0.1:4173';
const output = resolve(process.argv[3] ?? '/tmp/quartile-markdown-verification');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function open(path, viewport = { width: 1280, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // Vercel Web Analytics exists only on Vercel deployments; local previews answer 404.
    if (message.location()?.url?.includes('/_vercel/insights/')) return;
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  return { page, errors };
}

try {
  // Playground: every example compiles to a chart without errors.
  {
    const { page, errors } = await open('/language');
    for (const label of [
      'Bar chart',
      'Line over quarters',
      'Dashboard',
      'Forgiving input',
      'dbt Charts YAML',
      'JSON spec',
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.locator('.md-preview .q-block').first().waitFor();
      assert.equal(await page.locator('.md-preview .q-block-error').count(), 0, `${label} renders`);
    }
    // The forgiving example reports what it corrected.
    await page.getByRole('button', { name: 'Forgiving input', exact: true }).click();
    await page.getByText(/Used column “region” for “Regoin”/).waitFor();
    await page.screenshot({ path: `${output}/language.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Markdown report: blocks over one dataset share a selection.
  {
    const { page, errors } = await open('/examples/markdown-report');
    const kpi = page.locator('.q-kpi').first();
    assert.match(await kpi.textContent(), /\$2,593,000/);
    await page.getByRole('button', { name: /APAC/ }).first().click();
    await page.waitForFunction(() =>
      document.querySelector('.q-kpi')?.textContent?.includes('$639,000'),
    );
    assert.equal(await page.locator('.q-block-error').count(), 0);
    await page.screenshot({ path: `${output}/markdown-report.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Streamed answer: charts draw while streaming and every block completes without errors.
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
    await page.screenshot({ path: `${output}/ai-answer.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Plain HTML embed: same-origin data, shared selection, host theme and the root part.
  {
    const { page, errors } = await open('/embed/demo', { width: 900, height: 1200 });
    await page.waitForFunction(() => document.querySelectorAll('quartile-chart').length === 5);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('quartile-chart')][3]?.shadowRoot?.textContent?.includes(
        '$2,593,000',
      ),
    );
    const states = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('quartile-chart')].map((el) => ({
          theme: el.shadowRoot?.querySelector('.q-root')?.getAttribute('data-theme'),
          errors: el.shadowRoot?.querySelectorAll('.q-block-error').length ?? 0,
        })),
      );
    assert.deepEqual(
      (await states()).map((s) => s.errors),
      [0, 0, 0, 0, 0],
    );
    await page.evaluate(() => {
      const list = document.querySelectorAll('quartile-chart')[1].shadowRoot;
      [...list.querySelectorAll('button')].find((b) => b.textContent.includes('APAC')).click();
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('quartile-chart')][3]?.shadowRoot?.textContent?.includes(
        '$639,000',
      ),
    );
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
  console.log(`Markdown, AI answer and embed verification passed. Evidence: ${output}`);
} finally {
  await browser.close();
}
