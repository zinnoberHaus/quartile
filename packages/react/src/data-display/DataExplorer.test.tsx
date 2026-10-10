import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { dataset } from '../data/schema';
import { Selection, type SelectionApi, useSelection } from '../selection/Selection';
import { DataExplorer, type DataExplorerExport } from './DataExplorer';
import { DataTable, type DataTableColumn } from './DataTable';
import { createTableViewState, serializeTableViewState } from './explorer-model';
import { KPI } from './KPI';
import type { DataTableEdit } from './TableCellEditor';

const rows = [
  { id: 'a', name: 'Alpha', team: 'A', score: 10, approved: true },
  { id: 'b', name: 'Beta', team: 'B', score: 20, approved: false },
  { id: 'c', name: 'Gamma', team: 'A', score: 30, approved: true },
  { id: 'd', name: 'Delta', team: 'B', score: 40, approved: false },
];
const columns: DataTableColumn[] = [
  { field: 'name', label: 'Name', editable: true },
  { field: 'team', label: 'Team' },
  {
    field: 'score',
    label: 'Score',
    format: 'number',
    aggregate: 'mean',
    editable: {
      type: 'number',
      validate: (v) => (typeof v === 'number' && v < 0 ? 'Score must be nonnegative.' : undefined),
    },
  },
  { field: 'approved', label: 'Approved', editable: { type: 'boolean' } },
];
const bodyText = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent);

function Probe({ onApi }: { onApi: (api: SelectionApi) => void }) {
  const api = useSelection();
  useEffect(() => onApi(api));
  return null;
}

describe('DataExplorer interactions', () => {
  it('seeds uncontrolled column pins but respects explicit default and controlled view overrides', () => {
    const pinned: DataTableColumn[] = [
      { field: 'name', label: 'Name', width: 150, pinned: 'left' },
      { field: 'score', label: 'Score', width: 120, pinned: 'right' },
    ];
    const a = render(<DataExplorer data={rows} columns={pinned} rowKey="id" />);
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('data-pinned')).toBe(
      'left',
    );
    expect(screen.getByRole('columnheader', { name: 'Score' }).getAttribute('data-pinned')).toBe(
      'right',
    );
    a.unmount();
    const b = render(
      <DataExplorer
        data={rows}
        columns={pinned}
        rowKey="id"
        defaultView={{ pinnedColumns: { left: [], right: [] } }}
      />,
    );
    expect(
      screen.getByRole('columnheader', { name: 'Name' }).getAttribute('data-pinned'),
    ).toBeNull();
    b.unmount();
    render(<DataExplorer data={rows} columns={pinned} rowKey="id" view={createTableViewState()} />);
    expect(
      screen.getByRole('columnheader', { name: 'Name' }).getAttribute('data-pinned'),
    ).toBeNull();
  });

  it('keeps filtered group values and export aligned while publishing only the selected group', () => {
    let api: SelectionApi | undefined;
    let exported: DataExplorerExport | undefined;
    const input = [
      { id: 'a', team: 'A', region: 'East', score: 10 },
      { id: 'b', team: 'A', region: 'East', score: 30 },
      { id: 'c', team: 'A', region: 'West', score: 900 },
      { id: 'd', team: 'B', region: 'East', score: 50 },
    ];
    render(
      <Selection>
        <Probe
          onApi={(value) => {
            api = value;
          }}
        />
        <DataExplorer
          id="filtered-groups"
          data={input}
          rowKey="id"
          select="id"
          columns={[
            { field: 'team' },
            { field: 'region' },
            { field: 'score', key: 'mean', aggregate: 'mean' },
          ]}
          defaultView={{
            groupBy: 'team',
            pageSize: 1,
            sorts: [{ key: 'mean', desc: true }],
            filters: [{ field: 'score', type: 'number', op: 'gte', value: 20 }],
          }}
          onExport={(value) => {
            exported = value;
          }}
        />
        <KPI data={input} value="score" label="Shared population" format="number" />
      </Selection>,
    );
    act(() => api?.set('region', 'East', { source: 'region-control' }));
    expect(screen.getByText('2 of 4 source rows · 2 groups · read-only')).toBeTruthy();
    // Table-local score filter is excluded from the sibling KPI's denominator.
    expect(screen.getByRole('group', { name: 'Shared population' }).textContent).toContain('90');
    fireEvent.click(within(screen.getByRole('grid')).getAllByRole('row')[1]);
    expect(api?.get('team')).toMatchObject({ value: ['B'], source: 'filtered-groups' });
    expect(api?.get('id')).toBeUndefined();
    expect(screen.getByRole('group', { name: 'Shared population' }).textContent).toContain('50');
    // The table excludes its own B predicate, retaining both selectable groups in export.
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exported?.rows.map((row) => [row.team, row.mean])).toEqual([
      ['B', 50],
      ['A', 30],
    ]);
    expect(exported?.csv.split('\r\n')).toHaveLength(3);
  });

  it('controls a saved view and resets its page when search changes', () => {
    let current = createTableViewState({ page: 1, pageSize: 2 });
    function Harness() {
      const [view, setView] = useState(current);
      return (
        <DataExplorer
          data={rows}
          columns={columns}
          rowKey="id"
          view={view}
          onViewChange={(next) => {
            current = next;
            setView(next);
          }}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText('3–4 of 4 rows')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search rows' }), {
      target: { value: 'Gamma' },
    });
    expect(current.page).toBe(0);
    expect(bodyText()).toHaveLength(1);
    expect(bodyText()[0]).toContain('Gamma');
    expect(screen.getByText('1 of 4 source rows')).toBeTruthy();
  });

  it('builds a typed numeric filter with real controls and can remove it', () => {
    render(<DataExplorer data={rows} columns={columns} rowKey="id" />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Field' }), {
      target: { value: 'score' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Condition' }), {
      target: { value: 'gte' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Value' }), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
    expect(bodyText()).toHaveLength(2);
    expect(bodyText().join(' ')).toContain('Gamma');
    expect(bodyText().join(' ')).not.toContain('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 1' }));
    expect(bodyText()).toHaveLength(4);
  });

  it('orders, hides, pins and resizes columns through view state', () => {
    let latest = createTableViewState();
    render(
      <DataExplorer
        data={rows}
        columns={columns}
        rowKey="id"
        onViewChange={(v) => {
          latest = v;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Columns · 4/4' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Approved' }));
    expect(screen.queryByRole('columnheader', { name: 'Approved' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Move Name right' }));
    expect(latest.columnOrder.slice(0, 2)).toEqual(['team', 'name']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Pin Name' }), {
      target: { value: 'left' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width of Name' }), {
      target: { value: '220' },
    });
    expect(latest.pinnedColumns.left).toEqual(['name']);
    expect(latest.columnWidths.name).toBe(220);
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('Name');
    expect(screen.getAllByRole('columnheader')[0].getAttribute('data-pinned')).toBe('left');
  });

  it('groups into configured aggregates and makes grouped rows read-only', () => {
    const edit = vi.fn();
    render(<DataExplorer data={rows} columns={columns} rowKey="id" onCellEdit={edit} />);
    expect(screen.getAllByRole('button', { name: /^Edit Score, row/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Group' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Group by' }), {
      target: { value: 'team' },
    });
    expect(bodyText()).toHaveLength(2);
    expect(bodyText()[0]).toContain('20');
    expect(bodyText()[1]).toContain('30');
    expect(screen.getByText('4 of 4 source rows · 2 groups · read-only')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit Score, row/ })).toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });

  it('validates edits, applies caller-owned updates, and does not publish row selection from editor buttons', async () => {
    const edits: DataTableEdit[] = [];
    let api: SelectionApi | undefined;
    function Harness() {
      const [data, setData] = useState(rows);
      return (
        <Selection>
          <Probe
            onApi={(a) => {
              api = a;
            }}
          />
          <DataExplorer
            data={data}
            columns={columns}
            rowKey="id"
            select="id"
            onCellEdit={(edit) => {
              edits.push(edit);
              setData((old) =>
                old.map((r) => (r.id === edit.row.id ? { ...r, [edit.field]: edit.value } : r)),
              );
            }}
          />
        </Selection>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit Score, row/ })[0]);
    const input = await screen.findByRole('spinbutton', { name: 'Score' });
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Score must be nonnegative.',
    );
    expect(edits).toHaveLength(0);
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      field: 'score',
      columnKey: 'score',
      previousValue: 10,
      value: 45,
      row: { id: 'a' },
    });
    expect(bodyText()[0]).toContain('45');
    expect(api?.predicates).toEqual([]);
    expect(rows[0].score).toBe(10);
  });

  it('shows rejected edits and lets the user cancel without claiming a saved value', async () => {
    const edit = vi.fn().mockRejectedValue(new Error('Record changed on the server.'));
    render(<DataExplorer data={rows} columns={columns} rowKey="id" onCellEdit={edit} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit Name, row/ })[0]);
    const input = await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    expect(await screen.findByText('Record changed on the server.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bodyText()[0]).toContain('Alpha');
  });

  it('retains crossfilter source exclusion while reacting to predicates from another view', () => {
    let api: SelectionApi | undefined;
    render(
      <Selection id="table-crossfilter">
        <Probe
          onApi={(a) => {
            api = a;
          }}
        />
        <DataExplorer data={rows} columns={columns} rowKey="id" select="id" />
        <KPI data={rows} value="score" label="Linked score" format="number" />
      </Selection>,
    );
    const grid = screen.getByRole('grid');
    fireEvent.click(within(grid).getAllByRole('row')[1]);
    expect(within(grid).getAllByRole('row')).toHaveLength(5);
    expect(screen.getByRole('group', { name: 'Linked score' }).textContent).toContain('10');
    act(() => api?.set('team', 'B', { source: 'chart' }));
    expect(within(grid).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('2 of 4 source rows')).toBeTruthy();
    expect(within(grid).getAllByRole('row')[1].textContent).toContain('Beta');
  });

  it('publishes the grouping field for a grouped row instead of its first source-record identity', () => {
    let api: SelectionApi | undefined;
    render(
      <Selection>
        <Probe
          onApi={(a) => {
            api = a;
          }}
        />
        <DataExplorer
          data={rows}
          columns={columns}
          rowKey="id"
          select="id"
          defaultView={{ groupBy: 'team' }}
        />
        <KPI data={rows} value="score" label="Group score" format="number" />
      </Selection>,
    );
    fireEvent.click(within(screen.getByRole('grid')).getAllByRole('row')[2]);
    expect(api?.get('team')).toMatchObject({ value: ['B'] });
    expect(api?.get('id')).toBeUndefined();
    expect(screen.getByRole('group', { name: 'Group score' }).textContent).toContain('60');
  });

  it('exports all matching rows in view order, omitting hidden columns and ignoring pagination', () => {
    let exported: DataExplorerExport | undefined;
    render(
      <DataExplorer
        data={rows}
        columns={columns}
        rowKey="id"
        defaultView={{
          pageSize: 1,
          page: 1,
          hiddenColumns: ['approved'],
          sorts: [{ key: 'score', desc: true }],
          filters: [{ field: 'score', type: 'number', op: 'gte', value: 20 }],
        }}
        onExport={(e) => {
          exported = e;
        }}
      />,
    );
    expect(bodyText()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exported?.rows.map((r) => r.name)).toEqual(['Delta', 'Gamma', 'Beta']);
    expect(exported?.csv).not.toContain('Approved');
    expect(exported?.csv.split('\r\n')).toHaveLength(4);
    expect(screen.getByText('Exported 3 rows.')).toBeTruthy();
  });

  it('loads a saved view without changing records and rejects malformed imports', () => {
    render(<DataExplorer data={rows} columns={columns} rowKey="id" />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    const input = screen.getByRole('textbox', { name: 'View JSON' });
    fireEvent.change(input, {
      target: {
        value: serializeTableViewState(
          createTableViewState({ search: 'Gamma', hiddenColumns: ['approved'] }),
        ),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load view' }));
    expect(bodyText()).toHaveLength(1);
    expect(bodyText()[0]).toContain('Gamma');
    fireEvent.change(input, { target: { value: '{"version":999}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load view' }));
    expect(screen.getByText('Expected table view version 1.')).toBeTruthy();
    expect(bodyText()).toHaveLength(1);
    expect(rows).toHaveLength(4);
  });
});

describe('additive DataTable behavior', () => {
  it('reports the value seen when editing began, so callers can detect concurrent updates', async () => {
    const edit = vi.fn();
    const props = { columns, rowKey: 'id', onCellEdit: edit };
    const { rerender } = render(<DataTable {...props} data={rows.slice(0, 1)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit Score, row/ }));
    const input = await screen.findByRole('spinbutton', { name: 'Score' });
    fireEvent.change(input, { target: { value: '45' } });
    rerender(<DataTable {...props} data={[{ ...rows[0], score: 25 }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit.mock.calls[0][0]).toMatchObject({
      previousValue: 10,
      value: 45,
      row: { score: 10 },
    });
  });

  it('allows dismissal of a pending edit without cancelling or duplicating the caller update', async () => {
    let finish: (() => void) | undefined;
    const edit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<DataTable data={rows.slice(0, 1)} columns={columns} rowKey="id" onCellEdit={edit} />);
    const trigger = screen.getByRole('button', { name: /^Edit Score, row/ });
    fireEvent.click(trigger);
    const input = await screen.findByRole('spinbutton', { name: 'Score' });
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => finish?.());
    fireEvent.click(trigger);
    expect(await screen.findByRole('spinbutton', { name: 'Score' })).toBeTruthy();
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('shift-click adds a stable multi-sort priority while normal click replaces it', () => {
    const data = [
      { team: 'A', score: 1 },
      { team: 'B', score: 4 },
      { team: 'A', score: 3 },
    ];
    render(
      <DataTable
        data={data}
        columns={[{ field: 'team' }, { field: 'score' }]}
        defaultSorts={[{ key: 'team', desc: false }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Score' }), { shiftKey: true });
    expect(bodyText()).toEqual(['A3', 'A1', 'B4']);
    expect(screen.getByRole('columnheader', { name: /Score/ }).textContent).toContain(
      'Sort priority 2',
    );
    fireEvent.click(screen.getByRole('button', { name: /Score/ }));
    expect(bodyText()).toEqual(['A1', 'A3', 'B4']);
  });

  it('clamps a controlled page when the source becomes smaller', async () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <DataTable data={rows} columns={columns} page={1} pageSize={2} onPageChange={onPageChange} />,
    );
    rerender(
      <DataTable
        data={rows.slice(0, 1)}
        columns={columns}
        page={1}
        pageSize={2}
        onPageChange={onPageChange}
      />,
    );
    expect(bodyText()).toHaveLength(1);
    await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(0));
    expect(screen.getByText('1–1 of 1 rows')).toBeTruthy();
  });

  it('does not enable editable cells without stable row identity and a controlled update handler', () => {
    render(<DataTable data={rows} columns={columns} onCellEdit={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
  });

  it('preserves nominal temporal-looking row identities in a typed selectable table', () => {
    let api: SelectionApi | undefined;
    const data = dataset(
      [
        { id: '2026-01-01', v: 1 },
        { id: new Date('2026-01-01'), v: 2 },
      ],
      { id: { type: 'nominal' } },
    );
    render(
      <Selection>
        <Probe
          onApi={(a) => {
            api = a;
          }}
        />
        <DataTable data={data} columns={[{ field: 'v' }]} rowKey="id" select="id" typedSelection />
      </Selection>,
    );
    const items = screen.getAllByRole('row').slice(1);
    fireEvent.click(items[0]);
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    expect(items[1].getAttribute('aria-selected')).toBe('false');
    expect(api?.get('id')).toMatchObject({ value: ['2026-01-01'] });
  });
});
