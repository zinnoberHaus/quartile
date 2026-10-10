# Data-science workflows: evidence, capability audit, and examples

Checked 2026-10-10. The capability audit describes public commit `aa01805`, before the work proposed below. **Proposed** means an implementation recommendation, not a shipped feature or a compatibility claim. Sources are official product/project documentation; the recommendations are our inference, not a user study or evidence of adoption.

## What a scientist-facing library can contribute

**Evidence:** [Hex notebooks](https://learn.hex.tech/docs/explore-data/notebook-view/develop-your-notebook) combine SQL, Python, transformations, interactive inputs, and display cells around reusable dataframes and variables. [Hex Explore](https://learn.hex.tech/docs/share-insights/explore) lets viewers investigate the dataframe behind an app's chart or pivot. This connects an analyst's computation to someone else's follow-up questions.

**Evidence:** [Palantir's platform overview](https://www.palantir.com/docs/foundry/platform-overview/overview/index.html) describes data, logic, actions, an Ontology, security, and managed operational capabilities. Its [model evaluation workflow](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic) generates inference/metric datasets, respects permissions, and computes metrics for both the overall dataset and explicit subsets.

**Inference:** Quartile can supply the React surface for inspecting data, selecting a subset, comparing results, and explaining the calculation. It does not supply a notebook kernel, warehouse, model training service, model registry, access-control system, collaboration service, or operational agent. An application may connect these services, but component/schema validity does not establish data authorization, analytic correctness, or safe tool execution.

Useful workflow requirements inferred from these sources are: visible row grain and provenance; reproducible filters and parameters; explicit missing-data and denominator rules; a path from an aggregate to its underlying records; and a concise explanation beside the results. These requirements are more concrete than a claim to replace a managed data platform.

## Table and AI interaction research

[Airtable views](https://support.airtable.com/articles/5189551686-getting-started-with-airtable-views) separate one table’s records from named configurations of filtering, sorting, grouping and field visibility. [Ant Design Table](https://ant.design/components/table/) supplies selection, filter panels, multiple sorters, fixed/hidden columns, editable cells and pagination. **Our inference:** preserve a compact record grid with a separate versioned view state. Make grouped aggregates read-only, retain caller ownership of edits, and export the complete filtered result rather than only the visible page. This implements a useful subset; it does not establish spreadsheet formulas, relational storage, collaborative editing or feature parity.

[Hex Threads](https://learn.hex.tech/docs/explore-data/threads) connects conversational exploration with inspectable analytical work. [Palantir AIP Logic automation](https://www.palantir.com/docs/foundry/logic/aip-logic-integration-automate) describes proposed actions and a review workflow before execution. **Our inference:** an embeddable assistant should propose typed view changes, expose the disclosed context and resulting plan, reject stale responses, and require Apply. Quartile’s adapter does not execute arbitrary code or substitute for an application’s authorization layer.

[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) provides a constrained response format; [Anthropic client tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) distinguish model requests from client-side execution. **Our choice:** keep the public contract model-agnostic, validate the response again against allowed fields and types, and provide one executable server example. Structural validity alone does not prove a scientifically correct result. The local workbench’s deterministic rules are explicitly labeled; a real model requires the separately configured backend.

## Current public capabilities and gaps

| Area | Built at the audited commit | Boundary relevant to these examples |
| --- | --- | --- |
| Rows and metadata | `dataset()` carries rows plus declared/inferred field types, labels, units, and formats. | There is no dataframe execution kernel or general profiling API. Missing values and numeric coercion need deliberate treatment in scientific calculations. |
| Linked inspection | `Selection`, `useSelection`, and `useLinkedRows` connect predicates with source-excluding filtering. | One predicate per field, combined with AND; this is not arbitrary Boolean query building. Precomputed results must not be filtered or aggregated a second time. |
| Distribution and relationships | Histogram, BoxPlot, scatter, and other charts have keyboard behavior and exact-data alternatives. Scatter has explicit SVG/Canvas/WebGL renderers. | Accelerated rendering is scatter-only; a fast mark layer does not establish fast preparation or unrestricted capacity. Screen-reader compatibility is not manually established. |
| Matrices | Heatmap consumes linked filters and supports explicit axes, a fixed domain, tooltips, keyboard focus, and a table view. | It does not publish cell selections. Missing combinations display no data, but a present row with a null numeric value can become zero during aggregation. Omit immature cohort cells entirely. |
| Detail tables | DataTable supports selection, sorting, pagination/virtualization, custom cells, bars, and sparklines. | It is not a persisted spreadsheet/database. Row selection, exported records, and analytic denominators can have different scopes; label them. |
| Optional queries | `@quartile/react/query` exposes bounded rows, aggregate, and histogram requests; DuckDB accepts Arrow tables/IPC and applies typed predicates. | No arbitrary SQL in plans, joins, window plans, streaming ingestion, or built-in cohort/model metrics. The adapter caps results and copies imported data; it is not a zero-copy guarantee. |
| Declarative UI | A JSON schema, validator, and SpecView render a supported component subset. | The baseline editor does not contain an LLM or execute Python/SQL. A generated interface still needs trusted data and semantic checks. |

Audit references: [architecture](../architecture.md), [data types](../../packages/react/src/data/types.ts), [selection store](../../packages/react/src/selection/store.ts), [Heatmap](../../packages/react/src/charts/Heatmap.tsx), [matrix aggregation](../../packages/react/src/charts/core/dist-stats.ts), [query types](../../packages/react/src/query/types.ts), [worker decision](../decisions/0002-worker-query-sources.md), and [renderer decision](../decisions/0003-accelerated-scatter.md). Earlier [product research](product-direction-2026-10-09.md) remains historical; its unbuilt Arrow/renderer observations were superseded by those decisions and implementations.

## Proposed runnable examples

These examples should use original deterministic fixtures, require no credentials, expose calculations in source, and provide meaningful empty/undefined states. None is described as built by this research note.

### 1. Dataset profiling and exploratory analysis

**Question:** Which batches explain missing measurements, a skewed distribution, or an unusual relationship?

Use approximately 180 laboratory-like sample records with stable IDs, categories, timestamps, numeric measurements, nulls, and a boolean quality flag. Show a field summary, selected numeric distribution, group comparison, scatter relationship, and inspectable records. Profiles must distinguish missing, invalid/nonfinite, and valid numeric observations; show the denominator behind each count and statistic.

**Evidence:** [pandas `describe`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.describe.html) reports numeric count, center, spread, and quantiles while excluding missing values, and has different categorical summaries. **Our choice:** expose missingness separately instead of treating a reduced valid count as self-explanatory. Any quartile interpolation and standard-deviation convention must be documented and tested.

Acceptance: filter a batch, verify profile/chart/table agreement, inspect missing measurements, reset, and test empty/all-null/constant fields against hand-calculated fixtures.

### 2. Retention cohorts

**Question:** How does return activity differ by acquisition cohort and channel?

Use approximately 240 users plus dated activity events and an explicit observation cutoff. Compute exact calendar-month return retention: unique users active in a given age month divided by the eligible cohort's unique users. Show a cohort heatmap, a weighted overall curve, counts, channel/cohort controls, and supporting records. Duplicate events must not increase retained users. Future/incomplete age intervals are absent, never zero retention. Heatmap exploration uses explicit controls or selectable tables, since cells currently do not publish selection.

**Evidence:** [Amplitude's retention definitions](https://www.amplitude.com/docs/analytics/charts/retention-analysis/retention-analysis-calculation) distinguish exact-interval return from return-on-or-after, and exclude incomplete cohorts from overall interval denominators. **Our choice:** implement one clearly labeled definition, use completed UTC calendar months, and calculate an overall ratio from summed counts rather than averaging cohort percentages.

Acceptance: duplicates, unequal cohort sizes, no return, cutoff boundaries, and an immature interval have exact expected results; filters change the eligible population consistently.

### 3. Binary model evaluation and error inspection

**Question:** What does a threshold trade off, and which slices contain the mistakes?

Use approximately 360 records containing stable ID, segment, binary observed label, and model score. Threshold controls recompute predicted labels, confusion counts, precision, recall, F1, and accuracy; a score distribution and detail table support investigation. Label the score rule (`score >= threshold`), positive class, sample size, and selected segment. Undefined ratios display an unavailable value, not a successful zero. Error-row inspection must not silently redefine the evaluation population.

**Evidence:** [scikit-learn's classification report](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.classification_report.html) reports precision, recall, F1 and support, with explicit zero-division handling. Palantir's evaluation workflow above separates overall metrics from subset metrics. **Our choice:** keep metric calculations pure and testable; call this evaluation of supplied predictions, not training, calibration, fairness certification, or production monitoring.

Acceptance: a hand-built confusion matrix, threshold equality, all-negative/all-positive predictions, empty slices, and zero denominators; confusion counts always sum to the evaluated record count.

### 4. Dataframe handoff explorer

**Question:** How does an analyst's prepared dataframe become an inspectable React application?

Provide a small reproducible pandas/Polars export recipe and a committed original fixture. Let the app show source/schema metadata, apply linked filters, inspect exact records, and export the current selection. A row-JSON route is the smallest useful implementation; an Arrow variant can reuse the existing bounded-query explorer. A passing JSON example does not establish every Arrow producer/version combination or a Jupyter/Streamlit integration.

Acceptance: the exported fixture's row count, IDs, nulls, dates, and selected totals survive the handoff. Test one explicitly declared producer/type combination before calling it compatible.

## Integration choices supported by primary sources

| Integration | Evidence | Practical Quartile boundary |
| --- | --- | --- |
| pandas → JSON rows | [`DataFrame.to_json`](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.to_json.html) supports records orientation; missing values become null; date output can be ISO. Records do not preserve index labels. | Export the intended index/ID explicitly, declare the Quartile schema, and normalize values deliberately. The pandas table-schema envelope is not itself a Quartile Dataset. Preserve oversized integer identifiers as strings. |
| pandas/Polars → Arrow IPC | [Arrow pandas conversion](https://arrow.apache.org/docs/python/pandas.html) supports Table conversion and explicit index handling. [Polars `write_ipc`](https://docs.pola.rs/api/python/stable/reference/api/polars.DataFrame.write_ipc.html) writes Arrow IPC with compatibility/compression options. | Existing Quartile ingestion accepts a restricted physical type set: integers through 32 bits, floats, booleans, supported strings, and dates/timestamps through milliseconds. Default 64-bit integers, finer timestamps, newer string representations, and compression may require explicit conversion/compatibility verification. Do not promise lossless arbitrary-dataframe ingestion. |
| Jupyter/anywidget | [anywidget](https://docs.anywidget.dev/en/getting-started/) documents Python/JavaScript state synchronization and bundling frameworks such as React. | A possible adapter would mount/unmount React, load CSS, serialize data and predicates, and validate messages. No Quartile Python widget or tested notebook integration exists at the audited commit. |
| Streamlit | [Custom components](https://docs.streamlit.io/develop/concepts/custom-components/overview) document a v2 bridge for web code, JSON/Arrow exchange, and shared-page rendering. [Communication](https://docs.streamlit.io/develop/concepts/custom-components/components-v2/communicate) explains state/trigger callbacks and reruns. | A possible wrapper could map rows and selection events through that bridge. It requires lifecycle, theme/CSS isolation, serialization, and rerun testing; native Streamlit support is not established by React compatibility. |

Python or a server should remain responsible for expensive transforms, training, joins, and authorization. The browser should receive the authorized, bounded records/results needed for the task. Dataset version, extraction time, row grain, timezone, metric definition, and sampling/limiting status belong beside the analysis.

## Proposed documentation navigation

Public implementation guides should add **Data-science workflows** (profiling, retention, evaluation with formulas and runnable source) and **Dataframe integration** (JSON first, Arrow types, external-runtime boundary). Link them from the guide index, use-case overview, and README after implementations pass.

The published documentation site should expose the same task sequence: **Start → Bring data → Explore and evaluate → API reference**. Place three scientist examples together under use cases, keep the worker/renderer guides under data and performance, and link exact API references from each recipe. Publish Jupyter/Streamlit ideas as unbuilt adapter guidance until their own runnable verification exists. The site and public guides should describe the same verified capabilities without duplicating private implementation sources into this repository.

## Implementation follow-up

The subsequent preview implementation adds DataExplorer and the optional AI entry, the three science workspaces, and a Python snapshot handoff. [Data-science guidance](../guides/data-science.md), [table guidance](../guides/tables.md), and [AI integration](../guides/ai-assistance.md) describe the implemented contracts. Original fixtures contain 180 lab samples, 240 cohort users and 360 supplied predictions; the pure retention/evaluation helpers have 17 passing tests. Profiling is the bounded exported `profileDataset` helper, not the broader statistics package suggested in the exploration above. The fourth handoff workflow is integrated into the dataset explorer rather than exposed as a separate route.

The audit and proposal sections preserve the reasoning at the stated baseline. Jupyter/Streamlit adapters, hosted model provisioning, training and managed notebook services remain unbuilt. Final aggregate test counts, browser verification, credentialed model checks and deployment results are recorded separately; the proposals alone are not release evidence.
