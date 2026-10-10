import { parseProject, type StudioBlock, type StudioProject } from './model';

const literal = (value: unknown) =>
  (JSON.stringify(value) ?? 'undefined')
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const prop = (key: string, value: unknown) =>
  value === undefined ? '' : ` ${key}={${literal(value)}}`;
export function componentCode(block: StudioBlock): string {
  const common = ' data={result.data}';
  const identity = prop('id', block.id);
  switch (block.type) {
    case 'metric':
      return `<KPI${common}${prop('label', block.title)}${prop('aggregate', block.aggregate ?? 'mean')}${prop('value', block.aggregate === 'count' ? undefined : block.y)} />`;
    case 'table':
      return `<DataExplorer${common} columns={${literal(block.columns ?? [])}.map((key) => ({ field: key, label: result.data.schema[key]?.label ?? key }))} rowKey={(row) => rowIds.get(row)!} />`;
    case 'histogram':
      return `<Histogram${identity}${common}${prop('x', block.x)} bins={20} brush height={260} />`;
    case 'line':
      return `<LineChart${identity}${common}${prop('x', block.x)}${prop('y', block.y)}${prop('color', block.color)} brush height={280} />`;
    case 'bar':
      return `<BarChart${identity}${common}${prop('x', block.x)}${prop('y', block.y)}${prop('group', block.color)} select height={280} />`;
    case 'scatter':
      return `<ScatterPlot${identity}${common}${prop('x', block.x)}${prop('y', block.y)}${prop('color', block.color)} select height={280} />`;
  }
}

/** Native JSX, with escaped literals. No eval, generated execution, or hidden runtime service. */
export function reactSource(input: StudioProject): string {
  const project = parseProject(input);
  const components = Array.from(
    new Set(
      project.blocks.map(
        (block) =>
          ({
            metric: 'KPI',
            line: 'LineChart',
            bar: 'BarChart',
            scatter: 'ScatterPlot',
            histogram: 'Histogram',
            table: 'DataExplorer',
          })[block.type],
      ),
    ),
  ).join(', ');
  return `import { useEffect, useMemo, useState } from 'react';
import { QuartileProvider, Selection, FilterBar${components ? `, ${components}` : ''} } from '@quartile/react';
import { loadSource, type LoadedSource } from './quartile-data';
import { lineDataError } from './quartile-chart';
import '@quartile/react/styles.css';
import './app.css';

// Edit normal React components below. API normalization lives in quartile-data.ts.
const source = ${literal(project.source)} as const;

export default function App() {
  const [result, setResult] = useState<LoadedSource | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    loadSource(source, { signal: controller.signal }).then(
      (next) => { if (!controller.signal.aborted) setResult(next); },
      (reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Request failed.'); },
    ).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const rowIds = useMemo(() => new Map(result?.data.rows.map((row, index) => [row, String(index)])), [result]);
  const filters = result ? Object.values(result.data.schema).filter((field) => (field.type === 'nominal' || field.type === 'boolean') && new Set(result.data.rows.map((row) => row[field.name])).size <= 24).slice(0, 3).map((field) => ({ field: field.name, pinned: true })) : [];
  return <QuartileProvider><main className="analysis-app">
    <header><span className="eyebrow">QUARTILE / PUBLIC DATA</span><h1>{${literal(project.name)}}</h1><button type="button" onClick={() => setRevision((n) => n + 1)}>Reload source</button></header>
    {loading && <p role="status">Loading the public API…</p>}
    {error && <p role="alert">{error} Use Reload source to retry.</p>}
    {result && <>
      <aside className="provenance"><a href={result.requestedURL}>Source response</a> · {result.data.rows.length.toLocaleString()} records · Fetched {new Date(result.fetchedAt).toLocaleString()}
        {result.attribution.map((credit) => <p key={credit.url + credit.label}><a href={credit.url}>{credit.label}</a>{credit.license ? ' · ' + credit.license : ''}</p>)}
        {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </aside>
      {result.data.rows.length === 0 ? <p role="status">This source returned no records.</p> : <Selection key={result.fetchedAt} id="analysis">
        <FilterBar data={result.data} fields={filters} />
        <div className="analysis-grid">
${project.blocks
  .map(
    (
      block,
    ) => `          <section className="analysis-block" style={{ gridColumn: 'span ${block.span}' }}>
            ${block.type !== 'metric' ? `<h2>{${literal(block.title)}}</h2>` : ''}
            ${block.type === 'line' ? `{lineDataError(result.data, ${literal(block.x)}, ${literal(block.color ?? null) === 'null' ? 'undefined' : literal(block.color)}) ? <p role="alert">{lineDataError(result.data, ${literal(block.x)}, ${literal(block.color ?? null) === 'null' ? 'undefined' : literal(block.color)})}</p> : ${componentCode(block)}}` : componentCode(block)}
            ${block.type === 'bar' ? '<p className="note">Sum per x / series combination. Use additive measures.</p>' : ''}
          </section>`,
  )
  .join('\n')}
        </div>
      </Selection>}
    </>}
  </main></QuartileProvider>;
}
`;
}

export const starterCSS = `:root { font-family: system-ui, sans-serif; color: #22282b; background: #f3f4f1; }\n* { box-sizing: border-box; }\nbody { margin: 0; }\n.analysis-app { max-width: 1320px; margin: auto; padding: clamp(16px, 4vw, 48px); }\nheader { margin-bottom: 24px; }\nh1 { font-size: clamp(28px, 4vw, 44px); letter-spacing: -.04em; }\nh2 { margin: 0 0 16px; font-size: 16px; }\n.eyebrow, .note { font-family: monospace; font-size: 12px; }\nbutton { padding: 8px 14px; cursor: pointer; }\na { color: #285de5; }\n.provenance { padding: 16px 0; font-size: 13px; border-block: 1px solid #dce0db; margin-bottom: 20px; overflow-wrap: anywhere; }\n.provenance p { margin: 6px 0; }\n.analysis-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }\n.analysis-block { min-width: 0; border: 1px solid #dce0db; background: white; padding: 20px; border-radius: 8px; }\n@media (max-width: 650px) { .analysis-block { grid-column: 1 / -1 !important; padding: 12px; } }\n`;
export type ArchiveFile = { name: string; content: string | Uint8Array };

/** Small interoperable ZIP (stored entries), avoiding a compression dependency for a ~600KB starter. */
export function createZip(files: ArchiveFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const names = new Set<string>();
  for (const file of files) {
    if (
      !/^[A-Za-z0-9_./-]+$/.test(file.name) ||
      file.name.startsWith('/') ||
      file.name.split('/').includes('..') ||
      names.has(file.name)
    )
      throw new Error('Unsafe or duplicate archive path.');
    names.add(file.name);
    const name = encoder.encode(file.name);
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    parts.push(local, data);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const archive = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...parts, ...central, end]) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}

export function starterFiles(
  project: StudioProject,
  runtime: string,
  library: Uint8Array,
  license: string,
  chartRuntime: string,
): ArchiveFile[] {
  const p = parseProject(project);
  return [
    {
      name: 'package.json',
      content: JSON.stringify(
        {
          name: 'quartile-analysis',
          private: true,
          version: '0.0.0',
          type: 'module',
          engines: { node: '>=22.12' },
          scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' },
          dependencies: {
            '@quartile/react': 'file:vendor/quartile-react-0.1.0.tgz',
            react: '19.3.0',
            'react-dom': '19.3.0',
          },
          devDependencies: {
            '@types/react': '19.3.0',
            '@types/react-dom': '19.3.0',
            '@vitejs/plugin-react': '6.1.2',
            typescript: '5.9.3',
            vite: '8.3.3',
          },
        },
        null,
        2,
      ),
    },
    {
      name: 'index.html',
      content:
        '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quartile analysis</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    },
    {
      name: 'vite.config.ts',
      content:
        "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n",
    },
    {
      name: 'tsconfig.json',
      content: JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            lib: ['ES2022', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            jsx: 'react-jsx',
            strict: true,
            skipLibCheck: true,
            noEmit: true,
          },
          include: ['src', 'vite.config.ts'],
        },
        null,
        2,
      ),
    },
    {
      name: 'src/main.tsx',
      content:
        "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);\n",
    },
    { name: 'src/App.tsx', content: reactSource(p) },
    { name: 'src/quartile-data.ts', content: runtime },
    { name: 'src/quartile-chart.ts', content: chartRuntime },
    { name: 'src/app.css', content: starterCSS },
    { name: 'quartile-project.json', content: `${JSON.stringify(p, null, 2)}\n` },
    { name: 'vendor/quartile-react-0.1.0.tgz', content: library },
    { name: 'LICENSE', content: license },
    { name: '.gitignore', content: 'node_modules/\ndist/\n.env*\n' },
    {
      name: 'README.md',
      content: `# ${p.name}\n\nAn editable React app exported from Quartile App Studio. Requires Node.js 22.12 or newer.\n\n\`\`\`sh\nnpm install\nnpm run dev\n# Type-check and build for production\nnpm run build\n\`\`\`\n\nEdit src/App.tsx to change components and src/quartile-data.ts to change API normalization. quartile-project.json can be reimported into Studio; Studio does not parse changes made to JSX.\n\nThe Apache-2.0 Quartile 0.1 source preview is bundled under vendor/; no Quartile registry publication is required. Other dependencies install from npm; retain the resulting package-lock.json for reproducible installs. This is a source preview, not a stable package release. Library source: https://github.com/zinnoberHaus/quartile\n\nAPI data is fetched directly in the browser; no records, credentials, or current table/selection state are exported. Public sources need CORS, no credentials or redirects, and are limited to 2 MiB, 5,000 records, 64 fields and 20 seconds. Handle authenticated data on a backend you control. Attribution and provider warnings remain in the app. Open-Meteo's free endpoint is for non-commercial use; commercial usage needs an appropriate provider plan. Data licenses are separate from this code's Apache-2.0 license. Review provider terms before publishing.\n\nLine charts require unique X / series observations and reject duplicate grain; missing values remain gaps. Scatter charts use rows as observations. Bar charts sum each x/series combination: use additive measures. KPI mean is unweighted and skips nulls. Table filters and linked chart selections remain distinct.\n`,
    },
  ];
}
