import type { FieldDef, Formatter } from '../../data/types';
import type { Aggregate } from './trends-aggregate';

/**
 * Default value format for ranked lists and part-to-whole charts: counts are integers, currency is
 * compact ("$548.0K", "$1.32M") so values line up in a narrow column, everything else keeps the
 * field's own format. An explicit `format` always wins.
 */
export function listFormat(
  field: FieldDef | undefined,
  aggregate: Aggregate,
  format: Formatter | undefined,
): Formatter {
  if (format) return format;
  if (!field || aggregate === 'count') return 'integer';
  if (field.format === 'currency') return 'currency-compact';
  return field.format;
}
