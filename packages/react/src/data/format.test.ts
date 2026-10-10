import { describe, expect, it, vi } from 'vitest';
import {
  compactNumber,
  deltaTone,
  formatDelta,
  formatParts,
  isPercentFormat,
  makeFieldFormatter,
  makeFormatter,
  makeRangeFormatter,
} from './format';
import { dataset } from './schema';
import type { Formatter } from './types';

const intlNumber = (locale: string, value: number | bigint, options: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(locale, options)
    .formatToParts(value)
    .map((p) => (p.type === 'minusSign' ? '−' : p.value))
    .join('');

describe('scientific and international display contract', () => {
  it('keeps scientific observations and distinguishes detailed values from axes', () => {
    expect(makeFormatter('number')(0.0000000123)).toBe('0.0000000123');
    expect(makeFormatter('number')(-0)).toBe('0');
    expect(makeFormatter('currency')(123456.78)).toBe('$123,456.78');
    expect(makeFormatter('currency', { short: true })(123456.78)).toBe('$123.5K');
    expect(makeFormatter('number', { short: true })(0.0000000123)).toBe('1.23E-8');
    expect(compactNumber(999999)).toBe('1.0M');
    expect(compactNumber(NaN)).toBe('—');
    expect(makeFormatter('scientific')(123456)).toBe('1.23456E5');
    expect(makeFormatter('engineering')(123456)).toBe('123.456E3');
  });
  it('uses native locale grouping, currency placement and currency minor units', () => {
    for (const locale of ['en-US', 'de-DE', 'fr-FR', 'hi-IN', 'ar-EG']) {
      expect(makeFormatter('currency', { locale, currency: 'EUR' })(-1234.56)).toBe(
        intlNumber(locale, -1234.56, { style: 'currency', currency: 'EUR' }),
      );
      expect(makeFormatter('currency-compact', { locale, currency: 'EUR' })(123456)).toBe(
        intlNumber(locale, 123456, {
          style: 'currency',
          currency: 'EUR',
          notation: 'compact',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      );
    }
    expect(makeFormatter('currency', { currency: 'JPY' })(1234.56)).toBe('¥1,235');
    expect(makeFormatter('currency', { currency: 'KWD' })(12.3456)).toBe('KWD 12.346');
  });
  it('supports explicit notation, precision, units, accounting and display decorations', () => {
    expect(
      makeFormatter({
        type: 'number',
        style: 'currency',
        currency: 'USD',
        currencySign: 'accounting',
      })(-1234),
    ).toBe('($1,234.00)');
    expect(
      makeFormatter({ type: 'number', notation: 'engineering', maximumSignificantDigits: 4 })(
        0.00001234,
      ),
    ).toBe('12.34E-6');
    expect(
      makeFormatter({
        type: 'number',
        style: 'unit',
        unit: 'celsius',
        unitDisplay: 'long',
        locale: 'de-DE',
        maximumFractionDigits: 1,
      })(22.55),
    ).toBe('22,6 Grad Celsius');
    expect(
      makeFormatter({
        type: 'number',
        scale: 1000,
        suffix: ' ms',
        prefix: '≈ ',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })(1.234),
    ).toBe('≈ 1,234.00 ms');
    expect(makeFormatter({ maximumFractionDigits: 4 }, { short: true })(1234.56789)).toBe(
      '1,234.5679',
    );
    expect(isPercentFormat({ type: 'number', style: 'percent' })).toBe(true);
    expect(isPercentFormat({ style: 'percent' })).toBe(true);
    expect(isPercentFormat('number')).toBe(false);
  });
  it('preserves exact bigint and decimal-string display inputs', () => {
    expect(makeFormatter('number')(Number.MAX_SAFE_INTEGER)).toBe('9,007,199,254,740,991');
    const exact = '9007199254740993.125';
    expect(makeFormatter({ maximumFractionDigits: 3 })(exact)).toBe('9,007,199,254,740,993.125');
    expect(makeFormatter('number')(exact)).toBe('9,007,199,254,740,993.125');
    expect(makeFormatter('integer')(9007199254740993n)).toBe('9,007,199,254,740,993');
  });
  it('keeps missing observations out of every built-in format and honors explicit missing text', () => {
    const formats: Formatter[] = [
      'number',
      'scientific',
      'engineering',
      'bytes',
      'bytes-binary',
      'duration',
      'currency',
      { type: 'date', dateStyle: 'short' },
      { type: 'number', notation: 'scientific' },
    ];
    for (const format of formats)
      for (const value of [
        null,
        undefined,
        '',
        '  ',
        false,
        true,
        NaN,
        Infinity,
        -Infinity,
        {},
        [],
      ])
        expect(makeFormatter(format)(value)).toBe('—');
    expect(makeFormatter({ type: 'number', missing: 'Not observed', prefix: '$' })(null)).toBe(
      'Not observed',
    );
    expect(makeFormatter({ type: 'date', missing: 'Unknown' })('2026-02-30')).toBe('Unknown');
    expect(makeFormatter({ type: 'number', scale: 1e300 })(1e300)).toBe('—');
  });
  it('formats instants in a chosen zone and keeps date-only calendar identity', () => {
    const format: Formatter = { type: 'date', dateStyle: 'full', timeStyle: 'long' };
    const instant = '2026-01-01T01:30:00Z';
    for (const timeZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      expect(makeFormatter(format, { locale: 'en-US', timeZone })(instant)).toBe(
        new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone })
          .formatToParts(new Date(instant))
          .map((part) =>
            part.type === 'literal' ? part.value.replace(/[\u00a0\u202f]/g, ' ') : part.value,
          )
          .join(''),
      );
      expect(makeFormatter('date', { timeZone })('2026-01-01')).toBe('Jan 1, 2026');
    }
    expect(
      makeFormatter(
        { type: 'date', timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
        { timeZone: 'Asia/Tokyo' },
      )(instant),
    ).toBe('01:30');
    expect(dataset([{ observed: instant }]).schema.observed.format).toBe('datetime');
    expect(dataset([{ day: '2026-01-01' }]).schema.day.format).toBe('date-short');
  });
  it('keeps server/browser date spacing stable without rewriting application text or bidi marks', () => {
    const format: Formatter = { type: 'date', timeStyle: 'long', timeZone: 'UTC' };
    const start = '2026-10-10T00:30:00Z';
    const end = '2026-10-10T03:30:00Z';
    const nativeParts = Intl.DateTimeFormat.prototype.formatToParts;
    const nativeRangeParts = Intl.DateTimeFormat.prototype.formatRangeToParts;
    const outputs = [];
    for (const space of [' ', '\u00a0', '\u202f']) {
      const replace = <T extends { type: string; value: string }>(parts: T[]) =>
        parts.map((part) =>
          part.type === 'literal'
            ? { ...part, value: part.value.replace(/[ \u00a0\u202f]/g, space) }
            : part,
        );
      const single = vi
        .spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
        .mockImplementation(function (this: Intl.DateTimeFormat, value) {
          return replace(nativeParts.call(this, value));
        });
      const range = vi
        .spyOn(Intl.DateTimeFormat.prototype, 'formatRangeToParts')
        .mockImplementation(function (this: Intl.DateTimeFormat, a, b) {
          return replace(nativeRangeParts.call(this, a, b));
        });
      try {
        outputs.push({
          single: makeFormatter(format)(start),
          parts: formatParts(format, start),
          range: makeRangeFormatter(format)(start, end),
        });
      } finally {
        single.mockRestore();
        range.mockRestore();
      }
    }
    expect(outputs[0].single).toBe('12:30:00 AM UTC');
    expect(outputs[1]).toEqual(outputs[0]);
    expect(outputs[2]).toEqual(outputs[0]);
    const arabic = formatParts({ type: 'date', dateStyle: 'short', timeZone: 'UTC' }, start, {
      locale: 'ar-EG',
    });
    expect(arabic.some((part) => /\u200f/.test(part.value))).toBe(true);
    const custom = 'Keep\u00a0this\u202fspacing';
    expect(makeFormatter(() => custom)(1)).toBe(custom);
    expect(makeFormatter({ type: 'date', missing: custom })(null)).toBe(custom);
    expect(makeFormatter({ type: 'number', prefix: custom, suffix: custom })(1)).toBe(
      `${custom}1${custom}`,
    );
  });
  it('handles SI/binary byte boundaries and elapsed time without 24-hour rollover', () => {
    expect(makeFormatter('bytes')(1000)).toBe('1 kB');
    expect(makeFormatter('bytes-binary')(1024 ** 4)).toBe('1 TiB');
    expect(
      makeFormatter({ type: 'bytes', base: 1024, maximumFractionDigits: 1, locale: 'de-DE' })(1536),
    ).toBe('1,5 KiB');
    expect(makeFormatter('bytes')(999999)).toBe('1 MB');
    expect(makeFormatter('duration')(90061000)).toBe('25:01:01');
    expect(
      makeFormatter({ type: 'duration', unit: 'second', maximumFractionDigits: 2 })(59.999),
    ).toBe('0:01:00');
    expect(
      makeFormatter({
        type: 'duration',
        unit: 'second',
        maximumFractionDigits: 2,
        locale: 'de-DE',
      })(-3661.25),
    ).toBe('−1:01:01,25');
  });
  it('selects explicit surface formats without changing value data', () => {
    const field = dataset([{ latency: 0.123456 }], {
      latency: {
        format: { type: 'number', scale: 1000, suffix: ' ms', maximumFractionDigits: 3 },
        axisFormat: { type: 'number', scale: 1000, maximumFractionDigits: 0 },
        tooltipFormat: {
          type: 'number',
          scale: 1000,
          suffix: ' milliseconds',
          maximumFractionDigits: 3,
        },
      },
    }).schema.latency;
    expect(makeFieldFormatter(field)(0.123456)).toBe('123.456 ms');
    expect(makeFieldFormatter(field, { surface: 'axis', short: true })(0.123456)).toBe('123');
    expect(makeFieldFormatter(field, { surface: 'tooltip' })(0.123456)).toBe(
      '123.456 milliseconds',
    );
    expect(makeFieldFormatter(field, { surface: 'tooltip' }, 'scientific')(0.123456)).toBe(
      '1.23456E-1',
    );
  });
  it('exposes semantic parts and range formatting without changing a callback result', () => {
    const parts = formatParts({ style: 'currency', currency: 'EUR' }, -1234.56, {
      locale: 'ar-EG',
    });
    expect(parts.some((p) => p.type === 'currency')).toBe(true);
    expect(parts.find((p) => p.type === 'minusSign')?.value).toBe('−');
    expect(parts.map((p) => p.value).join('')).toBe(
      makeFormatter({ style: 'currency', currency: 'EUR' }, { locale: 'ar-EG' })(-1234.56),
    );
    expect(
      makeRangeFormatter({ type: 'date', dateStyle: 'medium', timeZone: 'UTC' })(
        '2026-01-01',
        '2026-01-05',
      ),
    ).toBe(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).formatRange(
        new Date('2026-01-01'),
        new Date('2026-01-05'),
      ),
    );
    expect(makeRangeFormatter((v) => `value=${v}`)(1, 2)).toBe('value=1 – value=2');
    expect(makeRangeFormatter('number')(null, 2)).toBe('— – 2');
    expect(makeRangeFormatter({ maximumFractionDigits: 1 })('10', '2')).toBe('10 – 2');
    const exactRange = makeRangeFormatter({ type: 'number', maximumFractionDigits: 3 });
    expect(exactRange('9007199254740993.125', '9007199254740993.124')).toBe(
      '9,007,199,254,740,993.125 – 9,007,199,254,740,993.124',
    );
    expect(exactRange('9007199254740993.124', '9007199254740993.125')).toBe(
      '9,007,199,254,740,993.124 – 9,007,199,254,740,993.125',
    );
    expect(exactRange(9007199254740993n, 9007199254740994n)).toBe(
      '9,007,199,254,740,993 – 9,007,199,254,740,994',
    );
    expect(makeRangeFormatter({ maximumFractionDigits: 0 })(1.1, 1.2)).toBe('1 – 1');
    expect(
      makeRangeFormatter({ type: 'date', dateStyle: 'short', timeZone: 'UTC' })(
        '2026-01-01T01:00:00Z',
        '2026-01-01T02:00:00Z',
      ),
    ).toBe('1/1/26 – 1/1/26');
    expect(
      makeRangeFormatter({ style: 'currency', currency: 'EUR' }, { locale: 'de-DE' })(1, 2),
    ).toBe(
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).formatRange(1, 2),
    );
  });
  it('formats localized deltas and keeps invalid measurements neutral', () => {
    expect(formatDelta(0.1234, 'percent', 2, { locale: 'de-DE' })).toBe('+12,34 %');
    expect(formatDelta(-0.004, 'number', 1)).toBe('±0.0');
    for (const value of [NaN, Infinity, -Infinity, 1e308]) expect(formatDelta(value)).toBe('—');
    expect(deltaTone(NaN)).toBe('neutral');
    expect(deltaTone(Infinity)).toBe('neutral');
    expect(deltaTone(1e-13)).toBe('positive');
  });
  it('rejects invalid configuration rather than silently substituting another format', () => {
    expect(() => makeFormatter({ type: 'date', timeZone: 'Mars/Crater' })).toThrow(RangeError);
    expect(() => makeFormatter({ type: 'number', style: 'unit', unit: 'invalid-unit' })).toThrow(
      RangeError,
    );
    expect(() =>
      makeFormatter({ type: 'number', minimumFractionDigits: 5, maximumFractionDigits: 2 }),
    ).toThrow(RangeError);
    expect(() => makeFormatter({ type: 'number', scale: Infinity })).toThrow(RangeError);
    expect(() => formatDelta(1, 'number', 21)).toThrow(RangeError);
  });
});
