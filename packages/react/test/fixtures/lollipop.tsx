import {
  AxisBottom,
  AxisLeft,
  aggregateBy,
  bandScale,
  type ChartBaseProps,
  type ChartColor,
  ChartFrame,
  type ChartMargin,
  chartColor,
  type DataInput,
  fieldOf,
  GridRows,
  makeFieldFormatter,
  marginSides,
  resolveData,
  seriesColor,
  statusOf,
  tickFormatter,
  useLinkedRows,
  useQuartile,
  useSourceId,
  useToggleSelect,
  valueAxis,
} from '@quartile/react';

interface LollipopProps extends ChartBaseProps {
  data: DataInput;
  category: string;
  value: string;
  /** Click a mark to toggle its category in the nearest Selection. */
  select?: boolean;
  color?: ChartColor;
  margin?: ChartMargin;
}

/** One stem and dot per category: a bar chart for sparse values. */
export function Lollipop({
  data,
  category,
  value,
  select = false,
  color,
  margin,
  height = 200,
  ...frame
}: LollipopProps) {
  const { locale, timeZone } = useQuartile();
  const source = useSourceId();
  const { rows: allRows, schema } = resolveData(data);
  // Rows under the selections of the other views, never under this chart's own.
  const { rows, selection } = useLinkedRows(allRows, { source });
  const picker = useToggleSelect(selection, category, source);
  const buckets = aggregateBy(rows, category, { value });
  const valueField = fieldOf(schema, value, rows);
  const categoryField = fieldOf(schema, category, rows);
  const format = makeFieldFormatter(valueField, { locale, timeZone });
  const label = makeFieldFormatter(categoryField, { locale, timeZone });
  // The same color vocabulary as the built-in charts; anything else falls back to the palette.
  const fill = chartColor(color) ?? seriesColor(0);

  return (
    <ChartFrame
      kind="Lollipop chart"
      status={statusOf(frame, buckets.length)}
      height={height}
      summary={`${buckets.length} marks.`}
      table={{
        columns: [categoryField.label, valueField.label],
        rows: buckets.map((b) => [label(b.raw), format(b.value)]),
      }}
      {...frame}
    >
      {({ width }) => {
        const pad = marginSides(margin);
        const left = pad.left ?? 48;
        const right = width - (pad.right ?? 8);
        const bottom = height - (pad.bottom ?? 24);
        const axis = valueAxis(
          buckets.map((b) => b.value),
          [bottom, pad.top ?? 10],
        );
        const tick = tickFormatter(valueField, locale, timeZone);
        const ticks = axis.ticks.map((v) => ({ y: axis.scale(v), label: tick(v) }));
        const band = bandScale(
          buckets.map((b) => b.key),
          [left, right],
        );
        const cx = (key: string) => (band(key) ?? 0) + band.bandwidth() / 2;
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <GridRows ys={ticks.map((t) => t.y)} x0={left} x1={right} />
            <AxisLeft ticks={ticks} x={left - 10} />
            <AxisBottom
              ticks={buckets.map((b) => ({ x: cx(b.key), label: label(b.raw) }))}
              y={bottom + 8}
              x0={left}
              x1={right}
            />
            {buckets.map((b) => (
              <g
                key={b.key}
                data-mark={b.key}
                data-dim={(picker.selecting && !picker.has(b.raw)) || undefined}
                onClick={() => select && picker.toggle(b.raw)}
              >
                <line
                  x1={cx(b.key)}
                  x2={cx(b.key)}
                  y1={axis.scale(0)}
                  y2={axis.scale(b.value)}
                  style={{ stroke: fill }}
                />
                <circle cx={cx(b.key)} cy={axis.scale(b.value)} r={5} style={{ fill }} />
              </g>
            ))}
          </svg>
        );
      }}
    </ChartFrame>
  );
}
