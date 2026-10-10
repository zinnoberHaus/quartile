import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYSIS_LIMITS, freeze, safeJson } from './limits';
import type { AnalysisContext, AnalysisPlan, AnalysisPlanError, AssistantAdapter } from './types';
import { validateAnalysisPlan } from './validate';

export type AnalysisAssistantStatus =
  | 'idle'
  | 'loading'
  | 'review'
  | 'applied'
  | 'error'
  | 'cancelled';
export interface AnalysisAssistantOptions {
  adapter: AssistantAdapter;
  context: AnalysisContext;
  /** Called synchronously only after explicit Apply and a second validation. Must commit locally. */
  onApply: (plan: AnalysisPlan) => void;
}
export interface AnalysisAssistant {
  status: AnalysisAssistantStatus;
  plan: AnalysisPlan | null;
  error: string | null;
  validationErrors: readonly AnalysisPlanError[];
  requestId: string | null;
  context: AnalysisContext;
  adapter: AssistantAdapter;
  submit(prompt: string): Promise<void>;
  cancel(): void;
  discard(): void;
  /** False for stale, absent, applied or invalid plans. */
  apply(): boolean;
}

interface State {
  status: AnalysisAssistantStatus;
  plan: AnalysisPlan | null;
  error: string | null;
  validationErrors: AnalysisPlanError[];
  requestId: string | null;
  key: string;
  adapter: AssistantAdapter;
}
let nextRequest = 0;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message.slice(0, ANALYSIS_LIMITS.text)
    : 'Assistant request failed.';

/** No network call on mount; no automatic application. Last request wins even if an adapter
 * ignores AbortSignal. Changing context/adapter invalidates the pending proposal immediately.
 */
export function useAnalysisAssistant(options: AnalysisAssistantOptions): AnalysisAssistant {
  const key = JSON.stringify(options.context);
  const current = useRef({ ...options, key });
  current.current = { ...options, key };
  const mounted = useRef(true);
  const serial = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const empty = useCallback(
    (status: AnalysisAssistantStatus = 'idle'): State => ({
      status,
      plan: null,
      error: null,
      validationErrors: [],
      requestId: null,
      key: current.current.key,
      adapter: current.current.adapter,
    }),
    [],
  );
  const [state, setState] = useState<State>(() => empty());
  const stateRef = useRef(state);
  stateRef.current = state;
  const commit = useCallback((next: State) => {
    stateRef.current = next;
    if (mounted.current) setState(next);
  }, []);
  const abort = useCallback(() => {
    serial.current++;
    pending.current?.abort();
    pending.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort();
    };
  }, [abort]);
  useEffect(() => {
    const previous = stateRef.current;
    if (previous.key !== key || previous.adapter !== options.adapter) {
      abort();
      commit(
        empty(previous.status === 'loading' || previous.status === 'review' ? 'cancelled' : 'idle'),
      );
    }
  }, [key, options.adapter, abort, commit, empty]);

  const cancel = useCallback(() => {
    abort();
    commit(empty('cancelled'));
  }, [abort, commit, empty]);
  const discard = useCallback(() => {
    abort();
    commit(empty());
  }, [abort, commit, empty]);
  const submit = useCallback(
    async (prompt: string) => {
      abort();
      if (!mounted.current) return;
      const start = current.current;
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > ANALYSIS_LIMITS.prompt) {
        commit({
          ...empty('error'),
          error: `Enter a prompt of 1–${ANALYSIS_LIMITS.prompt} characters.`,
        });
        return;
      }
      let context: AnalysisContext;
      try {
        context = freeze(safeJson(start.context) as AnalysisContext);
      } catch (error) {
        commit({ ...empty('error'), error: message(error) });
        return;
      }
      const controller = new AbortController();
      pending.current = controller;
      const run = ++serial.current;
      const requestId = `analysis-${++nextRequest}`;
      const base: State = { ...empty('loading'), requestId };
      commit(base);
      let removeAbort = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        const onAbort = () => reject(new DOMException('Cancelled', 'AbortError'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        removeAbort = () => controller.signal.removeEventListener('abort', onAbort);
      });
      const fresh = () =>
        mounted.current &&
        run === serial.current &&
        !controller.signal.aborted &&
        current.current.key === start.key &&
        current.current.adapter === start.adapter;
      try {
        const response = await Promise.race([
          Promise.resolve().then(() => {
            if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            const request = freeze(safeJson({ requestId, prompt: prompt.trim(), context })) as {
              requestId: string;
              prompt: string;
              context: AnalysisContext;
            };
            return start.adapter.generate(request, { signal: controller.signal });
          }),
          cancelled,
        ]);
        if (!fresh()) return;
        const result = validateAnalysisPlan(response, context);
        if (result.valid) commit({ ...base, status: 'review', plan: result.plan });
        else
          commit({
            ...base,
            status: 'error',
            error: 'The assistant returned an invalid plan. Nothing was applied.',
            validationErrors: result.errors,
          });
      } catch (error) {
        if (fresh()) commit({ ...base, status: 'error', error: message(error) });
      } finally {
        removeAbort();
        if (pending.current === controller) pending.current = null;
      }
    },
    [abort, commit, empty],
  );

  const apply = useCallback(() => {
    const saved = stateRef.current;
    const now = current.current;
    if (
      !mounted.current ||
      saved.status !== 'review' ||
      !saved.plan ||
      saved.key !== now.key ||
      saved.adapter !== now.adapter
    )
      return false;
    const result = validateAnalysisPlan(saved.plan, now.context);
    if (!result.valid) {
      commit({
        ...saved,
        status: 'error',
        plan: null,
        error: 'The plan no longer matches the analysis context.',
        validationErrors: result.errors,
      });
      return false;
    }
    // Consume first, so re-entrant handlers or two clicks cannot apply the same plan twice.
    commit({ ...saved, status: 'applied' });
    try {
      now.onApply(result.plan);
      return true;
    } catch (error) {
      commit({ ...saved, status: 'error', plan: null, error: message(error) });
      return false;
    }
  }, [commit]);

  const visible =
    state.key === key && state.adapter === options.adapter ? state : empty('cancelled');
  return {
    ...visible,
    context: options.context,
    adapter: options.adapter,
    submit,
    cancel,
    discard,
    apply,
  };
}
