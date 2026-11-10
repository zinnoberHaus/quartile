// Blocks rendered inside a page's Markdown keep their own layout. Renders the same blocks in a
// plain container and inside three kinds of prose stylesheet (Tailwind Typography, GitHub's
// markdown-body, bare `article` rules), then compares the computed style of every visible
// element. Run after `pnpm build`, in a workspace where Playwright's Chromium is installed:
//   node packages/react/scripts/verify-prose.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(pkg, '../../apps/gallery/package.json'));
const { chromium } = require('playwright');
const { createElement: h } = require('react');
const { renderToString } = require('react-dom/server');
const { QuartileBlock, QuartileDocument } = await import(
  pathToFileURL(join(pkg, 'dist/index.js')).href
);
const css = readFileSync(join(pkg, 'dist/styles.css'), 'utf8');

const rows =
  'region,channel,amount\nEMEA,Web,120\nAPAC,Store,80\nEMEA,Store,40\nAmericas,Web,200\n';
const blocks = [
  `dashboard Sales review\nactions: rows, download\nsource: Orders database\nasof: 2026-09-30\nkpi sum(amount) as "Revenue"\nbarlist sum(amount) by region\n---\n${rows}`,
  `bar sum(amount) by region\ntitle: Revenue by region\nsubtitle: Net of returns\nsource: Finance close\nactions: table, rows, download\n---\n${rows}`,
  `table region, channel, amount\ntitle: Orders\n---\n${rows}`,
  `explorer region, channel, amount\ntitle: Explore orders\n---\n${rows}`,
  `donut sum(amount) by channel\ntitle: Share\nlegend: right\n---\n${rows}`,
  `bar sum(amount) by nowhere\n---\n${rows}`,
];
const body = renderToString(
  h(
    QuartileDocument,
    { timeZone: 'UTC', locale: 'en-US' },
    ...blocks.map((s, i) => h(QuartileBlock, { key: i, source: s })),
  ),
);
const not = ':not(:where([class~="not-prose"],[class~="not-prose"] *))';
const PAGES = {
  plain: ['div class="plain"', ''],
  typography: [
    'div class="prose"',
    `.prose{font-size:1rem;line-height:1.75}
.prose :where(p)${not}{margin-top:1.25em;margin-bottom:1.25em}
.prose :where(h2)${not}{font-weight:700;font-size:1.5em;margin-top:2em;margin-bottom:1em;line-height:1.333}
.prose :where(table)${not}{width:100%;margin-top:2em;margin-bottom:2em;font-size:.875em;line-height:1.7}
.prose :where(tbody td)${not}{padding:.57em}
.prose :where(ul)${not}{list-style-type:disc;margin-top:1.25em;margin-bottom:1.25em;padding-inline-start:1.625em}
.prose :where(li)${not}{margin-top:.5em;margin-bottom:.5em}`,
  ],
  github: [
    'div class="markdown-body"',
    `.markdown-body{font-size:16px;line-height:1.5}
.markdown-body h2{margin-top:24px;margin-bottom:16px;font-weight:600;line-height:1.25;padding-bottom:.3em;font-size:1.5em;border-bottom:1px solid #d1d9e0}
.markdown-body p{margin-top:0;margin-bottom:16px}
.markdown-body table{border-collapse:collapse;display:block;width:max-content;overflow:auto;margin-bottom:16px}
.markdown-body table th,.markdown-body table td{padding:6px 13px;border:1px solid #d1d9e0}
.markdown-body table tr:nth-child(2n){background-color:#f6f8fa}
.markdown-body ul{padding-left:2em;margin-bottom:16px}
.markdown-body li+li{margin-top:.25em}
.markdown-body button{font-size:20px}`,
  ],
  article: [
    'article',
    `article h2,article h3{margin:2em 0 .5em;font-size:28px;border-bottom:2px solid #000;padding:0 0 4px}
article p{margin:0 0 1.5em;font-size:19px;line-height:1.7}
article table{margin:2em 0;border:2px solid #000;font-size:18px}
article th,article td{padding:12px 16px;border:1px solid #999}
article ul,article ol{margin:1em 0;padding-left:2.5em;list-style:square}
article li{margin:.5em 0}
article button{font-size:20px;padding:10px 20px;border:2px solid #000}`,
  ],
};
const PROPS = [
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'border-top-width',
  'border-bottom-width',
  'border-left-width',
  'border-bottom-style',
  'font-size',
  'line-height',
  'font-weight',
  'list-style-type',
  'display',
  'background-color',
];

const dir = mkdtempSync(join(tmpdir(), 'quartile-prose-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const snapshot = async (name) => {
    const [wrapper, rules] = PAGES[name];
    const file = join(dir, `${name}.html`);
    writeFileSync(
      file,
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0;font:16px/1.5 system-ui}${rules}</style></head><body><${wrapper} style="width:900px">${body}</${wrapper.split(' ')[0]}></body></html>`,
    );
    await page.goto(pathToFileURL(file).href);
    return page.evaluate(
      (props) =>
        [...document.querySelectorAll('.q-block *')]
          .filter((el) => !el.closest('.q-visually-hidden'))
          .map((el) => {
            const cs = getComputedStyle(el);
            const comp = el.parentElement
              ?.closest('[class*="q-"]')
              ?.getAttribute('class')
              ?.split(' ')
              .find((c) => c.startsWith('q-'));
            return [
              `${comp} > ${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]}`,
              props.map((p) => cs.getPropertyValue(p)),
            ];
          }),
      PROPS,
    );
  };
  const plain = await snapshot('plain');
  const problems = [];
  for (const name of ['typography', 'github', 'article']) {
    const got = await snapshot(name);
    const seen = new Set();
    got.forEach(([id, values], i) => {
      const [, expected] = plain[i];
      PROPS.forEach((prop, j) => {
        const key = `${name}: ${id} ${prop}`;
        if (values[j] !== expected[j] && !seen.has(key)) {
          seen.add(key);
          problems.push(`${key}: ${expected[j]} became ${values[j]}`);
        }
      });
    });
  }
  if (problems.length) {
    console.error(`Prose styles changed ${problems.length} block styles:\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Blocks keep their layout inside 3 prose stylesheets (${plain.length} elements compared).`,
    );
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
