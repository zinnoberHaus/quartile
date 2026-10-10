/** Hard bounds apply to all adapters, including custom adapters. */
export const ANALYSIS_LIMITS = Object.freeze({
  fields: 64,
  profileRows: 10_000,
  actions: 12,
  filterValues: 100,
  tableFields: 24,
  tableRows: 1_000,
  text: 2_000,
  prompt: 8_000,
  payloadBytes: 65_536,
});

export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Reject executable/accessor/exotic/cyclic objects before reading their values. */
export function safeJson(value: unknown): unknown {
  if (typeof value === 'string') {
    if (utf8Bytes(value) > ANALYSIS_LIMITS.payloadBytes) throw new Error('Payload exceeds 64 KiB.');
    value = JSON.parse(value) as unknown;
  }
  let nodes = 0;
  const ancestors = new Set<object>();
  function clone(item: unknown, depth: number): unknown {
    if (++nodes > 12_000 || depth > 12) throw new Error('Payload is too complex.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string' && item.length <= ANALYSIS_LIMITS.prompt) return item;
    if (!item || typeof item !== 'object') throw new Error('Expected finite JSON values.');
    if (ancestors.has(item)) throw new Error('Cyclic payloads are not supported.');
    const proto = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) {
      throw new Error('Expected plain JSON objects.');
    }
    if (Array.isArray(item) && item.length > 12_000) throw new Error('Payload array is too large.');
    ancestors.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length)
      throw new Error('Symbol properties are not supported.');
    const result: Record<string, unknown> | unknown[] = Array.isArray(item) ? [] : {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(item) && key === 'length') continue;
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new Error('Unsafe property name.');
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new Error('Expected plain JSON properties.');
      if (Array.isArray(item) && !/^(0|[1-9]\d*)$/.test(key))
        throw new Error('Expected JSON arrays.');
      (result as Record<string, unknown>)[key] = clone(descriptor.value, depth + 1);
    }
    if (Array.isArray(item) && Object.keys(descriptors).length - 1 !== item.length) {
      throw new Error('Sparse arrays are not supported.');
    }
    ancestors.delete(item);
    return result;
  }
  const result = clone(value, 0);
  if (utf8Bytes(JSON.stringify(result)) > ANALYSIS_LIMITS.payloadBytes)
    throw new Error('Payload exceeds 64 KiB.');
  return result;
}
