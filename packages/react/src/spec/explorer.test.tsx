import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileBlock } from '../lang/compile';
import { QuartileBlock } from '../markdown/QuartileBlock';
import { QuartileDocument } from '../markdown/QuartileDocument';
import { renderBlockToHTML } from '../server';
import { SpecView } from './SpecView';
import type { ComponentSpec, DashboardSpec } from './schema';
import { validateSpec } from './validate';

const csv =
  'region,product,amount\nEMEA,Desk,120\nAPAC,Lamp,80\nEMEA,Chair,40\nAmericas,Shelf,200\n';
const orders = [
  { region: 'EMEA', product: 'Desk', amount: 120 },
  { region: 'APAC', product: 'Lamp', amount: 80 },
  { region: 'EMEA', product: 'Chair', amount: 40 },
  { region: 'Americas', product: 'Shelf', amount: 200 },
];
const errors = (c: ReturnType<typeof compileBlock>) =>
  c.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
/** First cell of each body row of the explorer's table. */
const products = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.children[1]?.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('explorer blocks', () => {
  it('compile to a DataExplorer spec, under any of the kind’s names', () => {
    const c = compileBlock(
      `explorer region, product, amount\ntitle: Orders\npage size: 2\nsort: -amount\nexport: no\n---\n${csv}`,
    );
    expect(errors(c)).toEqual([]);
    expect(c.spec).toEqual({
      component: 'DataExplorer',
      title: 'Orders',
      pageSize: 2,
      sort: '-amount',
      export: false,
      columns: [{ field: 'region' }, { field: 'product' }, { field: 'amount' }],
      data: 'data',
    });
    for (const word of ['explore', 'dataexplorer', 'Data Explorer', 'data-explorer']) {
      const other = compileBlock(`${word}\n---\n${csv}`);
      expect(errors(other)).toEqual([]);
      // Without named columns the explorer shows every column, like a table.
      expect(other.spec).toMatchObject({
        component: 'DataExplorer',
        columns: [{ field: 'region' }, { field: 'product' }, { field: 'amount' }],
      });
    }
    expect(
      compileBlock(`explorer\nsort: amount desc\nsearch: off\n---\n${csv}`).spec,
    ).toMatchObject({
      sort: '-amount',
      search: false,
    });
  });

  it('take a full row in a dashboard and are a valid JSON spec', () => {
    const dash = compileBlock(`dashboard\nkpi sum(amount)\nexplorer\n---\n${csv}`);
    expect(errors(dash)).toEqual([]);
    const layout = (dash.spec as DashboardSpec).layout;
    expect(layout.map((item) => [item.component, item.span])).toEqual([
      ['KPI', 12],
      ['DataExplorer', 12],
    ]);
    expect(layout[1].title).toBeUndefined();
    expect(
      validateSpec({ component: 'DataExplorer', data: 'orders', columns: [{ field: 'region' }] }),
    ).toEqual({ valid: true, errors: [] });
    expect(
      validateSpec({
        component: 'DataExplorer',
        data: 'orders',
        columns: [{ field: 'region' }],
        rowKey: 'region',
      }).errors[0].message,
    ).toContain('Unknown property "rowKey"');
  });
});

describe('the explorer', () => {
  it('starts sorted and paged as the block says, with search, filters and export', () => {
    render(
      <QuartileBlock
        source={`explorer product, region, amount\ntitle: Orders\npageSize: 2\nsort: -amount\n---\n${csv}`}
      />,
    );
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Search rows' })).toBeTruthy();
    for (const name of [
      /^Filters/,
      /^Sort · 1/,
      /^Columns · 3\/3/,
      /^Group/,
      'View',
      'Export CSV',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByText('4 of 4 source rows')).toBeTruthy();
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.children[0]?.textContent),
    ).toEqual(['Shelf', 'Desk']);
    expect(
      (screen.getByRole('combobox', { name: 'Rows per page' }) as HTMLSelectElement).value,
    ).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.children[0]?.textContent),
    ).toEqual(['Lamp', 'Chair']);
  });

  it('searches its rows locally', () => {
    render(<QuartileBlock source={`explorer\n---\n${csv}`} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search rows' }), {
      target: { value: 'lamp' },
    });
    expect(screen.getByText('1 of 4 source rows')).toBeTruthy();
    expect(products()).toEqual(['Lamp']);
  });

  it('hides search and export when the block turns them off', () => {
    render(<QuartileBlock source={`explorer\nsearch: no\nexport: no\n---\n${csv}`} />);
    expect(screen.queryByRole('textbox', { name: 'Search rows' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Filters/ })).toBeTruthy();
  });

  it('is narrowed by the selection of the views it is linked with, and publishes none', () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuartileDocument data={{ orders }} onSelectionChange={onChange}>
        <QuartileBlock source={'barlist sum(amount) by region\nselect: true\ndata: orders\n'} />
        <QuartileBlock source={'explorer product, region, amount\ndata: orders\n'} />
      </QuartileDocument>,
    );
    const explorer = within(container.querySelector<HTMLElement>('.q-explorer')!);
    expect(screen.getByText('4 of 4 source rows')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^EMEA/ }));
    expect(screen.getByText('2 of 4 source rows')).toBeTruthy();
    expect(
      explorer
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.children[0]?.textContent),
    ).toEqual(['Desk', 'Chair']);
    expect(onChange).toHaveBeenCalledTimes(1);
    // Clicking a row of the explorer selects nothing.
    fireEvent.click(explorer.getAllByRole('row')[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('exports the matching rows under the block’s title', async () => {
    let blob: Blob | undefined;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => {
        blob = b;
        return 'blob:quartile-test';
      },
      revokeObjectURL: () => {},
    });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    render(
      <QuartileBlock
        source={`explorer product, amount\ntitle: Open orders\nsort: -amount\n---\n${csv}`}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Search rows' }), {
      target: { value: 'sh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(names).toEqual(['open-orders.csv']);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    expect(text).toBe('"product","amount"\r\n"Shelf","200"');
  });

  it('has its own controls: the host’s view actions do not add a toolbar to it', () => {
    render(
      <SpecView
        data={{ orders }}
        actions={['table', 'rows', 'download']}
        spec={{
          component: 'DataExplorer',
          data: 'orders',
          title: 'Orders',
          columns: [{ field: 'product' }, { field: 'amount' }],
          source: 'Order system',
        }}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Orders actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    expect(screen.getByText('Source: Order system')).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5);
  });

  it('is a readable table in static HTML', () => {
    const html = renderBlockToHTML(`explorer product, amount\ntitle: Orders\n---\n${csv}`);
    expect(html).toContain('data-quartile-block="view"');
    for (const word of ['Orders', 'Desk', 'Lamp', 'Chair', 'Shelf']) expect(html).toContain(word);
    expect((compileBlock(`explorer\n---\n${csv}`).spec as ComponentSpec).component).toBe(
      'DataExplorer',
    );
  });
});
