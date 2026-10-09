import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Predicate } from '../data/predicates';
import type { Dataset } from '../data/types';
import { AppliedPredicatesContext } from '../selection/appliedPredicates';
import { useSelection, useSourceId } from '../selection/Selection';
import type { QueryPlan, QueryRequest, QueryResult, QuerySource } from './types';

export interface DataQueryOptions {
  /** Publisher id; use the returned sourceId on a chart that publishes this query's selection. */
  id?: string;
  /** Defaults to the nearest Selection; false opts out. */
  selection?: string | false;
  /** Additional application filters, applied together with source-excluding selection filters. */
  predicates?: readonly Predicate[];
}

export interface DataQueryState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: Dataset | undefined;
  result: QueryResult | undefined;
  error: Error | undefined;
  sourceId: string;
  /** Request start to bounded result receipt; includes the backend queue and decoding. */
  durationMs: number | undefined;
  retry: () => void;
  /** Selection predicates consumed by this result, for QueryResultView. */
  appliedPredicates: ReadonlySet<Predicate>;
}

/** Stable across fresh inline plan objects. Typed values retain their distinction from strings. */
export function queryKey(value: unknown): string {
  if (value instanceof Date) return `date:${value.getTime()}`;
  if (typeof value === 'number') return `number:${String(value)}`;
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(queryKey).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${queryKey((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

interface Settled {
  source: QuerySource;
  key: string;
  attempt: number;
  result?: QueryResult;
  error?: Error;
  durationMs?: number;
}

/**
 * Executes a bounded query after render. Superseded successes AND failures are ignored even
 * when the source cannot interrupt work. Changing inputs immediately hides the previous result.
 * Source lifetime belongs to the application; this hook never disposes a shared source.
 */
export function useDataQuery(
  source: QuerySource | null | undefined,
  request: QueryRequest,
  options: DataQueryOptions = {},
): DataQueryState {
  const sourceId = useSourceId(options.id);
  const selection = useSelection(options.selection === false ? '__none__' : options.selection);
  const inherited = useContext(AppliedPredicatesContext);
  const predicates = useMemo(
    () =>
      options.selection === false ? [] : selection.predicates.filter((p) => p.source !== sourceId),
    [options.selection, selection.predicates, sourceId],
  );
  const appliedPredicates = useMemo(
    () => new Set([...inherited, ...predicates]),
    [inherited, predicates],
  );
  const plan: QueryPlan = {
    ...request,
    predicates: [...predicates, ...(options.predicates ?? [])],
  };
  // Labels/publisher metadata do not change query semantics; publisher exclusion happens above.
  const key = queryKey({
    ...plan,
    predicates: plan.predicates.map(({ field, op, value }) => ({ field, op, value })),
  });
  const stable = useRef({ key, plan });
  if (stable.current.key !== key) stable.current = { key, plan };
  const stablePlan = stable.current.plan;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled>();
  const sequence = useRef(0);
  const retry = useMemo(() => () => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    const requestId = `${sourceId}:${++sequence.current}`;
    const started = performance.now();
    let active = true;
    const run = async () => {
      try {
        const bound =
          stablePlan.kind === 'rows'
            ? stablePlan.window.limit
            : stablePlan.kind === 'aggregate'
              ? stablePlan.limit
              : stablePlan.edges.length - 1;
        if (
          !Number.isSafeInteger(bound) ||
          bound < 1 ||
          (stablePlan.kind === 'rows' &&
            (!Number.isSafeInteger(stablePlan.window.offset) || stablePlan.window.offset < 0)) ||
          (stablePlan.kind === 'histogram' &&
            stablePlan.edges.some(
              (value, i) => !Number.isFinite(value) || (i > 0 && value <= stablePlan.edges[i - 1]),
            ))
        ) {
          throw new Error(
            'A query requires a finite positive result bound and a valid window or bin edges.',
          );
        }
        const result = await source.query(stablePlan, { signal: controller.signal, requestId });
        if (!active) return;
        if (result.requestId !== requestId || result.sourceVersion !== source.version) {
          throw new Error('Query source returned a result for a different request or revision.');
        }
        if (
          !Array.isArray(result.rows) ||
          result.rows.length > bound ||
          !Number.isSafeInteger(result.totalRows) ||
          result.totalRows < result.rows.length
        ) {
          throw new Error('Query source returned an invalid or unbounded result.');
        }
        setSettled({ source, key, attempt, result, durationMs: performance.now() - started });
      } catch (error) {
        if (!active) return;
        setSettled({
          source,
          key,
          attempt,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };
    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [source, sourceId, key, stablePlan, attempt]);

  const current =
    settled?.source === source && settled?.key === key && settled?.attempt === attempt
      ? settled
      : undefined;
  const result = source ? current?.result : undefined;
  const data = useMemo<Dataset | undefined>(
    () => (result ? { kind: 'dataset', rows: result.rows, schema: result.schema } : undefined),
    [result],
  );
  return {
    status: !source ? 'idle' : current?.error ? 'error' : result ? 'ready' : 'loading',
    result,
    data,
    error: current?.error,
    sourceId,
    durationMs: current?.durationMs,
    retry,
    appliedPredicates,
  };
}
