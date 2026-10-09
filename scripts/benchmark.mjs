import { readFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
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
    },
    null,
    2,
  ),
);
