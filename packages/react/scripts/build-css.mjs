// Concatenates every stylesheet under src/ into dist/styles.css.
// Foundations load first; component sheets follow in path order, so no shared index needs editing.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const first = ['src/styles/tokens.css', 'src/styles/base.css'];
function stylesheets(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? stylesheets(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}
const rest = stylesheets('src')
  .filter((p) => !first.includes(p))
  .sort();
const out = [...first, ...rest]
  .map((p) => `/* ${p} */\n${readFileSync(join(root, p), 'utf8').trim()}\n`)
  .join('\n');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/styles.css'), out);
console.log(
  `styles.css: ${first.length + rest.length} sheets, ${(out.length / 1024).toFixed(1)} kB`,
);
