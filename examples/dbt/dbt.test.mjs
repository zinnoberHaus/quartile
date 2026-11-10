import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildReport } from './build-report.mjs';
import { exportShow } from './export-show.mjs';
import { injectDocs } from './inject-docs.mjs';

const here = new URL('.', import.meta.url).pathname;

test('renders a report with charts, dbt documentation and an exposure', () => {
  const out = mkdtempSync(join(tmpdir(), 'quartile-dbt-'));
  try {
    const { diagnostics, html } = buildReport(join(here, 'reports/revenue.md'), out);
    assert.deepEqual(diagnostics, []);
    const page = readFileSync(html, 'utf8');
    assert.match(page, /<h1>Q3 2026 revenue<\/h1>/);
    assert.equal(page.match(/class="quartile-static"/g)?.length, 2);
    assert.match(page, /<svg/);
    // The manifest's label and description reach the rendered chart and table.
    assert.match(page, /Net revenue/);
    assert.match(page, /Order value after discounts and returns, before tax\./);
    assert.match(readFileSync(join(out, 'exposures.yml'), 'utf8'), /- ref\('fct_orders'\)/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('exports dbt show rows and injects the embed script once', () => {
  const target = mkdtempSync(join(tmpdir(), 'quartile-dbt-target-'));
  try {
    cpSync(join(here, 'target'), target, { recursive: true });
    assert.equal(
      exportShow(join(target, 'show_fct_orders.json'), join(target, 'quartile/fct_orders.json')),
      9,
    );
    assert.equal(
      JSON.parse(readFileSync(join(target, 'quartile/fct_orders.json'), 'utf8')).length,
      9,
    );
    assert.equal(injectDocs(target), true);
    assert.equal(injectDocs(target), false);
    const html = readFileSync(join(target, 'index.html'), 'utf8');
    assert.equal(html.match(/data-quartile><\/script>/g)?.length, 1);
    assert.ok(readFileSync(join(target, 'quartile.global.js'), 'utf8').includes('quartile-chart'));
    // The committed fixture is untouched.
    assert.doesNotMatch(
      readFileSync(join(here, 'target/index.html'), 'utf8'),
      /quartile.global.js/,
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
