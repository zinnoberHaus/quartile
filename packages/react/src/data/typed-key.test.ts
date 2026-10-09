import { typedValueKey } from './typed-key';

describe('typed query result identity', () => {
  it('distinguishes nullable, literal string, and nonfinite numeric identities', () => {
    const values = [
      null,
      '',
      '2026-10-09',
      '2026-10-09T00:00:00Z',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    expect(new Set(values.map((value) => typedValueKey(value))).size).toBe(values.length);
  });

  it('matches temporal predicates to UTC date results without parsing nominal strings', () => {
    const date = new Date('2026-10-09T00:00:00Z');
    const temporal = typedValueKey(date, 'temporal');
    expect(typedValueKey('2026-10-09', 'temporal')).toBe(temporal);
    expect(typedValueKey(date.getTime(), 'temporal')).toBe(temporal);
    expect(typedValueKey('2026-10-09T02:00:00+02:00', 'temporal')).toBe(temporal);
    expect(typedValueKey('2026-10-09', 'nominal')).not.toBe(
      typedValueKey('2026-10-09T00:00:00Z', 'nominal'),
    );
  });
});
