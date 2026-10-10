# Workflow walkthrough — 2026-10-10

Scope: installation, data loading, linked analytics, record inspection, scientific examples, reviewed assistance, worker queries, Studio composition and runnable exports. The starting public revision was `559839b`. This is a correctness/usability audit of the preview, not a release or performance certification.

## Findings and resulting changes

| Workflow | Finding | Result |
| --- | --- | --- |
| Installation and copying examples | “Node 22+” included unsupported early Node 22 releases; several TSX entry examples omitted parameter types. | Recommend Node 22.12+ and retain the workspace's pinned pnpm. Complete public entry examples compile with strict TypeScript. |
| Choosing a data source | Explorer snapshot loading and Studio JSON loading have different formats, size bounds, deadlines and persistence behavior. | [Connecting data](../guides/connecting-data.md) compares paths and explains HTTP/CORS, format selection, cancellation, last-good-data preservation and the application-owned timeout boundary. |
| Python handoff | The first import did not say where `quartile_snapshot.py` must live. | State the notebook/script directory or Python import-path requirement and link file/URL snapshot loading. |
| Aggregation and missingness | Guidance could imply calendar bucketing or arbitrary aggregation from repeated line coordinates. | State additive duplicate-coordinate behavior separately from calendar bucketing, explicit means/distinct counts and Studio's stricter unique-line-coordinate rule. Preserve null versus zero semantics. |
| Table and chart scope | A reader could generalize the dataset explorer's linked table search to every `DataExplorer`. | Explain the application's `filterTableRows` bridge; Studio table search/filters remain local. Saved views and project exports are configuration, not record snapshots. |
| Studio navigation | Switching to source and back or moving a block discarded the current exploration. | Preserve mounted canvas/table/chart state for mode changes and block reordering; source/mapping changes still invalidate affected selection. |
| Studio/export data correctness | A starter could receive changed source fields without checking its actual rendered mappings. Newly added bars could silently sum non-additive measures. | Export shared field/type/line-grain guards with the native JSX. Leave new bar measures unset for deliberate mapping; do not guess a line series from a high-cardinality ID. |
| Storefront and operations | Placeholder storefront destinations and modeled timing looked more operational than the example was; a uniformly populated operations heatmap offered little diagnostic value. | Use real section navigation, describe modeled aggregate sales/fixed-week timing, round-trip shared brush state, and show failed-request counts in the service/region heatmap. |
| Scientific exploration | Sparse keys were absent rather than explicit null cells, and changing chart mappings could leave an obsolete predicate. | Rectangularize imported snapshots and clear obsolete mapping selections. Keep cohort maturity and model metric populations distinct from detail-table inspection. |
| Reviewed assistance | Numeric nominal IDs were treated as invalid; Undo/Reset could leave source or pending-proposal state behind. | Preserve primitive nominal identities in profiles/proposal validation; restore brush source on Undo and discard pending proposals on Reset. No new model service is implied. |
| Accessibility descriptions | “Every chart” overclaimed interactive/table support for Sparkline. | Document Sparkline's image summary exception and retain the uncompleted manual screen-reader audit disclosure. |

## Verification and limits

- Source and documentation were reconciled across all guides and the ten routes listed in the [example walkthrough](../guides/use-cases.md#walk-through-the-examples), including source/helper versus package-API boundaries.
- Seven complete public TSX examples from README, installation, connecting data, selection, generated dashboards, tables and framework integration were extracted and checked together with TypeScript strict mode against the packed preview. Fragment examples explicitly depend on application-owned rows, request state or model functions.
- Studio verification exercised preserving table search across source/canvas and reorder, schema mismatch when an exported app receives a changed API response, missing fields and recovery after a valid response. The standalone six-view and custom-data starter exports were installed, typechecked and built. No npm publication is implied by successful local artifact installation.
- Navigation checks exercised delayed transitions, latest-navigation behavior, back/forward, anchors and mobile navigation. The implementation keeps current content visible while a destination loads; motion honors reduced-motion preferences.
- The final public check run passed typecheck, 409 tests across 38 files, four Python tests, package consumers on React 18.2/19.3, and library/gallery production builds. Lint exited successfully with 16 existing CSS warnings. The local backend's nine HTTP tests use injected provider transport, not a credentialed model call.
- Local production-browser checks passed 19 science, 10 worker-scale and 13 navigation assertions, plus the updated Studio suite, without runtime console errors. The storefront/SaaS/operations/spec-editor harness passed its 13 checks, including a real brush → shared URL → reload round trip and filtered CSV inspection. Deployment checks are recorded with the pull request's final revision.
- Provider availability, CORS and machine-specific worker/GPU behavior may change. Automated checks do not replace a manual screen-reader compatibility audit, a representative performance study or a live model-provider test.

Related contracts: [tables](../guides/tables.md), [science](../guides/data-science.md), [assistance](../guides/ai-assistance.md), [worker queries](../guides/worker-queries.md), [API sources](../guides/api-data.md) and [Studio exports](../guides/studio.md).
