import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { deltaTone, formatDelta, makeFieldFormatter } from '../data/format';
import { finiteNumber } from '../data/number';
import type { Predicate } from '../data/predicates';
import { fieldOf, resolveData } from '../data/schema';
import { typedValueKey } from '../data/typed-key';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { type Aggregate, aggregateBy, type Bucket, type SortOrder } from './core/trends-aggregate';
import { listFormat } from './core/trends-format';
import { useToggleSelect } from './core/trends-select';

export interface BarListProps<R extends Row = Row> extends ChartBaseProps {
  /** Rows to rank, or a dataset with a schema attached. Raw rows are aggregated per category. */
  data: DataInput<R>;
  /** Field whose values become the rows of the list. */
  category: keyof R & string;
  /** Measure to aggregate. Omit it to count rows per category. */
  value?: keyof R & string;
  /** How rows sharing a category combine. Defaults to sum with a value, count without. */
  aggregate?: Aggregate;
  /** One already-aggregated numeric value per distinct, typed category. Skips raw-row grouping. */
  prepared?: boolean;
  /** Ranking order. Defaults to descending. */
  sort?: SortOrder;
  /** Shows at most this many rows; the rest are summarized in a footer line. */
  limit?: number;
  /** Formats values. Defaults to compact currency, integers for counts, else the field's format. */
  format?: Formatter;
  /** Field holding each row's change as a ratio (0.048 → +4.8%), shown after the value. */
  delta?: keyof R & string;
  /** Treats a fall in the delta as good (e.g. refunds), flipping its color. */
  invertDelta?: boolean;
  /**
   * `bar`: label and value on one line with a thin bar under them.
   * `fill`: a compact row with the bar drawn as a soft fill behind the label.
   */
  variant?: 'bar' | 'fill';
  /** Clicking a row (or Enter on it) toggles its category in the nearest Selection. */
  select?: boolean;
  /** Publisher id for the selection. Defaults to a generated id. */
  id?: string;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Called after a toggle with the new predicate for `category` (or null). */
  onSelect?: (predicate: Predicate | null) => void;
}

const ROW_H = { bar: 46, fill: 38 } as const;

/** A ranked list: label left, mono value right, a bar for scale. Aggregates raw rows. */
export function BarList<R extends Row = Row>(props: BarListProps<R>) {
  const {
    data,
    category,
    value,
    aggregate = value ? 'sum' : 'count',
    prepared = false,
    sort = 'desc',
    limit,
    format,
    delta,
    invertDelta = false,
    variant = 'bar',
    select = false,
    id,
    selection,
    onSelect,
    height,
    style,
    ...frame
  } = props;
  const { locale, timeZone } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows, selection: sel } = useLinkedRows(allRows, { selection, source });
  const picker = useToggleSelect(
    sel,
    category,
    source,
    onSelect,
    prepared ? (raw) => typedValueKey(raw, schema[category]?.type) : undefined,
  );
  const [announce, setAnnounce] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const catField = fieldOf(schema, category, rows);
  const valueField = value ? fieldOf(schema, value, rows) : undefined;
  const buckets = useMemo(() => {
    if (!prepared) return aggregateBy(rows, category, { value, aggregate, sort, delta });
    const groups: Bucket[] = rows.map((row) => ({
      key: typedValueKey(row[category], schema[category]?.type),
      raw: row[category],
      value: value ? (finiteNumber(row[value]) ?? Number.NaN) : 1,
      count: 1,
    }));
    if (sort !== 'none')
      groups.sort((a, b) => {
        if (!Number.isFinite(a.value)) return Number.isFinite(b.value) ? 1 : 0;
        if (!Number.isFinite(b.value)) return -1;
        return sort === 'asc' ? a.value - b.value : b.value - a.value;
      });
    return groups;
  }, [prepared, rows, category, value, aggregate, sort, delta, schema]);
  const measureField = aggregate === 'count' ? undefined : valueField;
  const fmtV = useMemo(
    () =>
      makeFieldFormatter(
        measureField,
        { locale, timeZone },
        format ?? (!measureField ? 'integer' : undefined),
      ),
    [measureField, locale, timeZone, format],
  );
  const fmtLabel = useMemo(
    () =>
      makeFieldFormatter(
        measureField,
        { locale, timeZone },
        listFormat(valueField, aggregate, format),
      ),
    [measureField, valueField, aggregate, locale, timeZone, format],
  );
  const fmtC = useMemo(() => {
    const format = makeFieldFormatter(catField, { locale, timeZone });
    return (raw: unknown) => (prepared && raw === '' ? '(empty string)' : format(raw));
  }, [catField, locale, timeZone, prepared]);

  const shown = limit != null ? buckets.slice(0, Math.max(0, limit)) : buckets;
  const rest = buckets.slice(shown.length);
  const max = Math.max(0, ...buckets.map((b) => b.value).filter(Number.isFinite));
  const status = statusOf(frame, buckets.length);

  const summary = useMemo(() => {
    if (buckets.length === 0) return '';
    const label = valueField?.label ?? 'Count';
    const observed = buckets.filter((b) => Number.isFinite(b.value));
    if (observed.length === 0)
      return `${label} by ${catField.label.toLowerCase()}: no numeric observations.`;
    const top = observed.reduce((a, b) => (b.value > a.value ? b : a));
    const low = observed.reduce((a, b) => (b.value < a.value ? b : a));
    return `${label} by ${catField.label.toLowerCase()}, ${buckets.length} items. Highest ${fmtC(top.raw)} at ${fmtV(top.value)}; lowest ${fmtC(low.raw)} at ${fmtV(low.value)}.`;
  }, [buckets, valueField, catField, fmtC, fmtV]);

  const table = useMemo<ChartTable>(() => {
    const label =
      aggregate === 'count'
        ? 'Count'
        : aggregate === 'mean'
          ? `Average ${(valueField?.label ?? 'value').toLowerCase()}`
          : (valueField?.label ?? 'Value');
    const withDelta = buckets.some((b) => b.delta != null);
    return {
      columns: [catField.label, label, ...(withDelta ? ['Change'] : [])],
      rows: buckets.map((b) => [
        fmtC(b.raw),
        fmtV(b.value),
        ...(withDelta
          ? [b.delta != null ? formatDelta(b.delta, 'percent', 1, { locale }) : '—']
          : []),
      ]),
    };
  }, [buckets, aggregate, valueField, catField, fmtC, fmtV, locale]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!select) return;
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('button.q-bar-list-row') ?? [],
    );
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(buttons.length - 1, i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[next]?.focus();
  };

  const estimated = (Math.min(buckets.length || 5, limit ?? 6) || 5) * ROW_H[variant];
  // Lists size to their content; states and the visible table need the fixed frame height.
  const autoHeight = status === 'ready' && frame.view !== 'table';

  return (
    <ChartFrame
      kind="Bar list"
      status={status}
      height={height ?? estimated}
      style={{ height: autoHeight ? 'auto' : (height ?? estimated), ...style }}
      summary={summary}
      table={table}
      {...frame}
    >
      {() => (
        <>
          <div
            ref={listRef}
            className="q-bar-list"
            data-variant={variant}
            role="list"
            onKeyDown={onKeyDown}
          >
            {shown.map((b) => {
              const on = picker.has(b.raw);
              const dim = picker.selecting && !on;
              const pct =
                max > 0 && Number.isFinite(b.value) ? Math.max(0, (b.value / max) * 100) : 0;
              const tone = b.delta != null ? deltaTone(b.delta, invertDelta) : undefined;
              const label = fmtC(b.raw);
              const content = (
                <>
                  {variant === 'fill' && (
                    <span className="q-bar-list-fill" style={{ width: `${pct}%` }} />
                  )}
                  <span className="q-bar-list-head">
                    <span className="q-bar-list-label">{label}</span>
                    <span className="q-bar-list-figures">
                      <span className="q-bar-list-value">{fmtLabel(b.value)}</span>
                      {b.delta != null && (
                        <span className="q-bar-list-delta" data-tone={tone}>
                          {formatDelta(b.delta, 'percent', 1, { locale })}
                        </span>
                      )}
                    </span>
                  </span>
                  {variant === 'bar' && (
                    <span className="q-bar-list-track" aria-hidden="true">
                      <span className="q-bar-list-bar" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </>
              );
              return (
                <div key={b.key} role="listitem" className="q-bar-list-item">
                  {select ? (
                    <button
                      type="button"
                      className="q-bar-list-row"
                      aria-pressed={on}
                      data-dim={dim || undefined}
                      onClick={() => {
                        picker.toggle(b.raw);
                        setAnnounce(`${label} ${on ? 'deselected' : 'selected'}`);
                      }}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="q-bar-list-row" data-dim={dim || undefined}>
                      {content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {rest.length > 0 && (
            <div className="q-bar-list-more">
              +{rest.length} more ·{' '}
              {fmtV(
                rest.some((b) => Number.isFinite(b.value))
                  ? rest.reduce((s, b) => s + (Number.isFinite(b.value) ? b.value : 0), 0)
                  : Number.NaN,
              )}
            </div>
          )}
          <div className="q-visually-hidden" aria-live="polite">
            {announce}
          </div>
        </>
      )}
    </ChartFrame>
  );
}
