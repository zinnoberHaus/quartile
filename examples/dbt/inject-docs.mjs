// Adds the Quartile embed script to the site `dbt docs generate` writes, so ```quartile fences in
// model and column descriptions render as interactive charts in `dbt docs serve` or any static
// host. dbt docs has no plugin system; this edits its generated index.html and is idempotent.
// Usage: node inject-docs.mjs <target-dir>
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { embedScript } from './quartile.mjs';

const TAG =
  '<script src="quartile.global.js" data-theme="auto" data-sources="same-origin" data-quartile></script>';

export function injectDocs(target) {
  const index = join(target, 'index.html');
  const html = readFileSync(index, 'utf8');
  copyFileSync(embedScript, join(target, 'quartile.global.js'));
  if (html.includes('data-quartile></script>')) return false;
  if (!html.includes('</body>')) throw new Error(`${index} has no </body>`);
  writeFileSync(index, html.replace('</body>', `  ${TAG}\n  </body>`));
  return true;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const target = process.argv[2] ?? 'target';
  console.log(
    injectDocs(target) ? `Injected Quartile into ${target}/index.html` : 'Already injected',
  );
}
