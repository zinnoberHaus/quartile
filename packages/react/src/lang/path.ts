/**
 * `path:` names where the rows are inside a JSON document: keys and array positions separated
 * by dots (`data.items`, `results.0.series`). It is a lookup, not a query language: there are no
 * wildcards, filters or expressions, so a block cannot compute over a response.
 */

export interface PathProblem {
  message: string;
  hint?: string;
}

export type PathResult = { ok: true; value: unknown } | { ok: false; problem: PathProblem };

const SYNTAX = 'A path is keys and positions separated by dots, e.g. `data.items` or `results.0`.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function list(keys: string[], max = 12): string {
  const shown = keys.slice(0, max).map((k) => `\`${k}\``);
  return keys.length > max ? `${shown.join(', ')} and ${keys.length - max} more` : shown.join(', ');
}

/** `$.data.items[0]` → `data.items.0`, for the hint of a path written as JSONPath. */
function plainForm(path: string): string | undefined {
  const plain = path
    .replace(/^\$\.?/, '')
    .replace(/\[\s*(\d+)\s*\]/g, '.$1')
    .replace(/\[\s*(["'])([^"'\]]+)\1\s*\]/g, '.$2')
    .replace(/^\./, '');
  return plain !== path && plain !== '' && segmentsOf(plain) ? plain : undefined;
}

function segmentsOf(path: string): string[] | undefined {
  if (/[*[\]?]/.test(path)) return undefined;
  const segments = path.split('.').map((s) => s.trim());
  if (segments.some((s) => s === '') || segments[0] === '$') return undefined;
  return segments;
}

/** The path's segments, or why it is not a path. */
export function parseDataPath(path: string): string[] | PathProblem {
  const text = path.trim();
  const segments = text === '' ? undefined : segmentsOf(text);
  if (segments) return segments;
  const plain = plainForm(text);
  return {
    message: `\`${text}\` is not a path this language reads.`,
    hint: plain
      ? `Write \`path: ${plain}\`.`
      : `${SYNTAX} Wildcards and filters are not supported.`,
  };
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
  const segments = parseDataPath(path);
  if (!Array.isArray(segments)) return { ok: false, problem: segments };
  const written = segments.join('.');
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const where = i === 0 ? 'the top level' : `\`${segments.slice(0, i).join('.')}\``;
    const stops = `The path \`${written}\` stops at \`${segment}\``;
    if (Array.isArray(current)) {
      const count = current.length;
      if (!/^\d+$/.test(segment)) {
        return {
          ok: false,
          problem: {
            message: `${stops}: ${where} is a list, which takes a position, not a key.`,
            hint: count
              ? `Use a position from 0 to ${count - 1}, or end the path at ${where} to read its items as rows.`
              : 'That list is empty.',
          },
        };
      }
      if (Number(segment) >= count) {
        return {
          ok: false,
          problem: {
            message: `${stops}: ${where} has ${count} ${count === 1 ? 'item' : 'items'}.`,
            hint: count ? `Positions run from 0 to ${count - 1}.` : undefined,
          },
        };
      }
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      if (!Object.hasOwn(current, segment)) {
        const keys = Object.keys(current);
        const near = keys.find((k) => k.toLowerCase() === segment.toLowerCase());
        return {
          ok: false,
          problem: {
            message: `${stops}: there is no such key at ${where}.`,
            hint: keys.length
              ? `${near ? `Did you mean \`${near}\`? ` : ''}Keys there: ${list(keys)}.`
              : 'That object is empty.',
          },
        };
      }
      current = current[segment];
    } else {
      return {
        ok: false,
        problem: {
          message: `${stops}: ${where} is ${describe(current)}, not an object or a list.`,
        },
      };
    }
  }
  return { ok: true, value: current };
}

/** Keys of a JSON object for a hint, e.g. after "no rows found". */
export function keyList(value: Record<string, unknown>): string {
  return list(Object.keys(value));
}
