/**
 * `path:` names where the rows are inside a JSON document: keys and array positions separated
 * by dots (`data.items`, `results.0.series`). It is a lookup, not a query language: there are no
 * wildcards, filters or expressions, so a block cannot compute over a response. The JSONPath
 * spellings of the same lookup (`$.results[0].series`, `data['items']`) are read with a note.
 */

export interface PathProblem {
  message: string;
  hint?: string;
}

export interface ParsedPath {
  segments: string[];
  /** The path in dotted form, e.g. `results.0.series`. Empty for the whole document (`$`). */
  dotted: string;
  /** The text as written, when it was another spelling of the dotted form. */
  written?: string;
}

export type PathResult =
  | { ok: true; value: unknown; path: ParsedPath }
  | { ok: false; problem: PathProblem; path?: ParsedPath };

const SYNTAX = 'A path is keys and positions separated by dots, e.g. `data.items` or `results.0`.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function list(keys: string[], max = 12): string {
  const shown = keys.slice(0, max).map((k) => `\`${k}\``);
  return keys.length > max ? `${shown.join(', ')} and ${keys.length - max} more` : shown.join(', ');
}

/**
 * Splits a path into segments. Besides the dotted form it reads a leading `$`, positions in
 * brackets (`[0]`) and quoted keys in brackets (`['items']`). Anything that would select more
 * than one place (`*`, `..`, filters, slices, unions) is not a path and returns undefined.
 */
function segmentsOf(text: string): { segments: string[]; dotted: boolean } | undefined {
  const segments: string[] = [];
  let dotted = true;
  let i = 0;
  // A key may start here without a dot before it: only at the very start.
  let keyNext = true;
  if (/^\$(?=$|[.[])/.test(text)) {
    dotted = false;
    keyNext = false;
    i = 1;
  }
  while (i < text.length) {
    const ch = text[i];
    if (ch === '[') {
      const close = text.indexOf(']', i);
      if (close < 0) return undefined;
      const inner = text.slice(i + 1, close).trim();
      const quoted = /^(["'])(.*)\1$/.exec(inner);
      if (/^\d+$/.test(inner)) segments.push(inner);
      // A quoted key the dotted form cannot spell (it holds a dot) stays out of reach.
      else if (quoted && quoted[2].trim() !== '' && !/[.*?[\]"']/.test(quoted[2]))
        segments.push(quoted[2].trim());
      else return undefined;
      dotted = false;
      keyNext = false;
      i = close + 1;
    } else if (ch === '.') {
      // A leading dot, `..`, or a dot at the end.
      if (keyNext || i === text.length - 1) return undefined;
      keyNext = true;
      i++;
    } else {
      if (!keyNext) return undefined;
      let end = i;
      while (end < text.length && text[end] !== '.' && text[end] !== '[') end++;
      const key = text.slice(i, end).trim();
      if (key === '' || /[*?\]]/.test(key)) return undefined;
      segments.push(key);
      keyNext = false;
      i = end;
    }
  }
  return segments.length === 0 && dotted ? undefined : { segments, dotted };
}

/** The path's segments, or why it is not a path. */
export function parseDataPath(path: string): ParsedPath | PathProblem {
  const text = path.trim();
  const read = segmentsOf(text);
  if (read) {
    const dotted = read.segments.join('.');
    return { segments: read.segments, dotted, ...(read.dotted ? {} : { written: text }) };
  }
  // jq writes the root as a leading dot: `.data.items`.
  const plain = text.startsWith('.') ? segmentsOf(text.slice(1)) : undefined;
  return {
    message: `\`${text}\` is not a path this language reads.`,
    hint: plain?.segments.length
      ? `Write \`path: ${plain.segments.join('.')}\`.`
      : `${SYNTAX} Wildcards and filters are not supported.`,
  };
}

/** The note for a path that was written in another spelling than the dotted one. */
export function pathNote(path: ParsedPath | undefined): string | undefined {
  if (path?.written === undefined) return undefined;
  return path.dotted === ''
    ? `Read \`${path.written}\` as the whole document.`
    : `Read \`${path.written}\` as \`${path.dotted}\`.`;
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'true or false';
  return `a ${typeof value}`;
}

/**
 * Follows `path` from the root of a parsed JSON value. Only own keys are read, so `__proto__` and
 * `constructor` are ordinary missing keys. A path that does not resolve names the first segment
 * that is missing and what exists at that level.
 */
export function resolveDataPath(root: unknown, path: string): PathResult {
  const parsed = parseDataPath(path);
  if (!('segments' in parsed)) return { ok: false, problem: parsed };
  const { segments, dotted: written } = parsed;
  const fail = (problem: PathProblem): PathResult => ({ ok: false, problem, path: parsed });
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const where = i === 0 ? 'the top level' : `\`${segments.slice(0, i).join('.')}\``;
    const stops = `The path \`${written}\` stops at \`${segment}\``;
    if (Array.isArray(current)) {
      const count = current.length;
      if (!/^\d+$/.test(segment)) {
        return fail({
          message: `${stops}: ${where} is a list, which takes a position, not a key.`,
          hint: count
            ? `Use a position from 0 to ${count - 1}, or end the path at ${where} to read its items as rows.`
            : 'That list is empty.',
        });
      }
      if (Number(segment) >= count) {
        return fail({
          message: `${stops}: ${where} has ${count} ${count === 1 ? 'item' : 'items'}.`,
          hint: count ? `Positions run from 0 to ${count - 1}.` : undefined,
        });
      }
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      if (!Object.hasOwn(current, segment)) {
        const keys = Object.keys(current);
        const near = keys.find((k) => k.toLowerCase() === segment.toLowerCase());
        return fail({
          message: `${stops}: there is no such key at ${where}.`,
          hint: keys.length
            ? `${near ? `Did you mean \`${near}\`? ` : ''}Keys there: ${list(keys)}.`
            : 'That object is empty.',
        });
      }
      current = current[segment];
    } else {
      return fail({
        message: `${stops}: ${where} is ${describe(current)}, not an object or a list.`,
      });
    }
  }
  return { ok: true, value: current, path: parsed };
}

/** Keys of a JSON object for a hint, e.g. after "no rows found". */
export function keyList(value: Record<string, unknown>): string {
  return list(Object.keys(value));
}
