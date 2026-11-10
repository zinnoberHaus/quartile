/**
 * Finds Quartile blocks in a Markdown document and collects the datasets they define, so a
 * chart can use rows from a `data` block anywhere in the same document — on a server, during a
 * static build, or while an answer streams.
 */
import type { DataInput, Dataset } from '../data/types';
import { type CompiledBlock, compileBlock } from './compile';
import type { Diagnostic } from './diagnostics';

/** Info-string languages read as Quartile blocks. Hosts may add aliases such as `chart`. */
export const DEFAULT_LANGUAGES: readonly string[] = ['quartile'];

export interface FencedBlock {
  /** First word of the info string, lowercased. */
  lang: string;
  /** Rest of the info string, e.g. `id=revenue`. */
  meta: string;
  /** Block body, without the fences. */
  source: string;
  /** 1-based line of the opening fence in the document. */
  line: number;
  /** False when the document ends before the closing fence (a streaming answer). */
  closed: boolean;
}

const OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/**
 * Fenced code blocks at the top level of a CommonMark document, following the spec's fence
 * rules (backtick or tilde runs of three or more, closing run at least as long, up to three
 * spaces of indentation). Blocks nested in lists or quotes are not scanned.
 */
export function findFencedBlocks(
  markdown: string,
  languages: readonly string[] = DEFAULT_LANGUAGES,
): FencedBlock[] {
  const wanted = new Set(languages.map((l) => l.toLowerCase()));
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: FencedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = OPEN.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const fence = m[2];
    const info = m[3].trim();
    if (fence[0] === '`' && info.includes('`')) continue;
    const [first = '', ...rest] = info.split(/\s+/);
    const lang = first.toLowerCase();
    const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    const body: string[] = [];
    let j = i + 1;
    let closed = false;
    for (; j < lines.length; j++) {
      if (close.test(lines[j])) {
        closed = true;
        break;
      }
      body.push(lines[j].replace(new RegExp(`^ {0,${indent}}`), ''));
    }
    if (wanted.has(lang)) {
      out.push({
        lang,
        meta: rest.join(' '),
        source: body.join('\n') + (closed || body.length ? '\n' : ''),
        line: i + 1,
        closed,
      });
    }
    i = j;
  }
  return out;
}

export interface ScannedBlock extends FencedBlock {
  compiled: CompiledBlock;
}

export interface DocumentScan {
  blocks: ScannedBlock[];
  /** Datasets defined by `data` blocks, plus the host's. */
  datasets: Record<string, DataInput>;
  /** URLs the document asks the host to load. */
  sources: { name: string; url: string }[];
  diagnostics: { line: number; diagnostics: Diagnostic[] }[];
}

export interface ScanOptions {
  languages?: readonly string[];
  /** Host datasets available to every block. */
  datasets?: Record<string, DataInput>;
  /** The document may still be streaming; its last block may be incomplete. */
  partial?: boolean;
}

/** Compiles every block of a document with the datasets the whole document defines. */
export function scanDocument(markdown: string, options: ScanOptions = {}): DocumentScan {
  const fenced = findFencedBlocks(markdown, options.languages);
  const datasets: Record<string, DataInput> = { ...options.datasets };
  const sources: DocumentScan['sources'] = [];
  // Pass 1: named datasets, wherever they appear.
  for (const block of fenced) {
    const compiled = compileBlock(block.source, {
      partial: options.partial && !block.closed,
      datasets: options.datasets,
    });
    if (compiled.type === 'data' && compiled.defines) {
      datasets[compiled.defines.name] = compiled.defines.dataset as Dataset;
    }
    for (const s of compiled.sources) {
      if (!sources.some((x) => x.name === s.name)) sources.push({ name: s.name, url: s.url });
    }
  }
  // Pass 2: every block against the complete set.
  const pending = sources.filter((s) => !Object.hasOwn(datasets, s.name)).map((s) => s.name);
  const blocks = fenced.map((block) => ({
    ...block,
    compiled: compileBlock(block.source, {
      partial: options.partial && !block.closed,
      datasets,
      pendingDatasets: pending,
    }),
  }));
  return {
    blocks,
    datasets,
    sources,
    diagnostics: blocks
      .filter((b) => b.compiled.diagnostics.length)
      .map((b) => ({ line: b.line, diagnostics: b.compiled.diagnostics })),
  };
}
