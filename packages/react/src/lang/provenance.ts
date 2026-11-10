/**
 * Reads the provenance settings of a block: `source:`, `source.url:` and `asof:`. They are
 * plain text and a checked link; nothing is fetched.
 */
import { httpUrl, type Provenance } from '../spec/provenance';
import { type Diagnostic, warning } from './diagnostics';
import type { PropEntry } from './parse';

/** Normalized setting key → the spec property it sets. */
const KEYS: Record<string, keyof Provenance> = {
  source: 'source',
  credit: 'source',
  attribution: 'source',
  sourcename: 'source',
  'source.url': 'sourceUrl',
  sourceurl: 'sourceUrl',
  asof: 'asOf',
  updated: 'asOf',
};

export function isProvenanceKey(norm: string): boolean {
  return Object.hasOwn(KEYS, norm);
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && /^["'`]/.test(t) && t[0] === t[t.length - 1]) return t.slice(1, -1);
  return t;
}

/**
 * `source:` used to name a dataset. A block that has no other data and whose `source:` is
 * exactly the name of a known dataset still reads it that way, with a warning. Returns that
 * setting, or undefined when `source:` states provenance.
 */
export function legacyDataSource(
  props: PropEntry[],
  known: (name: string) => boolean,
  diagnostics: Diagnostic[],
): PropEntry | undefined {
  const prop = props.find((p) => p.norm === 'source');
  if (!prop) return undefined;
  const name = unquote(prop.value);
  if (name === '' || !known(name)) return undefined;
  diagnostics.push(
    warning(
      `Read “source: ${name}” as the dataset “${name}”.`,
      prop.line,
      `Write “data: ${name}”. “source:” now says where the data came from.`,
    ),
  );
  return prop;
}

/** The provenance stated in `props`. `skip` is a `source:` line already read as a dataset. */
export function readProvenance(
  props: PropEntry[],
  diagnostics: Diagnostic[],
  skip?: PropEntry,
): Provenance {
  const out: Provenance = {};
  for (const p of props) {
    if (p === skip || !isProvenanceKey(p.norm)) continue;
    const key = KEYS[p.norm];
    const value = unquote(p.value);
    if (value === '') continue;
    if (key !== 'sourceUrl') {
      out[key] = value;
      continue;
    }
    if (httpUrl(value)) out.sourceUrl = value;
    else {
      diagnostics.push(
        warning(
          `“${p.key}” is not an http or https link; it was ignored.`,
          p.line,
          'Give a full address such as https://example.org/data.',
        ),
      );
    }
  }
  return out;
}

/** Drops a `sourceUrl` that is not an http(s) link from a JSON spec object, with a warning. */
export function checkSourceUrl(item: Record<string, unknown>, diagnostics: Diagnostic[]) {
  if (item.sourceUrl === undefined || httpUrl(item.sourceUrl)) return;
  delete item.sourceUrl;
  diagnostics.push(warning('“sourceUrl” is not an http or https link; it was ignored.'));
}
