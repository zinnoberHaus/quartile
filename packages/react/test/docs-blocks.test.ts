// Every ```quartile example in the README, the language reference, the guides and the dbt
// example must compile. Snippets may reference datasets defined elsewhere; nothing else may fail.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileBlock } from '../src/lang/compile';
import { findFencedBlocks } from '../src/lang/document';

const root = join(__dirname, '../../..');
const files = [
  'README.md',
  'docs/language.md',
  ...readdirSync(join(root, 'docs/guides'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/guides/${f}`),
  'examples/dbt/README.md',
  'examples/dbt/reports/revenue.md',
  'skills/quartile/SKILL.md',
];

/** Quartile blocks, including those shown inside ````markdown example fences. */
function blocksIn(text: string): { source: string; line: number }[] {
  const direct = findFencedBlocks(text);
  const nested = findFencedBlocks(text, ['markdown', 'md']).flatMap((outer) =>
    findFencedBlocks(outer.source).map((b) => ({ ...b, line: outer.line + b.line })),
  );
  return [...direct, ...nested];
}

const ALLOWED = [/^There is no dataset/, /^This chart has no data\.$/];

describe('documentation examples', () => {
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    const blocks = blocksIn(text);
    if (blocks.length === 0) continue;
    it(`${file}: ${blocks.length} block(s) compile`, () => {
      for (const block of blocks) {
        const errors = compileBlock(block.source)
          .diagnostics.filter((d) => d.severity === 'error')
          .filter((d) => !ALLOWED.some((re) => re.test(d.message)));
        expect({ line: block.line, errors }).toEqual({ line: block.line, errors: [] });
      }
    });
  }
});
