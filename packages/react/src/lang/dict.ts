/**
 * A map keyed by names that come from block text (columns, datasets, settings), without a
 * prototype: `constructor`, `toString` or `__proto__` are ordinary keys there, so a lookup never
 * returns an inherited function and a write never reaches a shared object.
 */
export function dict<T>(
  ...sources: (Readonly<Record<string, T>> | undefined)[]
): Record<string, T> {
  const out = Object.create(null) as Record<string, T>;
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) out[key] = source[key];
  }
  return out;
}
