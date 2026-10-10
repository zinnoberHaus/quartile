import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactSource, starterFiles } from '../../../apps/gallery/src/examples/studio/export';
import { FormattingInspector } from '../../../apps/gallery/src/examples/studio/FormattingInspector';
import {
  applyFormatting,
  parseFormatting,
} from '../../../apps/gallery/src/examples/studio/formatting';
import { parseProject, presetProject } from '../../../apps/gallery/src/examples/studio/model';
import { normalizeSource } from '../../../apps/gallery/src/examples/studio/sources';
import { makeFieldFormatter } from '../src/data/format';

afterEach(cleanup);
const source = normalizeSource({ kind: 'custom', url: 'https://example.org/data.json' }, [
  { count: 1234.56789, time: '2026-10-10T01:00:00Z' },
]);
const formatting = parseFormatting({
  locale: 'de-DE',
  timeZone: 'UTC',
  fields: {
    count: {
      format: { type: 'number', notation: 'scientific', maximumFractionDigits: 3 },
      axisFormat: 'compact',
      tooltipFormat: { type: 'number', maximumFractionDigits: 5 },
      description: 'Observed quantity',
      unit: 'COUNT',
    },
    time: {
      timeZone: 'Pacific/Honolulu',
      format: { type: 'date', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    },
  },
});

describe('Studio formatting project boundary', () => {
  it('round-trips metadata and preserves exact raw values and row identity', () => {
    const project = parseProject({ ...presetProject('weather'), formatting });
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    const overlay = applyFormatting(source, project.formatting);
    expect(overlay.rows).toBe(source.rows);
    expect(overlay.rows[0].count).toBe(1234.56789);
    expect(overlay.schema).not.toBe(source.schema);
    expect(source.schema.count.description).toBeUndefined();
    expect(
      makeFieldFormatter(overlay.schema.count, { locale: formatting.locale })(source.rows[0].count),
    ).toBe('1,235E3');
    expect(makeFieldFormatter(overlay.schema.time, { timeZone: 'UTC' })(source.rows[0].time)).toBe(
      '15:00',
    );
    expect(applyFormatting(source)).toBe(source);
    project.formatting!.fields!.count.description = 'Changed';
    expect(formatting.fields!.count.description).toBe('Observed quantity');
  });
  it('rejects unsafe/executable/unknown settings and invalid Intl options before applying', () => {
    for (const bad of [
      { locale: 'invalid_locale' },
      { timeZone: 'Moon/Crater' },
      { fields: { count: { format: () => 'executed' } } },
      {
        fields: {
          count: { format: { type: 'number', minimumFractionDigits: 8, maximumFractionDigits: 2 } },
        },
      },
      { fields: { count: { format: { type: 'date', timeZone: 'Moon/Crater' } } } },
      { fields: { count: { currency: 'EURO' } } },
      { fields: { count: { type: 'nominal' } } },
      JSON.parse('{"fields":{"__proto__":{"format":"currency"}}}'),
      { fields: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`x${i}`, {}])) },
    ])
      expect(() => parseProject({ ...presetProject('weather'), formatting: bad })).toThrow();
    expect(Object.prototype).not.toHaveProperty('format');
  });
  it('exports provider settings and schema overrides without mutating source adapters or serializing records', () => {
    const project = parseProject({ ...presetProject('weather'), formatting });
    const code = reactSource(project);
    expect(code).toContain('locale={"de-DE"} timeZone={"UTC"}');
    expect(code).toContain('const fieldFormatting: Record<string, Partial<FieldDef>>');
    expect(code).toContain('setResult(formatSource(next))');
    expect(code).not.toContain('1234.56789');
    const files = starterFiles(
      project,
      '// source adapter',
      new Uint8Array([1]),
      'license',
      '// chart guard',
    );
    expect(files.find((file) => file.name === 'src/quartile-data.ts')?.content).toBe(
      '// source adapter',
    );
    expect(
      JSON.parse(files.find((file) => file.name === 'quartile-project.json')!.content as string)
        .formatting,
    ).toEqual(formatting);
  });
});

it('only applies valid field drafts; numeric precision becomes an explicit serializable descriptor', () => {
  const onChange = vi.fn();
  const { rerender } = render(<FormattingInspector schema={source.schema} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Formatting field'), { target: { value: 'count' } });
  fireEvent.change(screen.getByLabelText('Format preset'), { target: { value: 'scientific' } });
  fireEvent.change(screen.getByLabelText('Decimal places'), { target: { value: '3' } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply field formatting' }));
  const applied = onChange.mock.calls[0][0];
  expect(applied.fields.count.format).toEqual({
    type: 'number',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    notation: 'scientific',
  });
  rerender(<FormattingInspector schema={source.schema} formatting={applied} onChange={onChange} />);
  const before = onChange.mock.calls.length;
  fireEvent.change(screen.getByLabelText('Field formatting JSON'), {
    target: { value: '{"format":{"type":"number","notation":"nope"}}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply field JSON' }));
  expect(screen.getByRole('alert').textContent).toContain('Not applied');
  expect(onChange).toHaveBeenCalledTimes(before);
  fireEvent.change(screen.getByLabelText('Field formatting JSON'), {
    target: { value: '{"format":"duration","description":"Elapsed milliseconds"}' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply field JSON' }));
  expect(onChange.mock.lastCall?.[0].fields.count).toEqual({
    format: 'duration',
    description: 'Elapsed milliseconds',
  });
});
