import type { ReactNode } from 'react';
import type { Dataset } from '../data/types';
import { AppliedPredicatesContext } from '../selection/appliedPredicates';
import type { QueryResult } from './types';
import type { DataQueryState } from './useDataQuery';

export interface QueryResultViewProps {
  query: DataQueryState;
  /** Runs only for the current, successful result. Use query.sourceId on a selecting chart. */
  children: (data: Dataset, result: QueryResult) => ReactNode;
  loading?: ReactNode;
  error?: (error: Error, retry: () => void) => ReactNode;
}

/** Prevents consumed predicates being applied to aggregates or pages a second time. */
export function QueryResultView({ query, children, loading, error }: QueryResultViewProps) {
  if (query.status === 'error' && query.error) {
    return error ? (
      error(query.error, query.retry)
    ) : (
      <div role="alert">
        <p>Unable to load data: {query.error.message}</p>
        <button type="button" onClick={query.retry}>
          Retry
        </button>
      </div>
    );
  }
  if (query.status !== 'ready' || !query.data || !query.result) {
    return (
      loading ?? (
        <div role="status" aria-busy="true">
          Loading data…
        </div>
      )
    );
  }
  return (
    <AppliedPredicatesContext.Provider value={query.appliedPredicates}>
      {children(query.data, query.result)}
    </AppliedPredicatesContext.Provider>
  );
}
