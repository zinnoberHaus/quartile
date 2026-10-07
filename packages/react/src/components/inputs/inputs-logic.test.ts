import { splitMatch } from './combobox/Combobox';
import {
  addMonths,
  DEFAULT_DATE_PRESETS,
  formatRange,
  monthGrid,
  normalizeRange,
  rangeLength,
  resolvePreset,
  sameRange,
} from './date/dateUtils';
import { firstEnabled, stepEnabled, typeaheadIndex } from './listbox/listNav';
import { groupOptions } from './select/Select';
import {
  binsInRange,
  moveRangeThumb,
  nearestThumb,
  snap,
  toPercent,
  valueFromKey,
  valueFromPointer,
} from './slider/sliderMath';
import { clampNumber, parseNumber } from './text-field/NumberField';
import { shortcutMatcher } from './text-field/TextField';

describe('slider math', () => {
  it('snaps to the step grid from min and clamps', () => {
    expect(snap(43, 0, 360, 10)).toBe(40);
    expect(snap(46, 0, 360, 10)).toBe(50);
    expect(snap(-5, 0, 360, 10)).toBe(0);
    expect(snap(999, 0, 360, 10)).toBe(360);
    expect(snap(0.30000000000000004, 0, 1, 0.1)).toBe(0.3);
    expect(snap(7, 1, 17, 2)).toBe(7);
  });

  it('maps values to percentages and pointers to values', () => {
    expect(toPercent(40, 0, 280)).toBeCloseTo(14.2857);
    expect(toPercent(5, 5, 5)).toBe(0);
    expect(valueFromPointer(150, 100, 200, 0, 100, 1)).toBe(25);
    expect(valueFromPointer(50, 100, 200, 0, 100, 1)).toBe(0);
  });

  it('moves with keys: step, big step, ends', () => {
    expect(valueFromKey('ArrowRight', 40, 0, 360, 10)).toBe(50);
    expect(valueFromKey('ArrowDown', 40, 0, 360, 10)).toBe(30);
    expect(valueFromKey('PageUp', 40, 0, 360, 10)).toBe(140);
    expect(valueFromKey('ArrowRight', 40, 0, 360, 10, true)).toBe(140);
    expect(valueFromKey('Home', 40, 0, 360, 10)).toBe(0);
    expect(valueFromKey('End', 40, 0, 360, 10)).toBe(360);
    expect(valueFromKey('a', 40, 0, 360, 10)).toBeNull();
  });

  it('marks histogram bins whose centre is inside the range', () => {
    const bins = binsInRange(36, 0, 360, 40, 180);
    expect(bins.filter(Boolean)).toHaveLength(14);
    expect(bins[3]).toBe(false);
    expect(bins[4]).toBe(true);
    expect(bins[17]).toBe(true);
    expect(bins[18]).toBe(false);
  });

  it('keeps range thumbs ordered and apart', () => {
    expect(moveRangeThumb([40, 180], 0, 200)).toEqual([180, 180]);
    expect(moveRangeThumb([40, 180], 1, 10)).toEqual([40, 40]);
    expect(moveRangeThumb([40, 180], 0, 175, 20)).toEqual([160, 180]);
  });

  it('picks the nearer thumb for a press', () => {
    expect(nearestThumb([40, 180], 20, 360)).toBe(0);
    expect(nearestThumb([40, 180], 100, 360)).toBe(0);
    expect(nearestThumb([40, 180], 120, 360)).toBe(1);
    expect(nearestThumb([40, 180], 300, 360)).toBe(1);
    expect(nearestThumb([360, 360], 360, 360)).toBe(0);
    expect(nearestThumb([0, 0], 0, 360)).toBe(1);
  });
});

describe('dates', () => {
  it('lays out September 2026 in five Monday-first weeks', () => {
    const weeks = monthGrid(new Date(2026, 8, 15), 1);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual(new Date(2026, 7, 31));
    expect(weeks[4][6]).toEqual(new Date(2026, 9, 4));
    const sunday = monthGrid(new Date(2026, 8, 1), 0);
    expect(sunday[0][0]).toEqual(new Date(2026, 7, 30));
  });

  it('counts inclusive days and formats ranges', () => {
    const r = { start: new Date(2026, 8, 7), end: new Date(2026, 9, 6) };
    expect(rangeLength(r)).toBe(30);
    expect(formatRange(r, 'en-US')).toBe('Sep 7 – Oct 6, 2026');
    expect(formatRange({ start: new Date(2025, 11, 30), end: new Date(2026, 0, 2) }, 'en-US')).toBe(
      'Dec 30, 2025 – Jan 2, 2026',
    );
    expect(normalizeRange(r.end, r.start)).toEqual(r);
  });

  it('resolves presets relative to today', () => {
    const today = new Date(2026, 9, 6);
    const [d7, d30, quarter, ytd] = DEFAULT_DATE_PRESETS.map((p) => resolvePreset(p, today));
    expect(rangeLength(d7)).toBe(7);
    expect(sameRange(d30, { start: new Date(2026, 8, 7), end: today })).toBe(true);
    expect(sameRange(quarter, { start: new Date(2026, 6, 1), end: new Date(2026, 8, 30) })).toBe(
      true,
    );
    expect(ytd.start).toEqual(new Date(2026, 0, 1));
    const jan = resolvePreset(DEFAULT_DATE_PRESETS[2], new Date(2026, 1, 10));
    expect(sameRange(jan, { start: new Date(2025, 9, 1), end: new Date(2025, 11, 31) })).toBe(true);
  });

  it('clamps month arithmetic to the last day', () => {
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(addMonths(new Date(2026, 2, 15), -12)).toEqual(new Date(2025, 2, 15));
  });
});

describe('list navigation', () => {
  const disabled = (i: number) => i === 2;
  it('steps over disabled items and stops at the ends', () => {
    expect(stepEnabled(4, 1, 1, disabled)).toBe(3);
    expect(stepEnabled(4, 3, 1, disabled)).toBe(3);
    expect(stepEnabled(4, 3, -1, disabled)).toBe(1);
    expect(stepEnabled(4, -1, 1, disabled)).toBe(0);
    expect(firstEnabled(3, -1, disabled)).toBe(1);
  });

  it('type-ahead finds, cycles and skips disabled items', () => {
    const labels = ['Net revenue', 'Gross revenue', 'Gross margin', 'Avg. order value'];
    const none = () => false;
    expect(typeaheadIndex(labels, 'g', 0, none)).toBe(1);
    expect(typeaheadIndex(labels, 'g', 1, none)).toBe(2);
    expect(typeaheadIndex(labels, 'gg', 2, none)).toBe(1);
    expect(typeaheadIndex(labels, 'gross m', 1, none)).toBe(2);
    expect(typeaheadIndex(labels, 'g', 0, (i) => i === 1)).toBe(2);
    expect(typeaheadIndex(labels, 'z', 0, none)).toBe(-1);
  });

  it('groups options in first-seen order', () => {
    const { sections, order } = groupOptions([
      { group: 'A' },
      { group: 'B' },
      { group: 'A' },
      { group: undefined },
    ]);
    expect(sections.map((s) => s.group)).toEqual(['A', 'B', undefined]);
    expect(order).toEqual([0, 2, 1, 3]);
  });

  it('splits a label around the matched query', () => {
    expect(splitMatch('Middle East & Africa', 'as')).toEqual(['Middle E', 'as', 't & Africa']);
    expect(splitMatch('Europe', 'xyz')).toEqual(['Europe', '', '']);
  });
});

describe('text fields', () => {
  it('parses grouped, signed and typographic-minus numbers', () => {
    expect(parseNumber('1,500.00')).toBe(1500);
    expect(parseNumber('−1,500')).toBe(-1500);
    expect(parseNumber('$ 42')).toBe(42);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('-')).toBeNull();
    expect(clampNumber(-3, 0, 10)).toBe(0);
  });

  it('matches shortcut chords', () => {
    const k = shortcutMatcher('⌘K');
    expect(k).not.toBeNull();
    const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
      ({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods }) as KeyboardEvent;
    expect(k?.(ev('k', { metaKey: true }))).toBe(true);
    expect(k?.(ev('k', { ctrlKey: true }))).toBe(true);
    expect(k?.(ev('k'))).toBe(false);
    expect(shortcutMatcher('/')?.(ev('/'))).toBe(true);
    expect(shortcutMatcher('⌘Enter')).toBeNull();
  });
});
