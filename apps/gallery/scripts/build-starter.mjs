import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gallery = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(gallery, '../..');
const library = join(root, 'packages/react');
// A dev server or gallery-only build must export the current source, never stale dist files.
execFileSync('pnpm', ['--filter', '@quartile/react', 'build'], { cwd: root, stdio: 'inherit' });
const temp = mkdtempSync(join(tmpdir(), 'quartile-starter-'));
try {
  const result = JSON.parse(
    execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], {
      cwd: library,
      encoding: 'utf8',
    }),
  );
  const bytes = readFileSync(join(temp, result[0].filename));
  const output = join(gallery, 'public/starter');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'quartile-react-0.1.0.tgz'), bytes);
  writeFileSync(
    join(output, 'manifest.json'),
    `${JSON.stringify({ version: '0.1.0', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2)}\n`,
  );
  console.log(`Prepared source-preview starter (${bytes.length} bytes).`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
