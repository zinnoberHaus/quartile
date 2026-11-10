/**
 * Parses the text of one Quartile block (the body of a ```quartile fence) into a syntax tree.
 *
 *   bar sum(revenue) by region        ← header: kind + sentence
 *   title: Revenue by region          ← properties
 *   ---                               ← data follows
 *   region,revenue
 *   EMEA,1200
 *
 * The parser never throws. It records diagnostics with 1-based line numbers and, for streaming
 * input, ignores a final line that may still be incomplete.
 */
import { type Diagnostic, error, info, warning } from './diagnostics';
import { type BlockKind, kindWords, lookupKind, normalizeKey, type ViewKind } from './kinds';

export type AggregateWord = 'sum' | 'count' | 'mean' | 'min' | 'max';

/** A field reference in a sentence or property: `revenue`, `sum(revenue)`, `count`. */
export interface FieldExpr {
  /** Column name, or null for a row count. */
  field: string | null;
  aggregate?: AggregateWord;
  /** Label from `… as "Label"`. */
  label?: string;
  /** Source text, for messages. */
  raw: string;
}

export interface PropEntry {
  /** Key as written. */
  key: string;
  /** Normalized key: lowercase, no separators, dots kept. */
  norm: string;
  value: string;
  line: number;
}

export interface Sentence {
  measures: FieldExpr[];
  dims: FieldExpr[];
  versus?: FieldExpr;
  flags: string[];
  text: string;
}

export interface ViewNode {
  kind: ViewKind;
  line: number;
  sentence: Sentence;
  props: PropEntry[];
  /** Props implied by the kind word, e.g. `hbar` → orientation horizontal. */
  implied: Record<string, unknown>;
}

export interface DataSection {
  text: string;
  /** Line of the first data line. */
  line: number;
}

export interface BlockNode {
  /** `view`: one chart; `dashboard`: several views; `data`: a named dataset; `json`: a JSON spec. */
  type: 'view' | 'dashboard' | 'data' | 'json' | 'empty';
  views: ViewNode[];
  /** Properties before the first view (dashboard and data blocks). */
  props: PropEntry[];
  /** Name of a `data <name>` block. */
  name?: string;
  /** Title words after `dashboard`. */
  title?: string;
  data?: DataSection;
  json?: unknown;
  diagnostics: Diagnostic[];
  /** False while a streaming block may still grow. */
  complete: boolean;
}

export interface ParseOptions {
  /** The text may end mid-line (a streaming answer). */
  partial?: boolean;
}

const KEYWORDS = new Set(['by', 'over', 'per', 'across', 'vs', 'versus', 'against']);
const VERSUS = new Set(['vs', 'versus', 'against']);
const FLAG_WORDS = new Set(['stacked', 'horizontal', 'smooth', 'smoothed', 'filled']);
const AGGREGATES: Record<string, AggregateWord> = {
  sum: 'sum',
  total: 'sum',
  count: 'count',
  n: 'count',
  mean: 'mean',
  avg: 'mean',
  average: 'mean',
  min: 'min',
  minimum: 'min',
  max: 'max',
  maximum: 'max',
};

/* ------------------------------------------------------------------------------------------ */
/* Tokens                                                                                      */
/* ------------------------------------------------------------------------------------------ */

interface Token {
  text: string;
  /** Quoted name; never a keyword. */
  quoted: boolean;
}

/** Splits on whitespace and commas, keeping quoted names and parenthesized calls whole. */
function tokenize(s: string): (Token | ',')[] {
  const out: (Token | ',')[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === ',') {
      out.push(',');
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = s.indexOf(ch, i + 1);
      const stop = end < 0 ? s.length : end;
      out.push({ text: s.slice(i + 1, stop), quoted: true });
      i = stop + 1;
      continue;
    }
    let j = i;
    let depth = 0;
    while (j < s.length) {
      const c = s[j];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (/\s/.test(c) || c === ',')) break;
      else if (depth > 0 && (c === '"' || c === "'" || c === '`')) {
        const end = s.indexOf(c, j + 1);
        j = end < 0 ? s.length - 1 : end;
      }
      j++;
    }
    out.push({ text: s.slice(i, j), quoted: false });
    i = j;
  }
  return out;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && /^["'`]/.test(t) && t[0] === t[t.length - 1]) return t.slice(1, -1);
  return t;
}

/** `sum(revenue)`, `avg("Order value")`, `count(*)`, `count`, `revenue`. */
export function parseFieldExpr(text: string, quoted = false): FieldExpr {
  const raw = text.trim();
  if (quoted) return { field: raw, raw };
  const call = /^([A-Za-z]+)\s*\(\s*(.*?)\s*\)$/.exec(raw);
  if (call) {
    const agg = AGGREGATES[call[1].toLowerCase()];
    const inner = unquote(call[2]);
    if (agg) {
      if (agg === 'count' && (inner === '' || inner === '*' || inner === '1')) {
        return { field: null, aggregate: 'count', raw };
      }
      return { field: inner, aggregate: agg, raw };
    }
    return { field: raw, raw };
  }
  const lower = raw.toLowerCase();
  if (lower === 'count' || lower === 'rows' || lower === 'count(*)') {
    return { field: null, aggregate: 'count', raw };
  }
  return { field: unquote(raw), raw };
}

/** Splits a token run into field expressions on commas and `and`/`then`; `as "Label"` attaches. */
function fieldList(tokens: (Token | ',')[]): FieldExpr[] {
  const out: FieldExpr[] = [];
  let current: Token[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const asAt = current.findIndex((t) => !t.quoted && t.text.toLowerCase() === 'as');
    const head = asAt >= 0 ? current.slice(0, asAt) : current;
    const label = asAt >= 0 ? current.slice(asAt + 1) : [];
    const quoted = head.length === 1 && head[0].quoted;
    const expr = parseFieldExpr(head.map((t) => t.text).join(' '), quoted);
    if (label.length) expr.label = label.map((t) => t.text).join(' ');
    if (expr.raw !== '') out.push(expr);
    current = [];
  };
  for (const t of tokens) {
    if (t === ',') flush();
    else if (!t.quoted && (t.text.toLowerCase() === 'and' || t.text.toLowerCase() === 'then')) {
      flush();
    } else current.push(t);
  }
  flush();
  return out;
}

/** The sentence after a kind word: measures, `by` dimensions, `vs` field, trailing flags. */
export function parseSentence(text: string): Sentence {
  const tokens = tokenize(text);
  const flags: string[] = [];
  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (last !== ',' && !last.quoted && FLAG_WORDS.has(last.text.toLowerCase())) {
      flags.unshift(last.text.toLowerCase());
      tokens.pop();
    } else break;
  }
  const sections: { keyword: string | null; tokens: (Token | ',')[] }[] = [
    { keyword: null, tokens: [] },
  ];
  for (const t of tokens) {
    if (t !== ',' && !t.quoted && KEYWORDS.has(t.text.toLowerCase())) {
      sections.push({ keyword: t.text.toLowerCase(), tokens: [] });
    } else sections[sections.length - 1].tokens.push(t);
  }
  const sentence: Sentence = { measures: fieldList(sections[0].tokens), dims: [], flags, text };
  for (const s of sections.slice(1)) {
    const fields = fieldList(s.tokens);
    if (VERSUS.has(s.keyword!)) sentence.versus = fields[0];
    else sentence.dims.push(...fields);
  }
  return sentence;
}

/* ------------------------------------------------------------------------------------------ */
/* Lines                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const PROPERTY = /^([A-Za-z_][\w.-]*(?:[ ][A-Za-z_][\w.-]*){0,2})\s*:\s*(.*)$/;
const SEPARATOR = /^\s*(-{3,}|={3,})\s*(data)?\s*:?\s*$/i;
const COMMENT = /^\s*(#|\/\/)/;

function looksLikeTableRow(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('|') ||
    t.includes(',') ||
    t.includes('\t') ||
    t.startsWith('[') ||
    t.startsWith('{')
  );
}

/** Matches a kind word (one or two words, e.g. "bar chart", "big number") at the line start. */
function headerAt(
  line: string,
): { kind: BlockKind; implied?: Record<string, unknown>; rest: string } | null {
  const m = /^\s*([A-Za-z][\w-]*)(?:\s+([A-Za-z][\w-]*))?(?:\s+([A-Za-z][\w-]*))?/.exec(line);
  if (!m) return null;
  const words = [m[1], m[2], m[3]].filter(Boolean) as string[];
  for (let n = words.length; n >= 1; n--) {
    const candidate = words.slice(0, n).join(' ');
    const found = lookupKind(candidate);
    if (found) {
      // Consume exactly the matched words, plus a trailing "chart"/"graph"/"plot".
      let rest = line.trimStart();
      for (let k = 0; k < n; k++) rest = rest.replace(/^[A-Za-z][\w-]*\s*/, '');
      rest = rest.replace(/^(chart|graph|plot|diagram)\b\s*/i, '');
      return { kind: found.kind, implied: found.props, rest: rest.trim() };
    }
  }
  return null;
}

function emptyBlock(diagnostics: Diagnostic[], complete: boolean): BlockNode {
  return { type: 'empty', views: [], props: [], diagnostics, complete };
}

/** Parses one block body. */
export function parseBlock(source: string, options: ParseOptions = {}): BlockNode {
  const diagnostics: Diagnostic[] = [];
  const complete = !options.partial;
  const text = source.replace(/\r\n?/g, '\n');
  const trimmed = text.trim();
  if (trimmed === '') return emptyBlock(diagnostics, complete);

  // JSON form: a Quartile spec, optionally with inline datasets.
  if (trimmed.startsWith('{') || (trimmed.startsWith('[') && !trimmed.includes('\n---'))) {
    try {
      return {
        type: 'json',
        views: [],
        props: [],
        json: JSON.parse(trimmed),
        diagnostics,
        complete,
      };
    } catch (e) {
      if (options.partial)
        return { type: 'json', views: [], props: [], diagnostics, complete: false };
      diagnostics.push(error(`The block is not valid JSON: ${(e as Error).message}`, 1));
      return { type: 'json', views: [], props: [], diagnostics, complete };
    }
  }

  // While streaming, the last line may still be growing. Markdown renderers append a newline to
  // every code block, so a trailing newline does not prove the line is finished: hold it back.
  const lines = (options.partial ? text.replace(/\n$/, '') : text).split('\n');
  const lastComplete = options.partial ? lines.length - 1 : lines.length;

  const block: BlockNode = { type: 'view', views: [], props: [], diagnostics, complete };
  let headerSeen = false;
  const currentView = (): ViewNode | undefined => block.views[block.views.length - 1];

  const startView = (
    kind: ViewKind,
    line: number,
    rest: string,
    implied?: Record<string, unknown>,
  ): ViewNode => {
    const view: ViewNode = {
      kind,
      line,
      sentence: parseSentence(rest),
      props: [],
      implied: { ...implied },
    };
    for (const flag of view.sentence.flags) {
      if (flag === 'stacked') view.implied.stack = true;
      else if (flag === 'horizontal') view.implied.orientation = 'horizontal';
      else if (flag === 'smooth' || flag === 'smoothed') view.implied.curve = 'monotone';
      else if (flag === 'filled') view.implied.area = true;
    }
    block.views.push(view);
    return view;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    if (line.trim() === '' || COMMENT.test(line)) continue;

    if (SEPARATOR.test(line)) {
      block.data = { text: lines.slice(i + 1).join('\n'), line: lineNo + 1 };
      break;
    }
    if (i >= lastComplete) break;

    const prop = PROPERTY.exec(line.trim());
    const header = prop ? null : headerAt(line);

    if (prop) {
      const key = prop[1];
      const value = (prop[2] ?? '').trim();
      const norm = normalizeKey(key);
      // `data:` with nothing after it starts the data section, like `---`.
      if (
        (norm === 'data' || norm === 'values' || norm === 'rows') &&
        (value === '' || value === '|')
      ) {
        block.data = { text: dedent(lines.slice(i + 1)).join('\n'), line: lineNo + 1 };
        break;
      }
      // dbt Charts style `query:` — a named query, or inline `columns` and `values`.
      if (norm === 'query') {
        if (value !== '') {
          const entry: PropEntry = { key: 'data', norm: 'data', value, line: lineNo };
          const target = currentView();
          if (target) target.props.push(entry);
          else block.props.push(entry);
          continue;
        }
        const indent = /^\s*/.exec(line)![0].length;
        let end = i + 1;
        while (
          end < lines.length &&
          (lines[end].trim() === '' || /^\s*/.exec(lines[end])![0].length > indent)
        )
          end++;
        const inline = inlineQuery(lines.slice(i + 1, end), lineNo + 1);
        diagnostics.push(...inline.diagnostics);
        if (inline.csv !== null) block.data = { text: inline.csv, line: lineNo + 1 };
        i = end - 1;
        continue;
      }
      // `type: bar`, `chart: line` declare a view the YAML way.
      if (['type', 'chart', 'charttype', 'kind', 'mark', 'view'].includes(norm)) {
        const found = lookupKind(value);
        if (!found) {
          diagnostics.push(
            error(`Unknown chart type “${value}”.`, lineNo, `Use one of: ${viewWords()}.`),
          );
          continue;
        }
        if (found.kind === 'dashboard' || found.kind === 'data') {
          block.type = found.kind;
          headerSeen = true;
          continue;
        }
        // In a single-view block, properties written before `type:` belong to the view.
        const pending =
          block.type === 'view' && block.views.length === 0 ? block.props.splice(0) : [];
        startView(found.kind, lineNo, '', found.props).props.push(...pending);
        headerSeen = true;
        continue;
      }
      const entry: PropEntry = { key, norm, value, line: lineNo };
      const target = currentView();
      if (target) target.props.push(entry);
      else block.props.push(entry);
      continue;
    }

    if (header) {
      headerSeen = true;
      if (header.kind === 'dashboard') {
        if (block.views.length > 0 || block.type === 'data') {
          diagnostics.push(error('“dashboard” must be the first line of a block.', lineNo));
          continue;
        }
        block.type = 'dashboard';
        block.title = header.rest ? unquote(header.rest) : undefined;
        continue;
      }
      if (header.kind === 'data') {
        if (block.views.length > 0) {
          diagnostics.push(
            error('Start a new block for a named dataset, or put rows after “---”.', lineNo),
          );
          continue;
        }
        block.type = 'data';
        block.name = header.rest ? unquote(header.rest.split(/\s+/)[0]) : undefined;
        if (!block.name) diagnostics.push(error('Name the dataset: “data orders”.', lineNo));
        continue;
      }
      if (block.type === 'data') {
        diagnostics.push(
          error('A data block defines rows only; put charts in their own blocks.', lineNo),
        );
        continue;
      }
      startView(header.kind as ViewKind, lineNo, header.rest, header.implied);
      continue;
    }

    if (looksLikeTableRow(line) && (headerSeen || block.props.length > 0)) {
      // Rows without a `---` separator: accept them, since the intent is unambiguous.
      diagnostics.push(info('Read the remaining lines as data (add “---” before rows).', lineNo));
      block.data = { text: lines.slice(i).join('\n'), line: lineNo };
      break;
    }

    if (!headerSeen && looksLikeTableRow(line)) {
      // Only rows: a table block with every column.
      block.data = { text: lines.slice(i).join('\n'), line: lineNo };
      break;
    }

    diagnostics.push(
      error(
        `Expected a chart type, “key: value”, or “---” before data; got “${line.trim().slice(0, 60)}”.`,
        lineNo,
        `Start with a chart type such as ${['line', 'bar', 'kpi', 'table'].join(', ')}.`,
      ),
    );
  }

  if (block.type === 'view' && block.views.length > 1) block.type = 'dashboard';
  if (block.type === 'view' && block.views.length === 0) {
    if (block.data) {
      // Rows without a chart type render as a table.
      startView('table', 1, '').props.push(...block.props.splice(0));
    } else if (complete) {
      diagnostics.push(
        error('This block has no chart type.', 1, `Start with one of: ${viewWords()}.`),
      );
    }
  }
  if (block.type === 'view' && block.views.length === 1 && block.props.length) {
    // Single view: properties before the header still describe that view.
    block.views[0].props.unshift(...block.props.splice(0));
  }
  if (block.type === 'dashboard' && block.views.length === 0 && complete) {
    diagnostics.push(warning('This dashboard has no views yet.', 1));
  }
  return block;
}

/** One YAML flow sequence item list: `[Jan, 100, "a, b", null]`. */
function flowList(text: string): string[] | null {
  const t = text.trim();
  if (!t.startsWith('[') || !t.endsWith(']')) return null;
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of t.slice(1, -1)) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out.map((v) => (v === 'null' || v === '~' ? '' : v));
}

/** Inline dbt Charts `query:` with `columns: [...]` and `values: - [...]`, as CSV text. */
function inlineQuery(
  body: string[],
  firstLine: number,
): { csv: string | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let columns: string[] | null = null;
  const rows: string[][] = [];
  let inValues = false;
  body.forEach((raw, k) => {
    const line = raw.trim();
    if (!line) return;
    const col = /^columns\s*:\s*(.*)$/.exec(line);
    if (col) {
      columns = flowList(col[1]);
      inValues = false;
      return;
    }
    if (/^values\s*:\s*$/.test(line)) {
      inValues = true;
      return;
    }
    if (/^sql\s*:/.test(line)) {
      diagnostics.push(
        error(
          'SQL queries run in your data tool; pass their rows to the page as a named dataset.',
          firstLine + k,
        ),
      );
      return;
    }
    const item = /^-\s*(.*)$/.exec(line);
    if (inValues && item) {
      const cells = flowList(item[1]);
      if (cells) rows.push(cells);
      return;
    }
    diagnostics.push(warning(`Ignored “${line}” in the query.`, firstLine + k));
  });
  if (!columns) {
    diagnostics.push(
      error('An inline query needs `columns: [a, b]` and `values:` rows.', firstLine),
    );
    return { csv: null, diagnostics };
  }
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [columns as string[], ...rows].map((r) => r.map(cell).join(',')).join('\n');
  return { csv: `${csv}\n`, diagnostics };
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim() !== '').map((l) => /^[ \t]*/.exec(l)![0].length);
  const n = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(n, /^[ \t]*/.exec(l)![0].length)));
}

let viewWordList: string | undefined;
function viewWords(): string {
  viewWordList ??= [
    'line',
    'area',
    'bar',
    'barlist',
    'donut',
    'scatter',
    'histogram',
    'heatmap',
    'calendar',
    'funnel',
    'sankey',
    'box',
    'sparkline',
    'kpi',
    'table',
    'filters',
  ]
    .filter((k) => kindWords().includes(k))
    .join(', ');
  return viewWordList;
}
