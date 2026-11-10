/**
 * Content for the Markdown and AI-answer examples. All figures are fictional sample data.
 * The blocks are ordinary ```quartile fences, exactly as an author or a model writes them.
 */

const F = '```';

export interface LanguageExample {
  id: string;
  label: string;
  note: string;
  source: string;
}

/** A static, API-shaped JSON file served next to the plain-HTML embed demo. */
export const TICKETS_URL = '/examples/embed/tickets.json';

export const LANGUAGE_EXAMPLES: LanguageExample[] = [
  {
    id: 'bar',
    label: 'Bar chart',
    note: 'A sentence header, one setting, then CSV. "$2,100,000" becomes a number with a USD format.',
    source: `bar sum(revenue) by region
title: Revenue by region, Q3 2026
---
region,revenue
EMEA,"$1,200,000"
APAC,"$860,000"
Americas,"$2,100,000"
`,
  },
  {
    id: 'quarters',
    label: 'Line over quarters',
    note: 'Categories on a line keep the order they are written in, instead of being dropped.',
    source: `line revenue, cost by quarter
title: Revenue and cost
format: compact
---
| quarter | revenue | cost |
|---|---|---|
| Q1 | 410K | 300K |
| Q2 | 455K | 318K |
| Q3 | 512K | 341K |
| Q4 | 498K | 352K |
`,
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    note: 'Several views share the rows after ---. Click a channel or brush the line: the views filter each other.',
    source: `dashboard Orders, September 2026
kpi sum(amount) as "Revenue"
format: currency USD
kpi count as "Orders"
line sum(amount) by day
barlist sum(amount) by channel
---
day,channel,amount
2026-09-01,Web,1200
2026-09-01,Store,800
2026-09-01,Partner,300
2026-09-02,Web,1350
2026-09-02,Store,760
2026-09-03,Web,1410
2026-09-03,Store,820
2026-09-03,Partner,410
2026-09-04,Web,1290
2026-09-04,Store,900
`,
  },
  {
    id: 'messy',
    label: 'Forgiving input',
    note: 'No separator, a misspelt column, an alias for the kind and an unquoted thousands separator still render, with notes.',
    source: `pie chart sales by Regoin
title: Share of sales
region,sales
North,1,250
South,980
West,1,640
`,
  },
  {
    id: 'dbt-charts',
    label: 'dbt Charts YAML',
    note: 'The single-chart YAML used by dbt Charts, with an inline query, renders unchanged.',
    source: `type: line
title: Documents processed
query:
  columns: [month, documents]
  values:
    - [2026-06, 1180]
    - [2026-07, 1325]
    - [2026-08, 1410]
    - [2026-09, 1602]
x: month
y: documents
`,
  },
  {
    id: 'json',
    label: 'JSON spec',
    note: 'The validated JSON form, for tool calls and structured output, renders through the same path.',
    source: `{
  "component": "BarList",
  "title": "Tickets by priority",
  "category": "priority",
  "value": { "field": "tickets", "aggregate": "sum" },
  "data": [
    { "priority": "Urgent", "tickets": 14 },
    { "priority": "High", "tickets": 41 },
    { "priority": "Normal", "tickets": 128 }
  ]
}
`,
  },
  {
    id: 'details',
    label: 'Tune the details',
    note: 'Presentation settings: series colors, the y range and its ticks, names at the line ends instead of a legend, room for them in the right margin, and a labelled reference line.',
    source: `line conversion by week and channel
title: Checkout conversion by channel
colors: signal, #f26b3a
y.min: 2%
y.max: 6%
y.ticks: 5
labels: yes
legend: none
margin.right: 96
reference: 4.5%
reference.label: Target
---
week,channel,conversion
2026-08-03,Web,3.1%
2026-08-03,App,3.9%
2026-08-10,Web,3.3%
2026-08-10,App,4.2%
2026-08-17,Web,3.2%
2026-08-17,App,4.6%
2026-08-24,Web,3.6%
2026-08-24,App,4.9%
2026-08-31,Web,3.8%
2026-08-31,App,5.3%
`,
  },
  {
    id: 'source-rows',
    label: 'Source and rows',
    note: '"source" and "asof" state where the figures came from, under the chart. "actions" adds buttons that open the rows behind the chart and download them as CSV.',
    source: `bar sum(revenue) by region
title: Revenue by region, Q3 2026
source: Kestrel Goods finance export (fictional)
asof: 2026-09-30
actions: rows, download
---
region,product,revenue
EMEA,Desks,412000
EMEA,Chairs,238000
EMEA,Lamps,96000
APAC,Desks,301000
APAC,Chairs,187000
APAC,Lamps,84000
Americas,Desks,688000
Americas,Chairs,415000
Americas,Lamps,152000
`,
  },
  {
    id: 'json-api',
    label: 'From a JSON API',
    note: 'An API response pasted as it arrived. "path" says where the rows are inside the envelope; the rest of the response is ignored.',
    source: `bar sum(tickets) by week and priority
title: Support tickets opened per week
stacked: yes
path: data.results
---
{
  "status": "ok",
  "data": {
    "results": [
      { "week": "2026-09-07", "priority": "Urgent", "tickets": 14 },
      { "week": "2026-09-07", "priority": "Normal", "tickets": 128 },
      { "week": "2026-09-14", "priority": "Urgent", "tickets": 9 },
      { "week": "2026-09-14", "priority": "Normal", "tickets": 136 },
      { "week": "2026-09-21", "priority": "Urgent", "tickets": 17 },
      { "week": "2026-09-21", "priority": "Normal", "tickets": 119 }
    ],
    "next_cursor": null
  },
  "meta": { "request_id": "req_sample_0001" }
}
`,
  },
  {
    id: 'json-url',
    label: 'JSON from a URL',
    note: '"src" names a URL and the page decides whether to load it. This page loads from its own origin only: point "src" at another site and the block says it is not allowed.',
    source: `bar sum(tickets) by week and priority
title: Support tickets opened per week
stacked: yes
src: ${TICKETS_URL}
path: data.results
`,
  },
  {
    id: 'explorer',
    label: 'Explorer',
    note: 'A table to work in: search, filters, sorting, grouping, column choices and CSV export, from one line.',
    source: `explorer product, region, channel, amount
title: Orders, first week of September
sort: -amount
page size: 5
amount.format: currency USD
---
product,region,channel,amount
Standing desk,EMEA,Web,1290
Task chair,EMEA,Store,420
Desk lamp,APAC,Web,85
Standing desk,Americas,Web,1290
Monitor arm,Americas,Partner,160
Task chair,APAC,Web,420
Bookshelf,EMEA,Web,310
Desk lamp,Americas,Store,85
Monitor arm,EMEA,Web,160
Standing desk,APAC,Partner,1190
Bookshelf,Americas,Web,310
Task chair,Americas,Web,440
`,
  },
];

export const ANSWER_QUESTION =
  'How did subscription revenue change this year, and which plans drove it?';

/** A model-style answer, replayed locally token by token. No model is called. */
export const ANSWER_MARKDOWN = `Subscription revenue grew **38.1%** from January to September 2026, from **$412K** to **$569K** in monthly recurring revenue (MRR). Paying customers grew more slowly, by 14.9%, so most of the gain came from larger accounts.

${F}quartile
dashboard
kpi sum(mrr) as "MRR, September" vs mrr_january
comparison: vs. January
kpi sum(customers) as "Paying customers" vs customers_january
comparison: vs. January
---
plan,mrr,mrr_january,customers,customers_january
Starter,102000,98000,1460,1402
Team,245000,176000,812,588
Enterprise,222000,138000,61,41
${F}

Enterprise added the most (+$84K), followed by Team (+$69K). Starter stayed flat (+$4K):

${F}quartile
line sum(mrr) by month and plan
title: MRR by plan
format: currency USD
source: Billing export (fictional sample)
asof: 2026-09-30
---
month,plan,mrr
2026-01,Starter,98000
2026-01,Team,176000
2026-01,Enterprise,138000
2026-02,Starter,97000
2026-02,Team,184000
2026-02,Enterprise,145000
2026-03,Starter,99000
2026-03,Team,193000
2026-03,Enterprise,150000
2026-04,Starter,98000
2026-04,Team,201000
2026-04,Enterprise,157000
2026-05,Starter,100000
2026-05,Team,210000
2026-05,Enterprise,165000
2026-06,Starter,99000
2026-06,Team,219000
2026-06,Enterprise,172000
2026-07,Starter,101000
2026-07,Team,228000
2026-07,Enterprise,180000
2026-08,Starter,100000
2026-08,Team,236000
2026-08,Enterprise,196000
2026-09,Starter,102000
2026-09,Team,245000
2026-09,Enterprise,222000
${F}

${F}quartile
barlist sum(change) by plan
title: MRR change, January to September
format: currency USD
select: true
---
plan,change
Enterprise,84000
Team,69000
Starter,4000
${F}

Enterprise growth accelerated in August and September. If that pace holds, it will pass Team in the fourth quarter; worth checking whether those deals were annual prepayments counted as monthly revenue.
`;

/** A report written as one Markdown document: data defined once, charts linked by it. */
export const REPORT_MARKDOWN = `# Q3 2026 sales review

*Fictional sample data.* Online revenue rose from July to September in every region, while retail stayed within a few percent of July. The charts below read one dataset, defined once at the end of this document. **Click a region or a channel** and every chart that reads the same data follows. **Rows** opens the records behind the first dashboard, narrowed to whatever is selected; **Download CSV** saves them.

${F}quartile
dashboard Quarter at a glance
data: sales
source: Kestrel Goods sales ledger (fictional)
asof: 2026-09-30
actions: rows, download
kpi sum(revenue) as "Revenue"
format: currency USD
kpi sum(orders) as "Orders"
barlist sum(revenue) by region
bar sum(revenue) by month and channel
stacked: yes
${F}

## Regions

The Americas remain the largest region. APAC grew fastest online, from $141K in July to $167K in September.

${F}quartile
table sum(revenue), sum(orders) by region
data: sales
title: Revenue and orders by region
sort: -revenue
${F}

## Channels

${F}quartile
line sum(revenue) by month and channel
data: sales
title: Revenue by channel
format: currency USD
${F}

## Data

Every chart above reads this block. It is part of the page, so readers can inspect the exact rows.

${F}quartile
data sales
revenue.format: currency USD
revenue.description: Net revenue after returns, in US dollars.
---
month,region,channel,revenue,orders
2026-07,EMEA,Online,182000,1210
2026-07,EMEA,Retail,96000,640
2026-07,APAC,Online,141000,980
2026-07,APAC,Retail,58000,410
2026-07,Americas,Online,236000,1530
2026-07,Americas,Retail,121000,800
2026-08,EMEA,Online,176000,1180
2026-08,EMEA,Retail,99000,655
2026-08,APAC,Online,152000,1040
2026-08,APAC,Retail,61000,430
2026-08,Americas,Online,249000,1610
2026-08,Americas,Retail,118000,790
2026-09,EMEA,Online,194000,1290
2026-09,EMEA,Retail,98000,650
2026-09,APAC,Online,167000,1120
2026-09,APAC,Retail,60000,420
2026-09,Americas,Online,262000,1700
2026-09,Americas,Retail,123000,805
${F}
`;
