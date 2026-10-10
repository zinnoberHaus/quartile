import { area as d3area, line as d3line } from 'd3-shape';
import { type CSSProperties, useMemo } from 'react';
import { makeFieldFormatter } from '../data/format';
import { fieldOf, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { cx } from '../lib/cx';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { summarizeSeries } from './core/a11y';
import type { ChartStateProps } from './core/ChartFrame';
import { statusOf } from './core/ChartFrame';
import { type Curve, curveFactory } from './core/scales';
import { pivotSeries } from './core/trends-series';

export interface SparklineProps<R extends Row = Row> extends ChartStateProps {
  /** Rows, a dataset, or a plain array of numbers. */
  data: DataInput<R> | readonly number[];
  /** Orders points by this field (dates, numbers). Rows sharing an x are summed. */
  x?: keyof R & string;
  /** Measure to draw. Not needed when `data` is an array of numbers. */
  y?: keyof R & string;
  /** Field with comparison values, drawn as a dashed muted line on the same scale. */
  compare?: keyof R & string;
  /** Fills under the line with a faint wash of the line color. */
  area?: boolean;
  /** Line color. Defaults to the text color; pass a token such as `var(--q-signal)`. */
  color?: string;
  /** Height in px. Defaults to 28. */
  height?: number;
  /** Width in px, or any CSS length. Defaults to filling the container. */
  width?: number | string;
  /** Interpolation between points. Defaults to monotone. */
  curve?: Curve;
  /** Formats values in the accessible summary. Defaults to the field's schema format. */
  format?: Formatter;
  /** Selection to read from. Defaults to the nearest; false opts out. */
  selection?: string | false;
  className?: string;
  style?: CSSProperties;
  /** Accessible name. A summary of the trend is appended automatically. */
  'aria-label'?: string;
}

/**
 * A word-sized line for KPI cards, lists and table cells. No axes; the scale fits the data's own
 * range. Stretches to any width without re-measuring (the stroke keeps its weight).
 */
export function Sparkline<R extends Row = Row>(props: SparklineProps<R>) {
  const {
    data,
    x,
    y,
    compare,
    area = false,
    color = 'var(--q-text)',
    height = 28,
    width = '100%',
    curve = 'monotone',
    format,
    selection,
    className,
    style,
    'aria-label': ariaLabel,
    loading,
    error,
    errorCode,
    empty,
  } = props;
  const { locale, timeZone } = useQuartile();
  const source = useSourceId();
  const numeric = Array.isArray(data) && data.length > 0 && typeof data[0] === 'number';
  const resolved = useMemo(
    () =>
      numeric
        ? resolveData<Row>((data as readonly number[]).map((v, i) => ({ i, y: v })))
        : resolveData<Row>(data as DataInput<Row>),
    [data, numeric],
  );
  const { rows } = useLinkedRows(resolved.rows, {
    selection: numeric ? false : selection,
    source,
  });

  const model = useMemo(() => {
    const yName = numeric ? 'y' : (y ?? '');
    const yField = fieldOf(resolved.schema, yName, rows);
    const fields = [
      yField,
      ...(compare && !numeric ? [fieldOf(resolved.schema, compare, rows)] : []),
    ];
    const xName = numeric ? 'i' : x;
    if (xName) {
      const { xsRaw, series } = pivotSeries(rows, { x: xName, yFields: fields });
      return { xsRaw, values: series[0]?.values ?? [], prev: series[1]?.values, yField };
    }
    const toNum = (v: unknown) =>
      v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
    return {
      xsRaw: rows.map((_, i) => i),
      values: rows.map((r) => toNum(r[yName])),
      prev: compare ? rows.map((r) => toNum(r[compare])) : undefined,
      yField,
    };
  }, [rows, resolved.schema, x, y, compare, numeric]);

  const fmtY = useMemo(
    () => makeFieldFormatter(model.yField, { locale, timeZone }, format),
    [format, model.yField, locale, timeZone],
  );
  const fmtX = useMemo(() => {
    if (!x || numeric) return (v: unknown) => `point ${Number(v) + 1}`;
    const xField = fieldOf(resolved.schema, x, rows);
    return makeFieldFormatter(xField, { locale, timeZone });
  }, [x, numeric, resolved.schema, rows, locale, timeZone]);

  const present = model.values.filter((v): v is number => v != null);
  const status = statusOf({ loading, error }, present.length);
  const vbW = typeof width === 'number' ? width : 100;
  const box: CSSProperties = { width, height, ...style };

  if (status !== 'ready') {
    const message =
      status === 'error'
        ? `Couldn’t load${error instanceof Error ? `: ${error.message}` : typeof error === 'string' ? `: ${error}` : ''}${errorCode ? ` (${errorCode})` : ''}`
        : status === 'loading'
          ? typeof loading === 'string'
            ? loading
            : 'Loading'
          : (empty?.title ?? 'No data');
    return (
      <span
        className={cx('q-sparkline', className)}
        data-status={status}
        style={box}
        role="img"
        aria-label={`${ariaLabel ?? 'Sparkline'}: ${message}`}
        aria-busy={status === 'loading' || undefined}
        title={status === 'loading' ? undefined : message}
      >
        {status === 'loading' ? (
          <span className="q-sparkline-skeleton" />
        ) : (
          <span className="q-sparkline-dash" aria-hidden="true">
            —
          </span>
        )}
      </span>
    );
  }

  const all = [...present, ...(model.prev ?? []).filter((v): v is number => v != null)];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const range = hi - lo || 1;
  const pad = Math.min(2, height / 8);
  const n = model.values.length;
  const px = (i: number) => (n > 1 ? (i / (n - 1)) * vbW : vbW / 2);
  const py = (v: number) =>
    hi === lo ? height / 2 : height - pad - ((v - lo) / range) * (height - pad * 2);
  const line = d3line<number | null>()
    .defined((v) => v != null)
    .x((_, i) => px(i))
    .y((v) => py(v as number))
    .curve(curveFactory(curve));
  const fill = d3area<number | null>()
    .defined((v) => v != null)
    .x((_, i) => px(i))
    .y0(height)
    .y1((v) => py(v as number))
    .curve(curveFactory(curve));

  const summary = summarizeSeries(
    model.yField.label,
    model.values.flatMap((v, i) => (v == null ? [] : [{ x: model.xsRaw[i], y: v }])),
    fmtX,
    fmtY,
    locale,
  );

  return (
    <span
      className={cx('q-sparkline', className)}
      data-status="ready"
      style={box}
      role="img"
      aria-label={ariaLabel ? `${ariaLabel}. ${summary}` : summary}
    >
      <svg
        viewBox={`0 0 ${vbW} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        {area && (
          <path className="q-sparkline-area" d={fill(model.values) ?? ''} style={{ fill: color }} />
        )}
        {model.prev && <path className="q-sparkline-compare" d={line(model.prev) ?? ''} />}
        <path className="q-sparkline-line" d={line(model.values) ?? ''} style={{ stroke: color }} />
      </svg>
    </span>
  );
}
