# 0004: Analytical tables and model-agnostic AI

Date: 2026-10-10 · Status: accepted

## Context

Data scientists need to move between distributions, subsets, individual records and reproducible analysis configurations. Quartile already shares schema and selection across charts and tables, and provides an optional bounded query layer. The next step is richer table exploration and an explicit contract for AI-assisted analysis.

## Decision

- Keep Quartile an embeddable React/TypeScript library. Hex and Foundry inform analysis workflows; Quartile does not become a hosted notebook, warehouse, training service, ontology platform or collaboration backend.
- Add `DataExplorer` over the existing table and data model. Its view configuration is versioned, serializable and controlled or uncontrolled. Search, typed filters, multi-sort, column settings, grouping and paging have defined execution order. Applications own persistence and edited source records.
- Preserve existing `DataTable` behavior and shared-selection source exclusion. Editing emits validated changes; it never silently mutates caller data. Aggregate rows are read-only. CSV represents the complete filtered result and visible columns, with spreadsheet-formula protection.
- Add an optional `@quartile/react/ai` entry with no model SDK or service dependency. Core charts and tables do not import this entry. It shares the package's existing contexts rather than bundling independent copies.
- AI adapters receive a bounded, JSON-safe schema/selection/provenance context. Data profiles are explicit and bounded; row samples are excluded by default. Applications choose their backend, authentication and model, and enforce their own data access policy there.
- Model responses are untrusted declarative proposals. Validate allowed filter, sort, chart and table actions against the active schema and source revision. Do not execute model-produced JavaScript, SQL, arbitrary URLs or imports. Applying a proposal is an explicit application action, with stale-result rejection and cancellation.
- Examples distinguish a connected backend from local deterministic demonstrations. Dataset exploration, retention cohorts and model evaluation demonstrate real calculations on documented fictional fixtures; they do not imply live customer data or a training engine.

## Consequences

Saved views and analytical plans become reproducible application inputs, but do not provide multi-user persistence or authorization. Local exploration remains bounded by the supplied rows; the existing query entry remains the route for remote/worker-backed data. Dataframe handoff examples export typed snapshots rather than claiming a native Python runtime or two-way notebook synchronization.

New public APIs require model, interaction and consumer tests plus public guides. The private landing and docs sites consume a freshly measured package artifact only after library verification. The package remains an unpublished preview.
