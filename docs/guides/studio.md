# Visual Studio

[Open Quartile Studio](https://quartile-design.vercel.app/studio) to connect a public API, arrange charts and tables, and export the result into your codebase. It is a bounded example application built with Quartile, with no account requirement. Use [React components directly](installation.md) when your application needs a custom workflow.

## Start with an API

Choose [weather](https://quartile-design.vercel.app/studio?source=weather), [earthquakes](https://quartile-design.vercel.app/studio?source=earthquakes) or [development](https://quartile-design.vercel.app/studio?source=development). Each template makes a real browser request to its named provider. Loading, failure, cancellation and empty responses are visible; errors never become fabricated records. Retry or refresh starts another request. There is no automatic polling.

The source information includes the requested URL, receipt time, row count, attribution and interpretation warnings. Read [API data](api-data.md) for the endpoints, units, missing-value semantics and provider terms. Open-Meteo's free endpoint is for non-commercial use; its data license and service-access terms are separate.

Custom JSON accepts an absolute public HTTPS endpoint and optional dot-separated records path. Without a path, the response must be an array or an object containing a `rows` array. Flatten nested cells before loading. The adapter accepts at most 2 MiB, 5,000 rows and 64 fields, with a 20-second request timeout; it rejects oversize responses without truncating. Strings that resemble dates or numbers remain nominal. Authenticated sources belong behind your own application backend.

## Compose the view

Add up to sixteen blocks. Edit each title and type, map its fields, move it earlier or later, and choose half width (`span: 6`) or full width (`span: 12`). The responsive layout stacks on small screens.

| Block | Mapping | Interpretation |
| --- | --- | --- |
| Metric | Count, mean or sum; numeric field for mean/sum | Mean is unweighted and skips nulls. Count describes records. |
| Line | Temporal/numeric x, numeric y, optional categorical series | Studio rejects duplicate x/series coordinates; prepare aggregates explicitly. |
| Bar | x category, numeric y, optional series | Sums y for each x/series combination; choose additive measures. |
| Scatter | Numeric x and y, optional categorical color | One point per source observation. |
| Histogram | Numeric x | Distribution of source observations. |
| Table | Selected fields | DataExplorer controls inspect the underlying records. |

Mappings are checked against loaded field names and types. Incompatible mappings show an error, so remap fields after a source change. Type validity cannot prove that an analysis makes sense: do not sum temperatures or earthquake magnitudes, or label an unweighted mean of twelve countries as global life expectancy.

A newly added bar leaves its measure unset: explicitly choose an additive field before it renders or exports. A new line does not automatically choose a series field; select one when repeated x values represent separate series, such as countries in the development preset.

The preview renders native Quartile components after checking the project and mappings. Compatible chart selections link views through `Selection`. DataExplorer's local search and filters refine its table independently. Switching between canvas and React source preserves the current exploration, as does reordering blocks. Field mapping, block removal and source changes reset affected shared selection. Transient selection and table view settings are not part of the saved Studio project. [Data and selection](data-and-selection.md) and [tables](tables.md) explain that boundary.

## Format the data without changing it

Open **Data formatting** in the project controls. Display locale and display time zone apply across the workspace; a field-level time zone or format descriptor can override them. These settings change labels, not source observations, and applying them preserves the fetched response, shared selections and each table's current search/filter view.

Choose a field and a display surface:

- **Values and table cells** sets its base format, including exact chart tables and KPI values.
- **Axis labels only** can shorten ticks while keeping exact values detailed.
- **Tooltip values only** sets hover and keyboard detail independently.

Named presets include numbers, currencies, ratios as percentages, scientific and engineering notation, decimal/binary bytes, durations and dates. Use **Decimal places** for an explicit precision. Percent style expects a 0–1 ratio; weather humidity is already 0–100 and needs a number plus a `%` suffix. Duration presets interpret milliseconds; advanced descriptors can specify seconds. A unit badge labels KPI metadata; it does not convert units or append a suffix to every value.

**Advanced field JSON** accepts the same serializable formats as React and JSON specs, plus field description, currency, unit and time zone. For example:

```json
{
  "format": { "type": "number", "maximumFractionDigits": 5, "suffix": " °C", "missing": "Not reported" },
  "axisFormat": { "type": "number", "maximumFractionDigits": 1 },
  "tooltipFormat": { "type": "number", "maximumFractionDigits": 5, "suffix": " °C" },
  "description": "Hourly model forecast for air temperature at 2 m."
}
```

Press **Apply field formatting** or **Apply field JSON** to change the display. Invalid JSON, unsupported settings or invalid Intl options leave the last applied values intact. **Reset all formatting** restores source metadata. Missing observations stay missing: a `missing` label changes their display, not their value or aggregate contribution. Formatting does not change a field's declared type, so choosing a date format for a nominal string does not make it a temporal chart axis. See [formatting](formatting.md) for precedence, units, time zones and exact-value behavior.

## Export and continue in React

A **project JSON** stores version 1 configuration: project name, source, ordered blocks and optional display formatting. Import it to continue visual editing. It includes no source rows, credentials or executable expressions. Imports validate allowed properties, unique block IDs and structural bounds; the maximum size is 64 KiB. Field existence is checked against the loaded dataset. A Studio project is not a bare Quartile Dashboard spec.

Project JSON can preserve structurally valid, unfinished field mappings. Runnable source and starter downloads require a successfully loaded source and valid mappings, including unique rendered x/series coordinates for line charts. Null line values remain gaps.

The **React source** mode shows ordinary Quartile JSX. **Download React source** saves `App.tsx` only; it needs the matching helper and CSS from the **starter ZIP**, which includes:

- `src/App.tsx`, a native component composition with request states, provenance, provider locale/time zone and per-field formatting metadata.
- `src/quartile-data.ts`, the same standalone fetch and normalization helper.
- `src/quartile-chart.ts`, the schema/mapping and duplicate-coordinate guards used by exported views.
- `src/app.css`, `src/main.tsx`, HTML, TypeScript and Vite configuration.
- `quartile-project.json`, which can be reimported into Studio.
- A pinned `package.json`, README and the built Apache-2.0 preview tarball under `vendor/`.

With Node.js 22.12 or newer, unzip and run:

```sh
npm install
npm run dev
# Validate the exported application for production:
npm run build
```

Quartile is not published to npm. The starter uses its bundled local tarball; other dependencies still install from the registry. Keep the generated lockfile for subsequent reproducible installs. Exporting does not snapshot the API response: the resulting app fetches the provider when it runs. Each response is checked against the actual JSX field mappings; missing or incompatible fields show a validation error, and a later valid response can recover on refresh. Preserve credits and review data/provider terms independently of the source code's Apache-2.0 license.

Edit the JSX and helper as normal application code. Reimporting project JSON restores the editor configuration; Studio does not parse your later JSX edits back into a project. For an existing Next.js app, use a client boundary and import the stylesheet once. See [integration](integration.md).

## Opt-in local drafts

Draft persistence is an explicit browser-local choice. It stores project configuration, including formatting and a public source URL, not records or credentials. Restore or remove it with the draft controls, and export JSON for a portable copy. Local storage supplies neither backup nor collaboration.

Use **Save local draft** to save the current configuration; there is no automatic saving. **Restore draft** reloads that saved configuration and requests its source again. **Delete draft** removes it. Choosing a preset starts its default layout and discards unsaved edits. Submitting a custom source starts a count and table after loading. Export or save before switching.

Never put secrets anywhere in a source URL. The helper rejects common credential-bearing parameters but cannot identify every secret. Review imported source URLs before loading them. Your application remains responsible for access control and private API integration.

## Scope

Studio offers one bounded dataset, six view types, field mapping, display formatting and basic responsive layout. It does not provide joins, arbitrary transformations, notebook execution, hosted persistence, shared editing, managed authentication or application hosting. Use React components for those application-specific workflows, and [worker queries](worker-queries.md) for bounded results from larger analytical sources.

The implementation is public: [Studio application](../../apps/gallery/src/examples/studio), [source adapter](../../apps/gallery/src/examples/studio/sources.ts), [project model](../../apps/gallery/src/examples/studio/model.ts) and [React/ZIP export](../../apps/gallery/src/examples/studio/export.ts).
