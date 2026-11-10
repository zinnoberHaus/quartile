import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { describe, expect, it, vi } from 'vitest';
import { predicateValueLabel } from '../data/predicates';
import { Selection, useSelection } from '../selection/Selection';
import { type SelectionChange, SelectionStore } from '../selection/store';
import { SpecView } from '../spec/SpecView';
import { QuartileBlock } from './QuartileBlock';
import {
  QuartileDocument,
  type QuartileDocumentHandle,
  useQuartileDocument,
} from './QuartileDocument';
import { QuartilePre } from './renderers';

const orders = [
  { region: 'EMEA', amount: 120 },
  { region: 'APAC', amount: 80 },
  { region: 'EMEA', amount: 40 },
];
const csv = 'region,amount\nEMEA,120\nAPAC,80\nEMEA,40\n';
const list = 'barlist sum(amount) by region\nselect: true\ndata: orders\n';
const kpi = 'kpi sum(amount) as "Revenue"\ndata: orders\n';
const inlineDashboard = `dashboard Sales\nbarlist sum(amount) by region\nkpi sum(amount) as "Sales total"\n---\n${csv}`;

const apac = () => fireEvent.click(screen.getByRole('button', { name: /^APAC/ }));
const total = (name: string) => screen.getByRole('group', { name }).textContent ?? '';

describe('onSelectionChange', () => {
  it('fires once per change of a dataset group, however many blocks share it', () => {
    const onDocument = vi.fn();
    const onList = vi.fn();
    const onKpi = vi.fn();
    render(
      <QuartileDocument data={{ orders }} onSelectionChange={onDocument}>
        <QuartileBlock source={list} onSelectionChange={onList} />
        <QuartileBlock source={kpi} onSelectionChange={onKpi} />
      </QuartileDocument>,
    );
    apac();
    expect(onDocument).toHaveBeenCalledTimes(1);
    const change: SelectionChange = onDocument.mock.calls[0][0];
    expect(change.group).toBe('orders');
    expect(change.predicates).toMatchObject([{ field: 'region', op: 'in', value: ['APAC'] }]);
    expect(onList).toHaveBeenCalledTimes(1);
    expect(onKpi).toHaveBeenCalledTimes(1);
    expect(onKpi.mock.calls[0][0]).toEqual(change);
    // Clicking the selected row again clears it; the host hears the empty selection.
    apac();
    expect(onDocument).toHaveBeenCalledTimes(2);
    expect(onDocument.mock.calls[1][0]).toEqual({ group: 'orders', predicates: [] });
  });

  it('names a dashboard with its own rows block-<n> and lets the host clear it by name', () => {
    const onDocument = vi.fn();
    function Clear({ group }: { group: string }) {
      const doc = useQuartileDocument();
      return (
        <button type="button" onClick={() => doc?.store(group).clear()}>
          Clear {group}
        </button>
      );
    }
    render(
      <QuartileDocument data={{ orders }} onSelectionChange={onDocument}>
        <QuartileBlock source={kpi} />
        <QuartileBlock source={inlineDashboard} />
        <Clear group="block-2" />
      </QuartileDocument>,
    );
    apac();
    expect(onDocument).toHaveBeenCalledTimes(1);
    expect(onDocument.mock.calls[0][0]).toMatchObject({
      group: 'block-2',
      predicates: [{ field: 'region', op: 'in', value: ['APAC'] }],
    });
    expect(total('Sales total')).toContain('$80');
    // The dashboard stands alone: the block over the named dataset is not filtered.
    expect(total('Revenue')).toContain('$240');
    fireEvent.click(screen.getByRole('button', { name: 'Clear block-2' }));
    expect(onDocument).toHaveBeenCalledTimes(2);
    expect(onDocument.mock.calls[1][0]).toEqual({ group: 'block-2', predicates: [] });
    expect(total('Sales total')).toContain('$240');
  });

  it('routes every group through a host stores factory, so the host can act from outside', () => {
    const stores = new Map<string, SelectionStore>();
    const store = (group: string) => {
      let s = stores.get(group);
      if (!s) {
        s = new SelectionStore(group);
        stores.set(group, s);
      }
      return s;
    };
    const onDocument = vi.fn();
    render(
      <QuartileDocument data={{ orders }} stores={store} onSelectionChange={onDocument}>
        <QuartileBlock source={list} />
        <QuartileBlock source={inlineDashboard} />
      </QuartileDocument>,
    );
    expect([...stores.keys()].sort()).toEqual(['block-2', 'orders']);
    fireEvent.click(screen.getAllByRole('button', { name: /APAC/ })[1]);
    expect(stores.get('block-2')?.getSnapshot()).toHaveLength(1);
    stores.get('block-2')?.clear();
    expect(onDocument.mock.calls.map(([c]) => [c.group, c.predicates.length])).toEqual([
      ['block-2', 1],
      ['block-2', 0],
    ]);
  });

  it('keeps the group id it generated out of the interface', () => {
    render(
      <QuartileDocument>
        <QuartileBlock
          source={`dashboard\nkpi sum(amount)\ntable region, amount\nselect: region\n---\n${csv}`}
        />
      </QuartileDocument>,
    );
    expect(screen.getByText(/Select rows to publish to the selection/)).toBeTruthy();
  });

  it('gives a lone chart with its own rows a group too', () => {
    const onChange = vi.fn();
    const chart = `barlist sum(amount) by region\nselect: true\n---\n${csv}`;
    const { unmount } = render(<QuartileBlock source={chart} onSelectionChange={onChange} />);
    apac();
    expect(onChange.mock.calls[0][0]).toMatchObject({
      group: 'block-1',
      predicates: [{ field: 'region', value: ['APAC'] }],
    });
    unmount();
    const named = vi.fn();
    render(<QuartileBlock source={chart} group="answer-7" onSelectionChange={named} />);
    apac();
    expect(named.mock.calls[0][0].group).toBe('answer-7');
  });

  it('keeps a lone chart in the host Selection that encloses it', () => {
    const onChange = vi.fn();
    function Count() {
      return <output>{useSelection().predicates.length}</output>;
    }
    render(
      <Selection id="page">
        <Count />
        <QuartileBlock
          source={`barlist sum(amount) by region\nselect: true\n---\n${csv}`}
          onSelectionChange={onChange}
        />
      </Selection>,
    );
    apac();
    expect(screen.getByRole('status').textContent).toBe('1');
    expect(onChange.mock.calls[0][0].group).toBe('page');
  });

  it('reports the selection of a JSON dashboard under the name its spec gives', () => {
    const onChange = vi.fn();
    render(
      <SpecView
        data={{ orders }}
        onSelectionChange={onChange}
        spec={{
          selection: 'regions',
          layout: [{ component: 'BarList', data: 'orders', category: 'region', select: true }],
        }}
      />,
    );
    apac();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      group: 'regions',
      predicates: [{ field: 'region', op: 'in', value: ['APAC'] }],
    });
  });
});

describe('the document handle', () => {
  it('reads, sets, clears and watches a group by name through a ref', () => {
    const ref = createRef<QuartileDocumentHandle>();
    const onDocument = vi.fn();
    render(
      <QuartileDocument ref={ref} data={{ orders }} onSelectionChange={onDocument}>
        <QuartileBlock source={list} />
        <QuartileBlock source={kpi} />
        <QuartileBlock source={inlineDashboard} />
      </QuartileDocument>,
    );
    const doc = ref.current!;
    expect(doc.groups()).toEqual(['orders', 'block-3']);
    const selection = doc.selection('orders');
    const seen: number[] = [];
    const stop = selection.subscribe((predicates) => seen.push(predicates.length));
    expect(selection.get()).toEqual([]);

    act(() => selection.set('region', 'APAC'));
    expect(total('Revenue')).toContain('$80');
    expect(selection.get()).toMatchObject([{ field: 'region', op: 'eq', value: 'APAC' }]);
    // The host is told about its own change like any other, once.
    expect(onDocument).toHaveBeenCalledTimes(1);
    expect(onDocument.mock.calls[0][0]).toMatchObject({ group: 'orders' });
    // The standalone dashboard is another group: untouched.
    expect(total('Sales total')).toContain('$240');

    act(() => selection.set('region', ['EMEA', 'APAC']));
    act(() => selection.set('amount', [100, 500], { op: 'between' }));
    expect(selection.get().map((p) => p.op)).toEqual(['in', 'between']);
    expect(total('Revenue')).toContain('$120');
    act(() => selection.clear('amount'));
    expect(total('Revenue')).toContain('$240');
    act(() => selection.clear());
    expect(selection.get()).toEqual([]);
    expect(seen).toEqual([1, 1, 2, 1, 0]);
    stop();

    // A reader's click is visible through the handle, and the handle can undo it.
    fireEvent.click(screen.getAllByRole('button', { name: /^APAC/ })[1]);
    expect(doc.selection('block-3').get()).toMatchObject([{ field: 'region', value: ['APAC'] }]);
    expect(total('Sales total')).toContain('$80');
    act(() => doc.selection('block-3').clear());
    expect(total('Sales total')).toContain('$240');
    expect(seen).toHaveLength(5);
    expect(() => doc.selection('')).toThrow(TypeError);
    expect(() => selection.set('amount', 1, { op: 'between' })).toThrow(/\[min, max\]/);
  });

  it('lets a button outside the document clear a selection', () => {
    function Page() {
      const doc = useRef<QuartileDocumentHandle>(null);
      return (
        <>
          <button type="button" onClick={() => doc.current?.selection('orders').clear()}>
            Show all regions
          </button>
          <QuartileDocument ref={doc} data={{ orders }}>
            <QuartileBlock source={list} />
            <QuartileBlock source={kpi} />
          </QuartileDocument>
        </>
      );
    }
    render(<Page />);
    apac();
    expect(total('Revenue')).toContain('$80');
    fireEvent.click(screen.getByRole('button', { name: 'Show all regions' }));
    expect(total('Revenue')).toContain('$240');
  });

  it('names the groups of a host stores factory too', () => {
    const ref = createRef<QuartileDocumentHandle>();
    const stores = new Map<string, SelectionStore>();
    const store = (group: string) => {
      let s = stores.get(group);
      if (!s) {
        s = new SelectionStore(group);
        stores.set(group, s);
      }
      return s;
    };
    render(
      <QuartileDocument ref={ref} data={{ orders }} stores={store}>
        <QuartileBlock source={list} />
        <QuartileBlock source={kpi} />
      </QuartileDocument>,
    );
    expect(ref.current?.groups()).toEqual(['orders']);
    act(() => ref.current?.selection('orders').set('region', 'EMEA'));
    expect(stores.get('orders')?.getSnapshot()).toHaveLength(1);
    expect(total('Revenue')).toContain('$160');
  });
});

describe('blocks over one dataset', () => {
  const data = `data sales\n---\n${csv}`;

  it('filter each other without a select: line', () => {
    const onDocument = vi.fn();
    render(
      <QuartileDocument onSelectionChange={onDocument}>
        <QuartileBlock source={'barlist sum(amount) by region\ndata: sales\n'} />
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\ndata: sales\n'} />
        <QuartileBlock source={data} dataDisplay="hidden" />
      </QuartileDocument>,
    );
    expect(total('Revenue')).toContain('$240');
    apac();
    expect(total('Revenue')).toContain('$80');
    expect(onDocument).toHaveBeenCalledTimes(1);
    expect(onDocument.mock.calls[0][0]).toMatchObject({
      group: 'sales',
      predicates: [{ field: 'region', op: 'in', value: ['APAC'] }],
    });
  });

  it('stay still for a view that opts out', () => {
    const onDocument = vi.fn();
    render(
      <QuartileDocument onSelectionChange={onDocument}>
        <QuartileBlock source={'barlist sum(amount) by region\nselect: no\ndata: sales\n'} />
        <QuartileBlock source={'kpi sum(amount) as "Revenue"\ndata: sales\n'} />
        <QuartileBlock source={data} dataDisplay="hidden" />
      </QuartileDocument>,
    );
    expect(screen.getAllByText('APAC').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^APAC/ })).toBeNull();
    fireEvent.click(screen.getAllByText('APAC')[0]);
    expect(total('Revenue')).toContain('$240');
    expect(onDocument).not.toHaveBeenCalled();
  });

  it('leave a lone chart with its own rows as it was: not clickable unless it asks', () => {
    const onChange = vi.fn();
    render(
      <QuartileBlock
        source={`barlist sum(amount) by region\n---\n${csv}`}
        onSelectionChange={onChange}
      />,
    );
    expect(screen.getAllByText('APAC').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(screen.getAllByText('APAC')[0]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('asking a follow-up from a selection', () => {
  // The example hosts copy: a chat answer whose charts suggest the next question.
  function Answer({ markdown, onAsk }: { markdown: string; onAsk: (question: string) => void }) {
    const [picked, setPicked] = useState<SelectionChange | null>(null);
    const about = picked?.predicates
      .map((p) => `${p.field} ${predicateValueLabel(p)}`)
      .join(' and ');
    return (
      <QuartileDocument markdown={markdown} onSelectionChange={setPicked}>
        <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
        {about ? (
          <button type="button" onClick={() => onAsk(`Tell me more about ${about}.`)}>
            Ask about {about}
          </button>
        ) : null}
      </QuartileDocument>
    );
  }

  it('turns a clicked bar into a suggested question', () => {
    const markdown = [
      'Revenue is concentrated in two regions.',
      '',
      '```quartile',
      'dashboard Sales',
      'barlist sum(amount) by region',
      'kpi sum(amount) as "Revenue"',
      '---',
      csv.trim(),
      '```',
    ].join('\n');
    const onAsk = vi.fn();
    render(<Answer markdown={markdown} onAsk={onAsk} />);
    expect(screen.queryByRole('button', { name: /Ask about/ })).toBeNull();
    apac();
    fireEvent.click(screen.getByRole('button', { name: 'Ask about region APAC' }));
    expect(onAsk).toHaveBeenCalledWith('Tell me more about region APAC.');
    // Deselecting withdraws the suggestion.
    apac();
    expect(screen.queryByRole('button', { name: /Ask about/ })).toBeNull();
  });
});
