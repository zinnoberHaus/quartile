// Exercises the packed package outside the workspace, where dev dependencies cannot hide
// missing public declaration dependencies. Requires registry access for the clean consumers.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'quartile-package-'));
const run = (command, args, cwd = temporary) =>
  execFileSync(command, args, { cwd, stdio: 'inherit' });

try {
  run('npm', ['pack', '--pack-destination', temporary], root);
  const tarball = join(
    temporary,
    readdirSync(temporary).find((name) => name.endsWith('.tgz')),
  );
  writeFileSync(
    join(temporary, 'consumer.tsx'),
    `import { DataTable, KPI, LineChart, QuartileProvider, Selection, dataset } from '@quartile/react';
import '@quartile/react/styles.css';
const data = dataset([{ date: '2026-09-01', region: 'Europe', amount: 120 }]);
export function App() {
  return <QuartileProvider><Selection>
    <KPI data={data} label="Revenue" value="amount" />
    <LineChart data={data} x="date" y="amount" brush />
    <DataTable data={data} columns={[{ field: 'region' }, { field: 'amount' }]} />
  </Selection></QuartileProvider>;
}
`,
  );
  writeFileSync(
    join(temporary, 'runtime.mjs'),
    `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataTable, KPI, LineChart, QuartileProvider, Selection, dataset, validateSpec } from '@quartile/react';
const data = dataset([{ date: '2026-09-01', region: 'Europe', amount: 120 }]);
const warnings = [];
console.error = (...args) => warnings.push(args);
const html = renderToString(createElement(QuartileProvider, {}, createElement(Selection, {},
  createElement(KPI, { data, value: 'amount', label: 'Revenue' }),
  createElement(LineChart, { data, x: 'date', y: 'amount' }),
  createElement(DataTable, { data, columns: [{ field: 'region' }, { field: 'amount' }] }),
)));
assert.match(html, /Revenue/);
assert.match(html, /<table/);
assert.match(html, /Europe/);
assert.deepEqual(warnings, [], 'SSR should not emit React warnings');
const css = readFileSync(new URL(import.meta.resolve('@quartile/react/styles.css')), 'utf8');
assert.match(css, /--q-/);
assert.match(css, /q-chart/);
const schema = JSON.parse(readFileSync(new URL(import.meta.resolve('@quartile/react/schema.json')), 'utf8'));
assert(schema.$defs.LineChart);
assert(validateSpec({ component: 'LineChart', data: 'rows', x: 'date', y: 'amount' }).valid);
assert.match(readFileSync(new URL('../LICENSE', import.meta.resolve('@quartile/react')), 'utf8'), /Apache License/);
assert.match(readFileSync(new URL('../README.md', import.meta.resolve('@quartile/react')), 'utf8'), /0.1 preview/);
console.log('Packed import, SSR, CSS, schema, license and README passed.');
`,
  );
  for (const [react, types] of [
    ['18.2.0', '18'],
    ['19.3.0', '19'],
  ]) {
    rmSync(join(temporary, 'node_modules'), { recursive: true, force: true });
    rmSync(join(temporary, 'package-lock.json'), { force: true });
    writeFileSync(
      join(temporary, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    run('npm', [
      'install',
      '--no-audit',
      '--no-fund',
      tarball,
      `react@${react}`,
      `react-dom@${react}`,
      `@types/react@${types}`,
      `@types/react-dom@${types}`,
      'typescript@5.9.3',
    ]);
    run(process.execPath, [join(temporary, 'runtime.mjs')]);
    run(process.execPath, [
      join(temporary, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--jsx',
      'react-jsx',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--target',
      'es2022',
      '--lib',
      'DOM,ES2022',
      'consumer.tsx',
    ]);
    console.log(`React ${react}: packed consumer runtime and strict TypeScript passed.`);
  }
  rmSync(temporary, { recursive: true, force: true });
} catch (error) {
  console.error(`Consumer fixture retained for inspection: ${temporary}`);
  throw error;
}
