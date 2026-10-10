import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataset } from '../data/schema';
import { AssistantPanel } from './AssistantPanel';
import { createAnalysisContext } from './context';
import type { AnalysisContext, AnalysisPlan, AssistantAdapter } from './types';
import { type AnalysisAssistant, useAnalysisAssistant } from './useAnalysisAssistant';

afterEach(cleanup);
const context = createAnalysisContext({
  schema: dataset([{ amount: 1, region: 'A' }]).schema,
  source: { id: 'orders', version: 'v1' },
});
const plan: AnalysisPlan = {
  version: 1,
  title: 'Distribution',
  summary: 'Inspect order amounts.',
  actions: [{ type: 'chart', chart: 'histogram', x: 'amount' }],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function adapter(run: AssistantAdapter['generate']): AssistantAdapter {
  return { id: 'test', label: 'Test planner', mode: 'deterministic', generate: vi.fn(run) };
}
let latest: AnalysisAssistant;
function Probe({
  backend,
  source = context,
  onApply = () => {},
}: {
  backend: AssistantAdapter;
  source?: AnalysisContext;
  onApply?: (plan: AnalysisPlan) => void;
}) {
  latest = useAnalysisAssistant({ adapter: backend, context: source, onApply });
  return <AssistantPanel assistant={latest} />;
}

describe('analysis assistant lifecycle', () => {
  it('makes no call on mount and requires explicit inspect/apply; consumes a plan once', async () => {
    const backend = adapter(async () => plan);
    const apply = vi.fn();
    render(
      <StrictMode>
        <Probe backend={backend} onApply={apply} />
      </StrictMode>,
    );
    expect(backend.generate).not.toHaveBeenCalled();
    expect(screen.getByText('Deterministic planner · no model')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Analysis request'), {
      target: { value: 'Show a distribution' },
    });
    fireEvent.click(screen.getByText('Propose changes'));
    await screen.findByText('Apply changes');
    expect(apply).not.toHaveBeenCalled();
    act(() => {
      expect(latest.apply()).toBe(true);
      expect(latest.apply()).toBe(false);
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(plan);
  });
  it('cancel settles even an uncooperative adapter and ignores its late result', async () => {
    const job = deferred<unknown>();
    const backend = adapter(() => job.promise);
    render(<Probe backend={backend} />);
    let pending!: Promise<void>;
    act(() => {
      pending = latest.submit('Inspect');
    });
    await waitFor(() => expect(backend.generate).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(backend.generate).mock.calls[0][1].signal;
    act(() => latest.cancel());
    await act(() => pending);
    expect(signal.aborted).toBe(true);
    expect(latest.status).toBe('cancelled');
    await act(async () => job.resolve(plan));
    expect(latest.plan).toBeNull();
  });
  it('a superseding request wins and late rejection cannot replace the new proposal', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const backend = adapter(
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    render(<Probe backend={backend} />);
    act(() => {
      void latest.submit('First');
    });
    await waitFor(() => expect(backend.generate).toHaveBeenCalledTimes(1));
    act(() => {
      void latest.submit('Second');
    });
    await waitFor(() => expect(backend.generate).toHaveBeenCalledTimes(2));
    expect(vi.mocked(backend.generate).mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => second.resolve(plan));
    await act(async () => first.reject(new Error('obsolete failure')));
    expect(latest.status).toBe('review');
    expect(latest.plan).toEqual(plan);
    expect(latest.error).toBeNull();
  });
  it('invalidates proposals on selection, source revision and adapter changes before apply', async () => {
    const backend = adapter(async () => plan);
    const apply = vi.fn();
    const { rerender } = render(<Probe backend={backend} onApply={apply} />);
    await act(() => latest.submit('Inspect'));
    const changed = createAnalysisContext({
      schema: dataset([{ amount: 1, region: 'A' }]).schema,
      source: context.source,
      selection: [{ field: 'region', op: 'eq', value: 'A' }],
    });
    rerender(<Probe backend={backend} source={changed} onApply={apply} />);
    expect(latest.plan).toBeNull();
    expect(latest.apply()).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    await act(() => latest.submit('Again'));
    rerender(<Probe backend={adapter(async () => plan)} source={changed} onApply={apply} />);
    expect(latest.apply()).toBe(false);
  });
  it('aborts in-flight work when source changes and when unmounted', async () => {
    const jobs = [deferred<unknown>(), deferred<unknown>()];
    let n = 0;
    const backend = adapter(() => jobs[n++].promise);
    const { rerender, unmount } = render(<Probe backend={backend} />);
    act(() => {
      void latest.submit('First');
    });
    await waitFor(() => expect(backend.generate).toHaveBeenCalledTimes(1));
    rerender(
      <Probe
        backend={backend}
        source={{ ...context, source: { ...context.source, version: 'v2' } }}
      />,
    );
    expect(vi.mocked(backend.generate).mock.calls[0][1].signal.aborted).toBe(true);
    act(() => {
      void latest.submit('Second');
    });
    await waitFor(() => expect(backend.generate).toHaveBeenCalledTimes(2));
    unmount();
    expect(vi.mocked(backend.generate).mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      jobs[0].resolve(plan);
      jobs[1].reject(new Error('late'));
    });
  });
  it('rejects unknown code-bearing payloads and safely renders malicious model text', async () => {
    const backend = adapter(async () => ({
      ...plan,
      actions: [{ type: 'eval', code: 'window.hacked=true' }],
    }));
    const { rerender } = render(<Probe backend={backend} />);
    await act(() => latest.submit('Inspect'));
    expect(latest.status).toBe('error');
    expect(latest.validationErrors.length).toBeGreaterThan(0);
    expect(screen.queryByText('Apply changes')).toBeNull();
    const malicious = { ...plan, title: '<img src=x onerror="alert(1)">' };
    rerender(<Probe backend={adapter(async () => malicious)} />);
    await act(() => latest.submit('Inspect'));
    expect(screen.getByText(malicious.title)).toBeTruthy();
    expect(document.querySelector('.q-assistant img')).toBeNull();
  });
  it('surfaces transport/apply failures and supports a fresh retry', async () => {
    const backend = adapter(
      vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(plan),
    );
    render(
      <Probe
        backend={backend}
        onApply={() => {
          throw new Error('View rejected');
        }}
      />,
    );
    await act(() => latest.submit('Inspect'));
    expect(screen.getByRole('alert').textContent).toContain('Offline');
    await act(() => latest.submit('Inspect'));
    act(() => {
      expect(latest.apply()).toBe(false);
    });
    expect(screen.getByRole('alert').textContent).toContain('View rejected');
    expect(latest.plan).toBeNull();
  });
});
