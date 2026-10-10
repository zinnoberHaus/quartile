# Data and linked selection

Pass plain row objects or `dataset(rows, overrides)`. Use stable field names across related views. A dataset attaches labels, types, formats, currencies, and units once so axes, tables, and KPIs agree.

```tsx
const events = dataset(rows, {
  timestamp: { type: 'temporal', label: 'Time', format: 'datetime' },
  latency: { type: 'quantitative', label: 'Latency', format: 'integer', unit: 'ms' },
  failure: { type: 'quantitative', label: 'Error rate', format: 'percent' },
});
```

Percent fields use ratios: `0.125` renders as 12.5%. Currency values use major units: `42.5` with USD renders as $42.50. Normalize cents and percentages before creating the dataset. Formatters change display, not stored values. Use explicit types for ambiguous strings and normalize timestamps to one convention before comparison.

Numeric charts and aggregate measures accept finite numbers and nonblank numeric strings. Nulls, blank strings, booleans, objects and nonfinite values are not numeric observations; an explicit zero remains zero. All-missing measure groups display an unavailable value rather than an invented zero. For table/KPI sums, an empty population sums to zero, while a nonempty population containing no valid measures remains unavailable. Counts still describe records, so a category can contain records without a usable measurement.

Calendar-date inference rejects impossible dates such as `2026-02-30`. Such strings remain nominal values that can be grouped and selected; they are not silently moved into March. Declare ambiguous identifiers as nominal, and provide validated timestamps when a field must be temporal.

Rows are `Record<string, unknown>`; a TypeScript object `type` alias works naturally. Dates can be `Date` objects or supported ISO strings. Do not mutate a dataset's rows in place: replace the array/dataset when new data arrives so memoized views update.

## Selection semantics

`Selection` owns predicates. Components inside it subscribe automatically. A predicate is `eq`, `in`, or an inclusive `between` range. Predicates on different fields combine with AND; values in an `in` predicate combine with OR. The store holds one predicate per field, so two controls targeting the same field replace that field's predicate.

```tsx
function EuropeButton() {
  const selection = useSelection();
  return <button onClick={() => selection.set('region', 'Europe', { source: 'region-control' })}>
    Show Europe
  </button>;
}
```

Every publisher has a source ID. `BarList id="regions"` ignores predicates whose source is `regions`; other views apply them. This lets the list keep offering alternatives. `selection.clear('region')` removes that field; `selection.clear()` resets the full selection. `selection={false}` on a chart or KPI opts that view out.

Use a single enclosing selection for one analytic surface. Prefer the nearest context over named global lookups when embedding multiple dashboard instances. Give named selections unique IDs. The store is UI state; it does not authorize access to records.

## Aggregate after filtering

A selected region cannot filter rows that no longer contain `region`. For custom derived views, first filter the raw rows, then aggregate:

```tsx
import { LineChart, useLinkedRows, useSourceId } from '@quartile/react';

// date is a normalized calendar day, not an arbitrary timestamp.
type Order = { date: string; amount: number; region: string };

export function RevenueTrend({ rows }: { rows: Order[] }) {
  const source = useSourceId();
  const { rows: visible } = useLinkedRows(rows, { source });
  const byDay = new Map<string, number>();
  for (const row of visible) byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.amount);
  const daily = [...byDay].map(([date, revenue]) => ({ date, revenue }));
  // Filtering is already applied above. This view is display-only.
  return <LineChart data={daily} x="date" y="revenue" selection={false} />;
}
```

Mount this component inside your provider and selection scope. `BarList`, `DonutChart`, `KPI`, and grouped `DataTable` can aggregate raw rows themselves. `LineChart`, `AreaChart` and `BarChart` sum valid numeric values at repeated x/series coordinates. That is not calendar bucketing or a mean: timestamps at different hours remain different coordinates. Use `Histogram` with a temporal interval for calendar buckets, or calculate the required statistic before rendering. The declarative spec layer supports explicit aggregate measures. Studio deliberately requires unique line coordinates to avoid summing measures such as temperature or life expectancy.

## Connect to a server

Keep credentials and row authorization on the server. Fetch an authorized, bounded result, then provide the returned rows to Quartile. If selections drive new queries, translate an allowlist of fields and operators into parameterized queries on your server, cancel superseded requests, and distinguish loading/error/empty states. Browser predicates and hidden table columns are never row-level security.

Different aggregation grains require explicit handling. Do not mix raw order rows and daily totals under one selection unless every predicate can be applied meaningfully to both.
