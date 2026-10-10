# Bring your data to linked charts

Start with the dataset explorer at `/examples/explore` in the local gallery (`pnpm dev`). Import a CSV/JSON file or open **Load from a data URL**. Choose a numeric measure and a categorical group; selecting a category updates the distribution, field profile and records. Search and table filters also refine the charts. Clear the selection or restore the sample to start again.

## A file or API snapshot

The explorer accepts a JSON row array or a metadata envelope:

```json
{
  "label": "Orders — one row per order",
  "rows": [
    { "id": "001", "region": "East", "amount": 42.5 },
    { "id": "002", "region": "West", "amount": null }
  ],
  "fields": {
    "id": { "type": "nominal", "label": "Order" },
    "amount": { "type": "quantitative", "format": "currency", "currency": "USD" }
  }
}
```

Use a public HTTP(S) URL or a browser-accessible application endpoint returning that shape. Choose CSV or JSON explicitly when an endpoint's extension and content type do not describe its response. URL imports send no cookies, authorization headers or referrer. Cross-origin sources must allow access through CORS; Quartile does not proxy around a source's access policy. Keep database passwords and service keys on your server.

Both file and URL imports accept up to 5 MB, 10,000 rows and 64 fields. URL responses are checked while streaming, including when the server omits Content-Length; requests time out after 15 seconds. Cells must be scalar values or null. Nested API envelopes, pagination and database protocols need an application adapter. CSV numeric inference preserves leading-zero IDs and oversized integers as strings; represent large integer IDs as strings in JSON too. Use field metadata for numeric IDs that should be categories and ambiguous dates.

Successful loading replaces the current dataset and resets selections and table configuration. Local edits are replaced, so export changes first. Load again to refresh a snapshot. A failed or cancelled request leaves the previous dataset intact, and a superseded response cannot overwrite a newer import or restored sample. The explorer does not poll or save source credentials. Saved views contain table settings, not imported records.

## Inside a React application

Your application supplies authorized rows to the existing `dataset()` API:

```tsx
import { BarList, DataTable, Histogram, QuartileProvider, Selection, dataset } from '@quartile/react';
import '@quartile/react/styles.css';

type Order = { id: string; region: string; amount: number | null };

export function Orders({ rows }: { rows: Order[] }) {
  const data = dataset(rows, {
    id: { type: 'nominal', label: 'Order' },
    amount: { type: 'quantitative', format: 'currency', currency: 'USD' },
  });
  return (
    <QuartileProvider>
      <Selection>
        <Histogram data={data} x="amount" brush />
        <BarList data={data} category="region" select />
        <DataTable data={data} columns={[{ field: 'id' }, { field: 'region' }, { field: 'amount' }]} />
      </Selection>
    </QuartileProvider>
  );
}
```

For authenticated sources, fetch from your application backend using its existing session and authorization rules; validate and bound its response before passing rows into this component. The [URL loader](../../apps/gallery/src/examples/science/load-data.ts) and [source UI](../../apps/gallery/src/examples/science/DatasetSource.tsx) are gallery examples, not new package APIs. The [installation guide](installation.md) explains how to consume the unpublished preview locally.

Keep one row grain across linked views. Filter raw rows before aggregation; a precomputed daily total cannot respond correctly to an order-level region filter unless that dimension remains available. Show when a source was fetched, its row grain and whether records were limited or sampled. For larger data, use [bounded queries](worker-queries.md) and make server-side aggregate scope explicit. A preview table's row count must not be presented as the complete source population.

See [data and selection](data-and-selection.md) for crossfilter semantics, [data science](data-science.md) for Python snapshots and [tables](tables.md) for controlled edits and exports. Hosted database connectors, scheduled refresh and shared dashboard accounts are not part of the current preview.
