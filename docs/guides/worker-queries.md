# Arrow and worker queries

This is an experimental extension of the unpublished source preview. Existing rows and `dataset()` inputs remain synchronous. For larger local datasets, import Arrow into a DuckDB worker and ask for bounded aggregates or pages. React receives those results, rather than an object for every source record.

The runnable [worker explorer](https://quartile-design.vercel.app/examples/scale) generates deterministic Arrow IPC in a worker and links category counts, metrics, a 25-row detail page, and a bounded scatter plot. Its controls distinguish source records, matching records, returned rows, and drawn points. The first matching IDs in the scatter are **not a representative sample**.

## Installation and assets

First [build and pack the library](installation.md). The default package entry and `@quartile/react/query` do not import a database or start a worker. Install the optional adapter's verified peer pair only when using it:

```sh
pnpm add @duckdb/duckdb-wasm@1.32.0 apache-arrow@17.0.0
```

Use the worker and Wasm files from that same installed DuckDB version. The example uses Vite asset imports and the single-threaded MVP/EH bundles. It does not require cross-origin isolation. Other bundlers need equivalent asset handling; never pair a worker from one release with another release's Wasm.

Copy and adapt the [tested gallery initializer](../../apps/gallery/src/examples/scale/database.ts) for complete startup: it selects compatible assets, fetches Wasm on the host with HTTP and abort checks, supplies a temporary blob URL to the worker, races worker errors and an initialization deadline, and releases resources when setup fails. Host-side loading matters: in DuckDB 1.32.0 a failed Wasm fetch inside the worker can leave `instantiate()` pending.

After that application-owned startup succeeds, this wrapper transfers ownership of the initialized database and worker to the adapter:

```ts
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDuckDBBackend } from '@quartile/react/duckdb';

export function openBackend(database: AsyncDuckDB, worker: Worker) {
  return createDuckDBBackend({
    create: async () => ({
      database,
      dispose: async () => {
        try { await database.terminate(); }
        finally { worker.terminate(); }
      },
    }),
  });
}
```

Serve Wasm with `application/wasm`; the application's CSP must permit its worker, Wasm execution, and the temporary blob URL used during initialization. The gallery serves assets from its own origin. No library-owned CDN or remote database is required.

## Ingest once, query many views

```ts
import { tableFromArrays } from 'apache-arrow';

const backend = await openBackend(database, worker); // Initialized by the application.
const orders = await backend.fromArrow(tableFromArrays({
  region: ['Europe', 'Asia', 'Europe'],
  revenue: new Float64Array([120, 80, 60]),
}), {
  id: 'orders',
  fields: { revenue: { format: 'currency', currency: 'USD', label: 'Revenue' } },
});
```

`fromArrow` also accepts `Uint8Array` IPC bytes. It copies data into a private relation and retains caller ownership of the input. IPC decoding/re-encoding and database ingestion can allocate additional buffers; this is not a zero-copy API. Import outside rendering. Display initialization errors and loading state, and dispose resources created after an effect has already been canceled. The [example setup](../../apps/gallery/src/examples/scale/database.ts) demonstrates asynchronous ownership.

```tsx
import { Selection } from '@quartile/react';
import { QueryBarList, QueryDataTable, QueryKPI } from '@quartile/react/query';
import type { QuerySource } from '@quartile/react/query';

export function OrderViews({ orders }: { orders: QuerySource }) {
  return <Selection>
    <QueryKPI data={orders} value="revenue" label="Revenue" />
    <QueryKPI data={orders} aggregate="count" label="Matching orders" />
    <QueryBarList data={orders} category="region" value="revenue" select />
    <QueryDataTable data={orders} pageSize={25} defaultSort="-revenue"
      columns={[{ field: 'region' }, { field: 'revenue' }]} />
  </Selection>;
}
```

`QueryBarList` supports sums and counts, with a default maximum of 20 categories. It reports truncation. `QueryKPI` supports sum, count, mean, min, and max over the matching raw records. It does not average category means. `QueryDataTable` sends sorting and paging to the worker, shows the exact matching total, and returns to the first page when another view changes the filter. Its cell bars and shares describe the current page, not the entire source.

## Custom views

Use `useDataQuery` and `QueryResultView` for a different chart or a custom renderer:

```tsx
import { ScatterPlot } from '@quartile/react';
import { QueryResultView, useDataQuery, type QuerySource } from '@quartile/react/query';

export function RequestScatter({ source }: { source: QuerySource }) {
  const query = useDataQuery(source, {
    kind: 'rows',
    fields: ['id', 'latency', 'bytes', 'service'],
    orderBy: [{ field: 'id', direction: 'asc' }],
    window: { offset: 0, limit: 2000 },
  }, { id: 'request-scatter' });

  return <QueryResultView query={query}>
    {(data, result) => <>
      <p>{data.rows.length} points of {result.totalRows} matching requests</p>
      <ScatterPlot data={data} id={query.sourceId} x="bytes" y="latency"
        color="service" select="service" typedSelection renderer="canvas" />
    </>}
  </QueryResultView>;
}
```

The hook excludes selection predicates published by its `id`, applies all other predicates before grouping or limiting, and subscribes to the nearest `Selection`. `selection={false}` opts out; a selection name addresses another store. Additional `predicates` in the hook options are application filters.

Use the returned `sourceId` on the selecting child chart. Keep that chart inside `QueryResultView`: the boundary prevents already-consumed filters being reapplied to its bounded or aggregated rows, while leaving publication and highlighting connected. For custom bounded scatter/table views, `typedSelection` preserves physical field identities, including date-looking nominal strings. For category aggregates, `BarList prepared` preserves one numeric row per typed category without regrouping; `QueryBarList` configures this automatically. Use a static KPI value for a scalar. Passing grouped counts to a chart that counts rows produces a count of groups.

The hook reports `idle`, `loading`, `ready`, or `error`. It immediately hides an old result when inputs change. Both late successes and late failures from a superseded request are ignored. `retry()` starts a new attempt. `durationMs` includes backend queueing, execution, transfer, and result decoding; it is not an engine CPU measurement. Source lifetime remains the application's responsibility.

## Plans and semantics

| Plan | Bounded output | `totalRows` |
| --- | --- | --- |
| `rows` | Explicit offset and limit; optional projection and ordering | Matching raw records, before windowing |
| `aggregate` | Group fields, named measures, ordering, and explicit limit | Number of result groups, before limiting; one for a scalar aggregate |
| `histogram` | Explicit increasing finite edges; output fields `x0`, `x1`, `count` | Number of bins, including empty bins |

The adapter caps row/aggregate results at 10,000 and histograms at 1,000 bins. It rejects unbounded requests. A result's `complete` is true only when it covers the entire result from offset zero. Each result carries its request ID and immutable source revision; the hook rejects mismatched responses.

- Equality and inclusion use the physical field type. Temporal predicates accept epoch milliseconds, `Date`, or ISO date strings. For typed Arrow queries, ISO date-only strings mean UTC midnight, matching Arrow date epochs; ordinary synchronous row predicates retain their existing local-date convention. Use explicit timestamps or epoch milliseconds when combining both paths.
- Null equality uses SQL null semantics explicitly. Inclusion may include null; an empty inclusion list matches nothing. Ranges are inclusive and allow a null open endpoint.
- Numeric aggregates require physical numeric fields. Sum of no finite values is zero; mean/min/max of no finite values return null. An overflowing nonfinite aggregate result rejects the query. Raw row results preserve physical float values. Booleans and numeric-looking strings are not numeric measures.
- `count` without a field counts records; with a field it excludes null and empty strings. Histogram bins are left-inclusive and right-exclusive, except the final edge is included.
- Text ordering is binary lexical, nulls sort last, and raw pages use original input order to break remaining ties. This differs from locale-aware sorting of ordinary in-memory `DataTable` inputs.

Field metadata comes from Arrow, not a sample of returned rows. Supported inputs are integers up to 32 bits, Float32/Float64, booleans, strings and string dictionaries, and date/timestamp columns with at most millisecond precision. Exact decimals, 64-bit input integers, nested types, and sub-millisecond timestamps are rejected. Convert such data deliberately before importing; the adapter does not silently discard precision. Display labels, formats, currency, and units may be overridden, but physical types may not.

## Ownership, cancellation, and application boundaries

`source.dispose()` drops that source's private relation. `backend.dispose()` disposes every imported source and its adapter-created connection. Both are idempotent. An owned `create` factory's cleanup is called by backend disposal. A supplied `database` remains caller-owned; a supplied `connection` is borrowed and must be exclusively used while the backend is active.

An aborted request rejects promptly and queued work is skipped. Active prepared execution may continue in the worker; the adapter keeps its execution lock until that work and statement cleanup settle. It does not call a connection-wide cancel that could interrupt a newer view. Do not equate stale-result suppression with guaranteed engine interruption.

With an owned `create` factory, `backend.dispose()` aborts query/import callers and directly invokes the factory's required database/worker termination. It does not await pending SQL: terminating that owned engine releases all of its relations and connections. This also permits cleanup after fatal worker errors that leave DuckDB 1.32.0 request promises unresolved. Observe application-owned worker errors, dispose the failed backend, and create a fresh backend to recover.

With a borrowed database or connection, backend disposal remains graceful: it waits for active work before dropping its private relations and closing an adapter-created connection. A fatal worker failure can leave that wait pending. The caller must monitor and terminate its failed worker independently; the adapter has no authority to terminate borrowed resources. Individual `source.dispose()` also waits for active work; use owned backend disposal for a failed owned worker.

Plans contain no SQL, URLs, or relation names. The adapter validates fields against metadata, quotes identifiers, and binds values. It does not implement authorization: only ingest data the current application user is entitled to access. Generated dashboard JSON currently uses synchronous datasets; it cannot create database connections or inject query SQL.

See [decision 0002](../decisions/0002-worker-query-sources.md), [the renderer guide](renderers.md), and [performance measurement](performance.md) for boundaries and verification.
