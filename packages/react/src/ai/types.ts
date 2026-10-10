import type { Predicate } from '../data/predicates';
import type { FieldType, Schema } from '../data/types';

export type AnalysisValue = string | number | boolean | null;
export type AnalysisFilter =
  | { field: string; op: 'eq'; value: AnalysisValue }
  | { field: string; op: 'in'; value: readonly AnalysisValue[] }
  | { field: string; op: 'between'; value: readonly [AnalysisValue, AnalysisValue] };

export interface FieldProfile {
  field: string;
  type: FieldType;
  /** Null, undefined and empty strings. */
  missing: number;
  /** Present values that do not match the declared type; nonfinite numbers are invalid.
   * Nominal categories accept strings, finite numbers and booleans without coercion. */
  invalid: number;
  valid: number;
  /** Exact distinct valid values within the examined prefix, not an estimate of all rows. */
  distinct: number;
  /** Numeric extrema or ISO UTC timestamps. Nominal values are never included. */
  min?: number | string;
  max?: number | string;
  /** Finite numeric mean, omitted when arithmetic overflows. */
  mean?: number;
}

export interface DatasetProfile {
  totalRows: number;
  scannedRows: number;
  complete: boolean;
  fields: readonly FieldProfile[];
}

export interface AnalysisSource {
  id: string;
  /** Change this whenever the underlying data changes. */
  version: string;
  label?: string;
}

export interface AnalysisField {
  name: string;
  label: string;
  type: FieldType;
  /** Named formats only: formatter functions and Intl objects are never sent. */
  format?: string;
  currency?: string;
  unit?: string;
}

export interface AnalysisContext {
  version: 1;
  source: Readonly<AnalysisSource>;
  fields: readonly Readonly<AnalysisField>[];
  selection: readonly AnalysisFilter[];
  profile?: Readonly<DatasetProfile>;
  provenance: readonly Readonly<{ label: string; detail: string }>[];
}

export interface AnalysisContextOptions {
  schema: Schema;
  source: AnalysisSource;
  selection?: readonly Predicate[];
  /** Explicit field allowlist. Active predicates outside it cause an error. */
  fields?: readonly string[];
  profile?: DatasetProfile;
  provenance?: readonly { label: string; detail: string }[];
}

export interface AnalysisSort {
  field: string;
  direction: 'asc' | 'desc';
}
export type AnalysisChart =
  | { chart: 'histogram'; x: string }
  | { chart: 'scatter' | 'bar' | 'line'; x: string; y: string };
export interface AnalysisTable {
  fields: readonly string[];
  limit: number;
}
export type AnalysisAction =
  | ({ type: 'filter' } & AnalysisFilter)
  | { type: 'clear-filter'; field: string }
  | ({ type: 'sort' } & AnalysisSort)
  | ({ type: 'chart' } & AnalysisChart)
  | ({ type: 'table' } & AnalysisTable);

export interface AnalysisPlan {
  version: 1;
  title: string;
  /** Concise user-facing explanation, not a chain of thought. */
  summary: string;
  actions: readonly AnalysisAction[];
}

export interface AnalysisPlanError {
  path: string;
  message: string;
}
export type AnalysisPlanValidation =
  | { valid: true; plan: AnalysisPlan; errors: [] }
  | { valid: false; errors: AnalysisPlanError[] };

/** Application-controlled view state. Reducing a plan does not query or mutate a Selection. */
export interface AnalysisViewState {
  filters: readonly AnalysisFilter[];
  sort?: AnalysisSort;
  chart?: AnalysisChart;
  table?: AnalysisTable;
}

export interface AssistantRequest {
  requestId: string;
  prompt: string;
  context: AnalysisContext;
}

export interface AssistantAdapter {
  id: string;
  label: string;
  /** Deterministic rules must not be presented as live model output. */
  mode: 'live' | 'deterministic';
  generate(request: AssistantRequest, options: { signal: AbortSignal }): Promise<unknown>;
}
