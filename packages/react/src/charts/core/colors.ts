/**
 * Chart colors, for two kinds of author.
 *
 * A developer writing React props is trusted code: `colors` and `color` take a palette name, a
 * categorical index, or any CSS color (`rebeccapurple`, `rgb(20 80 200)`, `var(--brand)`).
 *
 * Text from a Markdown block or a JSON spec is not trusted: there a color is a palette name, an
 * index or a hex color and nothing else, so it can never carry a `url()`, a second declaration
 * or any other CSS into the page. `isChartColor` is that rule. It is enforced where such text
 * becomes a spec or props: the schema pattern (`validateSpec`), the block compiler, and
 * SpecView. No React here: the schema and the compiler import this file too.
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

/** JSON Schema `pattern` for a color written as a string in a block or a spec. */
export const CHART_COLOR_PATTERN = `^(?:${CHART_COLOR_NAMES.join('|')}|[1-8]|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))$`;

/** What to tell the author of a block or a spec whose color was refused. */
export const CHART_COLOR_HELP = `Use ${CHART_COLOR_NAMES.join(', ')}, a number from 1 to 8 for the categorical palette, or a hex color such as #2f45e8.`;

/**
 * A palette name (`signal`, `positive`, `negative`, `warning`, `muted`), `1`…`8` for the
 * categorical tokens `--q-cat-1` … `--q-cat-8`, or a CSS color. Blocks and JSON specs are
 * limited to the names, the indexes and hex colors.
 */
export type ChartColor = string | number;

/** True for a color that a block or a JSON spec may carry: a name, an index or a hex color. */
export function isChartColor(value: unknown): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 8;
  if (typeof value !== 'string') return false;
  return HEX.test(value) || INDEX.test(value) || Object.hasOwn(NAMED, value);
}

/**
 * Color settings of a spec, keeping only what `isChartColor` allows. SpecView applies it as the
 * spec becomes props, so a value that validation did not see (a spec changed in place after it
 * was checked) still cannot reach a component.
 */
export function specColors(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter(isChartColor);
  return isChartColor(value) ? value : undefined;
}

/**
 * The CSS value for a color prop: palette names and indexes become their tokens, and any other
 * non-empty string is the developer's CSS color, used as written. Null for anything else.
 */
export function chartColor(value: unknown): string | null {
  if (typeof value === 'number') return isChartColor(value) ? `var(--q-cat-${value})` : null;
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v === '') return null;
  if (INDEX.test(v)) return `var(--q-cat-${v})`;
  const lower = v.toLowerCase();
  return Object.hasOwn(NAMED, lower) ? NAMED[lower] : v;
}

const warned = new Set<string>();

/** Reports a refused setting once per message, so a re-rendering chart does not flood the log. */
export function warnOnce(message: string) {
  if (warned.has(message) || typeof console === 'undefined') return;
  warned.add(message);
  console.warn(`[quartile] ${message}`);
}

/** A prop that is not a color at all: an empty string, an object, a number outside 1–8. */
function refuse(value: unknown) {
  const shown = typeof value === 'string' ? `“${value.slice(0, 40)}”` : String(value);
  warnOnce(
    `Ignored the color ${shown}. Pass ${CHART_COLOR_NAMES.join(', ')}, a number from 1 to 8, or a CSS color.`,
  );
}

/** The CSS value of one color prop, or `fallback` when it is unset or not a color. */
export function singleColor(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  const css = chartColor(value);
  if (css === null) refuse(value);
  return css ?? fallback;
}

/** The CSS value of one color prop, or undefined when it is unset or not a color. */
export function optionalColor(value: unknown): string | undefined {
  if (value == null) return undefined;
  const css = chartColor(value);
  if (css === null) refuse(value);
  return css ?? undefined;
}

/**
 * CSS values for a `colors` prop, by series index or by series key. Returns undefined for no
 * setting, so callers keep their palette; an entry that is not a color leaves a gap, and that
 * series keeps its default.
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

/** The color of series `key` at position `i`: the setting, else `fallback(i)`. */
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
