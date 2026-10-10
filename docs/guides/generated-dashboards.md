# Generated dashboards

Quartile provides a constrained rendering surface for dashboard JSON. It does not include a model, prompt service, database connection, or arbitrary-code interpreter.

For visual composition without a model, use [Studio](studio.md). It connects public API data, edits six view types and exports native React code. Its versioned project includes source configuration and editor blocks; it is a separate document from a bare Dashboard spec.

For an existing workspace where a user asks for a filter, sort, chart or table change, use the separate optional [analysis-assistance API](ai-assistance.md). `AnalysisPlan` and `analysisPlanSchema` describe reviewed actions; `QuartileSpec` and `schema.json` describe dashboard layouts. They are distinct contracts. The [assistant demo](https://quartile-design.vercel.app/examples/assistant) starts with a labeled deterministic planner and can connect an application-owned model backend. The JSON editor below remains a local spec editor.

```tsx
import { SpecView, validateSpec } from '@quartile/react';

const spec = {
  selection: 'orders',
  layout: [
    { component: 'BarList', data: 'orders', category: 'region', value: 'amount', select: true, span: 4 },
    { component: 'DataTable', data: 'orders', columns: [{ field: 'order' }, { field: 'amount' }], span: 8 },
  ],
};

const result = validateSpec(spec);
// Show result.errors if invalid; never cast unvalidated output to trusted props.
export function GeneratedView({ orders }) {
  return <SpecView spec={spec} data={{ orders }} />;
}
```

`SpecView` also validates internally. `data` is a registry of named arrays or datasets; the spec selects names, not URLs. A Dashboard has a nonempty `layout`, optional title/description, and optional selection ID. Each component's `span` is part of a 12-column responsive layout. A single component spec is accepted too.

Read the [schema source](../../packages/react/src/spec/schema.ts) or the built `@quartile/react/schema.json`. JSX props and JSON props are not identical: functions, React nodes, and arbitrary style objects are not declarative inputs. Use the schema as the contract, including the allowlisted component names and field encodings.

## Model integration

1. Send the model the supported schema, field metadata, and the user's analytic question. Prefer metadata or small authorized samples over complete private datasets.
2. Request JSON constrained to that schema with the structured-output mechanism of your chosen model.
3. Parse JSON, enforce your own payload/row/layout limits, and call `validateSpec`.
4. Verify requested dataset/field names and measures against your application allowlist. Schema validity does not prove a metric answers the question correctly.
5. Render only the accepted spec with server-authorized data. Keep a previous valid view during an invalid edit and display useful errors.

Never evaluate model-generated JavaScript, forward arbitrary dataset URLs, or treat a generated filter as authorization. Reject unexpected fields on the server as well as in the UI. Apply rate limits and cancellation in your model/query layer.

## Aggregation and linked views

An encoding such as `y: { field: 'amount', aggregate: 'sum' }` asks the spec renderer to aggregate the measure by the view's dimensions. Filtering occurs before that aggregation. Use matching field names across views, and supply raw rows when selections need dimensions not present in preaggregated data.

Try the [editable playground](https://quartile-design.vercel.app/examples/ai-dashboard). It provides a complete local example of validation success, invalid JSON, unknown components, and linked aggregation without a model dependency.
