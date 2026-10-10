import { ANALYSIS_LIMITS } from './limits';

const field = { type: 'string', minLength: 1, maxLength: 160 };
const value = { type: ['string', 'number', 'boolean', 'null'] };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Provider-neutral JSON Schema. Providers may require translating their supported subset.
 * Runtime validation additionally checks field existence, types, dates and conflicting actions.
 */
export const analysisPlanSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Quartile analysis plan',
  ...object({
    version: { const: 1 },
    title: { type: 'string', minLength: 1, maxLength: 160 },
    summary: { type: 'string', minLength: 1, maxLength: ANALYSIS_LIMITS.text },
    actions: {
      type: 'array',
      minItems: 1,
      maxItems: ANALYSIS_LIMITS.actions,
      items: {
        oneOf: [
          object({ type: { const: 'filter' }, field, op: { const: 'eq' }, value }),
          object({
            type: { const: 'filter' },
            field,
            op: { const: 'in' },
            value: {
              type: 'array',
              minItems: 1,
              maxItems: ANALYSIS_LIMITS.filterValues,
              items: value,
            },
          }),
          object({
            type: { const: 'filter' },
            field,
            op: { const: 'between' },
            value: { type: 'array', minItems: 2, maxItems: 2, items: value },
          }),
          object({ type: { const: 'clear-filter' }, field }),
          object({ type: { const: 'sort' }, field, direction: { enum: ['asc', 'desc'] } }),
          object({ type: { const: 'chart' }, chart: { const: 'histogram' }, x: field }),
          object({
            type: { const: 'chart' },
            chart: { enum: ['scatter', 'bar', 'line'] },
            x: field,
            y: field,
          }),
          object({
            type: { const: 'table' },
            fields: {
              type: 'array',
              minItems: 1,
              maxItems: ANALYSIS_LIMITS.tableFields,
              uniqueItems: true,
              items: field,
            },
            limit: { type: 'integer', minimum: 1, maximum: ANALYSIS_LIMITS.tableRows },
          }),
        ],
      },
    },
  }),
} as const;
