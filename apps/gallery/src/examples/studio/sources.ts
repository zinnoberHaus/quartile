import type { Dataset, FieldDef, Row, Schema } from '@quartile/react';

/** Standalone browser helpers. Export this file with a Studio app; no backend or API key is used. */
export type SourceId = 'weather' | 'earthquakes' | 'development' | 'custom';
export interface SourceConfig {
  kind: SourceId;
  url?: string;
  rowsPath?: string;
}
export interface SourceAttribution {
  label: string;
  url: string;
  license?: string;
}
export interface LoadedSource {
  data: Dataset<Row>;
  label: string;
  requestedURL: string;
  /** Client receipt/validation time, not the provider's publication time. */
  fetchedAt: string;
  attribution: SourceAttribution[];
  warnings: string[];
}
export interface SourcePreset {
  id: Exclude<SourceId, 'custom'>;
  label: string;
  description: string;
  url: string;
  fields: Schema;
  defaults: { x: string; y: string; category: string; value: string };
  attribution: SourceAttribution[];
  warnings: string[];
}

export const sourceLimits = Object.freeze({
  bytes: 2 * 1024 * 1024,
  rows: 5000,
  fields: 64,
  timeoutMs: 20000,
});
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const field = (
  name: string,
  label: string,
  type: FieldDef['type'],
  format: FieldDef['format'],
  unit?: string,
): FieldDef => ({ name, label, type, format, ...(unit ? { unit } : {}) });

export const sourcePresets: readonly SourcePreset[] = [
  {
    id: 'weather',
    label: 'New York weather forecast',
    description: 'Seven days of hourly model forecasts for New York, in UTC.',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=UTC&forecast_days=7',
    fields: {
      time: field('time', 'Forecast time', 'temporal', 'datetime', 'UTC'),
      temperatureC: field('temperatureC', 'Temperature at 2 m', 'quantitative', 'number', '°C'),
      humidityPct: field('humidityPct', 'Relative humidity at 2 m', 'quantitative', 'number', '%'),
      precipitationMm: field(
        'precipitationMm',
        'Preceding-hour precipitation',
        'quantitative',
        'number',
        'mm',
      ),
      windSpeedKmh: field('windSpeedKmh', 'Wind speed at 10 m', 'quantitative', 'number', 'km/h'),
      location: field('location', 'Location', 'nominal', 'text'),
    },
    defaults: { x: 'time', y: 'temperatureC', category: 'location', value: 'temperatureC' },
    attribution: [
      { label: 'Weather data by Open-Meteo', url: 'https://open-meteo.com/', license: 'CC BY 4.0' },
      {
        label: 'CC BY 4.0 — field names and UTC timestamp representation normalized',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    ],
    warnings: [
      'Model forecasts, not station observations. Times are UTC; chart labels may use your browser time zone.',
      'The Open-Meteo free endpoint is for non-commercial use. Commercial apps need their own licensed service: https://open-meteo.com/en/terms',
    ],
  },
  {
    id: 'earthquakes',
    label: 'Earthquakes in the past day',
    description: 'USGS event feed, including all reported magnitudes and event types.',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    fields: {
      id: field('id', 'Event ID', 'nominal', 'text'),
      time: field('time', 'Event time', 'temporal', 'datetime', 'UTC'),
      magnitude: field('magnitude', 'Magnitude', 'quantitative', 'number'),
      magnitudeType: field('magnitudeType', 'Magnitude type', 'nominal', 'text'),
      depthKm: field('depthKm', 'Depth', 'quantitative', 'number', 'km'),
      longitude: field('longitude', 'Longitude', 'quantitative', 'number', '°'),
      latitude: field('latitude', 'Latitude', 'quantitative', 'number', '°'),
      place: field('place', 'Reported location', 'nominal', 'text'),
      eventType: field('eventType', 'Event type', 'nominal', 'text'),
    },
    defaults: { x: 'depthKm', y: 'magnitude', category: 'eventType', value: 'magnitude' },
    attribution: [
      {
        label: 'USGS Earthquake Hazards Program',
        url: 'https://earthquake.usgs.gov/',
        license: 'USGS-produced data: U.S. public domain',
      },
    ],
    warnings: [
      'Preliminary event reports may be revised. Magnitude is logarithmic, may use different magnitude types, and must not be summed; depth may be negative. This feed is not an alert system.',
    ],
  },
  {
    id: 'development',
    label: 'Life expectancy across 12 countries',
    description: 'World Bank life expectancy at birth, 2014–2023; one row per country and year.',
    url: 'https://api.worldbank.org/v2/country/USA;CAN;BRA;GBR;DEU;FRA;IND;CHN;JPN;AUS;ZAF;NGA/indicator/SP.DYN.LE00.IN?date=2014:2023&format=json&per_page=5000',
    fields: {
      country: field('country', 'Country', 'nominal', 'text'),
      countryCode: field('countryCode', 'Country code', 'nominal', 'text'),
      year: field('year', 'Year', 'quantitative', { useGrouping: false, maximumFractionDigits: 0 }),
      lifeExpectancyYears: field(
        'lifeExpectancyYears',
        'Life expectancy at birth',
        'quantitative',
        'number',
        'years',
      ),
    },
    defaults: {
      x: 'year',
      y: 'lifeExpectancyYears',
      category: 'country',
      value: 'lifeExpectancyYears',
    },
    attribution: [
      {
        label: 'World Bank, World Development Indicators — SP.DYN.LE00.IN',
        url: 'https://data.worldbank.org/indicator/SP.DYN.LE00.IN',
        license: 'CC BY 4.0',
      },
      {
        label:
          'Indicator sources: UN World Population Prospects, national statistical offices, and Eurostat',
        url: 'https://data.worldbank.org/indicator/SP.DYN.LE00.IN',
      },
      {
        label: 'CC BY 4.0 — field names and row order normalized',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    ],
    warnings: [
      'Selected countries, 2014–2023; not a world total or a current-year forecast. Missing observations remain null. Country averages are unweighted, not global life expectancy.',
    ],
  },
];

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}
function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}
function safeKey(key: string): void {
  if (!key || key.length > 128 || forbiddenKeys.has(key) || hasControlCharacters(key))
    throw new Error('Unsupported or unsafe field name.');
}
function publicURL(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\s\\]/.test(value) ||
    hasControlCharacters(value)
  )
    throw new Error('Enter an absolute public HTTPS URL (maximum 2,048 characters).');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter an absolute public HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('Use a public HTTPS URL without credentials or a fragment.');
  for (const key of url.searchParams.keys()) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      /(token|secret|password|credential|authorization|signature)/.test(normalized) ||
      /^(key|apikey|auth|sig|code|jwt|session|accesskey|subscriptionkey)$/.test(normalized) ||
      /^(xamz|xgoog)/.test(normalized)
    ) {
      throw new Error(
        'Secret-bearing query parameters are not supported. Use a public, unauthenticated URL.',
      );
    }
  }
  return url.href;
}

/** Validates config before saving or exporting it. Never put secrets anywhere in a URL. */
export function validateSourceConfig(value: unknown): SourceConfig {
  const config = record(value, 'Source configuration');
  if (Object.keys(config).some((key) => !['kind', 'url', 'rowsPath'].includes(key)))
    throw new Error('Unknown source configuration property.');
  if (config.kind !== 'custom') {
    if (!sourcePresets.some((preset) => preset.id === config.kind))
      throw new Error('Unknown source.');
    if ('url' in config || 'rowsPath' in config)
      throw new Error(
        'Preset URLs and record paths are fixed. Choose Custom JSON for another endpoint.',
      );
    return { kind: config.kind as SourceId };
  }
  const url = publicURL(config.url);
  const rowsPath = config.rowsPath ?? '';
  if (
    typeof rowsPath !== 'string' ||
    rowsPath.length > 256 ||
    (rowsPath !== '' && !/^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/.test(rowsPath))
  )
    throw new Error('Records path must be a dot-separated property path.');
  for (const part of rowsPath.split('.').filter(Boolean)) safeKey(part);
  return { kind: 'custom', url, ...(rowsPath ? { rowsPath } : {}) };
}

function abortError(): DOMException {
  return new DOMException('Source request cancelled.', 'AbortError');
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? abortError();
}
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(signal.reason ?? abortError());
    };
    signal.addEventListener('abort', cancel, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

/** Streams a bounded JSON response. Timeout covers both headers and body; no retries or fallback. */
export async function fetchJSON(
  url: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<unknown> {
  const requestedURL = publicURL(url);
  checkAbort(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort(abortError());
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException('Source request timed out after 20 seconds.', 'TimeoutError'),
      ),
    sourceLimits.timeoutMs,
  );
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await abortable(
      fetch(requestedURL, {
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json' },
      }),
      controller.signal,
    );
    checkAbort(controller.signal);
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    const size = Number(response.headers.get('content-length'));
    if (size > sourceLimits.bytes) throw new Error('Source response exceeds the 2 MiB limit.');
    if (!response.body) throw new Error('Source response has no readable body.');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const decode = (chunk?: Uint8Array, stream = false) => {
      try {
        return decoder.decode(chunk, { stream });
      } catch {
        throw new Error('Source did not return valid UTF-8 JSON.');
      }
    };
    let bytes = 0;
    let text = '';
    while (true) {
      checkAbort(controller.signal);
      const chunk = await abortable(reader.read(), controller.signal);
      checkAbort(controller.signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > sourceLimits.bytes) throw new Error('Source response exceeds the 2 MiB limit.');
      text += decode(chunk.value, true);
    }
    text += decode();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Source did not return valid JSON.');
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason ?? abortError();
    if (error instanceof TypeError)
      throw new Error(
        'Cannot read this public source. Check its URL, CORS permission, network, and redirect policy.',
      );
    throw error;
  } finally {
    controller.abort();
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function numberOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (Number.isInteger(value) && !Number.isSafeInteger(value))
  )
    throw new Error(`${label} must be a finite JSON number in the safe range, or null.`);
  return value;
}
function textOrNull(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 16384)
    throw new Error(`${label} must be a string of at most 16,384 characters, or null.`);
  return value;
}
function requiredText(value: unknown, label: string): string {
  const text = textOrNull(value, label);
  if (!text) throw new Error(`${label} must be a non-empty string.`);
  return text;
}
function rowsArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Source records must be a JSON array.');
  if (value.length > sourceLimits.rows)
    throw new Error(
      'Source exceeds the 5,000-row limit; narrow the query. No rows were truncated.',
    );
  return value;
}
function timestamp(value: unknown, label: string): string {
  const ms = numberOrNull(value, label);
  if (ms === null || !Number.isSafeInteger(ms) || !Number.isFinite(new Date(ms).getTime()))
    throw new Error(`${label} must be a valid epoch-millisecond timestamp.`);
  return new Date(ms).toISOString();
}
function weatherRows(value: unknown): Row[] {
  const body = record(value, 'Weather response');
  if (body.utc_offset_seconds !== 0) throw new Error('Expected UTC weather timestamps.');
  const units = record(body.hourly_units, 'Weather units');
  const expected = {
    time: 'iso8601',
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    precipitation: 'mm',
    wind_speed_10m: 'km/h',
  };
  if (Object.entries(expected).some(([key, unit]) => units[key] !== unit))
    throw new Error('Weather response units do not match the requested units.');
  const hourly = record(body.hourly, 'Hourly weather');
  const times = rowsArray(hourly.time);
  const columns = Object.keys(expected).filter((key) => key !== 'time');
  for (const key of columns)
    if (!Array.isArray(hourly[key]) || hourly[key].length !== times.length)
      throw new Error('Weather hourly columns have inconsistent lengths.');
  const seen = new Set<string>();
  return times.map((raw, index) => {
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))
      throw new Error('Invalid weather timestamp.');
    const time = `${raw}:00.000Z`;
    if (!Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time)
      throw new Error('Invalid weather timestamp.');
    if (seen.has(time)) throw new Error('Duplicate forecast hour in the weather response.');
    seen.add(time);
    const values = columns.map((key) => numberOrNull((hourly[key] as unknown[])[index], key));
    const [temperatureC, humidityPct, precipitationMm, windSpeedKmh] = values;
    if (
      (humidityPct !== null && (humidityPct < 0 || humidityPct > 100)) ||
      (precipitationMm !== null && precipitationMm < 0) ||
      (windSpeedKmh !== null && windSpeedKmh < 0)
    )
      throw new Error('Weather measurement is outside its supported range.');
    return { time, temperatureC, humidityPct, precipitationMm, windSpeedKmh, location: 'New York' };
  });
}
function earthquakeRows(value: unknown): Row[] {
  const body = record(value, 'Earthquake response');
  if (body.type !== 'FeatureCollection') throw new Error('Expected a GeoJSON FeatureCollection.');
  const features = rowsArray(body.features);
  const metadata = record(body.metadata, 'Earthquake metadata');
  if (metadata.count !== features.length)
    throw new Error('Earthquake feed count does not match the received events.');
  const seen = new Set<string>();
  return features.map((value) => {
    const feature = record(value, 'Earthquake feature');
    const props = record(feature.properties, 'Earthquake properties');
    const geometry = record(feature.geometry, 'Earthquake geometry');
    if (
      feature.type !== 'Feature' ||
      geometry.type !== 'Point' ||
      !Array.isArray(geometry.coordinates) ||
      geometry.coordinates.length !== 3
    )
      throw new Error('Expected earthquake point coordinates.');
    const [longitude, latitude, depthKm] = geometry.coordinates.map((value) =>
      numberOrNull(value, 'Coordinate'),
    );
    if (
      longitude === null ||
      latitude === null ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    )
      throw new Error('Invalid earthquake coordinates.');
    const id = requiredText(feature.id, 'Event ID');
    if (seen.has(id)) throw new Error('Duplicate event ID in the earthquake response.');
    seen.add(id);
    return {
      id,
      time: timestamp(props.time, 'Event time'),
      magnitude: numberOrNull(props.mag, 'Magnitude'),
      magnitudeType: textOrNull(props.magType, 'Magnitude type'),
      depthKm,
      longitude,
      latitude,
      place: textOrNull(props.place, 'Place'),
      eventType: requiredText(props.type, 'Event type'),
    };
  });
}
function developmentRows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.length !== 2)
    throw new Error('Expected World Bank metadata and observations.');
  const metadata = record(value[0], 'World Bank metadata');
  if (
    metadata.total === 0 &&
    [metadata.pages, metadata.page].every((page) => page === 0 || page === 1) &&
    (value[1] === null || (Array.isArray(value[1]) && value[1].length === 0))
  )
    return [];
  const observations = rowsArray(value[1]);
  if (metadata.pages !== 1 || metadata.page !== 1 || metadata.total !== observations.length)
    throw new Error(
      'World Bank response is incomplete or paginated; no partial dataset was accepted.',
    );
  const seen = new Set<string>();
  return observations
    .map((value) => {
      const row = record(value, 'World Bank observation');
      const country = record(row.country, 'Country');
      const indicator = record(row.indicator, 'Indicator');
      if (indicator.id !== 'SP.DYN.LE00.IN') throw new Error('Unexpected World Bank indicator.');
      const countryCode = requiredText(row.countryiso3code, 'Country code');
      if (
        ![
          'USA',
          'CAN',
          'BRA',
          'GBR',
          'DEU',
          'FRA',
          'IND',
          'CHN',
          'JPN',
          'AUS',
          'ZAF',
          'NGA',
        ].includes(countryCode)
      )
        throw new Error('Unexpected country in the development preset.');
      if (typeof row.date !== 'string' || !/^20(?:1[4-9]|2[0-3])$/.test(row.date))
        throw new Error('Unexpected year in the development preset.');
      const key = `${countryCode}:${row.date}`;
      if (seen.has(key)) throw new Error('Duplicate country-year in the World Bank response.');
      seen.add(key);
      return {
        country: requiredText(country.value, 'Country name'),
        countryCode,
        year: Number(row.date),
        lifeExpectancyYears: numberOrNull(row.value, 'Life expectancy'),
      };
    })
    .sort(
      (a, b) =>
        String(a.countryCode).localeCompare(String(b.countryCode)) ||
        Number(a.year) - Number(b.year),
    );
}
function customData(value: unknown, rowsPath = ''): Dataset<Row> {
  let selected: unknown = value;
  if (rowsPath) {
    for (const part of rowsPath.split('.')) {
      if (!selected || typeof selected !== 'object' || !Object.hasOwn(selected, part))
        throw new Error('Records path was not found in the response.');
      selected = (selected as Record<string, unknown>)[part];
    }
  } else if (!Array.isArray(selected)) selected = record(selected, 'JSON response').rows;
  const fields = new Map<string, Set<string>>();
  const rows = rowsArray(selected).map((value) => {
    const input = record(value, 'Each record');
    const row: Row = {};
    for (const [key, cell] of Object.entries(input)) {
      safeKey(key);
      if (!fields.has(key)) fields.set(key, new Set());
      if (fields.size > sourceLimits.fields) throw new Error('Source exceeds the 64-field limit.');
      if (cell !== null && !['string', 'number', 'boolean'].includes(typeof cell))
        throw new Error(
          'Custom records accept only string, number, boolean, and null cells; flatten nested values first.',
        );
      if (typeof cell === 'number') numberOrNull(cell, key);
      if (typeof cell === 'string') textOrNull(cell, key);
      if (cell !== null) fields.get(key)!.add(typeof cell);
      row[key] = cell;
    }
    return row;
  });
  if (rows.length && !fields.size) throw new Error('Custom records have no fields.');
  const schema: Schema = {};
  for (const [name, types] of fields) {
    // Inspect every bounded row. Numeric/date-looking strings are identifiers, never coerced.
    const type =
      types.size === 1 && types.has('number')
        ? 'quantitative'
        : types.size === 1 && types.has('boolean')
          ? 'boolean'
          : 'nominal';
    schema[name] = field(name, name, type, type === 'quantitative' ? 'number' : 'text');
    for (const row of rows) if (!Object.hasOwn(row, name)) row[name] = null;
  }
  return { kind: 'dataset', rows, schema };
}

/** Pure normalization for deterministic tests and exported apps. Does not imply a live fetch. */
export function normalizeSource(configValue: SourceConfig, json: unknown): Dataset<Row> {
  const config = validateSourceConfig(configValue);
  if (config.kind === 'custom') return customData(json, config.rowsPath);
  const preset = sourcePresets.find((preset) => preset.id === config.kind)!;
  const rows =
    config.kind === 'weather'
      ? weatherRows(json)
      : config.kind === 'earthquakes'
        ? earthquakeRows(json)
        : developmentRows(json);
  return {
    kind: 'dataset',
    rows,
    schema: Object.fromEntries(
      Object.entries(preset.fields).map(([key, def]) => [key, { ...def }]),
    ),
  };
}

export async function loadSource(
  configValue: SourceConfig,
  options: { signal?: AbortSignal } = {},
): Promise<LoadedSource> {
  const config = validateSourceConfig(configValue);
  const preset = sourcePresets.find((preset) => preset.id === config.kind);
  const requestedURL = preset?.url ?? config.url!;
  const json = await fetchJSON(requestedURL, options);
  checkAbort(options.signal);
  const data = normalizeSource(config, json);
  const warnings = preset
    ? [...preset.warnings]
    : [
        'Public JSON only. The source owner must permit browser CORS and your intended use. URLs are saved/exported; never place secrets anywhere in a URL. Mixed primitive columns are nominal; date-looking strings are not inferred as dates.',
      ];
  if (!data.rows.length) warnings.push('The source returned zero records.');
  const missing = data.rows.reduce(
    (count, row) => count + Object.values(row).filter((cell) => cell === null).length,
    0,
  );
  if (missing)
    warnings.push(`${missing} missing cells remain null; they were not replaced with zero.`);
  return {
    data,
    label: preset?.label ?? 'Custom public JSON',
    requestedURL,
    fetchedAt: new Date().toISOString(),
    attribution: preset
      ? preset.attribution.map((entry) => ({ ...entry }))
      : [{ label: 'Custom public JSON source', url: requestedURL }],
    warnings,
  };
}

/** The same implementation is bundled in native React exports; no hidden service calls. */
export const apiRuntime = { loadSource, fetchJSON, normalizeSource, validateSourceConfig };
