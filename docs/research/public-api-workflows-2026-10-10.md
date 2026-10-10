# Public API workflows verified on 2026-10-10

The Studio adapters are application examples, not new library APIs or hosted data services. Their standalone implementation is [sources.ts](../../apps/gallery/src/examples/studio/sources.ts); deterministic protocol fixtures live only in [source tests](../../packages/react/test/studio-sources.test.ts). No fixture replaces a failed live request.

## Browser evidence

A real headless Chromium page on a local HTTP origin requested each HTTPS endpoint with `credentials: 'omit'` and `redirect: 'error'`. All three responses were HTTP 200 with browser response type `cors`. Counts below describe this observation, not guaranteed future feed sizes or availability.

| Preset | Received at (UTC) | Records | Decoded body bytes |
| --- | --- | ---: | ---: |
| New York hourly weather | 2026-10-10T19:40:09.652Z | 168 | 6,559 |
| USGS past-day events | 2026-10-10T19:40:09.306Z | 212 | 151,253 |
| World Bank life expectancy | 2026-10-10T19:40:17.435Z | 120 | 27,056 |

The World Bank response identified one page, 120 total observations, source `2`, and `lastupdated: 2026-10-08`. USGS reported `generated: 1791661152000` and 212 events. These provider metadata differ from the client `fetchedAt` receipt timestamp exposed by the helper. CORS was observed in this browser, not inferred from the absence of an API key.

A second Chromium check imported the actual standalone helper compiled from `sources.ts` and called `loadSource` without interception. It accepted all three live responses: weather 168 rows at `2026-10-10T19:44:55.270Z`, earthquakes 212 rows at `2026-10-10T19:44:54.937Z`, and development 120 rows at `2026-10-10T19:44:54.954Z`. Boundary tests separately cover malformed input, cancellation before headers/during a stalled body, the deadline, and streamed size enforcement; they are not live-provider tests.

## Presets and scientific interpretation

### Open-Meteo

[Request the exact forecast](https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=UTC&forecast_days=7).

The preset requests seven days at New York coordinates. Each row represents one forecast hour. `time` is explicitly normalized to UTC ISO text after checking the response UTC offset and calendar date. `temperatureC` is air temperature at 2 m, `humidityPct` is relative humidity at 2 m on a 0–100 scale, `windSpeedKmh` is wind speed at 10 m, and `precipitationMm` is precipitation over the preceding hour. These are model forecasts, not station observations. Unit metadata and equal-length hourly arrays are checked before accepting data. Chart time labels may follow the viewer's locale/time zone. [Official forecast reference](https://open-meteo.com/en/docs).

The free endpoint is restricted to non-commercial use, with limits below 10,000 calls/day, 5,000/hour and 600/minute. Its data license is separately CC BY 4.0. Keep the visible Open-Meteo attribution and license link, and state the normalization changes. Commercial applications need an appropriate licensed service rather than copying the free endpoint unchanged. [Service terms](https://open-meteo.com/en/terms), [data license and attribution](https://open-meteo.com/en/licence).

### U.S. Geological Survey

[Request the exact daily feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson).

One row represents one reported event, retaining `id`, `eventType`, `place`, `magnitude`, `magnitudeType`, UTC `time`, `longitude`, `latitude`, and `depthKm`. The GeoJSON order is longitude, latitude, depth; the daily feed updates each minute. Epoch milliseconds are converted to UTC ISO text. Count mismatches and invalid coordinates are rejected. [Official GeoJSON format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).

Magnitude is logarithmic and distinct from intensity; summing magnitudes is not meaningful. Magnitude types can differ. Depth is in kilometres, may be negative, and its reference depends on the contributing network. Reports may change; this example is not an alert system. [USGS catalog field definitions](https://earthquake.usgs.gov/data/comcat/).

Credit U.S. Geological Survey. USGS-produced information is U.S. public domain; marked third-party material can have separate rights. No USGS logo or endorsement is implied. [USGS copyrights and credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).

### World Bank

[Request the exact indicator](https://api.worldbank.org/v2/country/USA;CAN;BRA;GBR;DEU;FRA;IND;CHN;JPN;AUS;ZAF;NGA/indicator/SP.DYN.LE00.IN?date=2014:2023&format=json&per_page=5000).

The fixed 12-country selection avoids regional aggregates. One row represents one country-year in 2014–2023, with `country`, `countryCode`, numeric `year`, and `lifeExpectancyYears`. This is life expectancy at birth, not observed mean age at death or a current forecast. Missing values remain null. Indicator and country/year membership are validated; results are sorted by country code and year. The indicator page identifies CC BY 4.0 and underlying sources including the UN, national statistical offices and Eurostat; attribution retains these credits. [Indicator and sources](https://data.worldbank.org/indicator/SP.DYN.LE00.IN).

The API needs no authentication. JSON must be requested explicitly; its default page size is 50. The helper requests a bounded page and rejects metadata indicating additional pages or an inconsistent total rather than silently returning a partial dataset. It does not compute population-weighted global life expectancy; a country average is unweighted. [API authentication](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation), [query and paging reference](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures).

## Runtime and export contract

`SourceConfig` selects `weather`, `earthquakes`, `development`, or `custom`. Built-in URLs are fixed. `validateSourceConfig(unknown)` rejects unknown properties and canonicalizes custom HTTPS URLs. `sourcePresets` publishes schemas, presentation defaults, source credits and interpretation warnings. `loadSource(config, { signal })` returns a typed dataset, label, requested URL, actual client receipt timestamp, attribution and warnings. `normalizeSource(config, json)` is a pure transform and makes no claim that its input was fetched. The exported `apiRuntime` exposes these functions plus `fetchJSON`.

Every fetch has a 20-second header/body deadline, a 2 MiB decoded-byte bound, no credentials, no referrer, and no redirects. Responses are capped at 5,000 records and 64 fields; exceeding a limit fails instead of truncating. Abort ends the caller's operation even if an underlying promise stalls. HTTP errors, malformed JSON, incomplete pages, empty responses, and cancellation remain distinguishable. The UI owns loading, user-triggered retries and stale-result suppression; the helper never automatically polls, retries, or substitutes data. Browser HTTP caching follows the source response policy, so receipt time does not establish freshness of the underlying measurements.

Custom JSON accepts a top-level array, an object with `rows`, or an explicit dot path such as `data.records`. Records must have primitive string, finite safe number, boolean, or null cells. Nested cells, dangerous property names, unsafe integer-valued numbers, and strings longer than 16,384 characters are rejected. All bounded rows participate in schema inference; absent cells become null. Numeric/date-looking strings retain nominal identity. Mixed primitive columns are nominal. Custom fields do not acquire unverified units or attribution.

URLs are public configuration that can appear in project files and generated code. Credential-bearing URLs and common sensitive query names are rejected, but no validator can recognize a secret hidden in an arbitrary path or innocently named parameter. Never put a secret anywhere in these URLs. Private authenticated sources require an application-owned integration; this example provides no proxy, credential store, or CORS bypass. The code's Apache-2.0 license does not replace each source's data license or service terms.
