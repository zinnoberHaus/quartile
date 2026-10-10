// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJSON,
  loadSource,
  normalizeSource,
  sourceLimits,
  sourcePresets,
  validateSourceConfig,
} from '../../../apps/gallery/src/examples/studio/sources';
import { tickFormatter } from '../src/charts/core/scales';

// Deliberately tiny deterministic protocol fixtures, never used by the live studio.
const weather = () => ({
  utc_offset_seconds: 0,
  hourly_units: {
    time: 'iso8601',
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    precipitation: 'mm',
    wind_speed_10m: 'km/h',
  },
  hourly: {
    time: ['2026-10-10T00:00', '2026-10-10T01:00'],
    temperature_2m: [12.5, null],
    relative_humidity_2m: [65, 0],
    precipitation: [0, 2.5],
    wind_speed_10m: [5, 10],
  },
});
const earthquake = () => ({
  type: 'FeatureCollection',
  metadata: { count: 1 },
  features: [
    {
      type: 'Feature',
      id: 'test-event',
      properties: { time: 0, mag: -0.3, magType: 'ml', place: null, type: 'earthquake' },
      geometry: { type: 'Point', coordinates: [-122, 38, -1.2] },
    },
  ],
});
const development = () => [
  { page: 1, pages: 1, total: 2 },
  [
    {
      country: { value: 'United States' },
      countryiso3code: 'USA',
      date: '2023',
      indicator: { id: 'SP.DYN.LE00.IN' },
      value: null,
    },
    {
      country: { value: 'United States' },
      countryiso3code: 'USA',
      date: '2014',
      indicator: { id: 'SP.DYN.LE00.IN' },
      value: 78.8,
    },
  ],
];
const custom = { kind: 'custom' as const, url: 'https://example.org/public.json' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('public source configuration', () => {
  it('accepts fixed presets and safe dot paths without retaining extra properties', () => {
    for (const preset of sourcePresets)
      expect(validateSourceConfig({ kind: preset.id })).toEqual({ kind: preset.id });
    expect(validateSourceConfig({ ...custom, rowsPath: 'data.0.records' })).toEqual({
      ...custom,
      rowsPath: 'data.0.records',
    });
    expect(() => validateSourceConfig({ kind: 'weather', url: 'https://example.org' })).toThrow(
      'fixed',
    );
    expect(() => validateSourceConfig({ ...custom, apiKey: 'secret' })).toThrow('Unknown');
    expect(() => validateSourceConfig({ kind: 'missing' })).toThrow('Unknown');
  });
  it('rejects credentials, sensitive parameters, non-HTTPS and unsafe path traversal before fetch', () => {
    for (const url of [
      'https://user:secret@example.org',
      'https://example.org/?api_key=x',
      'https://example.org/?access_token=x',
      'https://example.org/?X-Amz-Credential=x',
      'https://example.org/?%74oken=x',
      'https://example.org/#secret',
      'http://localhost/public',
      '//example.org',
      'javascript:alert(1)',
      'https://example.org/\nfoo',
    ]) {
      expect(() => validateSourceConfig({ ...custom, url })).toThrow();
    }
    for (const rowsPath of ['__proto__.rows', 'data.constructor', 'data..rows', 'data[0].rows'])
      expect(() => validateSourceConfig({ ...custom, rowsPath })).toThrow();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() =>
      validateSourceConfig({ ...custom, url: 'https://user:secret@example.org' }),
    ).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('typed API normalization', () => {
  it('preserves forecast units, UTC, null and zero without treating humidity as a ratio', () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const data = normalizeSource({ kind: 'weather' }, weather());
      expect(data.rows[0]).toEqual({
        time: '2026-10-10T00:00:00.000Z',
        temperatureC: 12.5,
        humidityPct: 65,
        precipitationMm: 0,
        windSpeedKmh: 5,
        location: 'New York',
      });
      expect(data.rows[1]).toMatchObject({ temperatureC: null, humidityPct: 0 });
      expect(data.schema.humidityPct).toMatchObject({
        type: 'quantitative',
        format: 'number',
        unit: '%',
      });
      expect(data.schema.precipitationMm.unit).toBe('mm');
    } finally {
      if (previousTZ === undefined) delete process.env.TZ;
      else process.env.TZ = previousTZ;
    }
  });
  it('rejects weather shape/unit/date mismatches instead of silently combining wrong series', () => {
    const mismatch = weather();
    mismatch.hourly.wind_speed_10m.pop();
    expect(() => normalizeSource({ kind: 'weather' }, mismatch)).toThrow('lengths');
    const units = weather();
    units.hourly_units.precipitation = 'inch';
    expect(() => normalizeSource({ kind: 'weather' }, units)).toThrow('units');
    const dates = weather();
    dates.hourly.time[0] = '2026-02-30T00:00';
    expect(() => normalizeSource({ kind: 'weather' }, dates)).toThrow('timestamp');
    const offset = weather();
    offset.utc_offset_seconds = -14400;
    expect(() => normalizeSource({ kind: 'weather' }, offset)).toThrow('UTC');
  });
  it('keeps USGS coordinate order, signed depth, logarithmic magnitude and UTC epoch', () => {
    const data = normalizeSource({ kind: 'earthquakes' }, earthquake());
    expect(data.rows[0]).toEqual({
      id: 'test-event',
      time: '1970-01-01T00:00:00.000Z',
      magnitude: -0.3,
      magnitudeType: 'ml',
      depthKm: -1.2,
      longitude: -122,
      latitude: 38,
      place: null,
      eventType: 'earthquake',
    });
    const bad = earthquake();
    bad.metadata.count = 2;
    expect(() => normalizeSource({ kind: 'earthquakes' }, bad)).toThrow('count');
    const invalid = earthquake();
    invalid.features[0].geometry.coordinates[1] = 100;
    expect(() => normalizeSource({ kind: 'earthquakes' }, invalid)).toThrow('coordinates');
  });
  it('sorts country-years and retains absent World Bank observations; rejects partial pages', () => {
    const data = normalizeSource({ kind: 'development' }, development());
    expect(tickFormatter(data.schema.year, 'en-US')(2014)).toBe('2014');
    expect(tickFormatter(data.schema.year, 'en-US')(2023)).toBe('2023');
    expect(data.rows).toEqual([
      { country: 'United States', countryCode: 'USA', year: 2014, lifeExpectancyYears: 78.8 },
      { country: 'United States', countryCode: 'USA', year: 2023, lifeExpectancyYears: null },
    ]);
    const partial = development();
    partial[0] = { page: 1, pages: 2, total: 2 };
    expect(() => normalizeSource({ kind: 'development' }, partial)).toThrow('paginated');
  });
  it('handles native arrays, rows and dot paths with every-row schema inference and no string coercion', () => {
    const rows = [
      { id: '001', date: '2026-10-10', n: 1, passed: true },
      { id: '002', date: '', n: null, passed: false, later: 4 },
    ];
    for (const [config, input] of [
      [custom, rows],
      [custom, { rows }],
      [{ ...custom, rowsPath: 'data.0.records' }, { data: [{ records: rows }] }],
    ] as const) {
      const result = normalizeSource(config, input);
      expect(result.rows[0]).toEqual({
        id: '001',
        date: '2026-10-10',
        n: 1,
        passed: true,
        later: null,
      });
      expect(result.schema.id.type).toBe('nominal');
      expect(result.schema.date.type).toBe('nominal');
      expect(result.schema.n.type).toBe('quantitative');
      expect(result.schema.passed.type).toBe('boolean');
      expect(result.schema.later.type).toBe('quantitative');
    }
    expect(rows[0]).not.toHaveProperty('later');
    const late = Array.from({ length: 201 }, (_, index) =>
      index === 200 ? { x: 1, late: 2 } : { x: 1 },
    );
    expect(normalizeSource(custom, late).schema.late.type).toBe('quantitative');
    expect(normalizeSource(custom, [{ toString: 'identifier' }, { x: 1 }]).rows[1]).toEqual({
      x: 1,
      toString: null,
    });
  });
  it('rejects duplicate preset row identities rather than quietly dropping or double-counting them', () => {
    const forecast = weather();
    forecast.hourly.time[1] = forecast.hourly.time[0];
    expect(() => normalizeSource({ kind: 'weather' }, forecast)).toThrow('Duplicate');
    const events = earthquake();
    events.features.push(events.features[0]);
    events.metadata.count = 2;
    expect(() => normalizeSource({ kind: 'earthquakes' }, events)).toThrow('Duplicate');
    const observation = {
      country: { value: 'United States' },
      countryiso3code: 'USA',
      date: '2023',
      indicator: { id: 'SP.DYN.LE00.IN' },
      value: 80,
    };
    expect(() =>
      normalizeSource({ kind: 'development' }, [
        { page: 1, pages: 1, total: 2 },
        [observation, observation],
      ]),
    ).toThrow('Duplicate');
    expect(
      normalizeSource({ kind: 'development' }, [{ page: 0, pages: 0, total: 0 }, null]).rows,
    ).toEqual([]);
  });
  it('rejects unsafe keys, nested cells, oversized fields/rows, unsafe numbers and inherited paths', () => {
    for (const rows of [
      JSON.parse('[{"__proto__":1}]'),
      [{ constructor: 1 }],
      [{ nested: { x: 1 } }],
      [{ list: [1] }],
      [{ x: Infinity }],
      [{ x: 9007199254740992 }],
      [{ x: 'a'.repeat(16385) }],
      [{ x: undefined }],
      [{}],
      [1],
    ]) {
      expect(() => normalizeSource(custom, rows)).toThrow();
    }
    expect(() =>
      normalizeSource(
        custom,
        Array.from({ length: 5001 }, () => ({ x: 1 })),
      ),
    ).toThrow('5,000');
    expect(() =>
      normalizeSource(custom, [
        Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`x${index}`, 1])),
      ]),
    ).toThrow('64-field');
    expect(() => normalizeSource({ ...custom, rowsPath: 'toString' }, {})).toThrow('not found');
    expect(normalizeSource(custom, []).rows).toEqual([]);
    expect(normalizeSource(custom, [{ x: 1 }, { x: '1' }]).schema.x.type).toBe('nominal');
  });
});

describe('bounded browser fetch lifecycle', () => {
  it('uses credential-free nonredirecting fetch and returns actual receipt provenance without fixture fallback', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify(weather())),
    );
    vi.stubGlobal('fetch', fetch);
    const before = Date.now();
    const result = await loadSource({ kind: 'weather' });
    expect(Date.parse(result.fetchedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.fetchedAt)).toBeLessThanOrEqual(Date.now());
    expect(result.requestedURL).toBe(sourcePresets[0].url);
    expect(result.attribution[0]).toMatchObject({ license: 'CC BY 4.0' });
    expect(result.warnings.some((warning) => warning.includes('1 missing cells'))).toBe(true);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  });
  it('preserves an empty response and propagates HTTP/JSON/network failures without retries', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    fetch.mockResolvedValueOnce(new Response('[]'));
    const result = await loadSource(custom);
    expect(result.data.rows).toEqual([]);
    expect(result.warnings).toContain('The source returned zero records.');
    fetch.mockResolvedValueOnce(new Response('do not echo provider internals', { status: 503 }));
    await expect(loadSource(custom)).rejects.toThrow('HTTP 503');
    fetch.mockResolvedValueOnce(new Response('<html>no</html>'));
    await expect(loadSource(custom)).rejects.toThrow('valid JSON');
    fetch.mockRejectedValueOnce(new TypeError('fetch failed secret details'));
    await expect(loadSource(custom)).rejects.toThrow('CORS');
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('bounds both declared and streamed bytes, including multibyte UTF-8', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    fetch.mockResolvedValueOnce(
      new Response('[]', { headers: { 'content-length': String(sourceLimits.bytes + 1) } }),
    );
    await expect(fetchJSON(custom.url)).rejects.toThrow('2 MiB');
    fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(sourceLimits.bytes));
            controller.enqueue(new Uint8Array(1));
            controller.close();
          },
        }),
      ),
    );
    await expect(fetchJSON(custom.url)).rejects.toThrow('2 MiB');
    const bytes = new TextEncoder().encode('[{"x":"é"}]');
    fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, 8));
            controller.enqueue(bytes.slice(8));
            controller.close();
          },
        }),
      ),
    );
    await expect(fetchJSON(custom.url)).resolves.toEqual([{ x: 'é' }]);
    fetch.mockResolvedValueOnce(new Response(new Uint8Array([0xff])));
    await expect(fetchJSON(custom.url)).rejects.toThrow('valid UTF-8 JSON');
  });
  it('cancels before headers and during a stalled body even if an operation ignores abort', async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const pending = loadSource(custom, { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(loadSource(custom, { signal: alreadyAborted.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const cancel = vi.fn();
    fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const bodyController = new AbortController();
    const body = loadSource(custom, { signal: bodyController.signal });
    await Promise.resolve();
    await Promise.resolve();
    const bodyRejection = expect(body).rejects.toMatchObject({ name: 'AbortError' });
    bodyController.abort();
    await bodyRejection;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('times out a stalled body at 20 seconds and cleans up its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new ReadableStream())),
    );
    const pending = loadSource(custom);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(20000);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});
