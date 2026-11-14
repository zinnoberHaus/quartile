// Names that come from block text (datasets, columns, field settings) must behave like any other
// name, including those of Object.prototype members: no crash, no inherited values, no writes to
// shared objects.
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { checkMarkdown } from '../cli/check';
import { QuartileBlock } from '../markdown/QuartileBlock';
import { QuartileDocument } from '../markdown/QuartileDocument';
import { renderMarkdownBlocks } from '../server';
import { compileBlock } from './compile';
import { scanDocument } from './document';

const NAMES = [
  'constructor',
  '__proto__',
  'toString',
  'hasOwnProperty',
  'valueOf',
  'isPrototypeOf',
];

function untouched() {
  const probe = {} as Record<string, unknown>;
  expect(probe.label).toBeUndefined();
  expect(probe.format).toBeUndefined();
  expect((Object as unknown as Record<string, unknown>).label).toBeUndefined();
  expect((Object as unknown as Record<string, unknown>).format).toBeUndefined();
  expect(Object.getPrototypeOf(probe)).toBe(Object.prototype);
}

afterEach(untouched);

describe('names of Object.prototype members', () => {
  it.each(NAMES)('a data block named %s compiles, renders and is read by name', (name) => {
    const data = `data ${name}\n---\nregion,revenue\nEMEA,10\nAPAC,4\n`;
    const chart = `bar sum(revenue) by region\ndata: ${name}\n`;
    expect(compileBlock(data).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(compileBlock(`data ${name}\nsrc: /x.json\n`).diagnostics).toBeDefined();
    const scan = scanDocument(`\`\`\`quartile\n${data}\`\`\`\n\n\`\`\`quartile\n${chart}\`\`\`\n`);
    expect(scan.blocks[1].compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const { container } = render(
      <QuartileDocument>
        <QuartileBlock source={data} />
        <QuartileBlock source={chart} />
      </QuartileDocument>,
    );
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it.each(NAMES)('a chart over a dataset named %s that nobody defines reports it', (name) => {
    const errors = compileBlock(`bar sum(revenue) by region\ndata: ${name}\n`).diagnostics.filter(
      (d) => d.severity === 'error',
    );
    expect(errors.map((e) => e.message).join(' ')).toMatch(/no dataset/i);
  });

  it('field settings for a column named constructor stay on that column', () => {
    const block =
      'bar sum(a) by constructor\nconstructor.label: Maker\n---\nconstructor,a\nx,1\ny,2\n';
    expect(compileBlock(block).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const { container } = render(<QuartileBlock source={block} />);
    expect(container.textContent).toContain('x');
  });

  it('dashboard and view field settings named like prototype members write nothing shared', () => {
    for (const name of NAMES) {
      compileBlock(
        `dashboard\n${name}.format: percent\n${name}.label: Hi\nkpi sum(a)\n---\nb,a\nx,1\n`,
      );
      compileBlock(`bar sum(a) by b\n${name}.label: hi\n---\nb,a\nx,1\n`);
    }
  });

  it('the checker and the server renderer handle the same names', async () => {
    const md = NAMES.map(
      (n) =>
        `\`\`\`quartile\ndata ${n}\n---\nk,v\na,1\n\`\`\`\n\n\`\`\`quartile\nbar sum(v) by k\ndata: ${n}\n\`\`\`\n`,
    ).join('\n');
    expect(checkMarkdown(md).problems.filter((p) => p.severity === 'error')).toEqual([]);
    const rendered = await renderMarkdownBlocks(md, { timeZone: 'UTC' });
    expect(rendered.length).toBe(NAMES.length * 2);
  });
});
