# Connect API data

Quartile accepts rows and field metadata. Your application owns the request, authorization, caching and refresh policy. The public [Studio](https://quartile-design.vercel.app/studio) demonstrates three real, unauthenticated API requests and a custom JSON source. It displays request failures; it never replaces a failed response with sample records.

Use the [Studio guide](studio.md) to build visually and download a React starter. For an existing React app, [install the preview](installation.md) and copy the standalone [source helper](../../apps/gallery/src/examples/studio/sources.ts) into your app as `quartile-data.ts`. This is example application code, not an export from `@quartile/react`.

## Fetch once, preserve the contract

```ts
import { loadSource } from './quartile-data';

const controller = new AbortController();
const result = await loadSource({ kind: 'weather' }, { signal: controller.signal });
// result.data: a Dataset with rows, labels, types, formats and units.
// result.requestedURL, fetchedAt, attribution and warnings explain its provenance.
// Call controller.abort() on cancellation or when the request is superseded.
```

Render the returned dataset directly:

```tsx
import { QuartileProvider, Selection, LineChart, DataExplorer } from '@quartile/react';
import type { Dataset, Row } from '@quartile/react';
import '@quartile/react/styles.css';

export function Forecast({ data }: { data: Dataset<Row> }) {
  return <QuartileProvider><Selection>
    <LineChart data={data} x="time" y="temperatureC" brush
      aria-label="Forecast temperature in degrees Celsius" />
    <DataExplorer data={data} rowKey="time" columns={[
      { field: 'time' }, { field: 'temperatureC' }, { field: 'humidityPct' },
      { field: 'precipitationMm' }, { field: 'windSpeedKmh' },
    ]} />
  </Selection></QuartileProvider>;
}
```

The caller must distinguish idle, loading, success, empty, error and cancellation. Catch rejected requests, expose a retry action, and ignore responses from superseded requests. In React effects, abort and prevent state updates on cleanup. The Studio and its exported app implement this lifecycle; the short fetch fragment above is not a complete request UI.

`fetchedAt` is the client's receipt/validation timestamp, not the provider's publication time. There is no automatic polling. Charts may format UTC instants in the browser's local time zone; label that display choice or supply an explicit formatter. Local DataExplorer filters refine its own table; use shared selection or derive a common filtered dataset for whole-workspace filtering.

## Weather

[Open the weather template](https://quartile-design.vercel.app/studio?source=weather). The preset requests seven days of hourly model forecasts for New York (`40.7128, -74.0060`) from [Open-Meteo's Forecast API](https://open-meteo.com/en/docs), explicitly choosing UTC, Celsius, mm and km/h. It validates the returned units and aligned column lengths before producing rows.

| Field | Meaning |
| --- | --- |
| `time` | UTC ISO timestamp, one row per forecast hour |
| `temperatureC` | Temperature at 2 m, °C |
| `humidityPct` | Relative humidity at 2 m, 0–100; number with `%` unit, not a 0–1 percentage formatter |
| `precipitationMm` | Preceding-hour precipitation, mm |
| `windSpeedKmh` | Wind speed at 10 m, km/h |
| `location` | New York |

Use a line for temperature over time, a histogram for its distribution, and a table for exact values. These are model forecasts, not station observations. A mean temperature is a mean across returned forecast hours; it is not an observed climate average.

Attribute Open-Meteo and retain the CC BY 4.0 data credit. The free endpoint's [service terms](https://open-meteo.com/en/terms) permit non-commercial use, with request limits; data licensing and API access terms are separate. A commercial application needs an appropriate licensed service and its own integration.

## Earthquakes

[Open the earthquakes template](https://quartile-design.vercel.app/studio?source=earthquakes). The [USGS past-day GeoJSON summary](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) supplies one row per reported event. The preset calls `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` and preserves event identity and type.

| Fields | Meaning |
| --- | --- |
| `id`, `place`, `eventType` | Event ID, reported location and event classification |
| `time` | Epoch-millisecond input normalized to a UTC ISO timestamp |
| `magnitude`, `magnitudeType` | Reported magnitude and its scale/type; missing magnitude remains null |
| `longitude`, `latitude`, `depthKm` | GeoJSON coordinates in their original order; degrees, degrees, km |

Scatter depth against magnitude, inspect the magnitude distribution, and use the table to examine events. Magnitude is logarithmic and may use different scale types; do not sum it. Depth can be negative and reference methods vary across networks. Preliminary reports may change. The feed includes reported event types other than earthquakes; this example is not an alert or risk-assessment service. [ComCat documentation](https://earthquake.usgs.gov/data/comcat/) defines the fields.

The provider updates the daily feed every minute; Studio requests it on load or explicit refresh, not every minute. Credit the U.S. Geological Survey. Its [copyright policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) places USGS-produced data in the U.S. public domain and notes exceptions for marked third-party content.

## Development

[Open the development template](https://quartile-design.vercel.app/studio?source=development). The World Bank v2 API provides [life expectancy at birth, total, in years](https://data.worldbank.org/indicator/SP.DYN.LE00.IN), indicator `SP.DYN.LE00.IN`. The bounded query selects twelve countries and 2014–2023:

```text
https://api.worldbank.org/v2/country/USA;CAN;BRA;GBR;DEU;FRA;IND;CHN;JPN;AUS;ZAF;NGA/indicator/SP.DYN.LE00.IN?date=2014:2023&format=json&per_page=5000
```

Rows contain `country`, `countryCode`, numeric `year` and nullable `lifeExpectancyYears`. Plot year on x, life expectancy on y and country as series. There is one row per country/year, so this mapping needs no summation. A cross-country mean is unweighted; it is not global life expectancy. This historical window is not a current-year forecast.

The API requires [no authentication key](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation). It defaults to XML and 50 results per page; `format=json` and `per_page` are explicit here. The helper checks page, pages and total metadata and rejects incomplete or paginated results instead of silently accepting the first page. If you expand the query, implement bounded pagination and validate every page. Country lists can include regional aggregates; use intentional country codes. See [call structures](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures).

The indicator is CC BY 4.0. Retain the World Bank World Development Indicators credit and the indicator's underlying sources: UN World Population Prospects, national statistical offices and Eurostat. Missing observations stay null, not zero.

## Custom public JSON

```ts
const result = await loadSource({
  kind: 'custom',
  url: 'https://your-public-api.example/observations',
  rowsPath: 'data.observations',
}, { signal: controller.signal });
```

The example URL above is a placeholder. Use an absolute HTTPS URL permitted by its owner for browser CORS and your intended use. The helper sends no cookies or authorization headers and rejects redirects. A top-level array or `{ "rows": [...] }` needs no path. A path selects a dot-separated property, not JSONPath or executable code.

Records must be flat objects with string, finite safe-range number, boolean or null cells. Nested objects/arrays need application-side flattening. Missing keys become null. Numeric columns become quantitative; boolean columns stay boolean; mixed values and numeric/date-looking strings remain nominal. Encode large identifiers as strings. This adapter does not infer custom date strings as temporal fields or provide an arbitrary transformation editor.

For a custom date column, validate and normalize its timezone in your application, then declare it temporal with `dataset(rows, schema)` in native React. Studio's custom adapter does not expose schema editing. A numeric epoch column can already serve as a numeric x field, but needs an appropriate label and display formatter to communicate time correctly.

The request has a **20-second timeout**, a **2 MiB UTF-8 response limit**, at most **5,000 rows** and **64 fields**. Oversize or invalid responses fail without truncation. These are example-adapter limits, not core library capacity claims. Custom strings are bounded to 16,384 characters and field names to 128 characters.

Source URLs are included in saved projects and exported code. Never put secrets anywhere in them. Obvious credential-bearing parameters are rejected, but that validation cannot recognize every secret. Keep authenticated APIs behind an application-owned server route, authorize there, and pass only permitted rows to Quartile. Browser filtering is not access control. For larger datasets, use server aggregation or [bounded worker queries](worker-queries.md).

## What was verified

The three exact preset endpoints completed real cross-origin requests in an isolated Chromium browser on 2026-10-10. Adapter tests cover normalization, missing values, pagination rejection, limits and cancellation. Those checks are evidence of the tested endpoint behavior, not an uptime or future CORS guarantee. Provider failures remain visible and retryable.
