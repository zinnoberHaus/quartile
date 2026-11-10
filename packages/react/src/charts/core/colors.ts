/**
 * The colors a chart setting may name. One vocabulary serves React props, JSON specs and Markdown
 * blocks: a palette name, a categorical index, or a hex color. Every value passes through
 * `chartColor` before it reaches a `style`, so text from a block or a model can never carry a
 * `url()`, a second declaration or any other CSS into the page. No React here: the schema and
 * the block compiler import this file too.
 */

/** Palette names and the token each one reads. */
const NAMED: Record<string, string> = {
  signal: 'var(--q-signal)',
  positive: 'var(--q-positive)',
  negative: 'var(--q-negative)',
  warning: 'var(--q-warning)',
  muted: 'var(--q-series-muted)',
};

export const CHART_COLOR_NAMES = Object.keys(NAMED);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const INDEX = /^[1-8]$/;
/** A reference to one of Quartile's own tokens, as React callers wrote before names existed. */
const OWN_TOKEN = /^var\(--q-[a-z0-9-]+\)$/;

/** JSON Schema `pattern` for a color written as a string. */
export const CHART_COLOR_PATTERN = `^(?:${CHART_COLOR_NAMES.join('|')}|[1-8]|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))$`;

/** What to tell an author whose color was refused. */
export const CHART_COLOR_HELP = `Use ${CHART_COLOR_NAMES.join(', ')}, a number from 1 to 8 for the categorical palette, or a hex color such as #2f45e8.`;

/**
 * A palette name (`signal`, `positive`, `negative`, `warning`, `muted`), `1`…`8` for the
 * categorical tokens `--q-cat-1` … `--q-cat-8`, or a hex color (`#rgb`, `#rrggbb`, `#rrggbbaa`).
 */
export type ChartColor = string | number;

/** True for a color that data (a block, a JSON spec) may carry. Stricter than `chartColor`. */
export function isChartColor(value: unknown): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 8;
  if (typeof value !== 'string') return false;
  return HEX.test(value) || INDEX.test(value) || Object.hasOwn(NAMED, value);
}

/**
 * The CSS value for a chart color, or null when the value is not one. This is the only path from
 * a color setting to a `style`. Besides the colors data may carry, React callers may pass a
 * reference to a Quartile token, `var(--q-…)`; nothing else is let through.
 */
export function chartColor(value: unknown): string | null {
  if (typeof value === 'number') return isChartColor(value) ? `var(--q-cat-${value})` : null;
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (HEX.test(v)) return v;
  if (INDEX.test(v)) return `var(--q-cat-${v})`;
  const lower = v.toLowerCase();
  if (Object.hasOwn(NAMED, lower)) return NAMED[lower];
  if (OWN_TOKEN.test(v)) return v;
  return null;
}

const warned = new Set<string>();

/** Reports a refused setting once per message, so a re-rendering chart does not flood the log. */
export function warnOnce(message: string) {
  if (warned.has(message) || typeof console === 'undefined') return;
  warned.add(message);
  console.warn(`[quartile] ${message}`);
}

function refuse(value: unknown) {
  const shown = typeof value === 'string' ? `“${value.slice(0, 40)}”` : String(value);
  warnOnce(`Ignored the color ${shown}. ${CHART_COLOR_HELP}`);
}

/** One validated color, or `fallback` (with a console warning) when the value is refused. */
export function singleColor(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  const css = chartColor(value);
  if (css === null) refuse(value);
  return css ?? fallback;
}

/** One validated color, or undefined (with a console warning) when the value is refused. */
export function optionalColor(value: unknown): string | undefined {
  if (value == null) return undefined;
  const css = chartColor(value);
  if (css === null) refuse(value);
  return css ?? undefined;
}

/**
 * Validated series colors, by series index or by series key. Returns undefined for no setting, so
 * callers keep their palette; refused entries are dropped and that series keeps its default.
 */
export function seriesColors(
  colors: readonly ChartColor[] | Readonly<Record<string, ChartColor>> | undefined,
): (string | undefined)[] | Record<string, string> | undefined {
  if (colors == null) return undefined;
  if (Array.isArray(colors)) {
    return (colors as readonly unknown[]).map((c) => {
      const css = chartColor(c);
      if (css === null && c != null) refuse(c);
      return css ?? undefined;
    });
  }
  if (typeof colors !== 'object') {
    refuse(colors);
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, c] of Object.entries(colors)) {
    const css = chartColor(c);
    if (css === null) refuse(c);
    else out[key] = css;
  }
  return out;
}

/** The color of series `key` at position `i`: the validated setting, else `fallback(i)`. */
export function pickColor(
  colors: (string | undefined)[] | Record<string, string> | undefined,
  key: string,
  i: number,
  fallback: (i: number) => string,
): string {
  if (!colors) return fallback(i);
  const chosen = Array.isArray(colors)
    ? colors[i]
    : Object.hasOwn(colors, key)
      ? colors[key]
      : undefined;
  return chosen ?? fallback(i);
}
