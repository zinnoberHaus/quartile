/**
 * The controls a view may show with its drawing. Kept free of React so the compiler, the
 * schema and the renderer agree on the words and on which component can do what.
 */
import { quartileSchema } from './schema';

/**
 * `table` switches the chart and its table; `rows` opens the rows the view is drawn from;
 * `download` saves those rows as CSV.
 */
export type ViewAction = 'table' | 'rows' | 'download';

/** Every action, in the order a toolbar shows them. */
export const VIEW_ACTIONS: readonly ViewAction[] = ['table', 'rows', 'download'];

/**
 * The actions a component can offer: charts with a table view take all three, a KPI or a
 * sparkline traces to its rows, a table can only be downloaded (it already shows its rows), and
 * filters and explorers have their own controls.
 */
export function actionsFor(component: string): readonly ViewAction[] {
  if (component === 'FilterBar' || component === 'DataExplorer') return [];
  if (component === 'DataTable') return ['download'];
  const def = (quartileSchema.$defs as Record<string, { properties?: object }>)[component];
  if (!def?.properties) return [];
  return 'view' in def.properties ? VIEW_ACTIONS : ['rows', 'download'];
}

/** The known actions in `value`, in toolbar order, without repeats. */
export function knownActions(value: unknown): ViewAction[] {
  if (!Array.isArray(value)) return [];
  return VIEW_ACTIONS.filter((action) => value.includes(action));
}

/**
 * The actions one view shows. A host's `false` turns them off whatever the view asks; otherwise
 * the view's own list wins (an empty list means none) and the host's list is the default.
 */
export function resolveActions(
  component: string,
  own: unknown,
  host: readonly string[] | false | undefined,
): ViewAction[] {
  if (host === false) return [];
  const asked = Array.isArray(own) ? own : (host ?? []);
  const possible = actionsFor(component);
  return knownActions(asked).filter((action) => possible.includes(action));
}

/** A file name for a view's rows: its title as a slug, or `rows`. */
export function csvFileName(title: unknown): string {
  const slug =
    typeof title === 'string'
      ? title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80)
          .replace(/-+$/, '')
      : '';
  return `${slug || 'rows'}.csv`;
}
