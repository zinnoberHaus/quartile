# Styling and settings

A block needs no styling to look right: by default a chart takes its colors and fonts from the page it is on. When you care about a detail, each one is one more line in the block. This page covers the defaults, then the settings one at a time, which chart takes which setting, the colors a block may set, the chart tokens, the same settings in React, and building a chart of your own.

## 1. The defaults follow your page

```quartile
line sum(mrr) by month and plan
title: MRR by plan
---
month,plan,mrr
2026-01,Team,176000
2026-02,Team,181000
2026-03,Team,189000
2026-01,Pro,90000
2026-02,Pro,97000
2026-03,Pro,104000
```

Nothing in this block says how it should look. The page decides:

- **Theme.** `theme="auto"` reads the page's background, text color and font, in light and dark. `theme="system"` follows the reader's light or dark preference and is resolved by CSS, so it is right on a server and on the first paint. `light` and `dark` are fixed.
- **Host presets.** `host="shadcn"`, `vitepress`, `docusaurus` and the other presets map a design system's own CSS variables.
- **Accent.** `accent` sets the brand color used for selection and the first series.
- **Tokens.** Each color, radius and size is a `--q-*` CSS custom property. Override one on the provider's class in React, or on `quartile-chart::part(root)` with the script.

These are set once, by the page: props of `QuartileDocument` in React, attributes on the script tag elsewhere. [Embedding and styling](embedding.md#styling) has the details and the [preset table](embedding.md#host-presets).

Labels, number formats and axes also come without settings: column names become labels, and values written as `$1,200` or `12%` get a matching format. See the [language reference](../language.md#7-compilation).

## 2. Settings, one line each

A setting is a `key: value` line after the first line of the block. Keys ignore case, spaces, hyphens and underscores, so `stroke width`, `stroke-width` and `strokeWidth` are the same key. In a dashboard, write a setting under the view it belongs to.

A setting that a kind does not have is ignored with a warning, for example `“radius” is not a line setting; it was ignored.` A number outside a setting's range is an error. [`quartile check`](coding-agents.md#quartile-check) reports both.

### Height and margins

```quartile
line revenue by month
title: Monthly revenue
height: 180px
margin: 16 24 32 48
margin.left: 72
---
month,revenue
2026-01,120000
2026-02,180000
2026-03,150000
```

- `height:` is the plot height in px (40 to 2000). The width always fills the container.
- `margin:` is the space around the plot in px, in CSS order: one number for every side, two for vertical then horizontal, four for top, right, bottom, left.
- `margin.left:` (or `.top`, `.right`, `.bottom`) sets one side. Sides you do not name keep the room the chart computes for its axis labels, so naming one side moves one edge only.
- A margin is at most 400 px. A larger value is reduced, with a warning.

### Colors

```quartile
bar revenue by region and year
title: Revenue by region
colors: signal, #f26b3a
---
region,year,revenue
EMEA,2025,1200000
EMEA,2026,1500000
APAC,2025,860000
APAC,2026,910000
```

`colors:` lists the mark colors in series order (slice order on a donut). Marks beyond the list keep the default palette. `colours:` and `palette:` are the same setting. Each entry is one of:

| Entry | Meaning |
|---|---|
| `signal`, `positive`, `negative`, `warning`, `muted` | a palette name, which reads the page's own token for that role |
| `1` to `8` | a color of the categorical palette |
| `#2f45e8`, `#abc`, `#2f45e880` | a hex color with 3, 6 or 8 digits |

Bar lists, histograms and sparklines have one color, set with `color:`.

```quartile
barlist sum(tickets) by priority
title: Open tickets
color: warning
---
priority,tickets
Urgent,14
High,31
Normal,52
```

On the other charts `color:` names the field that splits series (`color: plan`). When its value can only be a color, as in `color: #2f45e8`, it is read as the chart's colors, with a note. Write `colors:` to say what you mean. What a block may not set, and how a page turns block colors off, is in [section 4](#4-colors-a-block-may-set).

### Axis range

```quartile
line conversion by week
title: Checkout conversion
y.min: 2%
y.max: 5%
y.ticks: 3
x.ticks: 4
gridlines: no
---
week,conversion
2026-01-05,3.1%
2026-01-12,3.4%
2026-01-19,3.9%
2026-01-26,4.2%
```

- `y.min:` and `y.max:` bound the y axis. Numbers may be written the way data is: `1,200`, `1.2M`, `$40`, `2%`.
- `x.min:` and `x.max:` bound a numeric x axis. They are ignored for dates and categories.
- On a line or an area, marks outside the bounds are clipped to the plot. On a scatter plot, points outside are not drawn, and the chart's written summary says how many.
- **Bars start at zero.** A bar's length is its value, so a bar chart ignores a minimum above zero, with this warning: `Bars are measured from zero, so the axis minimum 800000 was ignored: a cut axis would overstate the differences.` The same holds for stacked areas. A maximum that would cut a bar is ignored too. Use a line chart to zoom in on a range.

### Ticks, gridlines and axes

- `y.ticks:` and `x.ticks:` ask for an approximate number of ticks, from 0 to 20. The scale rounds to tidy values, and `0` draws none.
- `grid:` chooses the gridlines: `y` for horizontal lines at the y ticks, `x` for vertical lines at the x ticks, `both`, or `none`. `gridlines: no` is the same as `grid: none`.
- `x axis: no` and `y axis: no` hide an axis's labels and give their room to the plot. `axes: no` hides both.

```quartile
scatter rating vs price
title: Rating against price
grid: both
x.min: 0
x.max: 100
y.min: 3
y.max: 5
---
product,price,rating
Desk,89,4.4
Lamp,24,4.1
Chair,65,4.7
Shelf,48,3.6
```

```quartile
line sum(signups) by day
title: Signups this week
axes: no
labels: yes
height: 120px
---
day,signups
2026-11-02,120
2026-11-03,134
2026-11-04,128
2026-11-05,151
2026-11-06,160
```

### Legend and value labels

```quartile
line mrr by month and plan
title: MRR by plan
legend: bottom
labels: yes
---
month,plan,mrr
2026-01,Team,176000
2026-02,Team,181000
2026-03,Team,189000
2026-01,Pro,90000
2026-02,Pro,97000
2026-03,Pro,104000
```

- `legend:` takes `top`, `bottom`, `left`, `right` or `none`. `yes` keeps the chart's usual place: above the plot for lines and scatter plots, under it for areas and bars, beside the ring for a donut. `no` hides it.
- `labels: yes` writes values on the marks, in the field's format. What that means depends on the chart:

| Chart | `labels: yes` writes |
|---|---|
| line, area | each series name and its last value at the end of its line (at the middle of its band on a stacked area) |
| bar | each value at the end of its bar, or the total on a stack. Horizontal bars with one series show them unless you write `labels: no`. |
| histogram | each bin's count or sum above its bar |
| donut | each slice's value in its legend row |

```quartile
donut sum(sessions) by browser
title: Sessions by browser
legend: bottom
labels: yes
---
browser,sessions
Chrome,6400
Safari,2900
Firefox,700
```

### Reference lines

```quartile
bar sum(revenue) by region
title: Revenue against target
reference: 1000000
reference.label: Target
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
```

- `reference:` draws a rule at a value on the value axis, and `reference.label:` names it. The axis grows to include the rule.
- The label is drawn beside the rule and is part of the chart's written summary: "Reference line Target at $1,000,000."
- On charts, `target:`, `goal:` and `threshold:` are other names for `reference:`. A KPI keeps its own `target`.
- On a histogram the rule is vertical, at a value of x.
- For several rules, write a JSON list:

```quartile
line p95_ms by day
title: p95 latency
reference: [{"value": 300, "label": "Objective"}, {"value": 500, "label": "Page"}]
---
day,p95_ms
2026-11-02,240
2026-11-03,265
2026-11-04,410
2026-11-05,280
```

### Log scale

```quartile
line users by month
title: Users, log scale
y.scale: log
---
month,users
2026-01,12
2026-02,160
2026-03,900
2026-04,4800
```

`y.scale: log` spaces equal ratios evenly. It needs every value above zero. Otherwise the chart stays linear and says so under the plot: "A log scale needs values above zero, so this chart uses a linear scale." Lines, scatter plots and overlapping areas take it. Bars and stacked areas are measured from zero and do not.

### Line width, bar corners and gaps

```quartile
bar sum(orders) by weekday
title: Orders by weekday
radius: 0
padding: 0.5
labels: yes
---
weekday,orders
Mon,120
Tue,134
Wed,128
Thu,151
Fri,160
```

- `radius:` is the corner radius of the bar ends in px, from 0 (square) to 40.
- `padding:` is the gap between bars as a share of each band, from 0 (touching) to 0.9 (thin). The default is 0.28.
- `stroke width:` is the line width in px, from 0.25 to 16, on lines, areas and sparklines.

### Annotations

```quartile
line users by month
title: Weekly active users
stroke width: 3
annotations: [{"x": "2026-02-01", "label": "Launch"}]
---
month,users
2026-01,1200
2026-02,1600
2026-03,2900
2026-04,3400
```

`annotations:` is a JSON list of vertical markers on a line or an area chart. Each has an `x` (a date such as `2026-02-01`, a number, or a category of the x axis) and a short `label`. The label is drawn as text.

## 3. Which chart takes which setting

| Setting | `line` | `area` | `bar` | `scatter` | `histogram` | `box` | `donut` | `barlist` | `sparkline` |
|---|---|---|---|---|---|---|---|---|---|
| `margin` | yes | yes | yes | yes | yes | yes | - | - | - |
| `colors` | yes | yes | yes | yes | - | - | yes | - | - |
| `color` (one color) | - | - | - | - | yes | - | - | yes | yes |
| `y.min`, `y.max` | yes | yes | yes | yes | - | yes | - | - | - |
| `x.min`, `x.max` | yes | yes | - | yes | - | yes | - | - | - |
| `y.ticks` | yes | yes | yes | yes | - | yes | - | - | - |
| `x.ticks` | yes | yes | yes | yes | - | yes | - | - | - |
| `grid` | yes | yes | yes | yes | - | yes | - | - | - |
| `x axis` | yes | yes | yes | yes | yes | yes | - | - | - |
| `y axis` | yes | yes | yes | yes | - | yes | - | - | - |
| `legend` (a side) | yes | yes | yes | yes | - | - | yes | - | - |
| `labels` | yes | yes | yes | - | yes | - | yes | - | - |
| `reference` | yes | yes | yes | yes | yes | - | - | - | - |
| `y.scale` | yes | yes | - | yes | - | - | - | - | - |
| `stroke width` | yes | yes | - | - | - | - | - | - | yes |
| `radius`, `padding` | - | - | yes | - | - | - | - | - | - |
| `annotations` | yes | yes | - | - | - | - | - | - | - |

The table is checked against the component schema in the test suite. Notes:

- `height:` applies to each of these kinds and to `funnel`, `heatmap`, `calendar` and `sankey`.
- `heatmap` and `calendar` take `legend: yes` or `no` for their color legend, without a side.
- A box plot uses the `y` settings for vertical boxes and the `x` settings for horizontal ones.
- `funnel`, `sankey`, `kpi`, `table`, `explorer` and `filters` take none of the settings in the table.

## 4. Colors a block may set

A block is text that may come from a model or from a stranger, so a color in a block is checked before it reaches the page.

- **Allowed.** The five palette names, `1` to `8`, and hex colors. A palette name reads a token of the page, so `signal` is the page's own accent in light and in dark.
- **Refused.** Everything else: CSS color names such as `red`, `rgb()` and other functions, `var()`, `url()`. A refused entry is dropped with a warning that says what is allowed, and the chart keeps its palette for that series: `“red” is not a color a block can set; it was ignored.`
- **The same rule for JSON specs.** A refused color in a spec is dropped with a warning; it does not fail the chart.

Fonts, the background and everything outside the plot still come from the page. A block has no setting for them.

A page that wants every chart on its own palette turns block colors off. The color settings are then dropped with a note (`This page keeps its own chart colors, so “colors” was ignored.`) and everything else in the block still applies.

| Where | How |
|---|---|
| React | `<QuartileDocument blockColors={false}>`, or `blockColors={false}` on one `QuartileBlock` |
| Script tag | `data-block-colors="off"`, or `blockColors: false` in `window.QuartileConfig` or `Quartile.configure` |
| Static rendering | `renderBlockToHTML(source, { blockColors: false })`, and the same option on the Markdown plugins |
| Compiler | `compileBlock(source, { blockColors: false })` |

## 5. Chart tokens

Three tokens set a default for every chart at once. A setting in a block or a prop wins over them.

| Token | Default | Sets |
|---|---|---|
| `--q-chart-stroke-width` | `2px` | line width of lines and areas |
| `--q-chart-bar-radius` | `2px` | corner radius of bar ends |
| `--q-chart-axis-font-size` | `11px` | size of axis labels |

```css
.report {
  --q-chart-stroke-width: 1.5px;
  --q-chart-bar-radius: 0;
  --q-chart-axis-font-size: 12px;
}
```

In React, pass `className="report"` to `QuartileDocument` or `QuartileProvider`. With the script, set them on `quartile-chart::part(root)`. The other tokens are in [tokens.css](../../packages/react/src/styles/tokens.css).

## 6. In React

The components take the same settings as props, with the same values:

```tsx
import { LineChart } from '@quartile/react';

<LineChart
  data={rows}
  x="month"
  y="mrr"
  color="plan"
  colors={['signal', '#f26b3a']}
  margin={{ left: 72 }}
  yMin={0}
  yTicks={3}
  grid="y"
  legend="bottom"
  labels
  reference={{ value: 200000, label: 'Target' }}
  strokeWidth={3}
  className="report-chart"
  style={{ maxWidth: 720 }}
/>;
```

- A block setting and a prop have the same name in camelCase: `y.min` is `yMin`, `stroke width` is `strokeWidth`, `x axis: no` is `xAxis={false}`.
- `colors` is a list in series order, or an object keyed by series name: `colors={{ Team: 'signal', Pro: 3 }}`.
- `className` and `style` go on the chart's root element.
- Color props take the same vocabulary as blocks, plus a reference to one of Quartile's own tokens, such as `var(--q-cat-3)`. Another value is ignored with a console warning and the series keeps its default color. To use a brand color that is not hex, set a token (`--q-signal`, `--q-cat-1` … `--q-cat-8`) in CSS and name it.

`ChartPresentationProps`, `ChartMargin`, `ChartColor`, `GridSetting`, `LegendSetting` and `ReferenceSetting` are exported types.

## 7. Build your own chart

When no built-in chart fits, build one from the parts the built-in charts use. They are exported from `@quartile/react`: the frame (`ChartFrame`), the axes and guides (`AxisLeft`, `AxisBottom`, `GridRows`, `GridColumns`, `Legend`, `ChartTooltip`, `ReferenceRules`), the scales (`valueAxis`, `bandScale`, `continuousX`, `timeScale`), the settings helpers (`marginSides`, `chartColor`, `gridLines`, `legendPlacement`) and the selection hooks (`useLinkedRows`, `useToggleSelect`, `useRangeBrush`, `useChartKeyboard`).

This lollipop chart is a little over a hundred lines. It sizes itself on a server, shows loading and empty states, has a table alternative, takes `margin` and `color` like the built-in charts, and joins the linked selection:

```tsx
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
```

Put it under the same `<Selection>` as built-in views and it filters them, and they filter it:

```tsx
<Selection>
  <Lollipop data={orders} category="region" value="amount" select />
  <BarList data={orders} category="channel" value="amount" select />
</Selection>
```

What each part does:

- `ChartFrame` keeps the chart's size, draws at an assumed width on a server, renders the loading, error and empty states, and exposes `summary` and `table` to assistive technology.
- `useLinkedRows` returns the rows under the other views' selections. `useToggleSelect` publishes a click as a selection; `useRangeBrush` does the same for a dragged range.
- `valueAxis` returns a zero-based scale with tidy ticks. It takes the same `min`, `max`, `ticks` and `log` options the settings above use.
- This example selects with the pointer only. `useChartKeyboard` adds arrow-key navigation and `ChartTooltip` a tooltip; a version with both, and a brushed step chart, is in [custom-chart.test.tsx](../../packages/react/test/custom-chart.test.tsx).

The code above is compiled and run by the test suite, so it stays in step with the library. A custom chart is a React component: it works under `QuartileProvider` and `Selection`, but it is not a kind of the block language.

## 8. Or ask your model

A setting is a line of text, so changing a chart is a text edit. A model that knows the syntax, from [`quartilePrompt()`](ai-responses.md) or from the [skill](coding-agents.md), can make it for you. Given this block:

```quartile
bar sum(revenue) by region
title: Revenue by region
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
```

and the request "make the bars orange, put the values on them and add a target line at one million", the edit is four added lines. Nothing else in the block changes:

```quartile
bar sum(revenue) by region
title: Revenue by region
colors: #f26b3a
labels: yes
reference: 1000000
reference.label: Target
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
```

Check the result the same way as a block you wrote yourself: `quartile check` reports a setting the kind does not have, a color a block may not set, and a number out of range.
