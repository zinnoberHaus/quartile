import { useMemo, useState } from 'react';
import { BarList, type BarListProps } from '../charts/BarList';
import { Button } from '../components/button/Button';
import { makeFormatter } from '../data/format';
import { DataTable, type DataTableProps } from '../data-display/DataTable';
import { KPI, type KPIProps } from '../data-display/KPI';
import type { AggregateName } from '../data-display/shared';
import { useQuartile } from '../provider/QuartileProvider';
import { AppliedPredicatesContext } from '../selection/appliedPredicates';
import { useSelection, useSourceId } from '../selection/Selection';
import { QueryResultView } from './QueryResultView';
import type { QuerySource } from './types';
import { type DataQueryOptions, queryKey, useDataQuery } from './useDataQuery';

export interface QueryBarListProps extends Omit<BarListProps, 'data' | 'delta' | 'aggregate'> {
  data: QuerySource;
  /** Counts and totals. For nullable means/min/max use an explicit query result view. */
  aggregate?: 'sum' | 'count';
}

/** Queries one aggregate per category, retaining the chart's source-excluding selection. */
export function QueryBarList({
  data,
  category,
  value,
  aggregate = value ? 'sum' : 'count',
  limit = 20,
  sort = 'desc',
  ...props
}: QueryBarListProps) {
  const { locale } = useQuartile();
  const fmtCount = makeFormatter('integer', { locale });
  // Avoid colliding with any application-owned field, including the grouping key.
  let alias = '__quartile_value';
  const names = new Set(Object.keys(data.schema).map((name) => name.toLowerCase()));
  while (names.has(alias)) alias += '_';
  const query = useDataQuery(
    data,
    {
      kind: 'aggregate',
      groupBy: [category],
      measures: [{ field: value, aggregate, as: alias }],
      orderBy: sort === 'none' ? undefined : [{ field: alias, direction: sort }],
      limit,
    },
    props,
  );
  const prepared = useMemo(
    () =>
      query.data
        ? {
            ...query.data,
            schema: {
              ...query.data.schema,
              [alias]: {
                ...query.data.schema[alias],
                label:
                  aggregate === 'count'
                    ? 'Count'
                    : ((value ? data.schema[value]?.label : undefined) ?? 'Value'),
              },
            },
          }
        : undefined,
    [query.data, alias, aggregate, value, data.schema],
  );
  return (
    <AppliedPredicatesContext.Provider value={query.appliedPredicates}>
      <BarList
        {...props}
        data={prepared ?? []}
        id={query.sourceId}
        category={category}
        value={alias}
        aggregate="sum"
        prepared
        sort={sort}
        limit={limit}
        format={props.format ?? (aggregate === 'count' ? 'integer' : undefined)}
        loading={query.status === 'loading'}
        error={query.error}
        onRetry={query.retry}
      />
      {query.result && !query.result.complete && (
        <p className="q-query-note">
          Showing {fmtCount(query.result.rows.length)} of {fmtCount(query.result.totalRows)}{' '}
          categories.
        </p>
      )}
    </AppliedPredicatesContext.Provider>
  );
}

export interface QueryKPIProps
  extends Omit<KPIProps, 'data' | 'value' | 'aggregate' | 'compareValue' | 'trendBy'>,
    DataQueryOptions {
  data: QuerySource;
  value?: string;
  aggregate?: AggregateName;
}

/** Queries a single scalar over matching source rows; never takes a mean of grouped means. */
export function QueryKPI({
  data,
  value,
  aggregate = 'sum',
  id,
  predicates,
  ...props
}: QueryKPIProps) {
  const alias = '__quartile_value';
  const query = useDataQuery(
    data,
    {
      kind: 'aggregate',
      groupBy: [],
      measures: [{ field: value, aggregate, as: alias }],
      limit: 1,
    },
    { id, predicates, selection: props.selection },
  );
  return (
    <QueryResultView query={query} loading={<KPI {...props} loading />}>
      {(_, result) => {
        const original = result.schema[alias] ?? (value ? data.schema[value] : undefined);
        const field = {
          ...(aggregate !== 'count' ? original : undefined),
          name: alias,
          type: 'quantitative' as const,
          label: aggregate === 'count' ? 'Count' : (original?.label ?? 'Value'),
          format:
            aggregate === 'count'
              ? ('integer' as const)
              : (original?.format ?? ('number' as const)),
        };
        return (
          <KPI
            {...props}
            data={{
              kind: 'dataset',
              // One already-aggregated observation. Keep an empty/null result unavailable.
              rows: [
                {
                  [alias]:
                    typeof result.rows[0]?.[alias] === 'number' ? result.rows[0][alias] : null,
                },
              ],
              schema: { [alias]: field },
            }}
            value={alias}
            aggregate="sum"
            selection={false}
          />
        );
      }}
    </QueryResultView>
  );
}

export interface QueryDataTableProps
  extends Omit<
    DataTableProps,
    | 'data'
    | 'groupBy'
    | 'transform'
    | 'limit'
    | 'sort'
    | 'defaultSort'
    | 'onSortChange'
    | 'pageSize'
    | 'rank'
    | 'manualSort'
    | 'typedSelection'
  > {
  data: QuerySource;
  /** Bounded remote page size; default 25. Grouping belongs in an explicit aggregate plan. */
  pageSize?: number;
  defaultSort?: string;
}

/** Remote pages display their exact matching total. Sort/filter changes start again at page one. */
export function QueryDataTable({
  data,
  pageSize = 25,
  defaultSort,
  id,
  ...props
}: QueryDataTableProps) {
  const sourceId = useSourceId(id);
  const selection = useSelection(props.selection === false ? '__none__' : props.selection);
  const [sort, setSort] = useState<string | null>(defaultSort ?? null);
  const resetKey = queryKey({
    source: data.id,
    version: data.version,
    pageSize,
    sort,
    predicates:
      props.selection === false ? [] : selection.predicates.filter((p) => p.source !== sourceId),
  });
  return (
    <QueryTablePage
      resetKey={resetKey}
      {...props}
      data={data}
      id={sourceId}
      pageSize={pageSize}
      sort={sort}
      onSortChange={setSort}
    />
  );
}

function QueryTablePage({
  data,
  pageSize,
  sort,
  onSortChange,
  resetKey,
  ...props
}: Omit<QueryDataTableProps, 'defaultSort' | 'pageSize'> & {
  pageSize: number;
  sort: string | null;
  onSortChange: (sort: string | null) => void;
  resetKey: string;
}) {
  const { locale } = useQuartile();
  const fmtCount = makeFormatter('integer', { locale });
  const [paging, setPaging] = useState({ key: resetKey, page: 0 });
  const page = paging.key === resetKey ? paging.page : 0;
  // Reset only the cursor, preserving the focused header when its sort changes.
  if (paging.key !== resetKey) setPaging({ key: resetKey, page: 0 });
  const setPage = (update: (page: number) => number) =>
    setPaging({ key: resetKey, page: update(page) });
  const sortKey = sort?.replace(/^-/, '');
  const sortField = sortKey
    ? props.columns.find((c) => (c.key ?? c.field) === sortKey)?.field
    : undefined;
  const query = useDataQuery(
    data,
    {
      kind: 'rows',
      window: { offset: page * pageSize, limit: pageSize },
      orderBy: sortField
        ? [{ field: sortField, direction: sort?.startsWith('-') ? 'desc' : 'asc' }]
        : undefined,
    },
    props,
  );
  const result = query.result;
  const start = page * pageSize;
  return (
    <AppliedPredicatesContext.Provider value={query.appliedPredicates}>
      <DataTable
        {...props}
        data={query.data ?? []}
        id={query.sourceId}
        sort={sort}
        manualSort
        typedSelection
        onSortChange={onSortChange}
        loading={query.status === 'loading'}
        error={query.error}
        onRetry={query.retry}
        footer={
          <>
            <span aria-live="polite">
              {result
                ? `${fmtCount(result.rows.length ? start + 1 : 0)}–${fmtCount(start + result.rows.length)} of ${fmtCount(result.totalRows)} ${props.noun ?? 'rows'}`
                : 'Loading page…'}
            </span>
            {props.footer}
            <Button
              size="sm"
              disabled={!result || page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous page
            </Button>
            <Button
              size="sm"
              disabled={!result || start + pageSize >= result.totalRows}
              onClick={() => setPage((p) => p + 1)}
            >
              Next page
            </Button>
          </>
        }
      />
    </AppliedPredicatesContext.Provider>
  );
}
