import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { makeFormatter } from '../data/format';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, FieldDef, Formatter, Row } from '../data/types';
import { cx } from '../lib/cx';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import {
  type AggregateName,
  aggregateRows,
  DeltaPill,
  distinctSorted,
  TrendLine,
  valueKey,
} from './shared';

export interface KPITarget {
  /** The goal, in the same unit as the value. */
  value: number;
  /** Shown after the progress, e.g. "Q3 target". */
  label?: ReactNode;
  /**
   * Share of the target expected by now (0–1), e.g. the share of the period elapsed. Draws a
   * marker on the bar and reads "on pace" within 5 points of it, "ahead of" or "behind pace"
   * otherwise.
   */
  expected?: number;
}

export interface KPICompare {
  current: number;
  previous: number;
  currentLabel?: ReactNode;
  previousLabel?: ReactNode;
}

export type KPIAggregate<R extends Row = Row> = AggregateName | ((rows: R[]) => number);

export interface KPIProps<R extends Row = Row> {
  /** What the number is, e.g. "Net revenue". */
  label: ReactNode;
  /**
   * A number (static mode), or a field of `data` to aggregate (linked mode). With
   * `aggregate="count"` the field may be omitted.
   */
  value?: number | null | (keyof R & string);
  /** Rows to aggregate. When set, the KPI follows the nearest Selection. */
  data?: DataInput<R>;
  /** How `value` is combined across rows. Defaults to `sum`. */
  aggregate?: KPIAggregate<R>;
  /** Field (or function) giving the comparison value; the delta is computed against it. */
  compareValue?: (keyof R & string) | ((rows: R[]) => number);
  /** Draws a sparkline of `value` aggregated per distinct value of this field, in order. */
  trendBy?: keyof R & string;
  /** Value format. Defaults to the field's format (linked) or "number" (static). */
  format?: Formatter;
  /** ISO 4217 code for currency formats. */
  currency?: string;
  /** Mono tag in the top-right corner, e.g. "USD". Defaults to the field's unit in linked mode. */
  unit?: ReactNode;
  /**
   * The change to show, as a ratio for "percent" (0.046 → +4.6%) or in points for "pt".
   * Computed from `compareValue` or `compare` when omitted.
   */
  delta?: number;
  /** Defaults to "pt" for percent-formatted values, "percent" otherwise. */
  deltaKind?: 'percent' | 'pt';
  /** For metrics where down is good (churn, cost): flips the delta color. */
  invert?: boolean;
  /** What the delta is measured against, e.g. "vs. previous 30 days". */
  comparison?: ReactNode;
  /** Values for the inline sparkline (static mode, or to override `trendBy`). */
  trend?: readonly number[];
  /** Shows progress toward a goal instead of a sparkline. */
  target?: KPITarget;
  /**
   * Two bars, this period against the previous one. Pass the numbers, or `true` in linked mode to
   * use the aggregated `value` and `compareValue`.
   */
  compare?: KPICompare | boolean;
  /** Shows a skeleton at the card's size. */
  loading?: boolean;
  /** Selection to read from. Defaults to the nearest; false ignores it. */
  selection?: string | false;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

const EMPTY: Row[] = [];
/** Points either side of `expected` that still read as "on pace". */
const PACE_TOLERANCE = 5;

function aggregateWith<R extends Row>(
  rows: R[],
  field: string | undefined,
  how: KPIAggregate<R>,
): number {
  return typeof how === 'function' ? how(rows) : aggregateRows(rows, field, how);
}

function textOf(node: ReactNode): string | undefined {
  return typeof node === 'string' || typeof node === 'number' ? String(node) : undefined;
}

/** The numbers a KPI shows, from props alone (static) or from linked rows. */
function useKPIModel<R extends Row>(props: KPIProps<R>) {
  const { data, value, aggregate = 'sum', compareValue, trendBy, selection, compare } = props;
  const linked = data !== undefined;
  const source = useSourceId();
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows } = useLinkedRows(linked ? allRows : (EMPTY as R[]), {
    selection: linked ? selection : false,
    source,
  });
  return useMemo(() => {
    const valueField = linked && typeof value === 'string' ? value : undefined;
    const field: FieldDef | undefined = valueField ? fieldOf(schema, valueField, rows) : undefined;
    let current: number | null;
    let previous: number | null = null;
    if (linked) {
      current = aggregateWith(rows, valueField, aggregate);
      if (typeof compareValue === 'function') previous = compareValue(rows);
      else if (compareValue) previous = aggregateWith(rows, compareValue, aggregate);
    } else {
      current = typeof value === 'number' ? value : null;
    }
    if (compare && typeof compare === 'object') {
      current = compare.current;
      previous = compare.previous;
    }
    let trend: number[] | undefined;
    if (linked && trendBy) {
      const groups = new Map<string, R[]>();
      for (const r of rows) {
        const k = valueKey(r[trendBy]);
        const g = groups.get(k);
        if (g) g.push(r);
        else groups.set(k, [r]);
      }
      trend = distinctSorted(rows.map((r) => r[trendBy])).map((v) =>
        aggregateWith(groups.get(valueKey(v)) ?? [], valueField, aggregate),
      );
    }
    return { field, current, previous, trend };
  }, [linked, value, schema, rows, aggregate, compareValue, compare, trendBy]);
}

function KPIBase<R extends Row = Row>(props: KPIProps<R>) {
  const {
    label,
    format,
    currency,
    unit,
    deltaKind,
    invert = false,
    comparison,
    target,
    compare,
    loading = false,
    className,
    style,
  } = props;
  const { locale } = useQuartile();
  const { field, current, previous, trend: linkedTrend } = useKPIModel(props);
  const fmtName = format ?? (props.aggregate === 'count' ? 'integer' : field?.format) ?? 'number';
  const fmt = useMemo(
    () => makeFormatter(fmtName, { currency: currency ?? field?.currency, locale }),
    [fmtName, currency, field, locale],
  );
  const kind = deltaKind ?? (fmtName === 'percent' ? 'pt' : 'percent');
  let delta = props.delta;
  if (delta === undefined && current != null && previous != null) {
    if (kind === 'pt') delta = (current - previous) * 100;
    else if (previous !== 0) delta = current / previous - 1;
  }
  const trend = props.trend ?? linkedTrend;
  const unitTag = unit ?? (props.data !== undefined ? field?.unit : undefined);
  const name = props['aria-label'] ?? textOf(label);

  const head = (
    <div className="q-kpi-head">
      <span className="q-kpi-label">{label}</span>
      {unitTag != null && <span className="q-kpi-unit">{unitTag}</span>}
    </div>
  );

  if (loading) {
    return (
      <div
        className={cx('q-kpi', className)}
        style={style}
        role="group"
        aria-label={name}
        aria-busy="true"
      >
        {head}
        <span className="q-dd-skeleton q-kpi-skel-value" />
        <span className="q-dd-skeleton q-kpi-skel-trend" />
        <span className="q-dd-skeleton q-kpi-skel-note" />
        <span className="q-visually-hidden">Loading</span>
      </div>
    );
  }

  const comparisonNode = comparison != null && <div className="q-kpi-note">{comparison}</div>;

  if (compare && current != null) {
    const c = typeof compare === 'object' ? compare : undefined;
    const max = Math.max(Math.abs(current), Math.abs(previous ?? 0)) * 1.15 || 1;
    const width = (v: number) => `${Math.max(0, Math.min(100, (Math.abs(v) / max) * 100))}%`;
    return (
      <div
        className={cx('q-kpi', className)}
        data-variant="compare"
        style={style}
        role="group"
        aria-label={name}
      >
        {head}
        <div className="q-kpi-compare-row">
          <span className="q-kpi-compare-label">{c?.currentLabel ?? 'This period'}</span>
          <span className="q-kpi-compare-track">
            <span className="q-kpi-compare-fill" style={{ width: width(current) }} />
          </span>
          <span className="q-kpi-compare-value">{fmt(current)}</span>
        </div>
        {previous != null && (
          <div className="q-kpi-compare-row" data-previous="">
            <span className="q-kpi-compare-label">{c?.previousLabel ?? 'Previous'}</span>
            <span className="q-kpi-compare-track">
              <span className="q-kpi-compare-fill" style={{ width: width(previous) }} />
            </span>
            <span className="q-kpi-compare-value">{fmt(previous)}</span>
          </div>
        )}
        <div className="q-kpi-compare-foot">
          <DeltaPill value={delta} kind={kind} invert={invert} />
          {comparisonNode}
        </div>
      </div>
    );
  }

  const progress = target && current != null && target.value ? current / target.value : null;
  let pace: { text: string; tone: string } | null = null;
  if (target?.expected != null && progress != null) {
    // Compare the whole percentages shown, so the words always agree with the numbers.
    const gap = Math.round(progress * 100) - Math.round(target.expected * 100);
    pace =
      Math.abs(gap) <= PACE_TOLERANCE
        ? { text: 'on pace', tone: 'positive' }
        : gap > 0
          ? { text: 'ahead of pace', tone: 'positive' }
          : { text: 'behind pace', tone: 'warning' };
  }

  return (
    <div
      className={cx('q-kpi', className)}
      data-variant={target ? 'target' : undefined}
      style={style}
      role="group"
      aria-label={name}
    >
      {head}
      <div className="q-kpi-main">
        <span className="q-kpi-value">{current == null ? '—' : fmt(current)}</span>
        {target ? (
          <span className="q-kpi-of">/ {fmt(target.value)}</span>
        ) : (
          <DeltaPill value={delta} kind={kind} invert={invert} />
        )}
      </div>
      {target && progress != null ? (
        <>
          <div
            className="q-kpi-target-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={`${Math.round(progress * 100)}% of target`}
          >
            <span
              className="q-kpi-target-fill"
              style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
            />
            {target.expected != null && (
              <span
                className="q-kpi-target-marker"
                style={{ left: `${Math.max(0, Math.min(100, target.expected * 100))}%` }}
              />
            )}
          </div>
          <div className="q-kpi-target-foot">
            <span>
              {Math.round(progress * 100)}% of {target.label ?? 'target'}
            </span>
            {pace && target.expected != null && (
              <span data-tone={pace.tone}>
                {pace.text} · {Math.round(target.expected * 100)}% expected
              </span>
            )}
          </div>
          {comparisonNode}
        </>
      ) : (
        <>
          {trend && trend.length > 1 && (
            <TrendLine values={trend} width={200} height={40} area className="q-kpi-trend" />
          )}
          {comparisonNode}
        </>
      )}
    </div>
  );
}

export interface KPIGroupProps<R extends Row = Row> {
  /** Shared rows for every item that does not bring its own `data`. */
  data?: DataInput<R>;
  /** Up to four reads best; the row wraps on narrow screens. */
  items: KPIProps<R>[];
  /** Separate cards, or one strip with hairline dividers. */
  variant?: 'cards' | 'strip';
  /** Selection every linked item reads from. */
  selection?: string | false;
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

/** A responsive row of KPIs that share data and selection. Also available as `KPI.Group`. */
export function KPIGroup<R extends Row = Row>({
  data,
  items,
  variant = 'cards',
  selection,
  loading,
  className,
  style,
  'aria-label': ariaLabel,
}: KPIGroupProps<R>) {
  return (
    <div
      className={cx('q-kpi-group', className)}
      data-variant={variant}
      style={style}
      role="group"
      aria-label={ariaLabel ?? 'Key metrics'}
    >
      {items.map((item, i) => (
        <KPIBase<R>
          key={textOf(item.label) ?? i}
          {...item}
          data={item.data ?? data}
          selection={item.selection ?? selection}
          loading={item.loading ?? loading}
        />
      ))}
    </div>
  );
}

/**
 * A headline number that always states its comparison. Static (`value` is a number) or linked
 * (`data` + a field, aggregated over the rows the nearest Selection lets through).
 */
export const KPI = Object.assign(KPIBase, { Group: KPIGroup });
