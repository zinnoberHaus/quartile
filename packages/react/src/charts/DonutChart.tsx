import { type ReactNode, useMemo, useState } from 'react';
import { makeFormatter } from '../data/format';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { seriesColor } from './core/scales';
import { type Aggregate, aggregateBy, pluralLabel, type SortOrder } from './core/trends-aggregate';
import { isKeyboardFocus } from './core/trends-focus';
import { listFormat } from './core/trends-format';
import { useToggleSelect } from './core/trends-select';

export interface DonutChartProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows to aggregate, or a dataset with a schema attached. */
  data: DataInput<R>;
  /** Field whose values become the slices. */
  category: keyof R & string;
  /** Measure to aggregate. Omit it to count rows per category. */
  value?: keyof R & string;
  /** How rows sharing a category combine. Defaults to sum with a value, count without. */
  aggregate?: Aggregate;
  /** Slice order, clockwise from 12 o'clock. Defaults to descending. */
  sort?: SortOrder;
  /** Formats values. Defaults to compact currency, integers for counts, else the field's format. */
  format?: Formatter;
  /** Large figure in the center. Defaults to the formatted total. */
  centerValue?: ReactNode;
  /** Caption under the center figure. Defaults to the slice count, e.g. "4 channels". */
  centerLabel?: ReactNode;
  /** Shows the legend with each slice's share. Defaults to true. */
  legend?: boolean;
  /** Slice colors, by index or by category. Defaults to the categorical palette in order. */
  colors?: string[] | Record<string, string>;
  /** Diameter in px. Defaults to 148. */
  size?: number;
  /** Ring thickness in px. Defaults to 18. */
  thickness?: number;
  /** Clicking a slice or legend row (or Enter on it) toggles its category in the nearest Selection. */
  select?: boolean;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called after a toggle with the new predicate for `category` (or null). */
  onSelect?: (predicate: Predicate | null) => void;
}

const GAP_DEG = 1.4;

function arcPath(cx: number, r: number, a0: number, a1: number): string {
  const pt = (a: number) => {
    const t = (a * Math.PI) / 180;
    return `${(cx + r * Math.cos(t)).toFixed(2)},${(cx + r * Math.sin(t)).toFixed(2)}`;
  };
  return `M${pt(a0)}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`;
}

/** Part-to-whole ring with a center total and a legend of mono shares. Hover or focus a slice. */
export function DonutChart<R extends Row = Row>(props: DonutChartProps<R>) {
  const {
    data,
    category,
    value,
    aggregate = value ? 'sum' : 'count',
    sort = 'desc',
    format,
    centerValue,
    centerLabel,
    legend = true,
    colors,
    size = 148,
    thickness = 18,
    select = false,
    id,
    selection,
    onSelect,
    height,
    style,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const picker = useToggleSelect(sel, category, source, onSelect);

  const catField = fieldOf(schema, category, rows);
  const valueField = value ? fieldOf(schema, value, rows) : undefined;
  const slices = useMemo(() => {
    const buckets = aggregateBy(rows, category, { value, aggregate, sort }).filter(
      (b) => b.value > 0,
    );
    const total = buckets.reduce((s, b) => s + b.value, 0);
    let angle = -90;
    return buckets.map((b, i) => {
      const sweep = total > 0 ? (b.value / total) * 360 : 0;
      const a0 = angle;
      angle += sweep;
      const color = Array.isArray(colors)
        ? (colors[i] ?? seriesColor(i))
        : (colors?.[String(b.raw)] ?? seriesColor(i));
      return { ...b, share: total > 0 ? b.value / total : 0, a0, a1: angle, color };
    });
  }, [rows, category, value, aggregate, sort, colors]);
  const total = slices.reduce((s, b) => s + b.value, 0);

  const fmtV = useMemo(
    () =>
      makeFormatter(listFormat(valueField, aggregate, format), {
        currency: valueField?.currency,
        locale,
      }),
    [valueField, aggregate, format, locale],
  );
  const fmtC = useMemo(() => makeFormatter(catField.format, { locale }), [catField, locale]);
  const fmtShare = useMemo(
    () =>
      makeFormatter(
        { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 },
        { locale },
      ),
    [locale],
  );

  const { active, setActive, keyboardProps } = useChartKeyboard(slices.length, (i) => {
    if (select) picker.toggle(slices[i].raw);
  });
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;
  const selectedOne =
    picker.selecting && picker.predicate?.op === 'in' && picker.predicate.value.length === 1
      ? slices.findIndex((s) => picker.has(s.raw))
      : -1;
  const shown = focus ?? (selectedOne >= 0 ? selectedOne : null);

  const summary = useMemo(() => {
    if (slices.length === 0) return '';
    const parts = slices.map((s) => `${fmtC(s.raw)} ${fmtShare(s.share)}`).join(', ');
    return `${valueField?.label ?? 'Count'} by ${catField.label.toLowerCase()}, total ${fmtV(total)}: ${parts}.`;
  }, [slices, valueField, catField, fmtC, fmtShare, fmtV, total]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [
        catField.label,
        aggregate === 'count'
          ? 'Count'
          : aggregate === 'mean'
            ? `Average ${(valueField?.label ?? 'value').toLowerCase()}`
            : (valueField?.label ?? 'Value'),
        'Share',
      ],
      rows: slices.map((s) => [fmtC(s.raw), fmtV(s.value), fmtShare(s.share)]),
    }),
    [slices, aggregate, valueField, catField, fmtC, fmtV, fmtShare],
  );

  const status = statusOf(frame, slices.length);
  // Lists size to their content; states and the visible table need the fixed frame height.
  const autoHeight = status === 'ready' && frame.view !== 'table';
  const c = size / 2;
  const r = c - thickness / 2 - 3;
  const kind = 'Donut chart';

  return (
    <ChartFrame
      kind={kind}
      status={status}
      height={height ?? size}
      style={{ height: autoHeight ? 'auto' : (height ?? size), ...style }}
      summary={summary}
      table={table}
      {...frame}
    >
      {() => (
        <div className="q-donut" data-hovering={focus != null || undefined}>
          <div className="q-donut-ring" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
              <circle
                className="q-donut-track"
                cx={c}
                cy={c}
                r={r}
                style={{ strokeWidth: thickness }}
              />
              {slices.map((s, i) => {
                const full = slices.length === 1;
                const gap = full ? 0 : Math.min(GAP_DEG, (s.a1 - s.a0) / 4);
                const on = picker.has(s.raw);
                const dim = picker.selecting && !on;
                const lit = focus === i || on;
                return (
                  <path
                    key={s.key}
                    className="q-donut-slice"
                    d={
                      full
                        ? `M${c},${c - r}a${r},${r} 0 1 1 0,${2 * r}a${r},${r} 0 1 1 0,${-2 * r}`
                        : arcPath(c, r, s.a0 + gap, s.a1 - gap)
                    }
                    data-dim={dim || undefined}
                    data-faded={(focus != null && focus !== i && !dim) || undefined}
                    style={{
                      stroke: dim ? 'var(--q-line)' : s.color,
                      strokeWidth: lit ? thickness + 4 : thickness,
                      cursor: select ? 'pointer' : undefined,
                    }}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => select && picker.toggle(s.raw)}
                  />
                );
              })}
            </svg>
            <div className="q-donut-center">
              <span className="q-donut-value">
                {shown != null ? fmtV(slices[shown].value) : (centerValue ?? fmtV(total))}
              </span>
              <span className="q-donut-label">
                {shown != null
                  ? fmtC(slices[shown].raw)
                  : (centerLabel ??
                    `${slices.length} ${pluralLabel(catField.label, slices.length)}`)}
              </span>
            </div>
            <div
              className="q-chart-plot q-donut-focus"
              role="application"
              aria-label={`${frame['aria-label'] ?? kind}. Use arrow keys to move between slices${select ? ', Enter to select' : ''}.`}
              {...keyboardProps}
              onFocus={(e) => {
                if (isKeyboardFocus(e.currentTarget)) setActive((a) => a ?? 0);
              }}
            />
          </div>
          {legend && (
            <div className="q-donut-legend" role="list">
              {slices.map((s, i) => {
                const on = picker.has(s.raw);
                const dim = picker.selecting && !on;
                const content = (
                  <>
                    <span
                      className="q-donut-swatch"
                      style={{ background: dim ? 'var(--q-line-strong)' : s.color }}
                    />
                    <span className="q-donut-name">{fmtC(s.raw)}</span>
                    <span className="q-donut-share">{fmtShare(s.share)}</span>
                  </>
                );
                return (
                  <div key={s.key} role="listitem">
                    {select ? (
                      <button
                        type="button"
                        className="q-donut-row"
                        aria-pressed={on}
                        data-dim={dim || undefined}
                        data-active={focus === i || undefined}
                        onPointerEnter={() => setHover(i)}
                        onPointerLeave={() => setHover(null)}
                        onClick={() => picker.toggle(s.raw)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        className="q-donut-row"
                        data-dim={dim || undefined}
                        data-active={focus === i || undefined}
                        onPointerEnter={() => setHover(i)}
                        onPointerLeave={() => setHover(null)}
                      >
                        {content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="q-visually-hidden" aria-live="polite">
            {active != null && slices[active]
              ? `${fmtC(slices[active].raw)}: ${fmtV(slices[active].value)}, ${fmtShare(slices[active].share)} of total${picker.has(slices[active].raw) ? ', selected' : ''}`
              : ''}
          </div>
        </div>
      )}
    </ChartFrame>
  );
}
