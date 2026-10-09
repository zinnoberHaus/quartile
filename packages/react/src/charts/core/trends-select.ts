import { useState } from 'react';
import type { Predicate, Primitive } from '../../data/predicates';
import type { SelectionApi } from '../../selection/Selection';
import { keyOf, predicateHas } from './trends-aggregate';

/** Narrows a raw field value to something a predicate can hold. */
export function toPrimitive(raw: unknown): Primitive {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
  return String(raw);
}

/**
 * Click-to-select for one field. Publishes `toggle(field, value, { source })` to the nearest
 * Selection; with no Selection around, keeps the same single-value toggle in local state so
 * highlighting and `onSelect` still work.
 */
export function useToggleSelect(
  sel: SelectionApi | null,
  field: string,
  source: string,
  onSelect?: (predicate: Predicate | null) => void,
  identity: (raw: unknown) => string = keyOf,
) {
  const [local, setLocal] = useState<Primitive[]>([]);
  const predicate: Predicate | undefined = sel
    ? sel.get(field)
    : local.length
      ? { field, op: 'in', value: local, source }
      : undefined;
  /** True when a click-style (eq / in) predicate is active on the field. Ranges never dim marks. */
  const selecting = predicate != null && (predicate.op === 'in' || predicate.op === 'eq');
  const has = (raw: unknown) =>
    selecting &&
    (identity === keyOf
      ? predicateHas(predicate, raw)
      : (predicate.op === 'in' ? predicate.value : [predicate.value]).some(
          (value) => identity(value) === identity(raw),
        ));
  const toggle = (raw: unknown) => {
    const value = toPrimitive(raw);
    if (sel) {
      if (identity === keyOf) sel.toggle(field, value, { source });
      else sel.set(field, has(value) ? [] : [value], { source, op: 'in' });
      onSelect?.(sel.get(field) ?? null);
      return;
    }
    const k = identity(value);
    const next = local.some((v) => identity(v) === k) ? [] : [value];
    setLocal(next);
    onSelect?.(next.length ? { field, op: 'in', value: next, source } : null);
  };
  return { predicate, selecting, has, toggle };
}
