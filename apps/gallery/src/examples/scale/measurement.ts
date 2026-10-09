/** Chromium exposes this main-thread estimate on some configurations. It excludes WASM/GPU/worker memory. */
export function mainThreadHeapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
}

export function environmentSnapshot() {
  return {
    recordedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
    crossOriginIsolated,
    mainThreadHeapBytes: mainThreadHeapBytes(),
    memoryScope:
      'Optional main-thread JS heap estimate only; excludes database worker, WASM and GPU memory.',
  };
}

export function downloadMeasurement(report: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quartile-worker-measurement.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const formatCount = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const formatMs = (value: number | null | undefined) =>
  value == null ? 'Not measured' : `${value.toFixed(1)} ms`;
export const formatBytes = (value: number | null) =>
  value == null ? 'Unavailable in this browser' : `${(value / 1024 / 1024).toFixed(2)} MiB`;
