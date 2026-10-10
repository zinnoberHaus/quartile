// @vitest-environment node
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  blockDataError,
  lineDataError,
} from '../../../apps/gallery/src/examples/studio/chart-data';
import {
  createZip,
  reactSource,
  starterFiles,
} from '../../../apps/gallery/src/examples/studio/export';
import {
  blockError,
  createBlock,
  parseProject,
  presetProject,
  projectLimit,
  type StudioProject,
} from '../../../apps/gallery/src/examples/studio/model';
import { normalizeSource, sourcePresets } from '../../../apps/gallery/src/examples/studio/sources';
import type { Dataset, Row } from '../src/data/types';

const custom = { kind: 'custom' as const, url: 'https://example.org/data.json' };
const basic = (): StudioProject => ({
  version: 1,
  name: 'My analysis',
  source: custom,
  blocks: [{ id: 'count', type: 'metric', title: 'Records', span: 6, aggregate: 'count' }],
});
const sourceText = (files: ReturnType<typeof starterFiles>, name: string) => {
  const file = files.find((file) => file.name === name);
  if (!file || typeof file.content !== 'string') throw new Error(`Missing source file: ${name}`);
  return file.content;
};

describe('Studio project boundary', () => {
  it('round-trips every preset with valid schema bindings and non-additive metric defaults', () => {
    for (const preset of sourcePresets) {
      const project = presetProject(preset.id);
      expect(parseProject(JSON.stringify(project))).toEqual(project);
      expect(project.blocks.map((block) => blockError(block, preset.fields))).toEqual(
        project.blocks.map(() => null),
      );
      expect(
        project.blocks.filter((block) => block.type === 'metric').map((block) => block.aggregate),
      ).toEqual(['count', 'mean']);
    }
  });
  it('rejects executable/unknown settings, unsafe keys, credential URLs and invalid versions', () => {
    const invalid: unknown[] = [
      { ...basic(), version: 2 },
      { ...basic(), rows: [{ value: 1 }] },
      { ...basic(), source: { ...custom, headers: { Authorization: 'secret' } } },
      { ...basic(), source: { ...custom, url: 'https://example.org/data?token=secret' } },
      { ...basic(), source: { ...custom, rowsPath: 'constructor.records' } },
      { ...basic(), blocks: [{ ...basic().blocks[0], onClick: 'alert(1)' }] },
      { ...basic(), blocks: [{ ...basic().blocks[0], type: 'script' }] },
      { ...basic(), blocks: [{ ...basic().blocks[0], span: 100 }] },
      { ...basic(), blocks: [{ ...basic().blocks[0], aggregate: 'eval' }] },
      { ...basic(), blocks: [{ ...basic().blocks[0], y: '__proto__' }] },
      { ...basic(), blocks: [{ ...basic().blocks[0], id: 'x" onclick="bad' }] },
      { ...basic(), blocks: [{ ...basic().blocks[0], columns: ['amount'] }] },
      JSON.parse(
        '{"version":1,"name":"Bad","source":{"kind":"weather"},"blocks":[],"__proto__":{"polluted":true}}',
      ),
      Object.assign(Object.create({ inherited: true }), basic()),
    ];
    for (const input of invalid) expect(() => parseProject(input)).toThrow();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('bounds IDs/components/columns and validates UTF-8 project bytes before applying', () => {
    const base = basic();
    expect(() => parseProject({ ...base, blocks: [base.blocks[0], base.blocks[0]] })).toThrow(
      'unique',
    );
    expect(() =>
      parseProject({
        ...base,
        blocks: Array.from({ length: 17 }, (_, index) => ({ ...base.blocks[0], id: `b${index}` })),
      }),
    ).toThrow('16');
    for (const columns of [
      [],
      ['value', 'value'],
      Array.from({ length: 65 }, (_, index) => `x${index}`),
    ]) {
      expect(() =>
        parseProject({
          ...base,
          blocks: [{ id: 'table', type: 'table', title: 'Rows', span: 12, columns }],
        }),
      ).toThrow();
    }
    expect(() => parseProject(' '.repeat(projectLimit + 1))).toThrow('64 KiB');
    expect(() => parseProject('é'.repeat(projectLimit / 2 + 1))).toThrow('64 KiB');
    expect(() => parseProject('{ not json }')).toThrow('valid JSON');
    const parsed = parseProject(base);
    parsed.blocks[0].title = 'Changed';
    expect(base.blocks[0].title).toBe('Records');
  });
  it('requires quantitative measures and continuous line/scatter axes, with schema-owned names', () => {
    const data = normalizeSource(custom, [{ amount: 4, other: 9, category: 'a', flag: true }]);
    const block = createBlock('line', data.schema, 'line');
    expect(block.color).toBeUndefined();
    expect(createBlock('bar', data.schema, 'bar').y).toBeUndefined();
    expect(blockError(block, data.schema)).toBeNull();
    expect(blockError({ ...block, y: 'category' }, data.schema)).toContain('quantitative');
    expect(blockError({ ...block, x: 'category' }, data.schema)).toContain(
      'temporal or quantitative',
    );
    expect(blockError({ ...block, color: 'amount' }, data.schema)).toContain('nominal or boolean');
    expect(blockError({ ...block, x: 'toString' }, data.schema)).toContain('loaded source');
    expect(
      blockError(
        { id: 'm', type: 'metric', title: 'Mean', span: 6, y: 'category', aggregate: 'mean' },
        data.schema,
      ),
    ).toContain('quantitative');
    expect(
      blockError({ id: 'm', type: 'metric', title: 'Count', span: 6, aggregate: 'count' }, {}),
    ).toBeNull();
    expect(
      blockError(
        { id: 't', type: 'table', title: 'Rows', span: 12, columns: ['missing'] },
        data.schema,
      ),
    ).toContain('loaded source');
  });
});

describe('Studio live-response validation', () => {
  it('rejects missing or changed measures and table fields while allowing a count to survive schema changes', () => {
    const original = normalizeSource(custom, [{ time: 1, amount: 4, category: 'A' }]);
    const changed = normalizeSource(custom, [{ time: 1, amount: 'unavailable', category: 'A' }]);
    const missing = normalizeSource(custom, [{ time: 1, category: 'A' }]);
    const line = { type: 'line', x: 'time', y: 'amount' };
    expect(blockDataError(original, line)).toBeNull();
    expect(blockDataError(changed, line)).toContain('quantitative');
    expect(blockDataError(missing, line)).toContain('loaded source');
    expect(blockDataError(missing, { type: 'table', columns: ['amount'] })).toContain(
      'loaded source',
    );
    expect(blockDataError(missing, { type: 'metric', aggregate: 'count' })).toBeNull();
  });
});

describe('Studio analysis grain', () => {
  it('rejects duplicate line X/series observations while allowing distinct series and ignoring absent x', () => {
    const data = normalizeSource(custom, [
      { year: 2020, country: 'A', value: 70 },
      { year: 2020, country: 'B', value: 80 },
      { year: null, country: 'A', value: 10 },
      { year: null, country: 'A', value: 20 },
    ]);
    expect(lineDataError(data, 'year')).toContain('Multiple records');
    expect(lineDataError(data, 'year', 'country')).toBeNull();
    const same = normalizeSource(custom, [
      { x: 1, group: true, y: 2 },
      { x: 1, group: 'true', y: 3 },
    ]);
    expect(lineDataError(same, 'x', 'group')).toContain('Multiple records');
  });
  it('compares temporal coordinates by instant so offset variants cannot be silently summed', () => {
    const data: Dataset<Row> = {
      kind: 'dataset',
      schema: { x: { name: 'x', type: 'temporal', label: 'Time', format: 'datetime' } },
      rows: [{ x: '2026-10-10T12:00:00Z' }, { x: '2026-10-10T08:00:00-04:00' }],
    };
    expect(lineDataError(data, 'x')).toContain('Multiple records');
  });
});

describe('native React source export', () => {
  it('keeps hostile labels/fields as escaped string literals and emits syntactically valid TSX', () => {
    const hostile =
      '</script><img src=x onerror=alert(1)>";globalThis.__studioPwned=true;//\u2028\u2029';
    const project: StudioProject = {
      ...basic(),
      name: hostile,
      blocks: [
        { id: 'metric', type: 'metric', title: hostile, span: 6, aggregate: 'mean', y: hostile },
        { id: 'line', type: 'line', title: hostile, span: 12, x: hostile, y: hostile },
        { id: 'table', type: 'table', title: hostile, span: 12, columns: [hostile] },
      ],
    };
    const unfinished = {
      ...project,
      blocks: [{ id: 'line', type: 'line' as const, title: 'Configure me', span: 12 as const }],
    };
    expect(() => reactSource(unfinished)).not.toThrow();
    const code = reactSource(project);
    expect(code).not.toContain('</script>');
    expect(code).not.toContain('<img');
    expect(code).not.toContain('\u2028');
    expect(code).not.toContain('\u2029');
    expect(code).toContain('\\u003c/script>');
    const output = ts.transpileModule(code, {
      fileName: 'App.tsx',
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    expect(
      output.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error),
    ).toEqual([]);
    const syntax = ts.createSourceFile(
      'App.tsx',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let recovered = false;
    let executableInjection = false;
    const walk = (node: ts.Node) => {
      if (ts.isStringLiteral(node) && node.text === hostile) recovered = true;
      if (ts.isPropertyAccessExpression(node) && node.name.text === '__studioPwned')
        executableInjection = true;
      ts.forEachChild(node, walk);
    };
    walk(syntax);
    expect(recovered).toBe(true);
    expect(executableInjection).toBe(false);
  });
  it('exports native components and the exact source/guard modules with a local preview tarball', () => {
    const project = presetProject('development');
    const runtime = '// exact data helper\nexport const marker = "runtime";\n';
    const chartRuntime = '// exact chart helper\nexport const marker = "chart";\n';
    const bytes = new Uint8Array([0x1f, 0x8b, 0, 255, 128]);
    const files = starterFiles(project, runtime, bytes, 'Apache license fixture', chartRuntime);
    const manifest = JSON.parse(sourceText(files, 'package.json'));
    expect(manifest.dependencies['@quartile/react']).toBe('file:vendor/quartile-react-0.1.0.tgz');
    expect(manifest.scripts.build).toContain('tsc --noEmit');
    expect(sourceText(files, 'src/quartile-data.ts')).toBe(runtime);
    expect(sourceText(files, 'src/quartile-chart.ts')).toBe(chartRuntime);
    expect(files.find((file) => file.name.startsWith('vendor/'))?.content).toEqual(bytes);
    expect(JSON.parse(sourceText(files, 'quartile-project.json'))).toEqual(project);
    const code = sourceText(files, 'src/App.tsx');
    expect(code).toContain('<LineChart');
    expect(code).toContain('<DataExplorer');
    expect(code).toContain('blockDataError');
    expect(code).toContain('children.props');
    expect(code).toContain('controller.abort()');
    expect(code).toContain('result.attribution');
    expect(code).toContain('result.warnings');
    expect(sourceText(files, 'README.md')).toContain('non-commercial');
    expect(files.some((file) => /\.env|records\.json|data\.json/.test(file.name))).toBe(false);
  });
});

describe('portable ZIP container', () => {
  it('writes standard headers, the known CRC-32 vector, and exact binary payloads', () => {
    const binary = new Uint8Array([0, 255, 128, 0, 42]);
    const zip = createZip([
      { name: 'check.txt', content: '123456789' },
      { name: 'vendor/package.tgz', content: binary },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    let central = view.getUint32(end + 16, true);
    const recovered = new Map<string, Uint8Array>();
    for (let index = 0; index < 2; index++) {
      expect(view.getUint32(central, true)).toBe(0x02014b50);
      expect(view.getUint16(central + 10, true)).toBe(0); // Stored, no deflate dependency.
      const nameLength = view.getUint16(central + 28, true);
      const name = new TextDecoder().decode(zip.slice(central + 46, central + 46 + nameLength));
      const size = view.getUint32(central + 24, true);
      const local = view.getUint32(central + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      expect(view.getUint32(local + 14, true)).toBe(view.getUint32(central + 16, true));
      if (name === 'check.txt') expect(view.getUint32(central + 16, true)).toBe(0xcbf43926);
      const start =
        local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      recovered.set(name, zip.slice(start, start + size));
      central +=
        46 + nameLength + view.getUint16(central + 30, true) + view.getUint16(central + 32, true);
    }
    expect(central).toBe(end);
    expect(new TextDecoder().decode(recovered.get('check.txt'))).toBe('123456789');
    expect(recovered.get('vendor/package.tgz')).toEqual(binary);
  });
  it('rejects path traversal, absolute paths, backslashes, controls and duplicate names', () => {
    for (const name of [
      '../escape',
      'a/../../escape',
      '/absolute',
      'C:\\file',
      'bad\nname',
      'a\\b',
    ])
      expect(() => createZip([{ name, content: 'x' }])).toThrow('Unsafe');
    expect(() =>
      createZip([
        { name: 'same', content: '1' },
        { name: 'same', content: '2' },
      ]),
    ).toThrow('duplicate');
  });
});
