import { formatField } from './format';
import { finiteNumber } from './number';
import { toComparable } from './schema';
import type { Row, Schema } from './types';

export type Primitive = string | number | boolean | Date | null;

interface PredicateBase {
  field: string;
  /** The component that published it. A view never filters itself by its own predicates. */
  source?: string;
  /** Optional human label, shown in FilterBar chips and selection logs. */
  label?: string;
}

export type Predicate =
  | (PredicateBase & { op: 'eq'; value: Primitive })
  | (PredicateBase & { op: 'in'; value: Primitive[] })
  | (PredicateBase & { op: 'between'; value: [Primitive, Primitive] });

export function matches(row: Row, p: Predicate): boolean {
  const v = toComparable(row[p.field]);
  switch (p.op) {
    case 'eq':
      return v === toComparable(p.value);
    case 'in':
      return p.value.some((x) => toComparable(x) === v);
    case 'between': {
      if (v == null || typeof v === 'boolean') return false;
      const lo = toComparable(p.value[0]);
      const hi = toComparable(p.value[1]);
      if (typeof v === 'number' || typeof lo === 'number' || typeof hi === 'number') {
        const value = finiteNumber(v);
        const lower = finiteNumber(lo);
        const upper = finiteNumber(hi);
        return (
          value != null &&
          (lo == null || (lower != null && value >= lower)) &&
          (hi == null || (upper != null && value <= upper))
        );
      }
      return (
        typeof v === 'string' &&
        v.trim() !== '' &&
        (lo == null || (typeof lo === 'string' && v >= lo)) &&
        (hi == null || (typeof hi === 'string' && v <= hi))
      );
    }
  }
}

/** Keeps rows that satisfy every predicate. */
export function applyPredicates<R extends Row>(
  rows: readonly R[],
  predicates: readonly Predicate[],
): R[] {
  if (predicates.length === 0) return rows as R[];
  return rows.filter((r) => predicates.every((p) => matches(r, p)));
}

/** `date ∈ [Aug 30, Sep 12]`, `category = "Footwear"`, `region ∈ {Europe, Asia}`. */
export function describePredicate(p: Predicate, schema: Schema = {}): string {
  const f = schema[p.field];
  const fmt = (v: unknown) => (typeof v === 'string' && !f ? `"${v}"` : formatField(f, v));
  switch (p.op) {
    case 'eq':
      return `${p.field} = ${fmt(p.value)}`;
    case 'in':
      return `${p.field} ∈ {${p.value.map(fmt).join(', ')}}`;
    case 'between':
      return `${p.field} ∈ [${fmt(p.value[0])}, ${fmt(p.value[1])}]`;
  }
}

/** Short value-only text for chips: "Europe", "Aug 30 – Sep 12", "3 selected". */
export function predicateValueLabel(p: Predicate, schema: Schema = {}): string {
  const f = schema[p.field];
  switch (p.op) {
    case 'eq':
      return formatField(f, p.value);
    case 'in':
      return p.value.length === 1 ? formatField(f, p.value[0]) : `${p.value.length} selected`;
    case 'between':
      return `${formatField(f, p.value[0])} – ${formatField(f, p.value[1])}`;
  }
}
