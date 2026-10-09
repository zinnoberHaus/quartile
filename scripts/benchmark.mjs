import { readFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { applyPredicates } from '../packages/react/dist/index.js';

const predicates = [
  { field: 'region', op: 'in', value: ['Europe', 'Americas'] },
  { field: 'amount', op: 'between', value: [100, 600] },
  { field: 'active', op: 'eq', value: true },
];
const cases = [];
for (const count of [1_000, 10_000, 100_000]) {
  const rows = Array.from({ length: count }, (_, i) => ({
    region: ['Europe', 'Americas', 'Asia Pacific'][i % 3],
    amount: (i * 17) % 1_000,
    active: i % 5 !== 0,
  }));
  for (let i = 0; i < 20; i++) applyPredicates(rows, predicates);
  const samples = [];
  let matched = 0;
  for (let i = 0; i < 50; i++) {
    const start = performance.now();
    matched = applyPredicates(rows, predicates).length;
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  cases.push({
    rows: count,
    matched,
    medianMs: Number(((samples[24] + samples[25]) / 2).toFixed(3)),
    p95Ms: Number(samples[47].toFixed(3)),
  });
}
const artifacts = [];
for (const name of ['index.js', 'styles.css', 'schema.json']) {
  const contents = await readFile(new URL(`../packages/react/dist/${name}`, import.meta.url));
  artifacts.push({ name, bytes: contents.length, gzipBytes: gzipSync(contents).length });
}
const dist = fileURLToPath(new URL('../packages/react/dist/', import.meta.url));
async function entryGraph(entry) {
  const files = new Map();
  const visit = async (file) => {
    if (files.has(file)) return;
    const contents = await readFile(file);
    files.set(file, contents);
    for (const match of contents
      .toString()
      .matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.js)['"]/g)) {
      await visit(resolve(dirname(file), match[1]));
    }
  };
  await visit(resolve(dist, entry));
  return {
    entry,
    description:
      'Reachable local JS files before application tree-shaking; external dependencies and worker/Wasm assets excluded.',
    files: [...files.keys()].map((file) => relative(dist, file)).sort(),
    bytes: [...files.values()].reduce((sum, contents) => sum + contents.length, 0),
    gzipBytes: [...files.values()].reduce((sum, contents) => sum + gzipSync(contents).length, 0),
  };
}
const entryGraphs = await Promise.all(
  ['index.js', 'query/index.js', 'duckdb/index.js'].map(entryGraph),
);
console.log(
  JSON.stringify(
    {
      description:
        'Synchronous in-memory filtering only; excludes browser rendering, layout, network and React updates.',
      measuredAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
      warmup: 20,
      samples: 50,
      predicates,
      cases,
      artifacts,
      entryGraphs,
    },
    null,
    2,
  ),
);
