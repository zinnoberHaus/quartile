import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
