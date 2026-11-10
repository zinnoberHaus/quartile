# Interaction

A Quartile chart is more than a picture. Views over the same data filter each other. A reader can open the rows behind a chart and download them. A chart can say where its numbers came from. And your app can listen to what the reader selects. This page covers each of these, then what is not built.

## 1. Linked views

### Views over one dataset filter each other

Define rows once in a `data` block. Each block that reads them joins one selection, with no further setting:

```quartile
data orders
amount.format: currency USD
---
day,region,channel,amount
2026-11-02,EMEA,Web,1200
2026-11-02,EMEA,Store,800
2026-11-02,APAC,Web,650
2026-11-03,EMEA,Web,1350
2026-11-03,APAC,Web,720
2026-11-03,Americas,Store,940
2026-11-04,Americas,Web,1500
2026-11-04,APAC,Store,410
```

```quartile
barlist sum(amount) by region
title: Revenue by region
data: orders
```

```quartile
kpi sum(amount) as "Revenue"
data: orders
```

```quartile
line sum(amount) by day
title: Revenue by day
data: orders
```

Click a region in the list: the KPI and the line show that region only. Drag across the line: the list and the KPI show those days only. Click the region again, or click the line without dragging, to clear.

- **A view is not filtered by its own selection.** The list keeps every region after you click one, so you can pick another. The other views narrow.
- **Selections combine.** A region and a range of days apply together, one predicate per field.
- **What a kind publishes.** In a group, these kinds publish without being asked:

| Publishes | Kinds |
|---|---|
| a click on a mark | `bar`, `barlist`, `donut`, `scatter`, `calendar`, `sankey`, `box` |
| a dragged range of x | `line`, `area`, `histogram` |
| nothing; it only follows | `kpi`, `table`, `explorer`, `sparkline`, `funnel`, `heatmap` |

A line or an area over categories (`Q1`, `Q2`) has no range to drag and does not publish. A `table` publishes when you name the field: `select: region`.

### The group a view belongs to

Views that share a group share a selection. A view's group is the first of these that applies:

1. **`link: name`**, when the block says so.
2. **Its dataset's name**, when it reads a named dataset: a `data` block, a dataset the app provides, or a `src:` URL the page loaded.
3. **`block-<n>`**, when it has its own inline rows. `n` is the block's number in the document, counted from 1. Such a block stands alone.

You need the name when your app reads or sets a selection ([section 6](#6-react-to-selections-in-your-app)).

### A block on its own

A block with its own rows has nothing to filter, so it publishes nothing unless you ask. `select: yes` (or `brush: yes` on a line, an area or a histogram) turns it on, which is useful together with the rows panel of [section 4](#4-the-rows-behind-a-chart):

```quartile
bar sum(tickets) by priority
title: Open tickets
select: yes
actions: rows
---
priority,team,tickets
Urgent,Billing,6
Urgent,Platform,8
Normal,Billing,22
Normal,Platform,30
```

### Opt out, or join by name

- `link: no` keeps a view out of its dataset's group. It neither filters nor follows.
- `select: no` or `brush: no` keeps a view in the group as a follower only.
- `link: sales` puts a block with its own rows into the group `sales`, so several such blocks filter each other and your page can filter them by name. A selection applies to each view of the group by field name. A view whose rows lack the selected field has no matching rows, so join blocks that share the fields readers select on.

## 2. Dashboards

A `dashboard` block is several views over the rows after `---`, on a 12-column grid. Its views are one group: click a bar and the numbers, the other charts and the table follow.

```quartile
dashboard Orders, first week of November
actions: rows, download
source: Order system export
asof: 2026-11-05
filters region, channel
kpi sum(amount) as "Revenue"
format: currency USD
kpi count as "Orders"
line sum(amount) by day
bar sum(amount) by channel
table region, channel, amount
---
day,region,channel,amount
2026-11-02,EMEA,Web,1200
2026-11-02,EMEA,Store,800
2026-11-02,APAC,Web,650
2026-11-03,EMEA,Web,1350
2026-11-03,APAC,Web,720
2026-11-03,Americas,Store,940
2026-11-04,Americas,Web,1500
2026-11-04,APAC,Store,410
```

Settings written before the first view (`title`, `actions`, `source`, `asof`, `data`, `src`) belong to the dashboard. Settings written under a view belong to that view. The layout rules are in the [language reference](../language.md#8-documents-dashboards-and-linking).

## 3. Filters

A `filters` block is a row of filter controls over the fields you name. It publishes what the reader picks to its group, like a chart does.

```quartile
filters region, channel
data: orders
```

On this page it filters the other views that read `orders`, because they are one group. Without field names, `filters` offers the text columns that have at most 20 distinct values.

## 4. The rows behind a chart

### A toolbar: `actions:`

```quartile
bar sum(amount) by region
title: Revenue by region
actions: table, rows, download
data: orders
```

`actions:` adds buttons to a view:

| Action | Button | Does |
|---|---|---|
| `table` | Table | switches between the chart and the same data as a table |
| `rows` | Rows | opens the rows the view is drawn from, ten to a page, with their count |
| `download` | Download CSV | saves those rows as a CSV file named after the title |

A view shows the actions it can perform. A chart with a table view takes all three. A `kpi` and a `sparkline` take `rows` and `download`. A `table` takes `download`, since it already shows its rows. `filters` and `explorer` have their own controls and take none. An action a kind cannot perform is ignored with a warning, and so is a word that is not an action.

No toolbar appears unless a block or the host asks for one.

### Rows and downloads follow the selection

The rows panel and the download hold the dataset's rows under the group's whole selection, **including the view's own**. Click the "Urgent" bar of the chart in section 1 and open its rows: you see the rows of that bar, and the count line reads "2 of 4 rows". The chart itself still shows every bar. When another view in the group selects, the panel narrows too.

- The panel shows the columns of your data, not the helper columns a chart adds to count rows.
- The CSV has the same rows as the panel. Cells that a spreadsheet would run as formulas are neutralized.

### One toolbar for a dashboard

In a dashboard, write `actions:` before the first view. The dashboard then has one toolbar beside its heading and one rows panel under its grid, for the rows that all of its views share. That is the dashboard of [section 2](#2-dashboards).

- A dashboard takes `rows` and `download`. `table` belongs to a chart: write `actions: table` under the view that should have the button.
- A view inside a dashboard gets a toolbar of its own only when it asks.

### Start as a table: `view: table`

```quartile
bar sum(amount) by region
title: Revenue by region, as a table
view: table
data: orders
```

`view: table` draws the view as its table from the start, with or without the Table button. It needs no script, so it also works in static HTML.

### Host defaults, and the off switch

The page that renders the blocks has the last word.

| Host setting | Effect |
|---|---|
| none | Only blocks that write `actions:` show a toolbar. |
| a list, such as `['rows', 'download']` | The default for views that do not write `actions:`. A block's own line still wins, and `actions: none` in a block shows none. Inside a dashboard the default becomes the one dashboard toolbar. |
| `false` | No toolbar anywhere, whatever a block asks. |

```tsx
<QuartileDocument actions={['rows', 'download']}>{children}</QuartileDocument>
```

`QuartileBlock` and `SpecView` take the same `actions` prop, and a block's prop overrides the document's. With the script: `data-actions="rows download"` or `data-actions="none"` on the script tag, or `actions` in `Quartile.configure`.

Static HTML from the [server renderers](server-rendering.md) has no toolbar, because buttons need script. The script adds the toolbars when it upgrades the page.

### A table to work in: `explorer`

When readers should search, sort, filter and group the rows themselves, use the `explorer` kind instead of a rows panel:

```quartile
explorer day, region, channel, amount
title: Orders
sort: -amount
page size: 5
data: orders
```

- The first line lists the columns. Without them, the explorer shows every column.
- `sort: -amount` or `sort: amount desc` sets the first sort. `page size:` sets the rows per page.
- `search: off` hides the search box. `export: no` hides the CSV export.
- An explorer follows the selection of its group and publishes none. In a dashboard it takes a full row.
- Its search, filters, sorting and grouping are local to it and do not filter other views.
- In static HTML it is a plain table.

## 5. Where the numbers came from

```quartile
bar sum(population) by country
title: Population, 2025
format: compact
source: World Bank, World Development Indicators
source.url: https://data.worldbank.org/indicator/SP.POP.TOTL
asof: 2026-07-01
---
country,population
Nigeria,232000000
Ethiopia,132000000
Egypt,116000000
```

Three settings state provenance. They render as one line under the view: "Source: World Bank, World Development Indicators · As of Jul 1, 2026".

| Setting | Also written | Shows |
|---|---|---|
| `source:` | `credit:`, `attribution:` | where the data came from, as text |
| `source.url:` | | a link on the source text. Only `http:` and `https:` addresses become links. |
| `asof:` | `updated:` | when the data was current. An ISO date or date-time is written the way the page writes dates; other text, such as `Q3 2026`, is shown as written. |

- The link is never fetched by Quartile. It opens with `rel="noopener noreferrer"`. An address with another scheme is dropped with a warning and the chart still draws.
- A link without source text is named by its host, for example `census.gov`.
- The text is rendered as text: markup in it is shown, not run.
- The line is the chart's accessible description, and it is in static HTML.
- In a dashboard, write the settings before the first view for a line under the grid, or under a view for that view.

Provenance is a statement by the author of the block. Quartile does not verify it. In AI answers, tell the model to add it only when it knows the source.

**`source:` used to name a dataset.** It now states provenance. For blocks written before the change: a view that has no rows, no `data:` and no `src:`, and whose `source:` is exactly the name of a known dataset, still reads that dataset, with a warning that says to write `data:`.

## 6. React to selections in your app

### In React: `onSelectionChange`

```tsx
<QuartileDocument
  markdown={markdown}
  onSelectionChange={({ group, predicates }) => {
    // group: 'orders'
    // predicates: [{ field: 'region', op: 'in', value: ['APAC'] }]
    console.log(group, predicates);
  }}
>
  <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
</QuartileDocument>
```

- It is called after each change of a group that the document's blocks take part in, once per change however many blocks share the group.
- `group` is the name from [section 1](#the-group-a-view-belongs-to). `predicates` is the group's whole selection, and an empty list once it is cleared.
- A predicate is `{ field, op, value }`: `op: 'eq'` with one value, `'in'` with a list, or `'between'` with `[min, max]`.
- `QuartileBlock` and `SpecView` take the same prop for one block or one spec. `QuartileBlock group="name"` names a block that stands alone.

### In React: read and set through a ref

```tsx
const doc = useRef<QuartileDocumentHandle>(null);

function showEmea() {
  const orders = doc.current?.selection('orders');
  orders?.set('region', 'EMEA'); // one value
  orders?.set('region', ['EMEA', 'APAC']); // several values
  orders?.set('amount', [100, 500], { op: 'between' }); // a range
  orders?.clear('amount'); // one field
}

<>
  <button type="button" onClick={() => doc.current?.selection('orders').clear()}>
    Show all regions
  </button>
  <QuartileDocument ref={doc} data={{ orders }}>
    {children}
  </QuartileDocument>
</>;
```

`selection(group)` returns a handle with `get()`, `set(field, value, options?)`, `clear(field?)` and `subscribe(listener)`, which returns a function that stops it. `groups()` lists the names of the document's groups in the order they were first used. A group exists from its first use, so you may select before the charts have rendered.

A selection that your code sets belongs to no chart, so each view in the group is filtered by it, including the one that shows that field.

### On a page with the script

Each `<quartile-chart>` in a group dispatches a `quartile-select` event when the group changes. The event bubbles to the document. `detail.origin` is true on the one element where the reader acted, so a listener on the document can handle each action once:

```html
<script>
  document.addEventListener('quartile-select', (event) => {
    const { group, predicates, origin } = event.detail;
    if (!origin) return;
    console.log(group, predicates);
  });

  const orders = Quartile.selection('orders');
  orders.set('region', 'EMEA');
  document.querySelector('#reset').addEventListener('click', () => orders.clear());
</script>
```

- `Quartile.selection(group)` is the same handle as in React: `get`, `set`, `clear`, `subscribe`. `Quartile.groups()` lists the group names.
- A change made from script is announced by each element of the group with `origin: false`. To observe those as well, use `subscribe`.
- Elements on one page form one document. A block with its own rows is `block-<n>`, numbered in the order the page's chart elements are created. Give it a name with `link:` when a script should address it.

### Recipe: ask a follow-up from a selection

In a chat, a selection is a good hint for the next question. This component offers one after the reader clicks a mark, and withdraws it when the selection is cleared:

```tsx
import { useState } from 'react';
import Markdown from 'react-markdown';
import {
  predicateValueLabel,
  QuartileDocument,
  QuartilePre,
  type SelectionChange,
} from '@quartile/react';

export function Answer({ markdown, onAsk }: { markdown: string; onAsk: (question: string) => void }) {
  const [picked, setPicked] = useState<SelectionChange | null>(null);
  const about = picked?.predicates
    .map((p) => `${p.field} ${predicateValueLabel(p)}`)
    .join(' and ');
  return (
    <QuartileDocument markdown={markdown} onSelectionChange={setPicked}>
      <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
      {about ? (
        <button type="button" onClick={() => onAsk(`Tell me more about ${about}.`)}>
          Ask about {about}
        </button>
      ) : null}
    </QuartileDocument>
  );
}
```

After a click on the APAC row of a ranking by region, the button reads "Ask about region APAC" and `onAsk` receives "Tell me more about region APAC." Send that as the next user message, with the predicates if your server should filter the data for the answer. For this to work, the model's charts must publish: a `dashboard` block does, and so do blocks over a dataset you pass in `data`.

## 7. What is not built

- **No write-back.** Selecting, opening rows and downloading read data. No setting in a block changes data or calls your server. What happens after a selection is your code's decision, through the callback, the handle or the event.
- **No shared groups across documents.** Each `QuartileDocument` has its own groups. Two documents share a selection only when the host gives both the same `stores` function. On a page with the script, the elements already share one.
- **No interaction without script.** Static HTML shows the chart, its table and its source line. Linking, toolbars and events start when React hydrates or the script upgrades the page.
- **No stored selections.** A selection lives in memory. Nothing is written to the URL or kept across a reload unless your code does it.
- **One format.** Downloads are CSV.
- **Rows panels are read-only.** They page through the rows and do not search or sort. Use `explorer` for that.
