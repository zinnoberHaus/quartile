import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuartileBlock } from '../markdown/QuartileBlock';
import { QuartileDocument } from '../markdown/QuartileDocument';
import { SpecView } from './SpecView';

const orders = [
  { region: 'EMEA', product: 'Desk', amount: 120 },
  { region: 'APAC', product: 'Lamp', amount: 80 },
  { region: 'EMEA', product: 'Chair', amount: 40 },
];
const csv = 'region,product,amount\nEMEA,Desk,120\nAPAC,Lamp,80\nEMEA,Chair,40\n';
/** Twelve rows, so a ten-row page leaves a second page. */
const many = `region,amount\n${Array.from({ length: 12 }, (_, i) => `${i % 3 === 0 ? 'APAC' : 'EMEA'},${i + 1}`).join('\n')}\n`;

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const rowsPanel = (name: string) => screen.getByRole('group', { name: `Rows behind ${name}` });
const count = (panel: HTMLElement) => panel.querySelector('.q-spec-rows-count')?.textContent;
/** Body rows of the table in a rows panel, as text. */
const bodyRows = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent);

describe('the view toolbar', () => {
  it('does not exist unless a block or the host asks for it', () => {
    const { container } = render(
      <QuartileBlock source={`bar sum(amount) by region\ntitle: Revenue\n---\n${csv}`} />,
    );
    expect(container.querySelector('.q-spec-actions')).toBeNull();
    expect(container.querySelector('.q-spec-card-top')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    // The card is the title and the chart, as before.
    const card = container.querySelector('.q-spec-card')!;
    expect([...card.children].map((c) => c.className)).toEqual(['q-spec-card-head', 'q-chart']);
  });

  it('shows real, named buttons for the actions a block lists', () => {
    render(
      <QuartileBlock
        source={`bar sum(amount) by region\ntitle: Revenue\nactions: rows, download\n---\n${csv}`}
      />,
    );
    const toolbar = screen.getByRole('group', { name: 'Revenue actions' });
    const buttons = within(toolbar).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Rows', 'Download CSV']);
    for (const b of buttons) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.tabIndex).toBe(0);
    }
    expect(button('Rows').getAttribute('aria-pressed')).toBe('false');
    expect(button('Download CSV').hasAttribute('aria-pressed')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
  });
});

describe('actions: rows', () => {
  it('opens the rows the view is drawn from, ten to a page, with their count', () => {
    render(
      <QuartileBlock
        source={`bar sum(amount) by region\ntitle: Revenue\nactions: rows\n---\n${many}`}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Rows behind Revenue' })).toBeNull();
    fireEvent.click(button('Rows'));
    expect(button('Rows').getAttribute('aria-pressed')).toBe('true');
    const panel = rowsPanel('Revenue');
    expect(button('Rows').getAttribute('aria-controls')).toBe(panel.id);
    expect(count(panel)).toBe('12 rows');
    expect(bodyRows(panel)).toHaveLength(10);
    // Cells use the dataset's formats, like every other view of it.
    expect(bodyRows(panel)[0]).toBe('APAC$1');
    expect(within(panel).getByText('1–10 of 12 rows')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Next' }));
    expect(bodyRows(panel)).toEqual(['EMEA$11', 'EMEA$12']);
    // The panel sits under the chart, inside the card.
    expect(panel.previousElementSibling?.getAttribute('role')).toBe('figure');
    fireEvent.click(button('Rows'));
    expect(screen.queryByRole('group', { name: 'Rows behind Revenue' })).toBeNull();
    expect(button('Rows').getAttribute('aria-pressed')).toBe('false');
  });

  it('narrows when another block over the same dataset selects', () => {
    render(
      <QuartileDocument data={{ orders }}>
        <QuartileBlock
          source={
            'barlist sum(amount) by region\ntitle: By region\nselect: true\nactions: rows\ndata: orders\n'
          }
        />
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\nactions: rows\ndata: orders\n'} />
      </QuartileDocument>,
    );
    const [listRows, kpiRows] = screen.getAllByRole('button', { name: 'Rows' });
    fireEvent.click(kpiRows);
    fireEvent.click(listRows);
    expect(count(rowsPanel('Revenue'))).toBe('3 rows');
    fireEvent.click(button(/^APAC/));
    // The number is now $80; its rows are the one order that makes it up.
    expect(screen.getByRole('group', { name: 'Revenue' }).textContent).toContain('$80');
    expect(count(rowsPanel('Revenue'))).toBe('1 of 3 rows');
    expect(bodyRows(rowsPanel('Revenue'))).toEqual(['APACLamp$80.00']);
    // The ranking keeps every region to choose from; the rows behind it are the chosen one's.
    expect(button(/^EMEA/)).toBeTruthy();
    expect(count(rowsPanel('By region'))).toBe('1 of 3 rows');
    expect(bodyRows(rowsPanel('By region'))).toEqual(['APACLamp$80.00']);
    fireEvent.click(button(/^APAC/));
    expect(count(rowsPanel('Revenue'))).toBe('3 rows');
    expect(count(rowsPanel('By region'))).toBe('3 rows');
  });

  it('traces a bar of a lone chart to its rows', () => {
    render(
      <QuartileBlock
        source={`barlist sum(amount) by region\ntitle: By region\nselect: true\nactions: rows\n---\n${csv}`}
      />,
    );
    fireEvent.click(button(/^EMEA/));
    fireEvent.click(button('Rows'));
    expect(count(rowsPanel('By region'))).toBe('2 of 3 rows');
    expect(bodyRows(rowsPanel('By region'))).toEqual(['EMEADesk$120', 'EMEAChair$40']);
    // The chart is not filtered by its own selection: the other region stays on offer.
    fireEvent.click(button(/^APAC/));
    expect(count(rowsPanel('By region'))).toBe('1 of 3 rows');
    expect(bodyRows(rowsPanel('By region'))).toEqual(['APACLamp$80']);
    fireEvent.click(button(/^APAC/));
    expect(count(rowsPanel('By region'))).toBe('3 rows');
  });

  it('traces a dashboard’s numbers back to their rows from one toolbar', () => {
    const { container } = render(
      <QuartileBlock
        source={`dashboard Sales\nactions: rows, download\nkpi sum(amount) as "Revenue"\nbarlist sum(amount) by region\n---\n${csv}`}
      />,
    );
    // One toolbar for the dashboard, beside its heading; none on the views.
    expect(screen.getAllByRole('group', { name: /actions$/ })).toHaveLength(1);
    const toolbar = screen.getByRole('group', { name: 'Sales actions' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Rows', 'Download CSV']);
    const top = container.querySelector('.q-spec-dashboard > .q-spec-top')!;
    expect([...top.children].map((c) => c.className)).toEqual(['q-spec-head', 'q-spec-actions']);
    expect(container.querySelector('.q-spec-noted, .q-spec-card-top')).toBeNull();

    fireEvent.click(button('Rows'));
    const panel = rowsPanel('Sales');
    expect(count(panel)).toBe('3 rows');
    // The rows open under the grid.
    expect(panel.previousElementSibling?.className).toBe('q-spec-grid');
    fireEvent.click(button(/^EMEA/));
    expect(screen.getByRole('group', { name: 'Revenue' }).textContent).toContain('$160');
    expect(count(rowsPanel('Sales'))).toBe('2 of 3 rows');
    expect(bodyRows(rowsPanel('Sales'))).toEqual(['EMEADesk$120', 'EMEAChair$40']);
  });

  it('gives a view inside a dashboard its own toolbar only when the view asks', () => {
    render(
      <QuartileBlock
        source={`dashboard Sales\nactions: rows\nkpi sum(amount) as "Revenue"\nbar sum(amount) by region\ntitle: By region\nactions: table\n---\n${csv}`}
      />,
    );
    const names = screen.getAllByRole('group', { name: /actions$/ }).map((g) => [
      g.getAttribute('aria-label'),
      within(g)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ]);
    expect(names).toEqual([
      ['Sales actions', ['Rows']],
      ['By region actions', ['Table']],
    ]);
  });

  it('names an untitled dashboard’s controls, and leaves a dashboard without actions alone', () => {
    const untitled = render(
      <QuartileBlock
        source={`dashboard\nactions: rows\nkpi sum(amount)\nbarlist sum(amount) by region\n---\n${csv}`}
      />,
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Dashboard actions' })).getByRole('button'),
    );
    expect(count(rowsPanel('this dashboard'))).toBe('3 rows');
    untitled.unmount();

    const { container } = render(
      <QuartileBlock
        source={`dashboard Sales\nkpi sum(amount)\nbarlist sum(amount) by region\n---\n${csv}`}
      />,
    );
    expect(screen.queryByRole('group', { name: /actions$/ })).toBeNull();
    const dashboard = container.querySelector('.q-spec-dashboard')!;
    expect([...dashboard.children].map((c) => c.className)).toEqual(['q-spec-head', 'q-spec-grid']);
  });

  it('shows the author’s columns, not the ones a chart adds to count rows', () => {
    render(
      <QuartileBlock source={`bar count by region\ntitle: Orders\nactions: rows\n---\n${csv}`} />,
    );
    fireEvent.click(button('Rows'));
    const headers = within(rowsPanel('Orders'))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Region', 'Product', 'Amount']);
  });
});

describe('actions: download', () => {
  let saved: { name: string; blob: Blob }[] = [];
  const text = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });

  beforeEach(() => {
    saved = [];
    let last: Blob | undefined;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        last = blob;
        return 'blob:quartile-test';
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, blob: last! });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves the rows as CSV, named after the title', async () => {
    render(
      <QuartileBlock
        source={`bar sum(amount) by region\ntitle: Revenue by region, Q3\nactions: download\n---\n${csv}`}
      />,
    );
    fireEvent.click(button('Download CSV'));
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('revenue-by-region-q3.csv');
    expect(saved[0].blob.type).toBe('text/csv;charset=utf-8');
    expect(await text(saved[0].blob)).toBe(
      [
        '"region","product","amount"',
        '"EMEA","Desk","120"',
        '"APAC","Lamp","80"',
        '"EMEA","Chair","40"',
      ].join('\r\n'),
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Downloaded 3 rows as revenue-by-region-q3.csv.',
    );
  });

  it('saves the rows of the bar a reader picked in a lone chart', async () => {
    render(
      <QuartileBlock
        source={`barlist sum(amount) by region\ntitle: By region\nselect: true\nactions: download\n---\n${csv}`}
      />,
    );
    fireEvent.click(button(/^EMEA/));
    fireEvent.click(button('Download CSV'));
    expect(saved[0].name).toBe('by-region.csv');
    expect(await text(saved[0].blob)).toBe(
      '"region","product","amount"\r\n"EMEA","Desk","120"\r\n"EMEA","Chair","40"',
    );
    expect(screen.getByRole('status').textContent).toBe('Downloaded 2 rows as by-region.csv.');
  });

  it('saves a dashboard’s rows under its selection, named after the dashboard', async () => {
    render(
      <QuartileBlock
        source={`dashboard Sales by region\nactions: rows, download\nkpi sum(amount) as "Revenue"\nbarlist sum(amount) by region\n---\n${csv}`}
      />,
    );
    fireEvent.click(button(/^EMEA/));
    fireEvent.click(button('Download CSV'));
    expect(saved[0].name).toBe('sales-by-region.csv');
    expect(await text(saved[0].blob)).toBe(
      '"region","product","amount"\r\n"EMEA","Desk","120"\r\n"EMEA","Chair","40"',
    );
  });

  it('saves the same rows the panel shows: the selection of other views applies', async () => {
    render(
      <QuartileBlock
        source={`dashboard Sales\nbarlist sum(amount) by region\nkpi sum(amount) as "Revenue"\nactions: rows, download\n---\n${csv}`}
      />,
    );
    fireEvent.click(button(/^APAC/));
    fireEvent.click(button('Download CSV'));
    expect(saved[0].name).toBe('revenue.csv');
    expect(await text(saved[0].blob)).toBe('"region","product","amount"\r\n"APAC","Lamp","80"');
  });

  it('neutralizes cells a spreadsheet would run as formulas', async () => {
    const risky = [
      { name: '=HYPERLINK("http://evil.example","Click")', note: '+1+1', amount: -5 },
      { name: '@SUM(A1:A9)', note: '-2+3', amount: 7 },
      { name: '\t=cmd|" /C calc"!A0', note: ' =1+1', amount: 1 },
      { name: 'Plain "quoted", text', note: 'a=b', amount: 2 },
    ];
    render(
      <SpecView
        data={{ risky }}
        spec={{
          component: 'BarList',
          data: 'risky',
          category: 'name',
          value: 'amount',
          title: '=Formulas',
          actions: ['download'],
        }}
      />,
    );
    fireEvent.click(button('Download CSV'));
    expect(saved[0].name).toBe('formulas.csv');
    const lines = (await text(saved[0].blob)).split('\r\n');
    expect(lines).toEqual([
      '"name","note","amount"',
      // A leading quote makes the cell text; numbers keep their sign.
      '"\'=HYPERLINK(""http://evil.example"",""Click"")","\'+1+1","-5"',
      '"\'@SUM(A1:A9)","\'-2+3","7"',
      '"\'\t=cmd|"" /C calc""!A0","\' =1+1","1"',
      '"Plain ""quoted"", text","a=b","2"',
    ]);
    for (const line of lines.slice(1)) {
      for (const cell of line.split('","')) {
        expect(cell.replace(/^"/, '')).not.toMatch(/^\s*[=+@]/);
      }
    }
  });
});

describe('actions: table and view: table', () => {
  it('switches the chart and its table with a pressed button', () => {
    const { container } = render(
      <QuartileBlock
        source={`bar sum(amount) by region\ntitle: Revenue\nactions: table\n---\n${csv}`}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Revenue' });
    expect(button('Table').getAttribute('aria-pressed')).toBe('false');
    expect(figure.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.q-chart-table')).toBeNull();
    fireEvent.click(button('Table'));
    expect(button('Table').getAttribute('aria-pressed')).toBe('true');
    expect(figure.querySelector('svg')).toBeNull();
    expect(container.querySelector('.q-chart-table')?.textContent).toContain('EMEA');
    fireEvent.click(button('Table'));
    expect(figure.querySelector('svg')).not.toBeNull();
  });

  it('starts as a table when the block says view: table, with or without the button', () => {
    const plain = render(
      <QuartileBlock source={`bar sum(amount) by region\nview: table\n---\n${csv}`} />,
    );
    expect(plain.container.querySelectorAll('.q-block')).toHaveLength(1);
    expect(plain.container.querySelectorAll('.q-chart')).toHaveLength(1);
    expect(plain.container.querySelector('.q-chart-table')).not.toBeNull();
    expect(plain.container.querySelector('.q-chart svg')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    plain.unmount();

    const { container } = render(
      <QuartileBlock
        source={`bar sum(amount) by region\nview: table\nactions: table\n---\n${csv}`}
      />,
    );
    expect(button('Table').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button('Table'));
    expect(container.querySelector('.q-chart svg')).not.toBeNull();
  });
});

describe('host control of actions', () => {
  const asking = `bar sum(amount) by region\ntitle: Asking\nactions: table, rows, download\n---\n${csv}`;
  const silent = `bar sum(amount) by region\ntitle: Silent\n---\n${csv}`;
  const refusing = `bar sum(amount) by region\ntitle: Refusing\nactions: none\n---\n${csv}`;
  const names = () => screen.queryAllByRole('button').map((b) => b.textContent);

  it('false turns the toolbar off whatever a block asks', () => {
    const { container, unmount } = render(
      <QuartileDocument actions={false}>
        <QuartileBlock source={asking} />
      </QuartileDocument>,
    );
    expect(names()).toEqual([]);
    expect(container.querySelector('.q-spec-actions')).toBeNull();
    unmount();
    render(<QuartileBlock source={asking} actions={false} />);
    expect(names()).toEqual([]);
    render(
      <SpecView
        data={{ orders }}
        actions={false}
        spec={{ component: 'BarList', data: 'orders', category: 'region', actions: ['rows'] }}
      />,
    );
    expect(names()).toEqual([]);
  });

  it('a list is the default for views that do not say; a block’s own choice wins', () => {
    render(
      <QuartileDocument actions={['rows', 'download']}>
        <QuartileBlock source={silent} />
        <QuartileBlock source={asking} />
        <QuartileBlock source={refusing} />
      </QuartileDocument>,
    );
    expect(
      within(screen.getByRole('group', { name: 'Silent actions' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Rows', 'Download CSV']);
    expect(
      within(screen.getByRole('group', { name: 'Asking actions' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Table', 'Rows', 'Download CSV']);
    expect(screen.queryByRole('group', { name: 'Refusing actions' })).toBeNull();
  });

  it('resolve to the one dashboard toolbar inside a dashboard', () => {
    const dashboard = `dashboard Sales\nkpi sum(amount) as "Revenue"\nbar sum(amount) by region\n---\n${csv}`;
    const toolbars = () =>
      screen.queryAllByRole('group', { name: /actions$/ }).map((g) => [
        g.getAttribute('aria-label'),
        within(g)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ]);
    // The host's default: the dashboard's rows and download; `table` is a chart's own.
    const defaulted = render(
      <QuartileBlock source={dashboard} actions={['table', 'rows', 'download']} />,
    );
    expect(toolbars()).toEqual([['Sales actions', ['Rows', 'Download CSV']]]);
    defaulted.unmount();
    // The dashboard's own choice wins over the default, and `false` over both.
    const refusing = render(
      <QuartileBlock
        source={dashboard.replace('dashboard Sales\n', 'dashboard Sales\nactions: none\n')}
        actions={['rows']}
      />,
    );
    expect(toolbars()).toEqual([]);
    refusing.unmount();
    render(
      <QuartileBlock
        source={dashboard.replace('dashboard Sales\n', 'dashboard Sales\nactions: rows\n')}
        actions={false}
      />,
    );
    expect(toolbars()).toEqual([]);
  });

  it('fall back to a toolbar per view when a dashboard’s views read different datasets', () => {
    render(
      <SpecView
        data={{ orders, returns: [{ region: 'EMEA', amount: 5 }] }}
        spec={{
          title: 'Mixed',
          actions: ['rows'],
          layout: [
            { component: 'KPI', data: 'orders', label: 'Orders', value: 'amount' },
            { component: 'KPI', data: 'returns', label: 'Returns', value: 'amount' },
          ],
        }}
      />,
    );
    expect(
      screen.getAllByRole('group', { name: /actions$/ }).map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Orders actions', 'Returns actions']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Rows' })[1]);
    expect(count(rowsPanel('Returns'))).toBe('1 row');
  });

  it('a block prop overrides the document, and each view gets only what it can do', () => {
    render(
      <QuartileDocument actions={['table', 'rows', 'download']}>
        <QuartileBlock source={silent} actions={['table']} />
        <QuartileBlock source={`kpi sum(amount) as "Total"\n---\n${csv}`} />
        <QuartileBlock source={`table region, amount\ntitle: Orders\n---\n${csv}`} />
        <QuartileBlock source={`data sales\n---\n${csv}`} dataDisplay="table" />
      </QuartileDocument>,
    );
    const of = (name: string) =>
      within(screen.getByRole('group', { name: `${name} actions` }))
        .getAllByRole('button')
        .map((b) => b.textContent);
    expect(of('Silent')).toEqual(['Table']);
    expect(of('Total')).toEqual(['Rows', 'Download CSV']);
    expect(of('Orders')).toEqual(['Download CSV']);
    // Three toolbars: a `data` block is a definition, not a view.
    expect(screen.getAllByRole('group', { name: /actions$/ })).toHaveLength(3);
  });
});

describe('server rendering and hydration', () => {
  it('renders the toolbar closed on the server and hydrates without a mismatch', async () => {
    const source = `bar sum(amount) by region\ntitle: Revenue\nactions: table, rows, download\n---\n${csv}`;
    const html = renderToString(<QuartileBlock source={source} />);
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain('q-spec-rows');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <QuartileBlock source={source} />, {
        onRecoverableError: (error) => errors.push([error]),
      });
    });
    expect(errors).toEqual([]);
    fireEvent.click(within(container).getByRole('button', { name: 'Rows' }));
    expect(within(container).getByRole('group', { name: 'Rows behind Revenue' })).toBeTruthy();
    await act(async () => root?.unmount());
    spy.mockRestore();
    container.remove();
  });
});
