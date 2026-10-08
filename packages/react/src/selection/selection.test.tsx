import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Selection, useLinkedRows, useSelection } from './Selection';
import { SelectionStore } from './store';

describe('SelectionStore', () => {
  it('keeps one predicate per field and notifies subscribers', () => {
    const s = new SelectionStore('t');
    const fn = vi.fn();
    s.subscribe(fn);
    s.set('region', 'Europe', { source: 'a' });
    s.set('region', ['Europe', 'Asia'], { source: 'a' });
    expect(s.getSnapshot()).toEqual([
      { field: 'region', op: 'in', value: ['Europe', 'Asia'], source: 'a', label: undefined },
    ]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('toggles values in and out', () => {
    const s = new SelectionStore('t');
    s.toggle('region', 'Europe');
    expect(s.get('region')?.value).toEqual(['Europe']);
    s.toggle('region', 'Asia', { multiple: true });
    expect(s.get('region')?.value).toEqual(['Europe', 'Asia']);
    s.toggle('region', 'Europe', { multiple: true });
    expect(s.get('region')?.value).toEqual(['Asia']);
    s.toggle('region', 'Asia');
    expect(s.get('region')).toBeUndefined();
  });
  it('clears a field or everything, and treats empty values as clear', () => {
    const s = new SelectionStore('t');
    const events: string[] = [];
    s.onEvent((e) => events.push(`${e.type}:${e.field}`));
    s.set('a', 1);
    s.set('b', 2);
    s.set('a', null);
    expect(s.getSnapshot().map((p) => p.field)).toEqual(['b']);
    s.clear();
    expect(s.getSnapshot()).toEqual([]);
    s.clear();
    expect(events).toEqual(['set:a', 'set:b', 'clear:a', 'clear:null']);
  });
});

const rows = [
  { region: 'Europe', amount: 1 },
  { region: 'Asia', amount: 2 },
  { region: 'Europe', amount: 3 },
];

function Publisher() {
  const sel = useSelection();
  const { rows: mine } = useLinkedRows(rows, { source: 'pub' });
  return (
    <button type="button" onClick={() => sel.set('region', 'Europe', { source: 'pub' })}>
      publisher sees {mine.length}
    </button>
  );
}

function Subscriber() {
  const { rows: mine } = useLinkedRows(rows, { source: 'sub' });
  return <span>subscriber sees {mine.length}</span>;
}

describe('<Selection> crossfilter semantics', () => {
  it('filters every view except the one that published', () => {
    const onChange = vi.fn();
    render(
      <Selection id="orders" onChange={onChange}>
        <Publisher />
        <Subscriber />
      </Selection>,
    );
    expect(screen.getByText('subscriber sees 3')).toBeTruthy();
    act(() => screen.getByRole('button').click());
    expect(screen.getByText('subscriber sees 2')).toBeTruthy();
    expect(screen.getByText('publisher sees 3')).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('is inert outside a Selection', () => {
    render(<Subscriber />);
    expect(screen.getByText('subscriber sees 3')).toBeTruthy();
  });

  it('can be addressed by id from outside the subtree', () => {
    function Remote() {
      const sel = useSelection('remote');
      return <span>remote {sel.predicates.length}</span>;
    }
    function Setter() {
      const sel = useSelection();
      return (
        <button type="button" onClick={() => sel.set('region', 'Asia')}>
          set
        </button>
      );
    }
    render(
      <>
        <Remote />
        <Selection id="remote">
          <Setter />
        </Selection>
      </>,
    );
    act(() => screen.getByText('set').click());
    expect(screen.getByText('remote 1')).toBeTruthy();
  });
});
