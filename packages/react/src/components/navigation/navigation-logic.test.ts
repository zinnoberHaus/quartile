import { filterCommandGroups } from './command-menu/filter';
import { matchesHotkey } from './command-menu/hotkey';
import { paginationRange } from './pagination/range';
import { nextIndex } from './roving';

describe('paginationRange', () => {
  it('keeps a constant width near the start', () => {
    expect(paginationRange(2, 24)).toEqual([1, 2, 3, 4, 5, 'end-ellipsis', 24]);
    expect(paginationRange(1, 24)).toEqual([1, 2, 3, 4, 5, 'end-ellipsis', 24]);
  });
  it('shows both ellipses in the middle', () => {
    expect(paginationRange(12, 24)).toEqual([1, 'start-ellipsis', 11, 12, 13, 'end-ellipsis', 24]);
  });
  it('mirrors at the end', () => {
    expect(paginationRange(24, 24)).toEqual([1, 'start-ellipsis', 20, 21, 22, 23, 24]);
  });
  it('lists every page when there are few', () => {
    expect(paginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(1, 0)).toEqual([]);
  });
  it('clamps out-of-range pages and honors siblings', () => {
    expect(paginationRange(99, 10)).toEqual([1, 'start-ellipsis', 6, 7, 8, 9, 10]);
    expect(paginationRange(10, 20, 2)).toEqual([
      1,
      'start-ellipsis',
      8,
      9,
      10,
      11,
      12,
      'end-ellipsis',
      20,
    ]);
  });
  it('never repeats a page', () => {
    for (let count = 1; count <= 12; count++) {
      for (let page = 1; page <= count; page++) {
        const nums = paginationRange(page, count).filter((x) => typeof x === 'number');
        expect(new Set(nums).size).toBe(nums.length);
        expect(nums).toContain(page);
      }
    }
  });
});

describe('nextIndex', () => {
  const none = [false, false, false, false];
  it('wraps with arrows and jumps with Home/End', () => {
    expect(nextIndex('ArrowRight', 3, none)).toBe(0);
    expect(nextIndex('ArrowLeft', 0, none)).toBe(3);
    expect(nextIndex('Home', 2, none)).toBe(0);
    expect(nextIndex('End', 0, none)).toBe(3);
    expect(nextIndex('Enter', 0, none)).toBeNull();
  });
  it('skips disabled items', () => {
    const disabled = [false, true, false, true];
    expect(nextIndex('ArrowRight', 0, disabled)).toBe(2);
    expect(nextIndex('ArrowRight', 2, disabled)).toBe(0);
    expect(nextIndex('End', 0, disabled)).toBe(2);
  });
  it('uses up/down for vertical lists', () => {
    expect(nextIndex('ArrowDown', -1, none, 'vertical')).toBe(0);
    expect(nextIndex('ArrowRight', 0, none, 'vertical')).toBeNull();
  });
});

describe('matchesHotkey', () => {
  const ev = (
    key: string,
    mods: Partial<Record<'meta' | 'ctrl' | 'alt' | 'shift', boolean>> = {},
  ) => ({
    key,
    metaKey: !!mods.meta,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
  });
  it('maps mod to ⌘ on Apple and Ctrl elsewhere', () => {
    expect(matchesHotkey(ev('k', { meta: true }), 'mod+k', true)).toBe(true);
    expect(matchesHotkey(ev('k', { ctrl: true }), 'mod+k', true)).toBe(false);
    expect(matchesHotkey(ev('k', { ctrl: true }), 'mod+k', false)).toBe(true);
  });
  it('requires modifiers to match exactly', () => {
    expect(matchesHotkey(ev('P', { meta: true, shift: true }), 'shift+mod+p', true)).toBe(true);
    expect(matchesHotkey(ev('p', { meta: true }), 'shift+mod+p', true)).toBe(false);
    expect(matchesHotkey(ev('t', { shift: true }), 't', true)).toBe(false);
    expect(matchesHotkey(ev('Escape'), 'esc', true)).toBe(true);
  });
});

describe('filterCommandGroups', () => {
  const groups = [
    {
      label: 'Charts',
      items: [
        { label: 'Line chart', keywords: ['add'] },
        { label: 'Bar chart' },
        { label: 'Heatmap' },
      ],
    },
    { label: 'Actions', items: [{ label: 'Export as CSV', keywords: ['download'] }] },
  ];
  it('returns every group for an empty query', () => {
    expect(filterCommandGroups(groups, '  ')).toEqual(groups);
  });
  it('matches every word against label, keywords and group label', () => {
    const r = filterCommandGroups(groups, 'add line');
    expect(r).toHaveLength(1);
    expect(r[0].items.map((i) => i.label)).toEqual(['Line chart']);
    expect(filterCommandGroups(groups, 'charts heat')[0].items[0].label).toBe('Heatmap');
    expect(filterCommandGroups(groups, 'DOWNLOAD')[0].label).toBe('Actions');
  });
  it('drops groups without matches', () => {
    expect(filterCommandGroups(groups, 'zzz')).toEqual([]);
  });
});
