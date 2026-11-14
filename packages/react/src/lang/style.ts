/**
 * Presentation settings in a block: margins, colors, axis bounds and ticks, legend placement and
 * reference lines. These have forms the generic schema coercion cannot read (`margin: 16 24`,
 * `y.min: 0`, `reference.label: Target`, `color: #2f45e8`), so they are read here and written to
 * the spec as plain numbers, booleans, words and validated color tokens. Nothing in this file
 * lets CSS, a class name or a URL through.
 */
import { CHART_COLOR_HELP, isChartColor } from '../charts/core/colors';
import type { SpecComponentName } from '../spec/schema';
import { type Diagnostic, info, warning } from './diagnostics';
import type { PropEntry } from './parse';
import { parseNumberToken } from './table';

type JsonSchema = Record<string, unknown>;
type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
const MAX_MARGIN = 400;

export interface StyleState {
  component: SpecComponentName;
  /** Kind word for messages, e.g. `bar`. */
  kind: string;
  /** The component's JSON Schema properties. */
  props: Record<string, JsonSchema>;
  spec: Record<string, unknown>;
  /** Source line of each spec property, for validation messages. */
  lines: Map<string, number>;
  diagnostics: Diagnostic[];
  columns: readonly string[];
  /** False when the host keeps its own colors: color settings are dropped with a note. */
  blockColors: boolean;
  margin: { all?: number[]; sides: Partial<Record<Side, number>>; line?: number };
  reference: { value?: unknown; label?: string; line?: number };
}

export function styleState(
  init: Pick<
    StyleState,
    'component' | 'kind' | 'props' | 'spec' | 'lines' | 'diagnostics' | 'columns' | 'blockColors'
  >,
): StyleState {
  return { ...init, margin: { sides: {} }, reference: {} };
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && /^["'`]/.test(t) && t[0] === t[t.length - 1]) return t.slice(1, -1);
  return t;
}

function readBool(s: string): boolean | undefined {
  const v = s.trim().toLowerCase();
  if (['true', 'yes', 'on', '1', 'y', 'show', 'shown', 'visible'].includes(v)) return true;
  if (['false', 'no', 'off', '0', 'n', 'none', 'hide', 'hidden'].includes(v)) return false;
  return undefined;
}

/** "1,200", "1.2M", "$40", "85%" (→ 0.85, as percent columns hold ratios), "64px". */
function readNumber(s: string): number | undefined {
  const text = unquote(s).replace(/px$/i, '');
  const token = parseNumberToken(text);
  if (!token) return undefined;
  return token.percent ? token.value / 100 : token.value;
}

function isColumn(st: StyleState, name: string): boolean {
  const n = unquote(name).toLowerCase();
  return st.columns.some((c) => c.toLowerCase() === n);
}

const has = (st: StyleState, prop: string) => Object.hasOwn(st.props, prop);

function set(st: StyleState, key: string, value: unknown, line: number) {
  st.spec[key] = value;
  st.lines.set(key, line);
}

/* ------------------------------------------------------------------------------------------ */
/* Colors                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Splits on commas and spaces outside parentheses, so `rgb(1, 2, 3)` stays one (refused) entry. */
function colorEntries(raw: string): string[] {
  const text = raw.trim();
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      /* not JSON: read it as a bracketed list */
    }
  }
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of text.replace(/^\[|\]$/g, '')) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';' || /\s/.test(ch))) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.map(unquote).filter((entry) => entry !== '' && entry.toLowerCase() !== 'and');
}

/** A block color in its spec form: a lowercase name or hex string, or 1–8 as a number. */
function readColor(entry: string): string | number | null {
  const lower = entry.trim().toLowerCase();
  if (/^[1-8]$/.test(lower)) return Number(lower);
  return isChartColor(lower) ? lower : null;
}

const CSS_COLOR_WORDS = new Set(
  'red orange yellow green blue purple violet pink brown black white gray grey teal cyan magenta navy gold silver lime indigo maroon olive coral salmon crimson turquoise beige transparent currentcolor'.split(
    ' ',
  ),
);

/** Text an author most likely meant as a CSS color, which a block may not carry. */
function looksLikeCssColor(entry: string): boolean {
  const v = entry.trim().toLowerCase();
  return v.startsWith('#') || /^[a-z-]+\(/.test(v) || CSS_COLOR_WORDS.has(v);
}

/** The property that holds this component's mark colors: a list, one color, or none. */
function colorTarget(st: StyleState): 'colors' | 'color' | null {
  if (has(st, 'colors')) return 'colors';
  // `color` is a field on most charts; it is a color only where the schema gives it a pattern.
  if (has(st, 'color') && typeof st.props.color.pattern === 'string') return 'color';
  return null;
}

function applyColors(st: StyleState, p: PropEntry, target: 'colors' | 'color') {
  if (!st.blockColors) {
    st.diagnostics.push(
      info(`This page keeps its own chart colors, so “${p.key}” was ignored.`, p.line),
    );
    return;
  }
  const valid: (string | number)[] = [];
  for (const entry of colorEntries(p.value)) {
    const color = readColor(entry);
    if (color === null) {
      st.diagnostics.push(
        warning(
          `“${entry}” is not a color a block can set; it was ignored.`,
          p.line,
          CHART_COLOR_HELP,
        ),
      );
    } else valid.push(color);
  }
  if (valid.length === 0) return;
  if (target === 'colors') {
    set(st, 'colors', valid, p.line);
    return;
  }
  if (valid.length > 1) {
    st.diagnostics.push(info(`A ${st.kind} has one color; used ${valid[0]}.`, p.line));
  }
  set(st, 'color', valid[0], p.line);
}

/* ------------------------------------------------------------------------------------------ */
/* Margin and reference lines                                                                  */
/* ------------------------------------------------------------------------------------------ */

function readPx(st: StyleState, text: string, line: number): number | undefined {
  const n = readNumber(text);
  if (n === undefined || n < 0) return undefined;
  if (n > MAX_MARGIN) {
    st.diagnostics.push(
      warning(`A margin is at most ${MAX_MARGIN}px; ${n} was reduced to ${MAX_MARGIN}.`, line),
    );
    return MAX_MARGIN;
  }
  return n;
}

const MARGIN_HINT =
  'Write 1, 2 or 4 numbers in px (top right bottom left), or one side: “margin.left: 64”.';

function applyMargin(st: StyleState, p: PropEntry) {
  const text = p.value.trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      for (const side of SIDES) {
        const v = parsed[side];
        if (v === undefined) continue;
        const n = readPx(st, String(v), p.line);
        if (n !== undefined) st.margin.sides[side] = n;
      }
      st.margin.line = p.line;
      return;
    } catch {
      /* fall through to the warning below */
    }
  }
  const parts = text
    .replace(/^\[|\]$/g, '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const numbers = parts.map((part) => readPx(st, part, p.line));
  if (![1, 2, 3, 4].includes(numbers.length) || numbers.some((n) => n === undefined)) {
    st.diagnostics.push(
      warning(`Could not read the margin “${p.value}”; it was ignored.`, p.line, MARGIN_HINT),
    );
    return;
  }
  const n = numbers as number[];
  // CSS order: one value for every side; two for vertical then horizontal; three for top,
  // horizontal, bottom; four for top, right, bottom, left.
  st.margin.all =
    n.length === 1
      ? [n[0]]
      : n.length === 2
        ? [n[0], n[1], n[0], n[1]]
        : n.length === 3
          ? [n[0], n[1], n[2], n[1]]
          : n;
  st.margin.line = p.line;
}

function applyReference(st: StyleState, p: PropEntry) {
  const text = p.value.trim();
  st.reference.line = p.line;
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      st.reference.value = JSON.parse(text);
      return;
    } catch {
      st.diagnostics.push(warning(`Could not read “${p.value}” as JSON.`, p.line));
      return;
    }
  }
  const n = readNumber(text);
  if (n === undefined) {
    st.diagnostics.push(
      warning(
        `A reference line needs a number, got “${p.value}”.`,
        p.line,
        'Write “reference: 1000000”, and name it with “reference.label: Target”.',
      ),
    );
    return;
  }
  st.reference.value = n;
}

/* ------------------------------------------------------------------------------------------ */
/* One setting                                                                                 */
/* ------------------------------------------------------------------------------------------ */

const AXIS_NUMBERS: Record<string, string> = {
  'y.min': 'yMin',
  'y.max': 'yMax',
  'x.min': 'xMin',
  'x.max': 'xMax',
  ymin: 'yMin',
  ymax: 'yMax',
  xmin: 'xMin',
  xmax: 'xMax',
  yminimum: 'yMin',
  ymaximum: 'yMax',
  xminimum: 'xMin',
  xmaximum: 'xMax',
};
const AXIS_TICKS: Record<string, string> = {
  'y.ticks': 'yTicks',
  'x.ticks': 'xTicks',
  'y.tickcount': 'yTicks',
  'x.tickcount': 'xTicks',
};
/** Keys that show (`true`) or hide (`false`) an axis when the value says yes. */
const AXIS_SWITCHES: Record<string, [prop: string, shows: boolean]> = {
  'y.hide': ['yAxis', false],
  'x.hide': ['xAxis', false],
  'y.hidden': ['yAxis', false],
  'x.hidden': ['xAxis', false],
  'y.show': ['yAxis', true],
  'x.show': ['xAxis', true],
  'y.axis': ['yAxis', true],
  'x.axis': ['xAxis', true],
  hideyaxis: ['yAxis', false],
  hidexaxis: ['xAxis', false],
};
const REFERENCE_KEYS = new Set([
  'reference',
  'referenceline',
  'refline',
  'target',
  'targetline',
  'goal',
  'threshold',
  'benchmark',
]);
/** True for `reference`, `target` … used as a setting name rather than a column. */
export function isReferenceKey(name: string, columns: readonly string[]): boolean {
  const n = name.toLowerCase();
  return REFERENCE_KEYS.has(n) && !columns.some((c) => c.toLowerCase() === n);
}

/** Keys that name the series field on charts that split by one (aliases of `color`). */
const SERIES_KEYS = new Set(['series', 'split', 'splitby', 'colorby', 'colourby']);

const LEGEND_WORDS: Record<string, string> = {
  above: 'top',
  over: 'top',
  below: 'bottom',
  under: 'bottom',
  beside: 'right',
  side: 'right',
  hide: 'none',
  hidden: 'none',
};
const GRID_WORDS: Record<string, string> = {
  horizontal: 'y',
  vertical: 'x',
  all: 'both',
  xy: 'both',
};

/**
 * Reads one setting. Returns null when it was a presentation setting (now on the spec, or
 * dropped with a diagnostic); otherwise the entry for the generic reader, possibly with its key
 * rewritten so an alias reaches the right property.
 */
export function readStyleSetting(p: PropEntry, st: StyleState): PropEntry | null {
  const norm = p.norm;

  // margin: 16 24 32 48 · margin.left: 64 · margin left: 64
  if ((norm === 'margin' || norm === 'margins') && has(st, 'margin')) {
    applyMargin(st, p);
    return null;
  }
  const side = /^margins?\.?(top|right|bottom|left)$/.exec(norm)?.[1] as Side | undefined;
  if (side && has(st, 'margin')) {
    const n = readPx(st, p.value, p.line);
    if (n === undefined) {
      st.diagnostics.push(warning(`Expected a number of px, got “${p.value}”.`, p.line));
    } else {
      st.margin.sides[side] = n;
      st.margin.line ??= p.line;
    }
    return null;
  }

  // reference: 1000000 · reference.label: Target. A column called "reference" keeps its
  // dotted field settings.
  const refPart = /^([a-z]+)\.?(label|value|name|text)$/.exec(norm);
  if (
    refPart &&
    REFERENCE_KEYS.has(refPart[1]) &&
    has(st, 'reference') &&
    (refPart[1] === 'reference' || !has(st, refPart[1])) &&
    !isColumn(st, refPart[1])
  ) {
    if (refPart[2] === 'value') applyReference(st, p);
    else {
      st.reference.label = unquote(p.value);
      st.reference.line ??= p.line;
    }
    return null;
  }
  if (
    REFERENCE_KEYS.has(norm) &&
    has(st, 'reference') &&
    (norm === 'reference' || !has(st, norm))
  ) {
    applyReference(st, p);
    return null;
  }

  // y.min: 0 · ymax: 100 · x.ticks: 6
  const bound = AXIS_NUMBERS[norm];
  if (bound && has(st, bound)) {
    const n = readNumber(p.value);
    if (n === undefined) {
      st.diagnostics.push(warning(`Expected a number, got “${p.value}”.`, p.line));
    } else set(st, bound, n, p.line);
    return null;
  }
  const ticks = AXIS_TICKS[norm];
  if (ticks && has(st, ticks)) return { ...p, key: ticks, norm: ticks.toLowerCase() };

  // y.hide: yes · y axis: no. "y axis: revenue" still names the field, as it always has.
  const toggle = AXIS_SWITCHES[norm];
  if (toggle && has(st, toggle[0])) {
    const b = readBool(p.value);
    if (b === undefined) {
      st.diagnostics.push(warning(`Expected yes or no, got “${p.value}”.`, p.line));
    } else set(st, toggle[0], b === toggle[1], p.line);
    return null;
  }
  if (norm === 'xaxis' || norm === 'yaxis') {
    const prop = norm === 'xaxis' ? 'xAxis' : 'yAxis';
    const b = readBool(p.value);
    if (b !== undefined && has(st, prop) && !isColumn(st, p.value)) {
      set(st, prop, b, p.line);
      return null;
    }
    return { ...p, norm: norm[0] };
  }
  if (norm === 'axes' && has(st, 'xAxis') && has(st, 'yAxis')) {
    const b = readBool(p.value);
    if (b !== undefined) {
      set(st, 'xAxis', b, p.line);
      set(st, 'yAxis', b, p.line);
      return null;
    }
  }

  // y.scale: log · log: yes
  if ((norm === 'y.scale' || norm === 'yscale' || norm === 'scale') && has(st, 'yScale')) {
    const word = unquote(p.value).toLowerCase();
    const value = word === 'logarithmic' || word === 'log10' ? 'log' : p.value;
    return { ...p, key: 'yScale', norm: 'yscale', value };
  }
  if (['log', 'logscale', 'logarithmic', 'ylog', 'y.log'].includes(norm) && has(st, 'yScale')) {
    const b = readBool(p.value);
    if (b === undefined) {
      st.diagnostics.push(warning(`Expected yes or no, got “${p.value}”.`, p.line));
    } else set(st, 'yScale', b ? 'log' : 'linear', p.line);
    return null;
  }

  // legend: bottom · legend.position: right · legend: below
  if (
    (norm === 'legend' || norm === 'legend.position' || norm === 'legendposition') &&
    has(st, 'legend')
  ) {
    const word = unquote(p.value).toLowerCase();
    return { ...p, key: 'legend', norm: 'legend', value: LEGEND_WORDS[word] ?? p.value };
  }
  if ((norm === 'grid' || norm === 'gridlines' || norm === 'gridline') && has(st, 'grid')) {
    const word = unquote(p.value).toLowerCase();
    return { ...p, key: 'grid', norm: 'grid', value: GRID_WORDS[word] ?? p.value };
  }

  // colors: signal, #f26b3a · color: #2f45e8. `color` names the series field unless its value
  // can only be a color.
  const target = colorTarget(st);
  if (target && (norm === 'colors' || norm === 'colours' || norm === 'palette')) {
    applyColors(st, p, target);
    return null;
  }
  if (target === 'color' && SERIES_KEYS.has(norm)) {
    // `series: region` asks for a split these charts do not draw; it must not become a color.
    st.diagnostics.push(
      warning(`A ${st.kind} draws one series, so “${p.key}” was ignored.`, p.line),
    );
    return null;
  }
  if (target && (norm === 'color' || norm === 'colour')) {
    if (target === 'color') {
      applyColors(st, p, target);
      return null;
    }
    const entries = colorEntries(p.value);
    const colorOnly =
      entries.length > 0 &&
      !isColumn(st, p.value) &&
      (entries.every((e) => readColor(e) !== null) || entries.some(looksLikeCssColor));
    if (colorOnly) {
      if (st.blockColors && entries.some((e) => readColor(e) !== null)) {
        st.diagnostics.push(
          info(
            `Read “${p.key}: ${p.value.trim()}” as the chart’s colors. “color” otherwise names the field that splits series; “colors” always means colors.`,
            p.line,
          ),
        );
      }
      applyColors(st, p, target);
      return null;
    }
  }
  return p;
}

/* ------------------------------------------------------------------------------------------ */
/* After the settings                                                                          */
/* ------------------------------------------------------------------------------------------ */

function isReferenceLine(v: unknown): v is { value: number; label?: string } {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (v as { value?: unknown }).value === 'number'
  );
}

/** Bars and stacked areas are measured from zero; a raised baseline would misstate them. */
function refuseCutBaseline(
  spec: Record<string, unknown>,
  diagnostics: Diagnostic[],
  line: number | undefined,
) {
  const anchored =
    spec.component === 'BarChart' || (spec.component === 'AreaChart' && spec.stack === true);
  if (!anchored || typeof spec.yMin !== 'number' || spec.yMin <= 0) return;
  const what = spec.component === 'BarChart' ? 'Bars are' : 'Stacked areas are';
  diagnostics.push(
    warning(
      `${what} measured from zero, so the axis minimum ${spec.yMin} was ignored: a cut axis would overstate the differences.`,
      line,
      'Use a line chart to zoom in on a range.',
    ),
  );
  delete spec.yMin;
}

/** Writes the collected margin and reference line to the spec and applies the cross-checks. */
export function finishStyle(st: StyleState) {
  const { all, sides, line } = st.margin;
  if (line !== undefined) {
    const named = Object.keys(sides).length > 0;
    if (!named && all) set(st, 'margin', all.length === 1 ? all[0] : all, line);
    else if (named) {
      const base =
        all?.length === 1
          ? { top: all[0], right: all[0], bottom: all[0], left: all[0] }
          : all
            ? { top: all[0], right: all[1], bottom: all[2], left: all[3] }
            : {};
      set(st, 'margin', { ...base, ...sides }, line);
    }
  }

  const ref = st.reference;
  if (ref.line !== undefined) {
    if (ref.value === undefined) {
      st.diagnostics.push(
        warning(
          'A reference label needs a value; it was ignored.',
          ref.line,
          'Add “reference: 1000000”.',
        ),
      );
    } else if (typeof ref.value === 'number') {
      set(
        st,
        'reference',
        ref.label ? { value: ref.value, label: ref.label } : ref.value,
        ref.line,
      );
    } else {
      // A JSON object or list; `reference.label` names the first rule that has no label yet.
      const list = Array.isArray(ref.value) ? ref.value : [ref.value];
      const first = list.find((item) => isReferenceLine(item) && item.label === undefined);
      if (ref.label && first) (first as { label?: string }).label = ref.label;
      set(st, 'reference', ref.value, ref.line);
    }
  }

  refuseCutBaseline(st.spec, st.diagnostics, st.lines.get('yMin'));
}

/* ------------------------------------------------------------------------------------------ */
/* JSON specs                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/**
 * The same rules for a spec written as JSON in a block: refused colors are dropped with a
 * warning instead of failing the whole chart, hosts that keep their colors have them removed,
 * and a cut bar baseline is ignored.
 */
export function styleJsonSpec(
  spec: Record<string, unknown>,
  diagnostics: Diagnostic[],
  blockColors: boolean,
) {
  const colorKeys = [
    'colors',
    ...(['Histogram', 'Sparkline', 'BarList'].includes(String(spec.component)) ? ['color'] : []),
  ];
  for (const key of colorKeys) {
    if (spec[key] === undefined) continue;
    if (!blockColors) {
      diagnostics.push(info(`This page keeps its own chart colors, so “${key}” was ignored.`));
      delete spec[key];
      continue;
    }
    const entries: unknown[] = Array.isArray(spec[key]) ? (spec[key] as unknown[]) : [spec[key]];
    const valid = entries.filter((entry) => {
      const ok = isChartColor(entry);
      if (!ok) {
        diagnostics.push(
          warning(
            `“${String(entry).slice(0, 40)}” is not a color a spec can set; it was ignored.`,
            undefined,
            CHART_COLOR_HELP,
          ),
        );
      }
      return ok;
    });
    if (valid.length === 0) delete spec[key];
    else spec[key] = key === 'colors' ? valid : valid[0];
  }
  refuseCutBaseline(spec, diagnostics, undefined);
}
