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
    `import { DataExplorer, DataTable, KPI, LineChart, QuartileProvider, Selection, dataset, formatParts, makeFieldFormatter, makeRangeFormatter, validateFormat, type NumberFormat } from '@quartile/react';
import { QueryKPI, type QuerySource } from '@quartile/react/query';
import { AssistantPanel, createAnalysisContext, profileDataset, useAnalysisAssistant, type AssistantAdapter } from '@quartile/react/ai';
import { QuartileBlock, QuartileDocument, QuartilePre, quartileRenderer, type CompiledBlock } from '@quartile/react';
import { compileBlock, quartilePrompt, quartileChartTool, chartToolInputToBlock, dbtFields, type Diagnostic } from '@quartile/react/lang';
import { renderBlockToHTML, remarkQuartile, markdownItQuartile } from '@quartile/react/server';
import { configureEmbed, defineQuartileElements, upgradeBlocks } from '@quartile/react/embed';
import '@quartile/react/styles.css';
export const compiled: CompiledBlock = compileBlock('bar sum(amount) by region\\n---\\nregion,amount\\nEU,1\\n');
export const notes: Diagnostic[] = compiled.diagnostics;
export const prompt: string = quartilePrompt({ datasets: [{ name: 'orders', columns: [{ name: 'amount' }] }] });
export const tool = quartileChartTool();
export const block: string = chartToolInputToBlock({ kind: 'bar', title: null, measures: ['amount'], by: ['region'], format: null, columns: ['region', 'amount'], rows: [['EU', 1]] });
export const fields = dbtFields({ nodes: {} }, 'fct_orders');
export const html: string = renderBlockToHTML('kpi count\\n---\\nid\\n1\\n', { theme: 'dark', timeZone: 'UTC' });
export const plugins = [remarkQuartile({ languages: ['quartile'] }), markdownItQuartile];
export function Embed() { configureEmbed({ sources: 'same-origin' }); defineQuartileElements(); return upgradeBlocks(document); }
export function MarkdownBlocks({ md }: { md: string }) {
  return <QuartileDocument markdown={md} theme="auto" host="shadcn" accent="#e11d48"><QuartileBlock source={md} streaming={false} /><QuartilePre>x</QuartilePre></QuartileDocument>;
}
export const renderers = [quartileRenderer()];
export const RemoteMetric = ({ source }: { source: QuerySource }) => <QueryKPI data={source} label="Remote count" aggregate="count" />;
const data = dataset([{ date: '2026-09-01', region: 'Europe', amount: 120 }]);
const numberFormat: NumberFormat = { type: 'number', notation: 'engineering', maximumSignificantDigits: 4, suffix: ' ms' };
const formatted = dataset(data.rows, { amount: { format: numberFormat, axisFormat: 'compact', tooltipFormat: { type: 'number', maximumFractionDigits: 5 }, description: 'Elapsed time' }, date: { format: { type: 'date', dateStyle: 'long' }, timeZone: 'UTC' } });
export const displayed = makeFieldFormatter(formatted.schema.amount, { surface: 'tooltip', locale: 'de-DE' })(120);
export const parts = formatParts(numberFormat, 120);
export const range = makeRangeFormatter('currency')(1, 2);
export const valid = validateFormat(numberFormat);
const adapter: AssistantAdapter = { id: 'consumer', label: 'Consumer', mode: 'live', generate: async () => ({}) };
export function Assistant() {
  const context = createAnalysisContext({ schema: data.schema, source: { id: 'rows', version: '1' }, profile: profileDataset(data) });
  const assistant = useAnalysisAssistant({ adapter, context, onApply: () => {} });
  return <AssistantPanel assistant={assistant} />;
}
export function App() {
  return <QuartileProvider locale="de-DE" timeZone="UTC"><Selection>
    <KPI data={data} label="Revenue" value="amount" />
    <LineChart data={data} x="date" y="amount" brush />
    <DataExplorer data={formatted} rowKey="region" csvFormat="formatted" columns={[{ field: 'region' }, { field: 'amount', editable: true, description: 'Elapsed time' }]} />
    <DataTable data={data} columns={[{ field: 'region' }, { field: 'amount' }]} />
  </Selection></QuartileProvider>;
}
`,
  );
  writeFileSync(
    join(temporary, 'runtime.mjs'),
    `import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataExplorer, DataTable, KPI, LineChart, QuartileBlock, QuartileProvider, Selection, dataset, validateSpec, validateFormat, makeFormatter, formatParts, tableToCSV } from '@quartile/react';
import { QueryKPI } from '@quartile/react/query';
import { AssistantPanel, createAnalysisContext, profileDataset, useAnalysisAssistant, validateAnalysisPlan } from '@quartile/react/ai';
const adapter = { id: 'consumer', label: 'Consumer', mode: 'live', generate: async () => { throw new Error('SSR must not invoke a model'); } };
function Assistant() {
  const context = createAnalysisContext({ schema: data.schema, source: { id: 'rows', version: '1' }, profile: profileDataset(data) });
  assert(validateAnalysisPlan({ version: 1, title: 'Inspect', summary: 'Inspect rows', actions: [{ type: 'table', fields: ['region'], limit: 10 }] }, context).valid);
  const assistant = useAnalysisAssistant({ adapter, context, onApply: () => { throw new Error('SSR must not apply a plan'); } });
  return createElement(AssistantPanel, { assistant });
}
assert(!existsSync(new URL('./node_modules/apache-arrow', import.meta.url)), 'ordinary consumers must not install Arrow');
assert(!existsSync(new URL('./node_modules/@duckdb/duckdb-wasm', import.meta.url)), 'ordinary consumers must not install DuckDB');
const data = dataset([{ date: '2026-09-01', region: 'Europe', amount: 120 }]);
const warnings = [];
console.error = (...args) => warnings.push(args);
const html = renderToString(createElement(QuartileProvider, {}, createElement(Selection, {},
  createElement(QueryKPI, { data: {kind: 'query-source', id: 'server', version: 'v1', schema: {}, query: async () => { throw new Error('SSR must not start queries'); }, dispose: async () => {} }, label: 'Remote count', aggregate: 'count' }),
  createElement(KPI, { data, value: 'amount', label: 'Revenue' }),
  createElement(LineChart, { data, x: 'date', y: 'amount' }),
  createElement(Assistant),
  createElement(DataExplorer, { data, rowKey: 'region', columns: [{ field: 'region' }, { field: 'amount' }] }),
  createElement(DataTable, { data, columns: [{ field: 'region' }, { field: 'amount' }] }),
)));
assert.match(html, /Revenue/);
assert.match(html, /<table/);
assert.match(html, /Europe/);
assert.deepEqual(warnings, [], 'SSR should not emit React warnings');
const css = readFileSync(new URL(import.meta.resolve('@quartile/react/styles.css')), 'utf8');
assert.match(css, /--q-/);
assert.match(css, /q-chart/);
assert.match(css, /q-explorer/);
assert.match(css, /q-assistant/);
const schema = JSON.parse(readFileSync(new URL(import.meta.resolve('@quartile/react/schema.json')), 'utf8'));
assert(schema.$defs.LineChart);
assert(validateSpec({ component: 'LineChart', data: 'rows', x: 'date', y: 'amount' }).valid);
assert(validateFormat({ type: 'number', notation: 'engineering', maximumSignificantDigits: 4 }).valid);
assert(!validateFormat({ type: 'date', timeZone: 'Invalid/Zone' }).valid);
assert.equal(makeFormatter('number')(9007199254740991), '9,007,199,254,740,991');
assert.equal(makeFormatter({ type: 'number', maximumFractionDigits: 3 })('9007199254740993.125'), '9,007,199,254,740,993.125');
assert(formatParts({ style: 'currency', currency: 'EUR' }, -1).some(part => part.type === 'currency'));
assert(tableToCSV(data.rows, [{ field: 'amount' }], { mode: 'formatted', schema: data.schema, locale: 'de-DE' }).includes('120,00'));
assert.match(readFileSync(new URL('../LICENSE', import.meta.resolve('@quartile/react')), 'utf8'), /Apache License/);
assert.match(readFileSync(new URL('../README.md', import.meta.resolve('@quartile/react')), 'utf8'), /0.1 preview/);
// The Markdown language, static rendering and embed entries.
const langEntry = readFileSync(new URL(import.meta.resolve('@quartile/react/lang')), 'utf8');
const serverEntry = readFileSync(new URL(import.meta.resolve('@quartile/react/server')), 'utf8');
assert(!/^['"]use client['"]/.test(langEntry.trimStart()), 'lang must be callable from server components');
assert(!/^['"]use client['"]/.test(serverEntry.trimStart()), 'server must be callable from server code');
const { compileBlock, quartilePrompt, scanDocument } = await import('@quartile/react/lang');
const compiled = compileBlock('line sum(revenue) by quarter\\n---\\nquarter,revenue\\nQ1,10\\nQ2,12\\n');
assert.equal(compiled.diagnostics.filter((d) => d.severity === 'error').length, 0);
assert.equal(compiled.spec.component, 'LineChart');
assert(quartilePrompt().includes('quartile'));
assert.equal(scanDocument('~~~quartile\\ndata orders\\n---\\na\\n1\\n~~~').blocks.length, 1);
const { renderBlockToHTML } = await import('@quartile/react/server');
const staticHtml = renderBlockToHTML('bar sum(amount) by region\\n---\\nregion,amount\\nEU,1\\nUS,2\\n', { timeZone: 'UTC' });
assert.match(staticHtml, /<svg[^>]*viewBox="0 0 640/);
assert.match(staticHtml, /data-quartile-source=/);
const blockHtml = renderToString(createElement(QuartileBlock, { source: 'kpi count as "Rows"\\n---\\nid\\n1\\n2\\n' }));
assert.match(blockHtml, /Rows/);
const standalone = readFileSync(new URL(import.meta.resolve('@quartile/react/embed/standalone.global.js')), 'utf8');
assert(standalone.includes('quartile-chart'), 'standalone embed defines <quartile-chart>');
assert(standalone.length < 900_000, 'standalone embed stays under 900 kB minified');
assert.deepEqual(warnings, [], 'Static rendering should not emit React warnings');
console.log('Packed import, SSR, CSS, schema, language, static rendering, embed, license and README passed.');
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
  // Optional adapter declarations and runtime resolve with the explicitly installed peer pair.
  run('npm', [
    'install',
    '--no-audit',
    '--no-fund',
    '@duckdb/duckdb-wasm@1.32.0',
    'apache-arrow@17.0.0',
  ]);
  writeFileSync(
    join(temporary, 'adapter.ts'),
    `import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { tableFromArrays } from 'apache-arrow';
import { createDuckDBBackend } from '@quartile/react/duckdb';
export async function adapt(database: AsyncDuckDB) {
  const backend = await createDuckDBBackend({ database });
  return backend.fromArrow(tableFromArrays({ count: new Int32Array([1, 2]) }), { id: 'consumer' });
}
`,
  );
  run(process.execPath, [
    join(temporary, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--module',
    'esnext',
    '--moduleResolution',
    'bundler',
    '--target',
    'es2022',
    '--lib',
    'DOM,ES2022',
    'adapter.ts',
  ]);
  run(process.execPath, [
    '--input-type=module',
    '-e',
    "import {createDuckDBBackend} from '@quartile/react/duckdb'; if (typeof createDuckDBBackend !== 'function') throw new Error('Missing adapter export');",
  ]);
  rmSync(temporary, { recursive: true, force: true });
} catch (error) {
  console.error(`Consumer fixture retained for inspection: ${temporary}`);
  throw error;
}
