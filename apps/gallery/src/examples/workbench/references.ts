import {
  type ComponentSpec,
  type DashboardSpec,
  type QuartileSpec,
  quartileSchema,
} from '@quartile/react';
import { accounts } from './data';

type Schema = Record<string, unknown>;

/** Application policy on top of structural validation: this demo exposes one dataset. */
export function referenceErrors(spec: QuartileSpec): string[] {
  const dashboard = 'layout' in spec && Array.isArray(spec.layout);
  const items: ComponentSpec[] = dashboard
    ? (spec as DashboardSpec).layout
    : [spec as ComponentSpec];
  const definitions = quartileSchema.$defs as Record<string, Schema>;
  const fields = new Set(Object.keys(accounts.schema));
  const errors = new Set<string>();

  function visit(value: unknown, schema: Schema, path: string) {
    if (schema.$ref === '#/$defs/Field') {
      if (typeof value === 'string' && !fields.has(value))
        errors.add(`${path}: Unknown field "${value}".`);
      return;
    }
    if (typeof schema.$ref === 'string') {
      const target = definitions[schema.$ref.replace('#/$defs/', '')];
      if (target) visit(value, target, path);
      return;
    }
    if (Array.isArray(schema.oneOf)) {
      for (const choice of schema.oneOf) visit(value, choice as Schema, path);
    }
    if (Array.isArray(value) && schema.items) {
      value.forEach((item, index) => {
        visit(item, schema.items as Schema, `${path}/${index}`);
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
      const properties = schema.properties as Record<string, Schema>;
      for (const [key, item] of Object.entries(value)) {
        if (properties[key]) visit(item, properties[key], `${path}/${key}`);
      }
    }
  }

  items.forEach((item, index) => {
    const path = dashboard ? `/layout/${index}` : '';
    if (item.data !== undefined && item.data !== 'accounts') {
      errors.add(
        `${path}/data: Unknown dataset "${item.data}". This playground registers "accounts" only.`,
      );
      return;
    }
    visit(item, definitions[item.component], path);
    if (item.component === 'DataTable' && typeof item.sort === 'string') {
      const columns = item.columns as { field: string; key?: string }[];
      const key = item.sort.replace(/^-/, '');
      if (!columns.some((column) => (column.key ?? column.field) === key)) {
        errors.add(`${path}/sort: Unknown column "${key}".`);
      }
    }
  });
  return [...errors];
}
