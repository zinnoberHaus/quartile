// Run against the local gallery dev server. Playwright is an optional verification tool.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repository = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '');
const outputDirectory = process.env.SCATTER_EVIDENCE_DIR || tmpdir();
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 800 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await page.goto(process.env.GALLERY_URL || 'http://127.0.0.1:5173/');
  await page.waitForSelector('.q-root');
  await page.evaluate(async (repository) => {
    const entry = await (await fetch('/src/main.tsx')).text();
    const reactUrl = entry.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
    const domUrl = entry.match(/from "([^"]*\/react-dom_client\.js[^"]*)"/)[1];
    const React = (await import(reactUrl)).default;
    const { createRoot } = (await import(domUrl)).default;
    const { QuartileProvider, ScatterPlot, Selection } = await import(
      `/@fs${repository}/packages/react/src/index.ts`
    );
    document.getElementById('root').style.display = 'none';
    const target = document.createElement('div');
    target.id = 'test-scatter';
    target.style.cssText = 'width:640px;padding:20px';
    document.body.append(target);
    const root = createRoot(target);
    const rows = [
      { name: 'negative', group: 'a', x: -4, y: -2, size: 1 },
      { name: 'zero', group: 'b', x: 0, y: 0, size: 4 },
      { name: 'positive', group: 'a', x: 7, y: 9, size: 9 },
      { name: 'null', group: 'b', x: null, y: 1, size: 1 },
      { name: 'infinity', group: 'b', x: Infinity, y: 1, size: 1 },
    ];
    window.fixture = {
      target,
      root,
      rows,
      renderer: 'svg',
      theme: 'light',
      reports: [],
      selects: [],
      data: rows,
    };
    window.drawFixture = (change = {}) => {
      Object.assign(window.fixture, change);
      const f = window.fixture;
      root.render(
        React.createElement(
          QuartileProvider,
          { theme: f.theme },
          React.createElement(
            Selection,
            { key: f.renderer },
            React.createElement(ScatterPlot, {
              data: f.data,
              x: 'x',
              y: 'y',
              size: 'size',
              color: 'group',
              label: 'name',
              select: 'name',
              height: 300,
              renderer: f.renderer,
              onRendererChange: (s) => f.reports.push(s),
              onSelect: (s) => f.selects.push(s),
              'aria-label': 'Browser renderer fixture',
            }),
          ),
        ),
      );
    };
    window.drawFixture();
  }, repository);
  const protocol = await context.newCDPSession(page);
  const fixture = page.locator('#test-scatter');
  await fixture.locator('[data-renderer=svg]').waitFor();
  const marks = await fixture.locator('.q-scatter-point').evaluateAll((nodes) =>
    nodes.map((n) => ({
      x: +n.getAttribute('cx'),
      y: +n.getAttribute('cy'),
      r: +n.getAttribute('r'),
    })),
  );
  assert.equal(marks.length, 3);
  const axisText = await fixture.locator('.q-chart-axis').allTextContents();
  const output = {
    environment: {
      browser: await browser.version(),
      platform: process.platform,
      architecture: process.arch,
      dpr: 2,
      reducedMotion: 'reduce',
    },
    marks,
    checks: [],
  };
  for (const renderer of ['canvas', 'webgl']) {
    await page.evaluate((renderer) => window.drawFixture({ renderer }), renderer);
    const layer = fixture.locator(`canvas[data-renderer=${renderer}]`);
    await layer.waitFor();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    assert.deepEqual(await fixture.locator('.q-chart-axis').allTextContents(), axisText);
    const result = await layer.evaluate((canvas, marks) => {
      window.dispatchEvent(new Event('resize'));
      const rect = canvas.getBoundingClientRect();
      let colored = 0;
      let glError = null;
      if (canvas.dataset.renderer === 'canvas') {
        const ctx = canvas.getContext('2d');
        for (const m of marks) {
          const d = ctx.getImageData(
            Math.round(m.x * devicePixelRatio),
            Math.round(m.y * devicePixelRatio),
            1,
            1,
          ).data;
          if (d[3] > 0) colored++;
        }
      } else {
        const gl = canvas.getContext('webgl');
        for (const m of marks) {
          const d = new Uint8Array(4);
          gl.readPixels(
            Math.round(m.x * devicePixelRatio),
            canvas.height - Math.round(m.y * devicePixelRatio),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            d,
          );
          if (d[3] > 0) colored++;
        }
        glError = gl.getError();
      }
      return {
        renderer: canvas.dataset.renderer,
        width: canvas.width,
        height: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        colored,
        glError,
      };
    }, marks);
    assert.equal(result.colored, 3);
    assert.equal(result.width, Math.round(result.cssWidth * 2));
    assert.equal(result.height, Math.round(result.cssHeight * 2));
    if (renderer === 'webgl') assert.equal(result.glError, 0);
    const plot = fixture.getByRole('application');
    await plot.focus();
    await plot.press('Home');
    await plot.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.fixture.selects.at(-1).value), ['negative']);
    assert.match(await fixture.locator('.q-chart-tooltip').innerText(), /negative/);
    await plot.press('End');
    assert.match(await fixture.locator('.q-chart-tooltip').innerText(), /positive/);
    const table = await fixture.getByRole('table').innerText();
    assert.match(table, /negative/);
    assert.match(table, /positive/);
    assert.equal(await fixture.locator('tbody tr').count(), 3);
    const bounds = await plot.boundingBox();
    await page.mouse.move(bounds.x + marks[1].x, bounds.y + marks[1].y);
    assert.match(await fixture.locator('.q-chart-tooltip').innerText(), /zero/);
    await page.mouse.click(bounds.x + marks[1].x, bounds.y + marks[1].y);
    assert.deepEqual(await page.evaluate(() => window.fixture.selects.at(-1).value), ['zero']);
    await page.screenshot({ path: join(outputDirectory, `quartile-scatter-${renderer}.png`) });
    const readColor = async () =>
      layer.evaluate((canvas, mark) => {
        window.dispatchEvent(new Event('resize'));
        const pixel = new Uint8Array(4);
        if (canvas.dataset.renderer === 'canvas')
          return [
            ...canvas
              .getContext('2d')
              .getImageData(
                Math.round(mark.x * devicePixelRatio),
                Math.round(mark.y * devicePixelRatio),
                1,
                1,
              ).data,
          ];
        const gl = canvas.getContext('webgl');
        gl.readPixels(
          Math.round(mark.x * devicePixelRatio),
          canvas.height - Math.round(mark.y * devicePixelRatio),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        return [...pixel];
      }, marks[0]);
    const lightColor = await readColor();
    await page.evaluate(() => window.drawFixture({ theme: 'dark' }));
    await page.waitForFunction(
      () => document.querySelector('#test-scatter [data-theme]')?.dataset.theme === 'dark',
    );
    const darkColor = await readColor();
    assert.notDeepEqual(lightColor, darkColor);
    await page.screenshot({ path: join(outputDirectory, `quartile-scatter-${renderer}-dark.png`) });
    await page.evaluate(() => {
      window.fixture.target.style.width = '420px';
    });
    await page.waitForFunction(() => {
      const c = document.querySelector('#test-scatter canvas');
      return c && c.width === 840;
    });
    await page.evaluate(() => {
      window.fixture.target.style.width = '640px';
      window.drawFixture({ theme: 'light' });
    });
    await page.waitForFunction(
      () => document.querySelector('#test-scatter canvas')?.width === 1280,
    );
    for (const ratio of [0.75, 1, 2]) {
      await protocol.send('Emulation.setDeviceMetricsOverride', {
        width: 1100,
        height: 800,
        deviceScaleFactor: ratio,
        mobile: false,
      });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForFunction(
        (ratio) =>
          document.querySelector('#test-scatter canvas')?.width === Math.round(640 * ratio),
        ratio,
      );
    }
    output.checks.push({
      ...result,
      keyboard: true,
      pointer: true,
      exactRows: 3,
      theme: true,
      lightColor,
      darkColor,
      resize: true,
      dprChange: [0.75, 1, 2],
    });
  }
  await fixture
    .locator('canvas[data-renderer=webgl]')
    .evaluate((canvas) =>
      canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext(),
    );
  await fixture.locator('canvas[data-renderer=canvas]').waitFor();
  const fallback = await fixture.locator('canvas').getAttribute('data-fallback-reason');
  assert.equal(fallback, 'webgl-context-lost');
  output.fallback = await page.evaluate(() => window.fixture.reports.at(-1));
  await page.evaluate(() =>
    window.drawFixture({
      renderer: 'canvas',
      data: Array.from({ length: 10000 }, (_, i) => ({
        name: `row-${i}`,
        x: i,
        y: i % 71,
        group: 'a',
        size: 1,
      })),
    }),
  );
  await fixture.getByRole('button', { name: 'View data table (10000 rows)' }).waitFor();
  assert.equal(await fixture.locator('table').count(), 0);
  assert.equal(await fixture.locator('.q-scatter-point').count(), 0);
  output.largeDomNodes = await fixture.locator('*').count();
  await fixture.getByRole('button', { name: 'View data table (10000 rows)' }).click();
  assert.equal(await fixture.locator('tbody tr').count(), 50);
  await fixture.getByRole('button', { name: 'Next rows' }).click();
  assert.match(await fixture.getByRole('table').innerText(), /row-50/);
  await fixture.getByRole('button', { name: 'View chart', exact: true }).click();
  await fixture.locator('canvas').waitFor();
  await page.evaluate(() => {
    window.fixture.root.unmount();
  });
  assert.equal(await fixture.locator('canvas').count(), 0);
  output.errors = errors;
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    join(outputDirectory, 'quartile-scatter-browser.json'),
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
