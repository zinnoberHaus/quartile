/**
 * Static rendering of Quartile blocks: real SVG charts and HTML tables in the page's HTML, for
 * search engines, readers without JavaScript, feeds and static documentation builds. The
 * embed script (or React) upgrades the same markup into interactive charts in the browser.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DataInput } from '../data/types';
import { type CompiledBlock, compileBlock } from '../lang/compile';
import type { Diagnostic } from '../lang/diagnostics';
import { DEFAULT_LANGUAGES, scanDocument } from '../lang/document';
import { QuartileBlock } from '../markdown/QuartileBlock';
import { QuartileDocument } from '../markdown/QuartileDocument';
import type { Density } from '../provider/QuartileProvider';

export interface StaticRenderOptions {
  /** Named datasets blocks may use with `data: name`. */
  datasets?: Record<string, DataInput>;
  /** Static output has no system preference to follow; choose light or dark. Default light. */
  theme?: 'light' | 'dark';
  density?: Density;
  locale?: string;
  /** Pass a zone so build machines and readers see the same timestamps. */
  timeZone?: string;
  /** Drawing width before the browser measures; the SVG scales to its container. Default 640. */
  initialWidth?: number;
  /** How `data` blocks render. Default `summary`. */
  dataDisplay?: 'summary' | 'table' | 'hidden';
  /** Receives each block's diagnostics, e.g. to fail a docs build on errors. */
  onDiagnostics?: (diagnostics: Diagnostic[], source: string) => void;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** A backtick fence longer than any backtick run in `texts`, so re-wrapped bodies stay intact. */
function fenceFor(texts: string[]): string {
  let longest = 0;
  for (const t of texts)
    for (const m of t.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** Escapes text for an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Renders one block to HTML. The wrapper keeps the block source in `data-quartile-source`, so
 * the embed script can replace the static drawing with the interactive one.
 */
export function renderBlockToHTML(source: string, options: StaticRenderOptions = {}): string {
  const compiled: CompiledBlock = compileBlock(source, { datasets: options.datasets });
  options.onDiagnostics?.(compiled.diagnostics, source);
  const markup = renderToStaticMarkup(
    createElement(
      QuartileDocument,
      {
        data: options.datasets,
        theme: options.theme ?? 'light',
        density: options.density,
        locale: options.locale,
        timeZone: options.timeZone,
        initialWidth: options.initialWidth,
        dataDisplay: options.dataDisplay,
      },
      createElement(QuartileBlock, { source }),
    ),
  );
  const kind = compiled.type === 'dashboard' ? 'dashboard' : compiled.type;
  return `<div class="quartile-static" data-quartile-block="${kind}" data-quartile-source="${escapeHtml(source)}">${markup}</div>`;
}

export interface MarkdownRenderOptions extends StaticRenderOptions {
  /** Fence languages read as Quartile blocks. Default `quartile`. */
  languages?: readonly string[];
  /**
   * Loads `src:` URLs at build time, e.g. a CSV file next to the page. Returns rows, a dataset,
   * or CSV/JSON text. Without it, blocks naming a URL render their "no data" message.
   */
  loadSource?: (url: string) => Promise<DataInput | string> | DataInput | string;
}

async function loadSources(
  markdown: string,
  options: MarkdownRenderOptions,
): Promise<Record<string, DataInput>> {
  const datasets: Record<string, DataInput> = { ...options.datasets };
  if (!options.loadSource) return datasets;
  const scan = scanDocument(markdown, { languages: options.languages, datasets });
  for (const s of scan.sources) {
    if (Object.hasOwn(datasets, s.name)) continue;
    const value = await options.loadSource(s.url);
    if (typeof value === 'string') {
      const { parseTable } = await import('../lang/table');
      const { dataset } = await import('../data/schema');
      const table = parseTable(value);
      datasets[s.name] = dataset(table.rows, table.fields);
    } else datasets[s.name] = value;
  }
  return datasets;
}

/* ------------------------------------------------------------------------------------------ */
/* remark (unified): Astro, Next.js MDX-less pipelines, Eleventy, Docusaurus raw remark       */
/* ------------------------------------------------------------------------------------------ */

interface MdastNode {
  type: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  children?: MdastNode[];
}

function collectCode(node: MdastNode, wanted: Set<string>, out: MdastNode[]) {
  if (node.type === 'code' && node.lang && wanted.has(node.lang.toLowerCase())) out.push(node);
  for (const child of node.children ?? []) collectCode(child, wanted, out);
}

/**
 * A remark plugin: replaces ```quartile code nodes with static chart HTML (`html` nodes).
 * Datasets from `data` blocks anywhere in the document are available to every block. Pipelines
 * that convert to HTML must keep raw HTML (`allowDangerousHtml` in remark-rehype and
 * rehype-stringify, or rehype-raw). For MDX, render `QuartilePre` instead.
 */
export function remarkQuartile(options: MarkdownRenderOptions = {}) {
  const wanted = new Set((options.languages ?? DEFAULT_LANGUAGES).map((l) => l.toLowerCase()));
  return async (tree: MdastNode) => {
    const nodes: MdastNode[] = [];
    collectCode(tree, wanted, nodes);
    if (nodes.length === 0) return;
    const fence = fenceFor(nodes.map((n) => n.value ?? ''));
    const markdown = nodes.map((n) => `${fence}quartile\n${n.value ?? ''}\n${fence}`).join('\n\n');
    const datasets = await loadSources(markdown, options);
    const scan = scanDocument(markdown, { datasets });
    for (const node of nodes) {
      const html = renderBlockToHTML(node.value ?? '', { ...options, datasets: scan.datasets });
      node.type = 'html';
      node.value = html;
      delete node.lang;
      delete node.meta;
    }
  };
}

/* ------------------------------------------------------------------------------------------ */
/* markdown-it: VitePress, Docsify-like builds, markdown-it based generators                  */
/* ------------------------------------------------------------------------------------------ */

interface MarkdownItToken {
  type: string;
  info: string;
  content: string;
}
interface MarkdownItLike {
  core: {
    ruler: {
      push(
        name: string,
        fn: (state: { tokens: MarkdownItToken[]; env: Record<string, unknown> }) => void,
      ): void;
    };
  };
  renderer: {
    rules: Record<
      string,
      | ((
          tokens: MarkdownItToken[],
          idx: number,
          options: unknown,
          env: Record<string, unknown>,
          self: unknown,
        ) => string)
      | undefined
    >;
  };
}

const ENV_KEY = '__quartileDatasets';

/**
 * A markdown-it plugin: renders ```quartile fences as static chart HTML. markdown-it renders
 * synchronously, so `src:` URLs need datasets passed in `options.datasets`.
 */
export function markdownItQuartile(
  md: MarkdownItLike,
  options: StaticRenderOptions & { languages?: readonly string[] } = {},
) {
  const wanted = new Set((options.languages ?? DEFAULT_LANGUAGES).map((l) => l.toLowerCase()));
  const langOf = (info: string) => info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  md.core.ruler.push('quartile_datasets', (state) => {
    const fences = state.tokens.filter((t) => t.type === 'fence' && wanted.has(langOf(t.info)));
    const fence = fenceFor(fences.map((t) => t.content));
    const blocks = fences.map((t) => `${fence}quartile\n${t.content}${fence}`).join('\n\n');
    if (!blocks) return;
    state.env[ENV_KEY] = scanDocument(blocks, { datasets: options.datasets }).datasets;
  });
  const fallback = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    if (!wanted.has(langOf(token.info))) {
      return fallback
        ? fallback(tokens, idx, opts, env, self)
        : `<pre><code>${escapeHtml(token.content)}</code></pre>`;
    }
    const datasets = (env?.[ENV_KEY] as Record<string, DataInput> | undefined) ?? options.datasets;
    return renderBlockToHTML(token.content, { ...options, datasets });
  };
}

/** Renders every Quartile block of a Markdown string, returning HTML per block in order. */
export async function renderMarkdownBlocks(
  markdown: string,
  options: MarkdownRenderOptions = {},
): Promise<{ line: number; source: string; html: string }[]> {
  const datasets = await loadSources(markdown, options);
  const scan = scanDocument(markdown, { languages: options.languages, datasets });
  return scan.blocks.map((b) => ({
    line: b.line,
    source: b.source,
    html: renderBlockToHTML(b.source, { ...options, datasets: scan.datasets }),
  }));
}
