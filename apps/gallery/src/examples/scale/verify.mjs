import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';

// Install Playwright separately or point PLAYWRIGHT_MODULE at its package entry point.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2] || 'http://127.0.0.1:4173';
const output = resolve(process.argv[3] || '/tmp/quartile-scale-verification');
const benchmark = process.argv.includes('--benchmark');
await mkdir(output, { recursive: true });
const browserLaunchArguments = ['--enable-precise-memory-info'];
const browser = await chromium.launch({ headless: true, args: browserLaunchArguments });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on('pageerror', (error) => errors.push(error.message));
context.on('request', (request) => requests.push(request.url()));
const checks = [];
const checked = (message) => {
  checks.push(message);
  console.log(`Passed: ${message}`);
};
const runs = [];
const number = (value) => Number(value.replaceAll(',', ''));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function poll(read, expected, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await read()) === expected) return;
    await pause(25);
  }
  assert.equal(await read(), expected);
}

async function ready(target = page) {
  await target.waitForFunction(
    () => {
      const button = [...document.querySelectorAll('button')].find(
        (node) => node.textContent === 'Download this measurement',
      );
      return button && !button.disabled;
    },
    undefined,
    { timeout: 90_000 },
  );
}

async function report(target = page) {
  await ready(target);
  const download = target.waitForEvent('download');
  await target.getByRole('button', { name: 'Download this measurement', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const result = JSON.parse(Buffer.concat(chunks).toString());
  for (const query of Object.values(result.queries)) {
    assert.equal(query.status, 'ready');
    assert.ok(Number.isFinite(query.durationMs));
  }
  assert.ok(Number.isFinite(result.viewRequestToNextFrameMs));
  return result;
}

async function count(expected, target = page) {
  await poll(async () => {
    const value = target.getByRole('group', { name: 'Matching requests', exact: true });
    if (!(await value.count())) return null;
    return number(await value.locator('.q-kpi-value').innerText());
  }, expected);
  await ready(target);
}

async function firstId(expected) {
  await poll(async () => {
    const cell = page
      .getByRole('table', { name: 'Worker-paged request records' })
      .getByRole('cell')
      .first();
    return (await cell.count()) ? number(await cell.innerText()) : null;
  }, expected);
}

async function load(size, target = page) {
  await target
    .getByRole('combobox', { name: 'Source rows', exact: true })
    .selectOption(String(size));
  await target.getByRole('button', { name: /^(Load sample data|Reload sample)$/ }).click();
  await count(size, target);
}

async function chooseRegion(value, expected) {
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption(value);
  await count(expected);
}

async function chooseService(expected) {
  await page
    .locator('.q-bar-list-row')
    .filter({ hasText: /^Search/ })
    .click();
  await count(expected);
}

async function clear(expected) {
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await count(expected);
}

try {
  await page.goto(`${origin}/examples/scale`);
  assert.equal(
    await page.locator('script[src="/@vite/client"]').count(),
    0,
    'Use the production gallery preview server for reproducible verification and measurements.',
  );
  assert.equal(page.workers().length, 0);
  await load(100_000);
  const initial = await report();
  assert.equal(initial.queries.services.returnedRows, 4);
  assert.equal(initial.queries.metrics.returnedRows, 1);
  assert.equal(initial.queries.table.returnedRows, 25);
  assert.equal(initial.queries.scatter.returnedRows, 2_000);
  assert.equal(initial.queries.scatter.totalRows, 100_000);
  assert.equal(initial.queries.scatter.complete, false);
  assert.equal(initial.view.activeRenderer, 'canvas');
  await poll(() => page.workers().length, 1);
  await firstId(1);
  checked('100K Arrow ingestion; bounded 4 + 1 + 25 + 2,000 results; one live database worker');

  await chooseRegion('eu-west', 33_332);
  await chooseService(8_333);
  const alternatives = await page.locator('.q-bar-list-value').allTextContents();
  assert.deepEqual(alternatives.map(number), [8_333, 8_333, 8_333, 8_333]);
  await firstId(6);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await firstId(306);
  const paged = await report();
  assert.equal(paged.view.offset, 25);
  assert.equal(paged.queries.table.totalRows, 8_333);
  checked('Linked region/service predicates; source-excluding alternatives; exact stable paging');

  await clear(100_000);
  await chooseRegion('eu-west', 33_332);
  await chooseService(8_333);
  await firstId(6);
  await clear(100_000);
  checked('Revisiting an identical filter combination starts on its first page');
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('eu-west');
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('ap-south');
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('us-east');
  await count(33_336);
  await firstId(1);
  await pause(250);
  await count(33_336);
  checked('Rapid superseding filters settle on the last request');

  await clear(100_000);
  const plot = page.getByRole('application', { name: /^Latency and response size/ });
  await plot.focus();
  await plot.press('Enter');
  await count(1);
  await chooseRegion('eu-west', 0);
  assert.equal(
    await page
      .getByRole('group', { name: 'Mean latency', exact: true })
      .locator('.q-kpi-value')
      .innerText(),
    '—',
  );
  const empty = await report();
  assert.equal(empty.queries.table.returnedRows, 0);
  assert.equal(empty.queries.services.returnedRows, 0);
  assert.equal(empty.queries.scatter.totalRows, 33_332);
  checked(
    'Keyboard point selection links views; contradictory predicates produce honest empty values',
  );
  await clear(100_000);

  for (const renderer of ['svg', 'canvas', 'webgl']) {
    await page.getByRole('combobox', { name: 'Renderer', exact: true }).selectOption(renderer);
    await page.waitForFunction(() =>
      document.querySelector('.scale-renderer-status')?.textContent.includes('active'),
    );
    const measured = await report();
    assert.equal(measured.view.requestedRenderer, renderer);
    assert.ok(['svg', 'canvas', 'webgl'].includes(measured.view.activeRenderer));
    if (measured.view.activeRenderer !== renderer) assert.ok(measured.view.rendererFallbackReason);
  }
  await page.getByRole('button', { name: 'View scatter as a table', exact: true }).click();
  await ready();
  assert.ok(await page.getByRole('table', { name: /Latency and response size/ }).count());
  await page.getByRole('button', { name: 'View scatter as a table', exact: true }).click();
  await page.getByRole('combobox', { name: 'Renderer', exact: true }).selectOption('canvas');
  await ready();
  checked(
    'SVG/Canvas/WebGL switching reports active renderer; accessible scatter table is available',
  );
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await page.screenshot({ path: `${output}/dark.png`, fullPage: true });
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  checked('No horizontal page overflow at 320/375/768px; light/dark screenshots captured');

  if (benchmark) {
    for (const size of [10_000, 100_000, 1_000_000]) {
      await load(size);
      const setup = await report();
      runs.push({ phase: 'setup', size, report: setup });
      const eu = Math.floor(size / 12) * 4;
      // One untimed warm-up sequence, then five complete sequences with raw downloaded reports.
      for (let iteration = 0; iteration <= 5; iteration++) {
        await chooseRegion('eu-west', eu);
        if (iteration) runs.push({ phase: 'region', iteration, size, report: await report() });
        await chooseService(eu / 4);
        if (iteration) runs.push({ phase: 'service', iteration, size, report: await report() });
        await page.getByRole('button', { name: 'Next page', exact: true }).click();
        await firstId(306);
        if (iteration) runs.push({ phase: 'page', iteration, size, report: await report() });
        await clear(size);
        if (iteration) runs.push({ phase: 'clear', iteration, size, report: await report() });
      }
    }
    for (const marks of [2_000, 10_000]) {
      await page
        .getByRole('combobox', { name: 'Maximum plotted rows', exact: true })
        .selectOption(String(marks));
      await ready();
      for (let iteration = 0; iteration <= 5; iteration++) {
        for (const renderer of ['svg', 'canvas', 'webgl']) {
          await page
            .getByRole('combobox', { name: 'Renderer', exact: true })
            .selectOption(renderer);
          const measured = await report();
          assert.equal(measured.queries.scatter.returnedRows, marks);
          if (iteration)
            runs.push({ phase: 'renderer', iteration, size: 1_000_000, report: measured });
        }
      }
    }
    checked(
      '10K/100K/1M source sizes: five warm linked sequences each; five renderer switches per 2K/10K bound',
    );
  }

  await page.locator('.scale-header a[href="/"]').click();
  await poll(() => page.workers().length, 0);
  await page.goto(`${origin}/examples/scale`);
  await page.getByRole('combobox', { name: 'Source rows', exact: true }).selectOption('100000');
  await page.getByRole('button', { name: 'Load sample data', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
  await page.getByText('Loading cancelled. You can start a new sample.', { exact: true }).waitFor();
  await poll(() => page.workers().length, 0);
  await load(10_000);
  checked(
    'Unmount releases worker; cancellation releases generator; reload after cancellation succeeds',
  );

  const blockedContext = await browser.newContext();
  const blocked = await blockedContext.newPage();
  let blockedWasm = 0;
  await blockedContext.route('**/*.wasm', (route) => {
    blockedWasm++;
    return route.abort();
  });
  await blocked.goto(`${origin}/examples/scale`);
  await blocked.getByRole('button', { name: 'Load sample data', exact: true }).click();
  await blocked
    .getByRole('alert')
    .filter({ hasText: 'Unable to initialize the example' })
    .waitFor();
  assert.ok(blockedWasm > 0);
  await poll(() => blocked.workers().length, 0);
  assert.equal(await blocked.getByRole('button', { name: 'Download this measurement' }).count(), 0);
  await blockedContext.close();
  checked(
    'Blocked WASM produces visible setup error, no completed measurement, and no leaked worker',
  );

  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  const fallback = await fallbackContext.newPage();
  await fallback.goto(`${origin}/examples/scale`);
  await load(10_000, fallback);
  await fallback.getByRole('combobox', { name: 'Renderer', exact: true }).selectOption('webgl');
  await fallback
    .getByText('Canvas active · Fallback: webgl-unavailable', { exact: true })
    .waitFor();
  const fallbackReport = await report(fallback);
  assert.equal(fallbackReport.view.requestedRenderer, 'webgl');
  assert.equal(fallbackReport.view.activeRenderer, 'canvas');
  assert.equal(fallbackReport.view.rendererFallbackReason, 'webgl-unavailable');
  await fallbackContext.close();
  checked('Forced unavailable WebGL visibly falls back to Canvas and records actual renderer');
  assert.deepEqual(errors, []);
  const fontOrigins = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
  const remote = requests.filter(
    (url) =>
      /^https?:/.test(url) && !url.startsWith(origin) && !fontOrigins.has(new URL(url).origin),
  );
  assert.deepEqual(remote, []);
  const artifact = {
    recordedAt: new Date().toISOString(),
    build: 'Vite production preview, local HTTP; headless Chromium; no CPU/network throttling',
    host: { platform: platform(), architecture: arch(), release: release(), cpu: cpus()[0]?.model },
    browser: browser.version(),
    browserLaunchArguments,
    builtAssets: [
      ...new Set(
        requests
          .filter((url) => url.startsWith(`${origin}/assets/`))
          .map((url) => new URL(url).pathname),
      ),
    ].sort(),
    externalFontOrigins: [
      ...new Set(requests.filter((url) => /^https?:/.test(url)).map((url) => new URL(url).origin)),
    ].filter((url) => fontOrigins.has(url)),
    caveats: [
      'A single local machine/run is integration evidence, not a supported row-count limit or throughput guarantee.',
      'Query duration includes queueing, worker execution, result transfer and decoding.',
      'Two animation-frame callbacks estimate a render opportunity, not screen presentation.',
      'Renderer switching reuses fetched rows and retains previous query duration; use viewRequestToNextFrameMs for switch timing.',
      'Headless WebGL may use software rendering. Requested and active renderer are recorded separately.',
      'Heap estimates exclude worker, WebAssembly and GPU allocations; IPC bytes are not total memory.',
    ],
    checks,
    runs,
  };
  await writeFile(`${output}/measurements.json`, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ checks, measuredRuns: runs.length, output }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => undefined);
  await writeFile(
    `${output}/failure.txt`,
    `${String(error)}\n${await page.locator('body').innerText()}`,
  );
  throw error;
} finally {
  await browser.close();
}
