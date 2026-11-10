# The Quartile Markdown language

**Version 1 · preview.** A Quartile block is a fenced code block with the language `quartile`. It describes a chart, a KPI, a table, a dashboard or a dataset in a few lines of text that people and language models can write. A page renders it in React, on a server for search engines, or with one script tag. In a Markdown renderer that does not know Quartile, the block stays a readable code block, so the data stays readable.

````markdown
```quartile
bar sum(revenue) by region
title: Revenue by region, Q3 2026
format: currency USD
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
```
````

This page is the reference. To render blocks, see [Markdown and documentation sites](guides/markdown.md), [AI answers](guides/ai-responses.md), [embedding](guides/embedding.md), [server rendering](guides/server-rendering.md) and [dbt](guides/dbt.md). Where a block's rows come from is covered in depth in [data sources](guides/data-sources.md). To check blocks from the command line, see [`quartile check`](guides/coding-agents.md#quartile-check). The design rationale is [ADR 0007](decisions/0007-markdown-language-and-embedding.md); the evidence is the [November research](research/markdown-ai-embedding-2026-11.md). Try blocks in the [live playground](https://docs.usequartile.com/examples/playground).

## 1. Shape of a block

A block has up to three parts, in this order:

1. **A header**: a kind and a sentence, `bar sum(revenue) by region`.
2. **Settings**: `key: value` lines.
3. **Data**: a line `---`, then rows.

```text
line sum(mrr) by month and plan   ← kind · measures · "by" fields
title: MRR by plan                ← settings
format: currency USD
---                               ← data follows
month,plan,mrr
2026-01,Team,176000
```

Blank lines are ignored. In the header and settings, a line starting with `#` or `//` is a comment. Every part is optional except the kind; a block that is only rows renders as a table, and a chart without rows reads a named dataset (section 6).

### Grammar

```ebnf
block       = json | lines ;
lines       = { blank | comment | header | setting }, [ separator, data ] ;
header      = kind-words, [ sentence ] ;               (* first word(s) name a kind *)
sentence    = [ fields ], { clause }, { flag } ;
clause      = ( "by" | "over" | "per" | "across" ), fields
            | ( "vs" | "versus" | "against" ), field ;
fields      = field, { ( "," | "and" | "then" ), field } ;
field       = ( name | aggregate "(" [ name | "*" ] ")" | "count" | "rows" ), [ "as", label ] ;
aggregate   = "sum" | "total" | "count" | "n" | "mean" | "avg" | "average"
            | "min" | "minimum" | "max" | "maximum" ;
name        = word | '"' text '"' | "'" text "'" | "`" text "`" ;
flag        = "stacked" | "horizontal" | "smooth" | "smoothed" | "filled" ;
setting     = key, ":", value ;                         (* key: up to three words, may contain dots *)
separator   = "---" | "===" | "--- data" | "data:" (empty value) ;
data        = csv | tsv | semicolon-separated | markdown-table | json ;
```

The sentence is sugar: every part of it can also be written as settings (`x: region`, `y: revenue`). Both may be combined; explicit settings win.

### The YAML way

Blocks may also start with `type:` (or `chart:`, `kind:`, `mark:`, `view:`), which is how people and models often write charts:

```text
type: bar
x: region
y: revenue
data:
  region,revenue
  EMEA,1200
```

`data:` with nothing after it starts the data section like `---`; indented rows are dedented. Rows written straight after the settings, without a separator, are accepted with a note.

## 2. Kinds

The first word or words of the header choose the kind. Matching ignores case, spaces, hyphens and underscores, and a trailing *chart*, *graph*, *plot* or *diagram*: `Bar chart`, `bar-chart` and `BAR` are all `bar`.

| Kind | Aliases | Sentence | Becomes | Renders |
|---|---|---|---|---|
| `line` | `lines`, `trend`, `timeseries` | measures `by` x `and` series | `y`, `x`, `color` | LineChart |
| `area` | `stackedarea` (stacked) | measures `by` x `and` series | `y`, `x`, `color` | AreaChart |
| `bar` | `column`, `vbar`, `groupedbar`; `stackedbar` (stacked); `hbar`, `horizontalbar` (horizontal) | measures `by` x `and` group | `y`, `x`, `group` | BarChart |
| `barlist` | `ranking`, `rank`, `leaderboard`, `toplist` | measure `by` category | `value`, `category` | BarList |
| `donut` | `pie`, `doughnut`, `ring` | measure `by` category | `value`, `category` | DonutChart |
| `funnel` | | measure `by` step | `value`, `step` | Funnel |
| `sparkline` | `spark` | measure `by` x | `y`, `x` | Sparkline |
| `histogram` | `hist`, `distribution` | field | `x` | Histogram |
| `scatter` | `scatterplot`, `points`, `dots`, `bubble`, `xy` | y `vs` x (or y `by` x `and` color) | `y`, `x`, `color` | ScatterPlot |
| `heatmap` | `heat`, `matrix` | measure `by` x `and` y | `value`, `x`, `y` | Heatmap |
| `calendar` | `calendarheatmap`, `contributions` | measure `by` date | `value`, `date` | CalendarHeatmap |
| `sankey` | `flow`, `flows`, `alluvial` | measure `by` from `and` to | `value`, `from`, `to` | Sankey |
| `box` | `boxplot`, `boxes`, `whisker` | measure `by` category | `value`, `category` | BoxPlot |
| `kpi` | `metric`, `stat`, `number`, `bignumber`, `bigvalue`, `scorecard` | measure `by` trend field `vs` comparison | `value`, `trendBy`, `compareValue` | KPI |
| `table` | `datatable`, `grid` | columns `by` group | `columns`, `groupBy` | DataTable |
| `filters` | `filter`, `filterbar` | fields | `fields` | FilterBar |
| `data` | `dataset` | a name | a named dataset | a collapsed data summary |
| `dashboard` | `board`, `report` | a title | a dashboard | a 12-column grid |

Several view kinds in one block form a dashboard even without the `dashboard` line.

## 3. Fields and measures

- A **field** is a column name. Quote names with spaces: `"Net revenue"`, `` `Net revenue` ``.
- A **measure** may aggregate: `sum(revenue)`, `mean(price)` (`avg`, `average`), `count(user_id)` (non-missing values), and `count`, `count()`, `count(*)` or `rows` for the number of rows. `min()` and `max()` are available in tables; in charts they fall back to `sum` with a warning.
- `as "Label"` renames a measure: `kpi sum(amount) as "Revenue"`.
- Several measures draw several series: `line revenue, cost by month`.
- After `by`, the first field is the x axis or category; the second splits series (colors), groups bars, or is the y axis of a heatmap or the target of a sankey.

**Matching.** A name matches a column exactly, then ignoring case, then ignoring separators and comparing against the column's label (`Net revenue` matches `net_revenue`), then singular and plural forms, then a single close spelling (one edit for short names, two for longer ones) with a warning. A name that matches nothing is an error that lists the columns. It is never silently replaced.

## 4. Settings

A setting is `key: value`. Keys ignore case, spaces, hyphens and underscores (`x-label`, `X Label` and `x_label` are the same key). Values are taken literally to the end of the line (`title: Revenue: Q3` keeps the colon); surrounding quotes are removed.

### Common settings

| Key | Aliases | Meaning |
|---|---|---|
| `title` | | Card title and accessible name. Dashboards derive one ("Revenue by region") for untitled charts. |
| `subtitle` | `description`, `caption`, `desc`, `summary` | One line under the title. |
| `note` | `footnote`, `tooltip` | Plain-text context in tooltips and the accessible description. |
| `format` | `yformat`, `valueformat`, `numberformat` | Display format of the measure field (section 5). Axes keep compact ticks. |
| `data` | `dataset` | Name of a dataset (section 6). |
| `src` | `url` | A URL the host may load (section 6). |
| `path` | `rowspath`, `datapath`, `jsonpath` | Where the rows are inside JSON: keys and positions separated by dots, such as `data.items` (section 6). |
| `refresh` | | How often to reload a `src:` URL: `30s`, `5m`, `1h` or a number of seconds; `off` for none (section 6). |
| `span` | `cols`, `colspan` | Columns (1–12) in a dashboard. |
| `link` | | `no` to keep a view out of its dataset's shared selection, or a group name. |
| `version` | | The language version; `1` today. Others render with a warning. |
| `query` | | dbt Charts compatibility: a query name, or inline `columns` and `values` (section 9). |

### Component settings

Any setting of the rendered component can be written as a key, with its value read according to the component's JSON Schema: `stack: yes`, `legend: no`, `height: 300px`, `limit: 10`, `sort: desc`, `brush: true`, `select: true`, `bins: 20`, `interval: week`, `curve: step`, `orientation: horizontal`, `pageSize: 25`, `columns: region, revenue`, `target: 1000000`. Booleans accept `yes/no`, `true/false`, `on/off` and `1/0`; enums ignore case; lists are comma-separated or bracketed; objects may be JSON. The full list per component is [schema.json](../packages/react/src/spec/schema.ts).

Shorthands: `stacked` → `stack`; `smooth: yes` → monotone curve; `horizontal: yes` → horizontal bars; `top`, `rows` → `limit`; `series`, `split`, `colour` → `color` (`group` on bars); `trend`, `sparkline` → a KPI's `trendBy`; on a KPI, `compare: last_year` names the comparison field. Table `sort` accepts `-revenue` or `revenue desc`.

An unknown key is ignored with a warning that suggests the closest setting.

### Field and channel settings

Dotted keys describe fields:

- `<column>.label`, `.description`, `.format`, `.unit`, `.currency`, `.type` (`temporal`, `quantitative`, `nominal`), `.timezone`, `.axisformat`, `.tooltipformat`. Descriptions appear in tooltips and table headers.
- `x.label`, `y.label`, `color.label`, `x.format` describe whatever field that channel shows.
- `target.value`, `target.label`, `target.expected` set a KPI goal.

In a dashboard, field settings before the first view describe the shared dataset; inside a view they apply to that view.

## 5. Formats

`format:` and `<field>.format:` accept:

- **Names:** `number`, `integer`, `compact`, `scientific`, `engineering`, `currency`, `currency-compact`, `percent`, `pt`, `bytes`, `bytes-binary`, `duration`, `date`, `date-short`, `month`, `weekday`, `datetime`, `time`, `text`.
- **Words:** `int`, `%`, `pct`, `money`, `short`, `k`, `thousands`, `ms`, `seconds`, `year` (no digit grouping), `pp`.
- **Currencies:** `$`, `€`, `£`, `¥`, `₹`, `₩`, `USD`, `EUR` and other ISO codes, `currency EUR`, `$ compact`, `currency 2 decimals`.
- **Precision:** `1 decimal`, `2 dp`, `percent 1`.
- **d3-format specifiers:** `,.0f`, `.1%`, `$,.2f`, `.2s`, `.3e`, `,d`.
- **strftime patterns:** `%Y`, `%b %Y`, `%B %Y`, `%Y-%m-%d`, `%b %d`, `%a`, `%H:%M`.
- **A JSON format descriptor**, as in the [formatting guide](guides/formatting.md).

An unknown format is ignored with a warning. Formats change display only, never the stored values.

## 6. Data

### Inline rows

After `---`, the first non-blank line decides the format:

| Starts with | Read as |
|---|---|
| `[` or `{` | JSON: an array of objects, an array of arrays with a header row, an object of column arrays, or an object that wraps one of those (see [JSON envelopes](#json-envelopes-and-path)) |
| `\|` | A Markdown table; alignment rows are skipped and `**emphasis**` and `` `code` `` are unwrapped |
| anything else | Delimited text with a header row: tabs when tabs are at least as common as commas, semicolons when more common than commas, otherwise commas (RFC 4180 quoting) |

Each column is typed from all its values:

- **Missing:** empty, `NA`, `N/A`, `null`, `none`, `NaN`, `nil`, `-`, `—`, `–`, `..` become missing values, never zero.
- **Booleans:** `true` and `false`.
- **Numbers:** grouping commas (`1,234`), signs including `−`, scientific notation, accounting negatives (`(300)`), currency symbols or codes before or after (`$1.2M`, `€ 40`, `40 EUR`), percentages (`12.5%` → 0.125 with a percent format), and compact suffixes `K`, `M`, `MM`, `B`, `bn`, `T` (`1.2M` → 1,200,000 with a compact format). A currency column keeps its currency; one written in whole amounts displays without cents.
- **Dates:** ISO dates and times stay dates; `2026-03` and `Mar 2026` become months; `2026-Q1` and `Q1 2026` become quarters; four-digit `year` columns display without grouping.
- **Text:** anything else.

In CSV, a row with too many values caused by an unquoted thousands separator (`Europe,1,200`) is repaired when joining digit groups restores the column count, with a note. Other extra values are dropped with a warning. Duplicate column names get a suffix (`amount_2`). A block keeps at most 5,000 rows by default.

### JSON envelopes and `path:`

JSON from an API usually wraps its rows. `path:` names where they are: keys and list positions separated by dots, counted from 0.

````markdown
```quartile
bar sum(revenue) by region
path: data.items
---
{"status": "ok", "data": {"items": [{"region": "EMEA", "revenue": 1200000}, {"region": "APAC", "revenue": 860000}], "total": 2}}
```
````

- `path:` applies to JSON after `---` and to the JSON response of a `src:` URL. On CSV or a Markdown table it is ignored with a warning.
- The JSONPath spellings of the same lookup are read, with a note that gives the dotted form: `$.data.items`, `results[0].series`, `data['items']`. `$` alone is the whole document.
- A path selects one place. Wildcards, `..`, filters, slices, unions and negative positions are errors, so a block cannot query or compute over a response.
- A path that does not resolve is an error that names the first missing segment and the keys at that level: ``The path `data.itemz` stops at `itemz`: there is no such key at `data`. Keys there: `items`, `total`.``

Without a path, these shapes are read as they are, each with a note such as ``Read rows from `data`.``:

- An object in which one key holds a list of rows beside metadata: `{ "data": [...], "meta": {...} }`.
- An object in which several keys hold lists of rows, when one of them is named `rows`, `data`, `results`, `items` or `records`. That key is read, first match in that order, in any letter case.
- A list of bare arrays beside a key named `columns`, `cols`, `fields` or `schema` that names the columns, as strings or as objects with a `name`: `{ "columns": ["region", "revenue"], "rows": [["EMEA", 1200000]] }`. The names are used when there are as many as the first array has values.

Otherwise the block does not guess: ``Several keys hold rows: `current`, `previous`.`` with the hint to choose one with `path:`. The [data sources guide](guides/data-sources.md#5-json-apis-and-path) has more examples and the full list of messages.

### Named datasets

A `data` block defines rows once for a whole document:

````markdown
```quartile
data sales
revenue.format: currency USD
revenue.description: Net revenue after returns.
---
month,region,revenue
2026-07,EMEA,182000
```
````

Any block in the same document reads it with `data: sales`, before or after the definition. Hosts may also provide datasets by name (React `QuartileDocument data`, server `datasets`). When a document has exactly one dataset, views without `data:` use it.

### Remote data and refresh

`src: sales.csv` asks the host to load a URL (`url:` is the same setting). The response may be CSV, TSV, a Markdown table or JSON, and `path:` applies to JSON. In a `data` block the rows are registered under the block's name; in a dashboard, `src:` is written before the first view.

```text
line sum(visitors) by day
src: https://api.example.com/v1/analytics/visitors?range=7d
path: data.results
refresh: 5m
```

`refresh:` reloads the URL on a timer: `30s`, `5m`, `1h`, or a number of seconds; `off` switches it off. The host sets the shortest interval (10 seconds by default), and a shorter value is raised to it with a note. `refresh:` needs `src:` in the same block; elsewhere it is ignored with a warning. Static output loads a source once.

Nothing is fetched by the language. A block only names the URL:

- React pages load only through a `loadSource` function they supply, such as the one `createSourceLoader({ origins })` returns.
- The embed script fetches only from what the page lists in `data-sources`: `same-origin` and exact origins such as `https://api.example.com`. The default is `none`.
- Without permission the block says that the page does not load remote data.

A loader that the host writes itself receives the `src:` text as written, so it may define its own names, for example a warehouse query name. The packaged loader reads `http:` and `https:` URLs only. See [data sources](guides/data-sources.md) for the loader, authentication, limits and error messages.

## 7. Compilation

Blocks compile to the [JSON spec](guides/generated-dashboards.md) that `SpecView` renders, and are validated against the same schema. The compiler fills in what authors usually leave out:

- **Missing encodings** come from column types: lines take the first date column as x and every numeric column as series; bars take the first low-cardinality text column; scatter plots take the first two numeric columns; tables show every column (grouped tables: the group plus numeric totals); filter bars offer text columns with at most 20 values. Each choice is reported as a note.
- **Repeated positions** are combined: when several rows share an x (and series), measures are summed, and percentage fields are averaged instead of added. Summing a percentage explicitly gives a warning.
- **Categories on a line or area chart** (`Q1`, `Week 1`, `Jan`) keep the order they first appear in, instead of being dropped from a numeric axis; brushing is turned off for such a chart.
- **Row counts** become a `count` column of ones, or are left to components that count rows themselves.
- **KPI labels** come from `as`, the title, or the measure's label.
- **In dashboards**, charts that support it publish selections (bars, lists and donuts on click; lines, areas and histograms by brushing), untitled charts get a derived title, headline numbers sit in their own row, and a row that is not full stretches to fill twelve columns.

## 8. Documents, dashboards and linking

- **A dashboard** is one block with several views. Settings before the first view describe the dashboard (`title`, `subtitle`, `data`, field settings); the rows after `---` are shared by every view. Views filter each other: a view is never filtered by its own selection.
- **Across blocks**, views over the same named dataset share one selection: clicking a region in one block filters every other block over that dataset. Blocks with their own inline rows stand alone. `link: no` opts a view out; `link: name` joins a named group.
- **Layout** uses a 12-column grid. Defaults: KPIs and sparklines 3; lists, donuts and funnels 4; tables, calendars, sankeys and filter bars 12; other charts 6. `span:` overrides. On narrow containers every item takes the full width.

## 9. JSON and dbt Charts forms

The same fence accepts the JSON spec, which tool calls and structured outputs produce:

```json
{ "component": "BarList", "category": "priority", "value": { "field": "tickets", "aggregate": "sum" },
  "data": [{ "priority": "Urgent", "tickets": 14 }] }
```

`data` may be inline rows or a dataset name; a dashboard may carry a `datasets` object of named rows; a bare array of rows renders as a table.

The single-chart YAML of [dbt Charts](https://docs.dbtcharts.com) renders unchanged: `type`, `title`, `x`, `y`, `color`, and `query` as either a query name (read as `data:`) or inline `columns: [...]` and `values:` rows. SQL queries are not executed; pass their rows as a named dataset.

## 10. Streaming

A block may be rendered while it is still being written:

- The last line is held back until the next line starts or the block completes, because Markdown renderers append a newline to code blocks while the fence is open.
- The chart appears as soon as the header, the needed settings and the first complete row are present, and grows with each row. Before that, a placeholder keeps the block's space.
- Errors are reported only when the block is complete, so a half-written column name is never shown as a mistake.
- JSON rows read through `path:` wait for the whole JSON document, because a path cannot be followed through half of one.
- A `src:` URL is requested once its block is complete.

## 11. Diagnostics

Every problem carries a severity, a message, the 1-based line within the block and, where useful, a hint (the real columns, the closest setting). **Errors** stop a view from rendering: the block shows the messages and its source instead of a wrong chart. In a dashboard, valid views still render. **Warnings** (a corrected spelling, an ignored setting) and **notes** (an inferred encoding, a parsed percentage) render normally and are available to hosts through `onDiagnostics` and `compileBlock`.

The [`quartile check`](guides/coding-agents.md#quartile-check) command prints the same diagnostics for the blocks in Markdown files, with their line in the file, so a docs build, a CI job or a coding agent can validate blocks without rendering them.

## 12. Safety

Blocks are data. The language has no expressions, scripts, HTML, styles, SQL, imports or event handlers; text renders as text.

- **Remote data needs the host's permission.** A block can name a URL; it cannot make a page fetch it. A host opts in with a loader or a list of exact origins (section 6), and the default is none. The packaged loader reads `http:` and `https:` URLs only, sends cookies to the page's own origin only, and limits the size and time of a response.
- **A block cannot set request headers.** Headers such as an API key come from host code.
- **`path:` is a lookup.** It has no wildcards, filters or expressions, and it reads own keys only.
- **`refresh:` has a floor** that the host sets.
- **Rows are capped.** A block keeps 5,000 inline rows by default.
- **Colors and fonts come from the page**, so a block cannot imitate a page's interface beyond its charts.

The reasons are in the [security model](guides/data-sources.md#12-security-model) of the data sources guide.

## 13. Versions

This is version 1 of a preview language. A block may state `version: 1`. A future incompatible change will use a new version or fence name rather than reinterpret existing blocks. The [changelog](../CHANGELOG.md) records changes while the preview lasts.
