// Turns `dbt show --select <model> --output json` into a rows file that Quartile blocks load with
// `src:`. Usage: node export-show.mjs <show.json> <rows.json>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { lang } from './quartile.mjs';

export function exportShow(input, output) {
  const rows = lang.rowsFromDbtShow(readFileSync(input, 'utf8'));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(rows)}\n`);
  return rows.length;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [input, output] = process.argv.slice(2);
  console.log(`Wrote ${exportShow(input, output)} rows to ${output}`);
}
