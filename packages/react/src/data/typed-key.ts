import type { FieldType } from './types';

/** Physical-type identity for prepared query results; nominal ISO strings remain strings. */
export function typedValueKey(value: unknown, type?: FieldType): string {
  if (value == null) return 'null';
  if (type === 'temporal') {
    const time =
      value instanceof Date
        ? value.getTime()
        : typeof value === 'number'
          ? value
          : Date.parse(String(value));
    return `temporal:${time}`;
  }
  if (value instanceof Date) return `date:${value.getTime()}`;
  if (typeof value === 'number') return `number:${String(value)}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}
