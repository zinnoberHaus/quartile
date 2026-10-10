import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Delta, describeDelta } from '../components/display/delta/Delta';
import { dataset } from '../data/schema';
import { QuartileProvider } from '../provider/QuartileProvider';
import { Selection, type SelectionApi, useSelection } from '../selection/Selection';
import { DataExplorer, type DataExplorerExport } from './DataExplorer';
import { DataTable, type DataTableColumn } from './DataTable';
import { tableToCSV } from './explorer-model';
import { FilterBar } from './FilterBar';
import { KPI } from './KPI';

function Probe({ ready }: { ready: (api: SelectionApi) => void }) {
  const api = useSelection();
  useEffect(() => ready(api));
  return null;
}

describe('field formatting across analytical displays', () => {
  it('sizes automatic number tracks for detailed labels and retains full text on constrained tracks', () => {
    const data = dataset([{ concentration: 0.00001234 }], {
      concentration: { format: { type: 'number', notation: 'scientific', suffix: ' mol/L' } },
    });
    const { container, rerender } = render(
      <DataTable data={data} columns={[{ field: 'concentration' }]} />,
    );
    const cell = container.querySelector('.q-dt-num')!;
    expect(cell.textContent).toBe('1.234E-5 mol/L');
    expect(
      Number.parseFloat(
        (screen.getByRole('table') as HTMLElement).style.getPropertyValue('--q-dt-cols'),
      ),
    ).toBeGreaterThan(100);
    rerender(<DataTable data={data} columns={[{ field: 'concentration', width: 60 }]} />);
    expect((screen.getByRole('table') as HTMLElement).style.getPropertyValue('--q-dt-cols')).toBe(
      '60px',
    );
    expect(container.querySelector('.q-dt-num')?.getAttribute('title')).toBe('1.234E-5 mol/L');
  });
  it('uses field currency and time zone for primary, secondary and grouped table values', () => {
    const data = dataset([{ group: 'a', amount: 123456.78, instant: '2026-10-10T01:00:00Z' }], {
      group: { format: (value) => `Group ${value}` },
      amount: { format: 'currency', currency: 'EUR' },
      instant: {
        format: { type: 'date', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
        timeZone: 'UTC',
      },
    });
    const { container } = render(
      <QuartileProvider locale="de-DE" timeZone="America/New_York">
        <DataTable
          data={data}
          groupBy="group"
          columns={[
            { field: 'group', secondary: 'instant' },
            { field: 'amount', aggregate: 'sum' },
          ]}
        />
      </QuartileProvider>,
    );
    const row = screen.getAllByRole('row')[1];
    expect(row.textContent).toContain('Group a');
    expect(container.querySelector('.q-dt-secondary')?.textContent).toBe('01:00');
    expect(row.textContent).toContain(
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(123456.78),
    );
  });

  it('uses value format rather than tooltip/axis formats and honors column overrides', () => {
    const data = dataset([{ value: 0.000123 }], {
      value: {
        format: { type: 'number', notation: 'scientific' },
        axisFormat: () => 'AXIS',
        tooltipFormat: () => 'TOOLTIP',
      },
    });
    const { rerender } = render(<DataTable data={data} columns={[{ field: 'value' }]} />);
    expect(screen.getAllByRole('row')[1].textContent).toBe('1.23E-4');
    rerender(<DataTable data={data} columns={[{ field: 'value', format: (v) => `exact:${v}` }]} />);
    expect(screen.getAllByRole('row')[1].textContent).toBe('exact:0.000123');
  });

  it('exposes a field description on keyboard focus and permits a column-specific explanation', async () => {
    const data = dataset([{ score: 0.8 }], {
      score: { description: 'Model probability before calibration.' },
    });
    const { rerender } = render(<DataTable data={data} columns={[{ field: 'score' }]} />);
    const header = screen.getByRole('columnheader');
    expect(document.getElementById(header.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Model probability before calibration.',
    );
    act(() => within(header).getByRole('button').focus());
    await waitFor(() =>
      expect(screen.getByRole('tooltip').textContent).toContain(
        'Model probability before calibration.',
      ),
    );
    rerender(
      <DataTable
        data={data}
        columns={[{ field: 'score', description: 'Probability in this cohort.', sortable: false }]}
      />,
    );
    const label = screen.getByText('Score');
    expect(label.getAttribute('tabindex')).toBe('0');
    act(() => label.focus());
    await waitFor(() =>
      expect(screen.getByRole('tooltip').textContent).toContain('Probability in this cohort.'),
    );
  });

  it('keeps counts unitless and recognizes Intl percentage formats for point deltas', () => {
    const data = dataset([{ amount: 10, rate: 0.2, previous: 0.1 }], {
      rate: { format: { type: 'number', style: 'percent' } },
    });
    const { container, rerender } = render(
      <KPI data={data} value="amount" aggregate="count" label="Records" />,
    );
    expect(container.querySelector('.q-kpi-unit')).toBeNull();
    expect(container.querySelector('.q-kpi-value')?.textContent).toBe('1');
    rerender(<KPI data={data} value="amount" aggregate="count" label="Records" unit="COUNT" />);
    expect(container.querySelector('.q-kpi-unit')?.textContent).toBe('COUNT');
    rerender(
      <QuartileProvider locale="de-DE">
        <KPI data={data} value="rate" compareValue="previous" label="Rate" />
      </QuartileProvider>,
    );
    expect(container.querySelector('.q-dd-delta')?.textContent).toBe('+10,00 pt');
    expect(container.querySelector('.q-dd-delta')?.getAttribute('data-tone')).toBe('positive');
  });

  it('localizes target progress and keeps progressbar values within its declared range', () => {
    const { rerender } = render(
      <QuartileProvider locale="de-DE">
        <KPI label="Completed" value={125} target={{ value: 100 }} />
      </QuartileProvider>,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe(
      `${new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 }).format(1.25)} of target`,
    );
    rerender(<KPI label="Completed" value={2} target={{ value: Infinity, expected: NaN }} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('preserves tiny changes with configured delta precision in KPI variants and table cells', () => {
    const { container, rerender } = render(
      <QuartileProvider locale="ar-EG">
        <KPI label="Measurement" value={1} delta={0.00000123} deltaDigits={4} />
        <KPI
          label="Period comparison"
          compare={{ current: 1, previous: 1 }}
          delta={0.00000123}
          deltaDigits={4}
        />
        <DataTable
          data={[{ change: -0.00000123 }]}
          columns={[{ field: 'change', cell: 'delta', deltaDigits: 4 }]}
        />
      </QuartileProvider>,
    );
    const pills = container.querySelectorAll('.q-dd-delta');
    expect(pills).toHaveLength(3);
    for (const pill of [pills[0], pills[1]]) {
      expect(pill.textContent).toContain('+٠٫٠٠٠١');
      expect(pill.getAttribute('data-tone')).toBe('positive');
    }
    expect(pills[2].textContent).toContain('−٠٫٠٠٠١');
    expect(pills[2].getAttribute('data-tone')).toBe('negative');
    rerender(<KPI label="Measurement" value={1} delta={0.00000123} />);
    expect(container.querySelector('.q-dd-delta')?.textContent).toBe('±0.0%');
    expect(container.querySelector('.q-dd-delta')?.getAttribute('data-tone')).toBe('neutral');
  });

  it('localizes delta labels without deriving tone from localized numerals or dropping bidi signs', () => {
    const { container, rerender } = render(
      <QuartileProvider locale="ar-EG">
        <Delta value={0.125} variant="arrow" />
      </QuartileProvider>,
    );
    const delta = container.querySelector('.q-delta')!;
    expect(delta.getAttribute('data-tone')).toBe('positive');
    const visual = delta.querySelector('[aria-hidden="true"]')!.textContent!;
    expect(visual).toContain('١٢٫٥');
    expect(visual).not.toContain('+');
    expect(delta.querySelector('.q-visually-hidden')?.textContent).toBe(
      describeDelta(0.125, 'percent', { locale: 'ar-EG' }).text,
    );
    rerender(
      <QuartileProvider locale="ar-EG">
        <KPI label="Count" compare={{ current: 125, previous: 100 }} />
      </QuartileProvider>,
    );
    expect(container.querySelector('.q-dd-delta')?.getAttribute('data-tone')).toBe('positive');
    for (const value of [NaN, Infinity, -Infinity, 1e308])
      expect(describeDelta(value)).toMatchObject({ text: '—', direction: 'flat', tone: 'neutral' });
  });

  it('uses provider locale for selection chips and their generated menu options', () => {
    const data = dataset([{ amount: 1234.5 }], { amount: { format: 'currency', currency: 'EUR' } });
    let api!: SelectionApi;
    render(
      <QuartileProvider locale="de-DE">
        <Selection>
          <Probe
            ready={(value) => {
              api = value;
            }}
          />
          <FilterBar data={data} fields={[{ field: 'amount' }]} />
        </Selection>
      </QuartileProvider>,
    );
    act(() => api.set('amount', 1234.5, { source: 'test', op: 'eq' }));
    const expected = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
      1234.5,
    );
    expect(screen.getByRole('button', { name: `Amount${expected}` }).textContent).toContain(
      expected,
    );
    fireEvent.click(screen.getByRole('button', { name: `Amount${expected}` }));
    expect(screen.getByRole('menuitemcheckbox').textContent).toContain(expected);
  });
});

describe('explicit CSV display mode', () => {
  it('uses the field value format for delta columns rather than their pill precision or percent scale', () => {
    const data = dataset([{ change: 0.00000123 }], {
      change: { format: { type: 'number', notation: 'scientific' } },
    });
    const columns: DataTableColumn[] = [{ field: 'change', cell: 'delta', deltaDigits: 4 }];
    expect(
      tableToCSV(data.rows, columns, {
        mode: 'formatted',
        schema: data.schema,
      }),
    ).toContain('"1.23E-6"');
  });

  it('preserves raw values by default and applies field/column formats only on request', () => {
    const data = dataset([{ group: 'a', amount: 1234.5, instant: '2026-10-10T01:00:00Z' }], {
      group: { format: (v) => `Group ${v}` },
      amount: { format: 'currency', currency: 'EUR' },
      instant: {
        format: { type: 'date', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
        timeZone: 'UTC',
      },
    });
    const columns = [{ field: 'group' }, { field: 'amount' }, { field: 'instant' }];
    const raw = tableToCSV(data.rows, columns);
    expect(raw).toContain('"a","1234.5","2026-10-10T01:00:00Z"');
    const display = tableToCSV(data.rows, columns, {
      mode: 'formatted',
      schema: data.schema,
      locale: 'de-DE',
      timeZone: 'America/New_York',
    });
    expect(display).toContain('"Group a"');
    expect(display).toContain(
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5),
    );
    expect(display).toContain('"01:00"');
    expect(
      tableToCSV(data.rows, [{ field: 'amount', format: () => 'OVERRIDE' }], {
        mode: 'formatted',
        schema: data.schema,
      }),
    ).toContain('"OVERRIDE"');
  });

  it('escapes formula-like strings emitted by formatters as well as raw strings', () => {
    const columns = [{ field: 'value', format: () => '\t=HYPERLINK("https://example.com")' }];
    const csv = tableToCSV([{ value: 3 }], columns, { mode: 'formatted' });
    expect(csv).toContain('"\'\t=HYPERLINK(""https://example.com"")"');
    expect(tableToCSV([{ value: '=1+1' }], [{ field: 'value' }])).toContain('"\'=1+1"');
    expect(tableToCSV([{ value: new Date(NaN) }], [{ field: 'value' }])).toBe('"value"\r\n""');
  });

  it('exports every grouped result using requested display mode and count formatting', () => {
    let exported: DataExplorerExport | undefined;
    const data = dataset(
      [
        { group: 'a', amount: 2 },
        { group: 'a', amount: 3 },
      ],
      { group: { format: (v) => `Group ${v}` } },
    );
    render(
      <DataExplorer
        data={data}
        rowKey="group"
        defaultView={{ groupBy: 'group' }}
        csvFormat="formatted"
        columns={[{ field: 'group' }, { field: 'amount', aggregate: 'count' }]}
        onExport={(value) => {
          exported = value;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exported?.csv).toContain('"Group a","2"');
    expect(exported?.rows).toHaveLength(1);
  });
});
