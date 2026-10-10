import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const zip = resolve(process.argv[2]);
const consumer = process.argv[3]
  ? resolve(process.argv[3])
  : mkdtempSync(join(tmpdir(), 'quartile-studio-consumer-'));
execFileSync(
  'python3',
  [
    '-c',
    `import pathlib, sys, zipfile
archive, target = sys.argv[1:]
with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None, 'Archive CRC mismatch'
  for name in z.namelist():
    p = pathlib.PurePosixPath(name)
    assert not p.is_absolute() and '..' not in p.parts, 'Unsafe archive path'
  z.extractall(target)
`,
    zip,
    consumer,
  ],
  { stdio: 'inherit' },
);
const bundled = readFileSync(join(consumer, 'vendor/quartile-react-0.1.0.tgz'));
const expected = JSON.parse(
  readFileSync(new URL('../public/starter/manifest.json', import.meta.url), 'utf8'),
);
assert.equal(
  createHash('sha256').update(bundled).digest('hex'),
  expected.sha256,
  'Export includes the current verified library build',
);
const project = JSON.parse(readFileSync(join(consumer, 'quartile-project.json'), 'utf8'));
assert.equal(project.version, 1);
assert(!('rows' in project));
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: consumer,
  stdio: 'inherit',
});
execFileSync('npm', ['run', 'build'], { cwd: consumer, stdio: 'inherit' });
console.log(`Exported starter installs, typechecks, and builds independently: ${consumer}`);

// The custom-source fixture deliberately changes its schema between reloads.
// Verify the exported code itself, outside the gallery and its source aliases.
if (project.source.kind === 'custom' && project.source.url === 'https://example.org/data.json') {
  const server = spawn(
    process.execPath,
    [
      join(consumer, 'node_modules/vite/bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ],
    { cwd: consumer, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let browser;
  try {
    const address = await new Promise((resolveAddress, reject) => {
      const timeout = setTimeout(() => reject(new Error('Starter preview did not start')), 20000);
      server.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Starter preview exited ${code}`));
      });
      server.stdout.on('data', (chunk) => {
        const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timeout);
          resolveAddress(match[0]);
        }
      });
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let records = [
      { category: 'A', value: 2 },
      { category: 'B', value: 4 },
    ];
    await page.route(project.source.url, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ records }) }),
    );
    await page.goto(address);
    await page.getByLabel('Search rows', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    records = [{ category: 'A', value: 'unavailable' }];
    await page.getByRole('button', { name: 'Reload source', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'quantitative' }).waitFor();
    assert.match(await page.getByRole('alert').innerText(), /src\/App\.tsx/);
    assert.equal(
      await page.locator('.q-histogram').count(),
      0,
      'An incompatible measure never renders a misleading chart',
    );
    records = [{ category: 'A' }];
    await page.getByRole('button', { name: 'Reload source', exact: true }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'Choose a field from the loaded source' })
      .first()
      .waitFor();
    assert.equal(
      await page.getByRole('alert').count(),
      2,
      'Both the table and chart report the missing field',
    );
    assert.equal(await page.getByLabel('Search rows', { exact: true }).count(), 0);
    records = [{ category: 'A', value: 9 }];
    await page.getByRole('button', { name: 'Reload source', exact: true }).click();
    await page.getByLabel('Search rows', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('alert').count(),
      0,
      'Compatible data recovers without rebuilding',
    );
    assert.deepEqual(errors, []);
    console.log('Standalone starter handles changed types, removed fields and recovery.');
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const closed = once(server, 'exit');
      server.kill();
      await closed;
    }
  }
}
