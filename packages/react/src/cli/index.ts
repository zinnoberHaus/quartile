/**
 * The `quartile` command: `check` validates the Quartile blocks in Markdown files, `prompt`
 * prints the system-prompt section that teaches a model the block syntax. No network access.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { dataset } from '../data/schema';
import type { DataInput } from '../data/types';
import { type PromptDataset, quartilePrompt } from '../lang/prompt';
import { parseTable } from '../lang/table';
import { type CheckProblem, checkMarkdown, formatProblem } from './check';

const HELP = `quartile: check and teach Quartile chart blocks

Usage
  quartile check <file.md ...> [options]   Compile every \`\`\`quartile block and report problems
  quartile prompt [--dataset name=file]    Print the system prompt that teaches a model the syntax
  quartile --version | --help

Options for check
  -                        Read Markdown from standard input
  --dataset name=file      Rows your app supplies under "name" (CSV, TSV or JSON), to check fields
  --dataset name           A dataset your app supplies only at run time; its fields are not checked
  --lang word              Also read this fence language as a Quartile block (repeatable)
  --nested                 Also check blocks shown inside \`\`\`markdown example fences
  --notes                  Print notes (inferred fields, corrected spellings) as well
  --strict                 Exit 1 on warnings too
  --json                   Print one JSON object instead of lines

Exit status: 0 no errors · 1 errors found · 2 the command could not run
`;

/** Thrown for problems with the command itself, reported without a stack trace. */
class UsageError extends Error {}

function read(file: string): string {
  try {
    return readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (cause) {
    throw new UsageError(
      `Cannot read ${file === '-' ? 'standard input' : file}: ${(cause as Error).message}`,
    );
  }
}

/** `--dataset name=file` loads rows; a bare `--dataset name` only declares the name. */
function readDatasets(values: readonly string[]) {
  const datasets: Record<string, DataInput> = {};
  const hostDatasets: string[] = [];
  const described: PromptDataset[] = [];
  for (const value of values) {
    const at = value.indexOf('=');
    if (at < 0) {
      hostDatasets.push(value);
      continue;
    }
    const name = value.slice(0, at);
    const file = value.slice(at + 1);
    const table = parseTable(read(file), { maxRows: 50_000 });
    const problem = table.diagnostics.find((d) => d.severity === 'error');
    if (problem) throw new UsageError(`${file}: ${problem.message}`);
    const data = dataset(table.rows, table.fields);
    datasets[name] = data;
    described.push({
      name,
      columns: table.columns.map((column) => ({ name: column, type: data.schema[column]?.type })),
    });
  }
  return { datasets, hostDatasets, described };
}

function check(files: readonly string[], flags: Flags): number {
  if (files.length === 0)
    throw new UsageError('Name at least one Markdown file, or - for standard input.');
  const { datasets, hostDatasets } = readDatasets(flags.dataset);
  const report: { file: string; blocks: number; problems: CheckProblem[] }[] = [];
  for (const file of files) {
    const result = checkMarkdown(read(file), {
      datasets,
      hostDatasets,
      languages: flags.lang.length ? ['quartile', ...flags.lang] : undefined,
      nested: flags.nested,
    });
    report.push({ file: file === '-' ? '<stdin>' : file, ...result });
  }
  const all = report.flatMap((r) => r.problems);
  const count = (severity: CheckProblem['severity']) =>
    all.filter((p) => p.severity === severity).length;
  const errors = count('error');
  const warnings = count('warning');
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ errors, warnings, files: report }, null, 2)}\n`);
  } else {
    for (const { file, problems } of report) {
      for (const problem of problems) {
        if (problem.severity === 'info' && !flags.notes) continue;
        process.stdout.write(`${formatProblem(file, problem)}\n`);
      }
    }
    const blocks = report.reduce((sum, r) => sum + r.blocks, 0);
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    process.stdout.write(
      `${plural(blocks, 'block')} in ${plural(report.length, 'file')}: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}\n`,
    );
  }
  if (
    !flags.json &&
    all.some((p) => p.severity === 'error' && /^There is no dataset/.test(p.message))
  ) {
    process.stderr.write(
      'Tip: for a dataset your app supplies at run time, pass --dataset name, or --dataset name=rows.csv to check its fields too.\n',
    );
  }
  return errors > 0 || (flags.strict && warnings > 0) ? 1 : 0;
}

interface Flags {
  dataset: string[];
  lang: string[];
  nested: boolean;
  notes: boolean;
  strict: boolean;
  json: boolean;
}

function main(argv: readonly string[]): number {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      dataset: { type: 'string', multiple: true, default: [] },
      lang: { type: 'string', multiple: true, default: [] },
      nested: { type: 'boolean', default: false },
      notes: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${manifest.version}\n`);
    return 0;
  }
  if (values.help || !command) {
    process.stdout.write(HELP);
    return values.help ? 0 : 2;
  }
  if (command === 'check') return check(rest, values as Flags);
  if (command === 'prompt') {
    const { described } = readDatasets(values.dataset as string[]);
    process.stdout.write(`${quartilePrompt({ datasets: described })}\n`);
    return 0;
  }
  throw new UsageError(`Unknown command "${command}". Try quartile --help.`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (cause) {
  // parseArgs reports unknown options as TypeErrors with a readable message.
  if (cause instanceof UsageError || cause instanceof TypeError) {
    process.stderr.write(`quartile: ${cause.message}\n`);
    process.exitCode = 2;
  } else {
    throw cause;
  }
}
