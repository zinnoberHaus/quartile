import type { Predicate } from '../data/predicates';
import type { Row, Schema } from '../data/types';
import type { AggregateName } from '../data-display/shared';

export interface QueryOrder {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryMeasure {
  field?: string;
  aggregate: AggregateName;
  as: string;
}

/** Every request is explicitly bounded. No plan accepts SQL, a URL, or a table identifier. */
export type QueryRequest =
  | {
      kind: 'rows';
      fields?: readonly string[];
      orderBy?: readonly QueryOrder[];
      window: { offset: number; limit: number };
    }
  | {
      kind: 'aggregate';
      groupBy: readonly string[];
      measures: readonly QueryMeasure[];
      orderBy?: readonly QueryOrder[];
      limit: number;
    }
  | {
      kind: 'histogram';
      field: string;
      /** Increasing finite edges. Bins are [lo, hi), except the inclusive final edge. */
      edges: readonly number[];
    };

export type QueryPlan = QueryRequest & { predicates: readonly Predicate[] };

export interface QueryResult {
  requestId: string;
  sourceVersion: string;
  rows: Row[];
  schema: Schema;
  /** Exact result count before the requested window/limit (groups for aggregate plans). */
  totalRows: number;
  /** True when the returned rows cover the entire result, without windowing/truncation. */
  complete: boolean;
}

export interface QueryOptions {
  signal: AbortSignal;
  requestId: string;
}

/** Application-owned data/query boundary. Dispose it explicitly after its consumers unmount. */
export interface QuerySource {
  readonly kind: 'query-source';
  readonly id: string;
  /** Immutable revision. Replace the source object when its data or schema changes. */
  readonly version: string;
  readonly schema: Schema;
  query(plan: QueryPlan, options: QueryOptions): Promise<QueryResult>;
  /** Idempotent; rejects subsequent queries. Does not dispose another source's resources. */
  dispose(): Promise<void>;
}
