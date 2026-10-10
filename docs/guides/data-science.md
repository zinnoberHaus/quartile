# Data-science workflows

Quartile supplies an inspectable React surface around data preparation and model results. The runnable examples use original deterministic fixtures, with no hosted notebook, training service, or real customer data. The [research note](../research/data-science-workflows-2026-10-10.md) explains the primary-source evidence and platform boundary.

| Task | Runnable example | Implementation |
| --- | --- | --- |
| Profile and explore a dataset | [Dataset explorer](https://quartile-design.vercel.app/examples/explore) | [Science workspace](../../apps/gallery/src/examples/science) |
| Compare return activity by cohort | [Cohort retention](https://quartile-design.vercel.app/examples/cohorts) | [Exact calculations](../../apps/gallery/src/examples/science/analysis.ts) |
| Inspect model thresholds and errors | [Model evaluation](https://quartile-design.vercel.app/examples/model-evaluation) | [Fixtures and calculations](../../apps/gallery/src/examples/science) |
| Review a proposed analysis view | [Assistant](https://quartile-design.vercel.app/examples/assistant) | [Optional AI entry](../../packages/react/src/ai) |

## Profiling and exploratory analysis

The lab fixture contains 180 records: sample ID, batch, material, instrument, UTC measurement time, nullable measurements and a nullable quality flag. `yieldPct` is a fraction from zero to one, displayed as a percentage. Temperature, pressure and duration retain their physical units.

The explorer combines a field profile with linked distribution/relationship views and an exact table. The optional `profileDataset` helper from `@quartile/react/ai` provides valid/missing/invalid/distinct counts and numeric/date ranges; numeric fields also have a mean. It examines at most a configured prefix, so show `scannedRows`, `totalRows`, and `complete`. It neither imputes missing values nor detects statistically significant anomalies.

Supply field metadata when inference would misclassify identifiers or sparse columns. A nominal ID that resembles a date must remain an ID. Shared chart filters and a table's local filters have separate scopes; see [tables](tables.md). Label which population a profile describes, particularly after table search.

## Retention: users, calendar months and maturity

The fixture has 240 users across six unequal April–September 2026 acquisition cohorts, with Organic/Paid/Partner channels and repeated activity events. The exclusive observation cutoff is `2026-10-01T00:00:00.000Z`.

Month zero is the unique signup population and therefore a 100% baseline. For age months one and later:

```text
retention = unique users active in that exact UTC calendar month
            / unique eligible users in the acquisition cohort
```

Only completed calendar months are eligible. Future/incomplete cells are omitted from the matrix and overall denominator. A mature cell with no activity is zero; an immature interval is not zero. Repeated user records with the same cohort/channel are deduplicated; conflicting identity records reject. Multiple activity events for one user/month count once. This is exact-month return, not return-on-or-after retention or a rolling 30-day calculation.

`retentionByCohort(users, events, cutoff?, maxMonth=5)` returns `{ cohortMonth, month, retained, eligible, retention }`. `overallRetention(cells)` sums numerators and denominators per age month, giving the weighted ratio. It never averages cohort percentages. `cohortMembership(users, events, month, cutoff?)` returns unique user rows with `eligible`, nullable `retained`, and Returned / Did not return / Not yet observed, so records explain the selected interval.

These functions belong to the example source, not the published component API. Pass the chosen channel/cohort user population to them; unmatched events are ignored. Heatmap consumes linked filters and supports keyboard inspection, but does not publish cell selections. The example uses explicit cohort/month controls and detail records.

## Model evaluation: threshold and population

The fixture contains 360 supplied binary labels/scores across Starter/Growth/Enterprise segments. It represents synthetic predictions, not a trained model. A score equal to the threshold counts as positive: `score >= threshold`. Scores must be finite in `[0,1]`; labels are exactly zero or one.

| Metric | Definition |
| --- | --- |
| Precision | TP / (TP + FP) |
| Recall | TP / (TP + FN) |
| F1 | 2TP / (2TP + FP + FN) |
| Accuracy | (TP + TN) / evaluated records |

An undefined denominator returns null; render “—” with an explanation. A defined zero remains zero. Confusion counts always sum to the evaluated population. Segments change that population; restricting the detail table to false positives is a separate inspection step and must not silently redefine the metric denominator.

`evaluatePredictions(rows, threshold=0.5)` returns counts, positive totals and ratios. `predictionRows(rows, threshold)` preserves records and adds predicted label, TP/FP/TN/FN and correctness. Both are pure example helpers. Threshold exploration does not establish calibration, causal explanations, fairness, or production suitability. Supply externally computed evaluation snapshots when training, cross-validation, or more advanced metrics are required.

## pandas, Polars and notebook handoff

The [Python handoff](../../examples/python/README.md) exports a dataframe or list of dictionaries into an inspectable JSON snapshot. Its utility uses the Python standard library and requires no Quartile Python package. The included notebook demonstrates pandas in the caller's notebook environment.

```python
from quartile_snapshot import write_snapshot

write_snapshot(df.head(1000), "observations.json",
    label="Experiment observations",
    fields={
        "sample_id": {"type": "nominal", "label": "Sample"},
        "temperature": {"type": "quantitative", "unit": "°C"},
    })
```

Import the file through the dataset explorer. Example limits are 10,000 rows, 64 fields and 5 MB; these are input guards, not universal library capacity claims. Records stay in that browser unless the application exports them or sends configured assistant context. Saved view configuration does not contain the imported records.

The local explorer also loads bounded CSV/JSON snapshots from a data URL, with cancel, refresh by reloading, and last-good-data preservation on failure. [Bring your data](connecting-data.md) describes supported API shapes, browser access, source identity and authenticated-backend integration.

The helper converts missing/nonfinite values to null and dates to ISO text, rejects nested cells, and rejects integers outside JavaScript's safe range. Convert such identifiers to strings intentionally. Row-oriented JSON does not automatically preserve a dataframe index; make identity a column. A metadata envelope is adapted by the example importer, not passed directly to `dataset()` as if it were a Quartile Dataset.

For the optional Arrow path, see [worker queries](worker-queries.md). pandas/Polars default integer widths, timestamp precision, string representation and IPC compatibility may need explicit conversion to the adapter's supported types. Quartile does not execute Python, stream notebook state, or ship a Jupyter/Streamlit widget. Those integrations need a separate tested bridge.

## Adapting the examples

Keep source identity/revision, row grain, units, timezone, missingness, population and limit/sampling status visible. Authorize data before it reaches the browser. Use the existing [loading/error/empty and accessibility guidance](accessibility.md), preserve a reset path, and reconcile the table with the metric after filtering. Pure calculation tests cover duplicate events, maturity boundaries, unequal cohort sizes, threshold equality and undefined ratios; browser behavior and deployment checks are recorded separately.
