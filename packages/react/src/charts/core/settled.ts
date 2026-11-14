import { useMemo } from 'react';

function keyOf(value: unknown): string | null {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

/**
 * A plain setting (a list of colors, a margin, reference lines) with a stable identity: the same
 * object is returned until its JSON changes. Callers write these inline, `colors={['signal']}`,
 * which would otherwise rebuild every memo that depends on them on each render. A value JSON
 * cannot represent is returned as given.
 */
export function useSettled<T>(value: T): T {
  const key = keyOf(value);
  const settled = useMemo(() => (key ? (JSON.parse(key) as T) : undefined), [key]);
  return key === null ? value : (settled as T);
}
