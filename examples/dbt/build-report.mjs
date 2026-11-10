// Renders a Markdown report whose ```quartile blocks read a dbt model, to static HTML: real SVG
// charts and tables in the page, labelled with the model's column documentation, then upgraded
// to interactive charts by the embed script. Also writes an exposure so the report appears in
// dbt lineage. Usage: node build-report.mjs <report.md> <out-dir>
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { embedScript, lang, MarkdownIt, server, stylesheet } from './quartile.mjs';

const here = new URL('.', import.meta.url).pathname;

export function buildReport(reportPath, outDir) {
  const manifest = JSON.parse(readFileSync(join(here, 'target/manifest.json'), 'utf8'));
  const show = readFileSync(join(here, 'target/show_fct_orders.json'), 'utf8');
  const fct_orders = lang.dbtDataset(show, { manifest, model: 'fct_orders' });
  const diagnostics = [];
  const md = new MarkdownIt();
  server.markdownItQuartile(md, {
    datasets: { fct_orders },
    timeZone: 'UTC',
    onDiagnostics: (d, source) => {
      for (const x of d)
        if (x.severity === 'error') diagnostics.push(`${x.message} in:\n${source}`);
    },
  });
  const markdown = readFileSync(reportPath, 'utf8');
  const body = md.render(markdown);
  const title = /^#\s+(.+)$/m.exec(markdown)?.[1] ?? 'Report';
  const name = basename(reportPath, '.md');
  mkdirSync(outDir, { recursive: true });
  copyFileSync(stylesheet, join(outDir, 'quartile.css'));
  copyFileSync(embedScript, join(outDir, 'quartile.global.js'));
  writeFileSync(
    join(outDir, `${name}.html`),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${server.escapeHtml(title)}</title>
  <link rel="stylesheet" href="quartile.css">
  <style>body{max-width:960px;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui,sans-serif}</style>
</head>
<body>
${body}
  <script src="quartile.global.js" data-theme="auto"></script>
</body>
</html>
`,
  );
  writeFileSync(
    join(outDir, 'exposures.yml'),
    lang.dbtExposureYaml({
      name: `quartile_${name.replace(/\W+/g, '_')}`,
      label: title,
      dependsOn: ['fct_orders'],
      url: `https://example.com/reports/${name}.html`,
      description: 'Quartile report rendered from Markdown.',
      owner: { name: 'Analytics' },
    }),
  );
  return { diagnostics, html: join(outDir, `${name}.html`) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [report = join(here, 'reports/revenue.md'), out = join(here, 'site')] =
    process.argv.slice(2);
  const result = buildReport(report, out);
  if (result.diagnostics.length) {
    console.error(result.diagnostics.join('\n\n'));
    process.exit(1);
  }
  console.log(`Wrote ${result.html} and ${join(out, 'exposures.yml')}`);
}
