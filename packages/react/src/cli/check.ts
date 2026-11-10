/**
 * Checks the Quartile blocks of a Markdown document without rendering them. It runs the same
 * compiler the renderers use and reports each problem with its line in the document, so a docs
 * build, a CI job or a coding agent can validate blocks before anyone looks at the page.
 */
import type { DataInput } from '../data/types';
import { compileBlock } from '../lang/compile';
import type { Diagnostic } from '../lang/diagnostics';
import { findFencedBlocks } from '../lang/document';

export interface CheckOptions {
  /** Fence languages read as Quartile blocks. Defaults to `quartile`. */
  languages?: readonly string[];
  /** Rows the host application supplies by name, so field names can be checked against them. */
  datasets?: Record<string, DataInput>;
  /** Names the host supplies only at run time. Blocks over them are checked without their columns. */
  hostDatasets?: readonly string[];
  /** Also check blocks shown inside `markdown` example fences, each example as its own document. */
  nested?: boolean;
}

export interface CheckProblem {
  severity: Diagnostic['severity'];
  /** 1-based line in the document. */
  line: number;
  message: string;
  hint?: string;
}

export interface CheckResult {
  /** Quartile blocks found. */
  blocks: number;
  problems: CheckProblem[];
}

/** `offset` is the document line before the text's first line: 0, or an outer fence's line. */
function checkDocument(text: string, options: CheckOptions, offset: number): CheckResult {
  const fenced = findFencedBlocks(text, options.languages);
  const datasets: Record<string, DataInput> = { ...options.datasets };
  const awaited = new Set(options.hostDatasets);
  // Pass 1: `data` blocks define datasets for the whole document, wherever they appear.
  for (const block of fenced) {
    const compiled = compileBlock(block.source, { datasets: options.datasets });
    if (compiled.type === 'data' && compiled.defines) {
      datasets[compiled.defines.name] = compiled.defines.dataset;
    }
    // A `src:` is loaded by the page, never here; its columns are unknown to this check.
    for (const source of compiled.sources) awaited.add(source.name);
  }
  const pendingDatasets = [...awaited].filter((name) => !Object.hasOwn(datasets, name));
  const problems: CheckProblem[] = [];
  for (const block of fenced) {
    const compiled = compileBlock(block.source, { datasets, pendingDatasets });
    for (const d of compiled.diagnostics) {
      // A diagnostic's line counts from the first line inside the fence.
      const line = offset + block.line + (d.line ?? 0);
      problems.push({ severity: d.severity, line, message: d.message, hint: d.hint });
    }
    if (!block.closed) {
      problems.push({
        severity: 'warning',
        line: offset + block.line,
        message:
          'This code fence is never closed, so the rest of the document is read as the block.',
      });
    }
  }
  return { blocks: fenced.length, problems };
}

/** Compiles every Quartile block in `markdown` and returns the problems in document order. */
export function checkMarkdown(markdown: string, options: CheckOptions = {}): CheckResult {
  const result = checkDocument(markdown, options, 0);
  if (options.nested) {
    for (const example of findFencedBlocks(markdown, ['markdown', 'md'])) {
      const inner = checkDocument(example.source, options, example.line);
      result.blocks += inner.blocks;
      result.problems.push(...inner.problems);
    }
  }
  result.problems.sort((a, b) => a.line - b.line);
  return result;
}

/** One line per problem, in the `file:line: severity: message` form editors and agents parse. */
export function formatProblem(file: string, problem: CheckProblem): string {
  const severity = problem.severity === 'info' ? 'note' : problem.severity;
  const hint = problem.hint ? ` ${problem.hint}` : '';
  return `${file}:${problem.line}: ${severity}: ${problem.message}${hint}`;
}
