// Concatenates every stylesheet under src/ into dist/styles.css.
// Foundations load first; component sheets follow in path order, so no shared index needs editing.
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const first = ['src/styles/tokens.css', 'src/styles/base.css'];
const rest = globSync('src/**/*.css', { cwd: root })
  .map((p) => p.split('\\').join('/'))
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
void relative;
