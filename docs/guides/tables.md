# Analytical tables and saved views

Use `DataTable` for a table inside a composed report. Use `DataExplorer` when readers need search, typed filters, multiple sort priorities, column controls, grouping, view JSON, and CSV export. Both use the existing provider, field metadata, and linked selection. [Run the dataset explorer](https://quartile-design.vercel.app/examples/explore).

```tsx
import { useState } from 'react';
import {
  DataExplorer, QuartileProvider, Selection, createTableViewState, dataset,
  type DataTableColumn,
} from '@quartile/react';
import '@quartile/react/styles.css';

const samples = dataset([
  { id: 's1', batch: 'A', temperature: 21.5, passed: true },
  { id: 's2', batch: 'B', temperature: null, passed: false },
], { temperature: { type: 'quantitative', unit: '°C' } });

const columns: DataTableColumn[] = [
  { field: 'id', width: 120 },
  { field: 'batch', width: 140 },
  { field: 'temperature', cell: 'number', width: 160 },
  { field: 'passed', width: 120 },
];

export function SampleExplorer() {
  const [view, setView] = useState(() => createTableViewState({
    pageSize: 10,
    sorts: [{ key: 'temperature', desc: true }],
    pinnedColumns: { left: ['id'], right: [] },
  }));
  return <QuartileProvider><Selection>
    <DataExplorer data={samples} columns={columns} rowKey="id"
      view={view} onViewChange={setView} select="batch"
      title="Sample measurements" exportFileName="samples.csv" />
  </Selection></QuartileProvider>;
}
```

## Processing order and scope

The explorer applies shared selection first, excluding its own published predicate. It then applies local search and filters, groups if requested, sorts, and paginates. Local search/filter controls refine this table only; they do not publish chart predicates. Row selection through `select` does publish to the nearest `Selection`. A required stable `rowKey` identifies records independently of sorting or paging.

Search is case-insensitive across configured source fields, including hidden columns. Filters combine with AND. Grouping uses a single field and the columns' existing aggregate definitions; grouped rows are summaries, not source records. Editing is disabled while grouped. Choose sum/count/mean/min/max explicitly where the default would not reflect your metric.

Local category filtering and grouping preserve typed identities. The legacy synchronous shared selection path still uses date-aware comparison, which can equate nominal strings that parse to the same instant. `typedSelection` preserves table highlighting/publication but does not change every sibling component's filter semantics. Use stable non-date-like IDs for linked record selection. When grouped, selecting a row publishes its grouping value rather than the first member's record ID.

| Filter type | Operations and semantics |
| --- | --- |
| `text` | `contains`, `notContains`, `eq`, `startsWith`; case-insensitive strings. |
| `number` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, inclusive `between`; finite numbers, without string coercion. Null range endpoints are open. |
| `date` | `on`, `before`, `after`, `between` with `YYYY-MM-DD` inputs. Days use UTC; a between range includes both complete endpoint days. |
| `category` | `in`, `notIn`; typed primitive identities. The picker offers up to 1,000 distinct source values. |
| `boolean` | `is`; actual boolean values. |
| `empty` | `isEmpty`, `isNotEmpty`; null, undefined, empty strings and nonfinite numbers count as empty. |

## View state and persistence

`TableViewState` version 1 contains `search`, `filters`, ordered `sorts`, `hiddenColumns`, `columnOrder`, `columnWidths`, `pinnedColumns`, `groupBy`, zero-based `page`, and `pageSize`. Column controls use each column's `key`, falling back to `field`; filters/grouping use source field names. Widths are 60–1,000 pixels, and page size is 1–1,000. Sort priorities use `{ key, desc }`; Shift-clicking a header adds a priority. Empty values sort last and equal keys retain a stable order.

`createTableViewState(partial)` fills defaults and validates. `parseTableViewState(jsonOrObject)` rejects malformed saved configurations; `serializeTableViewState(view)` validates and emits JSON. The explorer's View panel copies/applies configuration JSON. It does not save records, credentials, or shared selection. Durable storage and named-view management belong to the application. The gallery additionally demonstrates browser-local view persistence.

`filterTableRows(rows, view, schema, fields?)` applies local filters/search. `deriveTableRows(rows, columns, view, schema)` additionally groups and sorts, without paging. Callers using these helpers must pass the intended linked population themselves.

## Column controls and controlled edits

The explorer exposes visibility, reordering, numeric width, and left/right pinning controls. An uncontrolled explorer seeds pins from column definitions unless `defaultView.pinnedColumns` is supplied; controlled `view` is authoritative. Direct `DataTable` pinning requires a numeric column width; fractional CSS tracks cannot establish a stable sticky offset.

Set `editable` on a column, provide `rowKey`, and handle `onCellEdit`. The component proposes a change; your callback updates the source array or persists it. It never writes to a database itself.

```tsx
<DataExplorer data={rows} rowKey="id"
  columns={[
    { field: 'id', width: 120 },
    { field: 'temperature', width: 160, editable: {
      type: 'number', nullable: true,
      validate: value => value !== null && Number(value) < -273.15
        ? 'Temperature must be at least absolute zero.' : null,
    } },
  ]}
  onCellEdit={({ row: edited, field, value }) => {
    setRows(current => current.map(row =>
      row.id === edited.id ? { ...row, [field]: value } : row));
  }} />
```

`DataTableEdit` includes the original `row`, stable `rowKey`, source `field`, `columnKey`, `previousValue`, and proposed `value`. A field-name rowKey becomes an opaque typed identity in DataExplorer; compare the original row's ID when updating source records, or provide a rowKey function with your chosen representation. Editors support text, finite numbers, UTC calendar dates, booleans and explicit select options. `validate(value, row)` can keep an invalid draft open. An asynchronous callback shows pending state; rejection remains visible. Authorization, concurrency conflicts and rollback policy belong in your persistence layer. Nullable blank text/number/date editors emit null; nullable boolean editors expose an Empty option.

## Export and scale

CSV includes all matching sorted result rows before pagination and only visible columns in their visible order. When grouped, it exports groups. `onExport({ csv, rows, columns, view })` replaces the browser download. The lower-level `tableToCSV` quotes/escapes cells and prefixes formula-like strings; values are source values, not localized display text.

This is local row processing. Virtualization bounds rendered rows, not filtering/sorting cost or the dataset in memory. `QueryDataTable` remains the separate worker-paging path; do not run a local explorer over one remote page and label the export as the entire remote source. See [worker queries](worker-queries.md) and [data-science workflows](data-science.md).
