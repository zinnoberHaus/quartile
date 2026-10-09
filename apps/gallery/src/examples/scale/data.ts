/** Fictional, deterministic request data. Increasing the size preserves the existing prefix. */
export const SAMPLE_SEED = 20261009;
export const SAMPLE_SIZES = [10_000, 100_000, 1_000_000] as const;
export const SERVICES = ['Gateway', 'Search', 'Billing', 'Exports'] as const;
export const REGIONS = ['us-east', 'eu-west', 'ap-south'] as const;

export function makeRequestColumns(count: number, seed = SAMPLE_SEED) {
  if (!SAMPLE_SIZES.some((size) => size === count)) {
    throw new Error('Choose a supported sample size: 10,000, 100,000, or 1,000,000 rows.');
  }
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  const requestId = new Int32Array(count);
  const service = new Array<string>(count);
  const region = new Array<string>(count);
  const latency = new Float64Array(count);
  const payload = new Float64Array(count);
  const error = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    const serviceIndex = index % SERVICES.length;
    const regionIndex = Math.floor(index / SERVICES.length) % REGIONS.length;
    const failed = random() < (serviceIndex === 1 ? 0.08 : 0.018);
    const tail = -Math.log(random());
    requestId[index] = index + 1;
    service[index] = SERVICES[serviceIndex];
    region[index] = REGIONS[regionIndex];
    latency[index] = Math.round(
      18 + serviceIndex * 34 + regionIndex * 12 + tail * 68 + (failed ? 380 : 0),
    );
    payload[index] = Math.round((4 + random() * 116 + serviceIndex * 24) * 100) / 100;
    error[index] = failed ? 1 : 0;
  }
  return { requestId, service, region, latency, payload, error };
}

export const REQUEST_FIELDS = {
  requestId: { label: 'Request ID', type: 'quantitative' as const, format: 'integer' as const },
  service: { label: 'Service', type: 'nominal' as const, format: 'text' as const },
  region: { label: 'Region', type: 'nominal' as const, format: 'text' as const },
  latency: {
    label: 'Latency',
    type: 'quantitative' as const,
    format: 'number' as const,
    unit: 'ms',
  },
  payload: {
    label: 'Response size',
    type: 'quantitative' as const,
    format: 'number' as const,
    unit: 'KB',
  },
  error: { label: 'Failed request', type: 'quantitative' as const, format: 'integer' as const },
};
