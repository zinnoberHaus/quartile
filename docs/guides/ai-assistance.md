# Analysis assistance with an application-owned model

`@quartile/react/ai` supplies bounded profiling, context construction, a typed proposal contract, validation, a React lifecycle hook, and a review panel. The entry is optional and provider-agnostic. It has no model SDK, hosted model, automatic execution, Python interpreter, or SQL endpoint.

The [assistant example](https://quartile-design.vercel.app/examples/assistant) starts with an explicitly labeled deterministic local planner. This exercises proposal/review/apply and does not claim model inference. Connect your own HTTP backend to use a real model; the [server example](../../examples/ai-server) documents a concrete server-side integration.

## Build the context deliberately

In this fragment, `rows` is the bounded sample population supplied by your application.

```tsx
import { dataset } from '@quartile/react';
import { createAnalysisContext, profileDataset } from '@quartile/react/ai';

const samples = dataset(rows, {
  temperature: { type: 'quantitative', unit: '°C' },
  batch: { type: 'nominal' },
});
const context = createAnalysisContext({
  schema: samples.schema,
  source: { id: 'samples', version: 'snapshot-1', label: 'Lab samples' },
  fields: ['temperature', 'batch'],
  selection: [],
  profile: profileDataset(samples, { fields: ['temperature', 'batch'], maxRows: 1000 }),
  provenance: [{ label: 'Grain', detail: 'One record per laboratory sample; original demo data.' }],
});
```

`profileDataset` examines a prefix: 1,000 rows by default, at most 10,000, and at most 64 fields. It returns total/scanned rows, completeness, and field type, missing/invalid/valid counts, exact distinct counts within that prefix, numeric/date extrema, and numeric mean. It does not compute quantiles, standard deviation, correlations, distributions, or nominal example values. Prefix statistics are not representative-sampling estimates. Missing means null/undefined/empty string; present values inconsistent with the declared type, including nonfinite numbers, are invalid.

`createAnalysisContext` projects an explicit field allowlist, source identity/version, active predicates, optional profile and up to eight provenance entries into immutable JSON. It excludes raw rows, function formatters, nominal samples and arbitrary metadata. Names, labels, active filter values, extrema and provenance can still disclose information: the application chooses what may be sent. A predicate referencing an omitted field is rejected, not silently dropped. Change the source version whenever the underlying data changes.

## Proposal contract

`AnalysisPlan` contains `version: 1`, a title, a concise summary, and 1–12 actions. The schema is exported as `analysisPlanSchema`. Plans can request only:

| Action | Fields |
| --- | --- |
| `filter` | `field`, `op: eq/in/between`, typed `value`; a range is numeric/temporal. |
| `clear-filter` | `field`. |
| `sort` | `field`, `direction: asc/desc`. |
| `chart` | `chart: histogram/scatter/bar/line`, `x`, and `y` except for histogram. |
| `table` | Allowlisted `fields` and explicit `limit` up to 1,000. |

`validateAnalysisPlan(input, context)` checks finite JSON, known keys, action bounds, field existence and compatible encodings. It returns `{ valid, plan?, errors }`. `reduceAnalysisPlan(plan, state, context)` validates the whole plan before returning new `AnalysisViewState`; it does not fetch, write, or mutate a `Selection`. The application maps accepted view state to its charts/table and owns the atomic local commit. Keep record inspection filters and metric populations explicit.

Nominal fields may contain strings, finite numbers or booleans: `1`, `"1"` and `true` retain different category identities in profiling and proposal validation. A numeric identifier declared nominal is not a quantitative measure. Nominal equality/inclusion values preserve those primitive types; strings are bounded to 500 characters. This does not change the documented comparison semantics of every downstream chart or selection consumer.

Payloads are bounded at 64 KiB; prompt text at 8,000 characters; inclusion lists at 100 values; table projections at 24 fields. Unknown actions, executable values and unsafe object shapes are rejected. These restrictions establish a rendering contract, not proof that a model's explanation is correct.

## Hook, panel, and lifecycle

```tsx
import { useMemo, useState } from 'react';
import {
  AssistantPanel, createHttpAssistantAdapter, reduceAnalysisPlan,
  useAnalysisAssistant, type AnalysisContext, type AnalysisViewState,
} from '@quartile/react/ai';

export function ProposalInspector({ context }: { context: AnalysisContext }) {
  const adapter = useMemo(() => createHttpAssistantAdapter({ endpoint: '/api/analysis' }), []);
  const [view, setView] = useState<AnalysisViewState>({ filters: [] });
  const assistant = useAnalysisAssistant({
    adapter, context,
    onApply: plan => setView(current => reduceAnalysisPlan(plan, current, context)),
  });
  return <>
    <AssistantPanel assistant={assistant} />
    <pre aria-label="Applied view state">{JSON.stringify(view, null, 2)}</pre>
  </>;
}
```

This complete component reviews and commits view state; it does not itself render a chart. The gallery demonstrates the additional view-to-chart mapping. For filters already active elsewhere, initialize/synchronize `view.filters` and `context.selection` from the same application state.

The hook exposes `idle`, `loading`, `review`, `applied`, `error`, and `cancelled`, plus `submit`, `cancel`, `discard`, and `apply`. It makes no request on mount. Only explicit Apply invokes the synchronous `onApply`, after revalidation; each proposal is consumed once. Newer requests, unmount, changed context or adapter invalidate stale results even if an adapter ignores its abort signal. Cancellation does not guarantee that a remote model stopped computing. Keep the adapter identity stable with `useMemo`. Revision/staleness tracking belongs to this lifecycle hook; standalone validation and reduction only validate against the supplied context.

`AssistantPanel` shows the adapter mode, inspectable context, proposal actions, errors, cancellation and Apply/Discard. Model text is rendered as escaped text. Asynchronous persistence is not part of the local Apply transaction; implement it separately with application-specific review and error handling.

## HTTP backend boundary

`createHttpAssistantAdapter({ endpoint, id?, label?, mode?, headers?, fetch? })` POSTs `{ requestId, prompt, context }` as JSON and expects an `AnalysisPlan` JSON object directly. It bounds the streamed response and validates the eventual proposal through the hook. Endpoints must be HTTP(S) or root-relative, chosen by the application. It uses same-origin credentials; a cross-origin backend must implement its own authentication/CORS contract.

Keep provider credentials and model calls on the server. Authenticate callers, authorize the source/version/field catalog, limit requests and costs, enforce timeouts, and validate model output before returning it. The browser's context is not a trusted authorization claim. See [the optional example server](../../examples/ai-server) for its exact environment variables and deployment limitations; no model account or service is provisioned by Quartile.

The runnable example uses Node 22+ and the OpenAI Responses REST API with server-only `OPENAI_API_KEY` / `OPENAI_MODEL` and exact `ALLOWED_ORIGIN`. After `pnpm build:lib`, copy its `.env.example` to `.env`, configure it, and run `node --env-file=examples/ai-server/.env examples/ai-server/server.mjs`. It serves `http://127.0.0.1:8787/api/analysis`, validates structured output, bounds requests/responses and propagates cancellation/timeouts. Its tests use an injected provider transport, not a credentialed model call. It is an unauthenticated local-development example: the Origin check is not authentication and does not establish a multi-user deployment boundary.

The AI plan is distinct from a dashboard spec. Use [generated dashboards](generated-dashboards.md) for a complete declarative layout, [tables](tables.md) for local table state, and [data-science workflows](data-science.md) for metric semantics.
