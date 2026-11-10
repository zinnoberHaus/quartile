/** Reads the `actions:` setting of a view or a dashboard: `rows, download`, or `none`. */
import { actionsFor, VIEW_ACTIONS, type ViewAction } from '../spec/actions';
import { type Diagnostic, warning } from './diagnostics';
import type { PropEntry } from './parse';

const NONE = new Set(['none', 'no', 'off', 'false']);

/** The actions a setting names, in toolbar order. Words that are not actions are reported. */
export function parseActions(prop: PropEntry, diagnostics: Diagnostic[]): ViewAction[] {
  const words = prop.value
    .replace(/^\[(.*)\]$/s, '$1')
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.replace(/^["'`]|["'`]$/g, ''))
    .filter((w) => w !== '' && w !== 'and');
  const out = new Set<ViewAction>();
  for (const word of words) {
    if (NONE.has(word)) continue;
    if ((VIEW_ACTIONS as readonly string[]).includes(word)) out.add(word as ViewAction);
    else {
      diagnostics.push(
        warning(
          `“${word}” is not an action; it was ignored.`,
          prop.line,
          `Actions: ${VIEW_ACTIONS.join(', ')}, or none.`,
        ),
      );
    }
  }
  return VIEW_ACTIONS.filter((a) => out.has(a));
}

/**
 * `actions` narrowed to what `component` can do. With `report`, each action the view asked for
 * and cannot have is reported; a dashboard's default is narrowed silently.
 */
export function supportedActions(
  actions: readonly ViewAction[],
  component: string,
  report?: { kind: string; line: number; diagnostics: Diagnostic[] },
): ViewAction[] {
  const possible = actionsFor(component);
  if (report) {
    for (const action of actions) {
      if (possible.includes(action)) continue;
      report.diagnostics.push(
        warning(
          `A ${report.kind} has no “${action}” action; it was ignored.`,
          report.line,
          possible.length ? `It can show: ${possible.join(', ')}.` : undefined,
        ),
      );
    }
  }
  return actions.filter((a) => possible.includes(a));
}
