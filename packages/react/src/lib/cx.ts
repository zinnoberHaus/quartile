type ClassValue = string | false | null | undefined | 0;

/** Joins truthy class names. */
export function cx(...values: ClassValue[]): string {
  let out = '';
  for (const v of values) if (v) out = out ? `${out} ${v}` : v;
  return out;
}
