import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChartState, type ChartStateProps } from '../charts/core/ChartFrame';
import { Button } from '../components/button/Button';
import { type DeltaKind, makeFormatter } from '../data/format';
import type { Predicate, Primitive } from '../data/predicates';
import { fieldOf, resolveData } from '../data/schema';
import { typedValueKey } from '../data/typed-key';
import type { DataInput, FieldDef, Formatter, Row } from '../data/types';
import { IconArrowDown, IconArrowUp, IconCheck, IconMinus } from '../icons';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/useControllable';
import { useElementSize } from '../lib/useElementSize';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { type AggregateName, DeltaPill, type Tone, TrendLine, valueKey } from './shared';
import { type DataTableEdit, type DataTableEditor, TableCellEditor } from './TableCellEditor';
import {
  type CellKind,
  columnKey,
  formatSort,
  groupRows,
  parseSort,
  type SortState,
  sortRows,
} from './table-model';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface DataTableColumn<R extends Row = Row> {
  /** Field read from each row (or aggregated from each group with `groupBy`). */
  field: string;
  /** Unique column id; defaults to `field`. Set it when two columns read the same field. */
  key?: string;
  /** Header text. Defaults to the field's schema label. */
  label?: ReactNode;
  /** Value format. Defaults to the field's schema format. */
  format?: Formatter;
  align?: 'left' | 'center' | 'right';
  /** Grid track: a number (px) or any CSS track, e.g. "minmax(160px, 2fr)". */
  width?: number | string;
  /**
   * How the value renders: `text` (with optional `secondary` line), `number` (mono, right),
   * `bar` (in-cell bar scaled to the column max), `sparkline` (an array of numbers), `delta`
   * (signed pill), `badge` (tag) or `status` (dot + text). Or a function returning any node.
   */
  cell?: CellKind | ((row: R, index: number) => ReactNode);
  /** Click the header to sort. Defaults to true except for sparklines. */
  sortable?: boolean;
  /** Text cells: a second mono line from this field, e.g. a SKU. */
  secondary?: string;
  /** Badge and status cells: tone per value, e.g. { "In stock": "positive" }. */
  tones?: Record<string, Tone>;
  /** Delta cells: ratio ("percent") or points ("pt"). */
  deltaKind?: DeltaKind;
  /** Delta cells: down is good. */
  invert?: boolean;
  /** Bar cells: label shows the value's share of the column total instead of the value. */
  share?: boolean;
  /** With `groupBy`: how the field combines across a group. */
  aggregate?: AggregateName;
  /**
   * With `groupBy`, for sparkline and delta cells: the series is the aggregate per distinct value
   * of this field. A delta compares the later half of that series with the earlier half.
   */
  over?: string;
  /** Keep this column visible while scrolling horizontally. Pinned columns use a fixed pixel track. */
  pinned?: 'left' | 'right';
  /** Editable only when onCellEdit and a stable rowKey are supplied, and rows are not grouped. */
  editable?: boolean | DataTableEditor;
}

export interface DataTableProps<R extends Row = Row> extends ChartStateProps {
  /** Rows, or a dataset with a schema. Filtered by the nearest Selection. */
  data: DataInput<R>;
  columns: DataTableColumn<Row>[];
  /** Collapses rows to one per value of this field; columns aggregate with `aggregate`. */
  groupBy?: string;
  /** Derives displayed rows from the linked rows (runs instead of `groupBy`). */
  transform?: (rows: R[]) => Row[];
  /** Column key to sort by; prefix with "-" for descending, e.g. "-revenue". */
  sort?: string | null;
  defaultSort?: string;
  onSortChange?: (sort: string | null) => void;
  /** Ordered multi-sort priorities. When supplied, takes precedence over the single sort prop. */
  sorts?: readonly SortState[];
  defaultSorts?: readonly SortState[];
  onSortsChange?: (sorts: SortState[]) => void;
  /** Rows are already ordered by an external query. Headers still publish onSortChange. */
  manualSort?: boolean;
  /** Preserve physical field identities for prepared query results (including nominal dates). */
  typedSelection?: boolean;
  /** Keeps only the first N rows after sorting. */
  limit?: number;
  /** Paginates with Previous / Next in the footer. */
  pageSize?: number;
  /** Controlled zero-based page. */
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** Stable row identity: a field, or a function. */
  rowKey?: string | ((row: Row, index: number) => string);
  /**
   * Field published to the selection when a row is clicked or Enter is pressed; selected rows
   * highlight with a check. The table is not filtered by its own selection.
   */
  select?: string;
  /** Select several rows (default) or one. */
  multiple?: boolean;
  /** Adds a leading rank column (1, 2, 3 … after sorting). */
  rank?: boolean;
  title?: ReactNode;
  /** Secondary line under the title. */
  caption?: ReactNode;
  /** Controls on the right of the title row. */
  toolbar?: ReactNode;
  /** Right side of the footer. */
  footer?: ReactNode;
  /** Plural noun for the page label, e.g. "products" in "1–8 of 12 products". */
  noun?: string;
  /**
   * Row count above which only the visible rows render inside a fixed-height scroller.
   * Defaults to 200; false turns it off. Ignored when paginating.
   */
  virtualize?: number | false;
  /** Scroller height in px when virtualized (or to cap the table). Defaults to 480 when virtualized. */
  height?: number;
  /** Selection to read from and publish to. Defaults to the nearest; false opts out. */
  selection?: string | false;
  /** Publisher id. */
  id?: string;
  onRowClick?: (row: Row) => void;
  /** Controlled write: update the caller's data after accepting this edit. Rejections remain visible. */
  onCellEdit?: (edit: DataTableEdit) => void | Promise<void>;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

const DEFAULT_WIDTH: Record<CellKind | 'custom', string> = {
  text: 'minmax(100px, 1fr)',
  number: '100px',
  bar: 'minmax(130px, 1.2fr)',
  sparkline: '96px',
  delta: '84px',
  badge: '110px',
  status: '104px',
  custom: 'minmax(80px, 1fr)',
};

const NUMERIC: CellKind[] = ['number', 'bar', 'delta'];
const OVERSCAN = 8;

function minTrack(track: string): number {
  const m = /^(?:minmax\()?\s*(\d+(?:\.\d+)?)px/.exec(track);
  return m ? Number(m[1]) : 80;
}

function selectedValues(p: Predicate | undefined): Primitive[] {
  if (!p) return [];
  if (p.op === 'eq') return [p.value];
  if (p.op === 'in') return p.value;
  return [];
}

function isGeneratedId(id: string) {
  return /^selection[^a-zA-Z0-9-]/.test(id);
}

interface ColumnModel {
  col: DataTableColumn<Row>;
  key: string;
  kind: CellKind | 'custom';
  align: 'left' | 'center' | 'right';
  track: string;
  sortable: boolean;
  label: ReactNode;
  field: FieldDef;
  fmt: (v: unknown) => string;
  shareFmt: (v: unknown) => string;
  max: number;
  total: number;
}

/**
 * Rows with typed cells: bars, sparklines, deltas, badges and status dots. Follows the nearest
 * Selection, publishes a field on row click, sorts by header, paginates or virtualizes.
 */
export function DataTable<R extends Row = Row>(props: DataTableProps<R>) {
  const {
    data,
    columns,
    groupBy,
    transform,
    sort: sortProp,
    defaultSort,
    onSortChange,
    sorts: sortsProp,
    defaultSorts,
    onSortsChange,
    manualSort = false,
    typedSelection = false,
    limit,
    pageSize,
    page: pageProp,
    defaultPage = 0,
    onPageChange,
    rowKey,
    select,
    multiple = true,
    rank = false,
    title,
    caption,
    toolbar,
    footer,
    noun = 'rows',
    virtualize = 200,
    height,
    selection,
    id,
    onRowClick,
    onCellEdit,
    className,
    style,
    loading,
    error,
    errorCode,
    onRetry,
    empty,
    'aria-label': ariaLabel,
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows: linked, selection: sel } = useLinkedRows(allRows, { selection, source });
  const [sortValue, setSort] = useControllable<string | null>(
    sortProp,
    defaultSort ?? null,
    onSortChange,
  );
  const sortState = parseSort(sortValue);
  const multiSort =
    sortsProp !== undefined || defaultSorts !== undefined || onSortsChange !== undefined;
  const [sorts, setSorts] = useControllable<readonly SortState[]>(
    sortsProp,
    defaultSorts ?? [],
    (next) => onSortsChange?.([...next]),
  );
  const activeSorts = multiSort ? sorts : sortState ? [sortState] : [];

  const derived: Row[] = useMemo(() => {
    if (transform) return transform(linked);
    if (groupBy) return groupRows(linked, groupBy, columns);
    // A column whose key differs from its field reads the field into its key.
    const aliased = columns.filter((c) => columnKey(c) !== c.field);
    if (aliased.length === 0) return linked;
    return linked.map((r) => {
      const row: Row = { ...r };
      for (const c of aliased)
        Object.defineProperty(row, columnKey(c), {
          value: r[c.field],
          enumerable: true,
          configurable: true,
          writable: true,
        });
      return row;
    });
  }, [linked, transform, groupBy, columns]);

  const sorted = useMemo(
    () => (manualSort ? derived : sortRows(derived, multiSort ? sorts : parseSort(sortValue))),
    [derived, sortValue, manualSort, multiSort, sorts],
  );
  const shown = useMemo(() => (limit != null ? sorted.slice(0, limit) : sorted), [sorted, limit]);

  const cols: ColumnModel[] = useMemo(() => {
    let firstText = true;
    return columns.map((col) => {
      const key = columnKey(col);
      const field = fieldOf(schema, col.field, allRows);
      const sample = shown.find((r) => r[key] != null)?.[key];
      let kind: CellKind | 'custom';
      if (typeof col.cell === 'function') kind = 'custom';
      else if (col.cell) kind = col.cell;
      else if (Array.isArray(sample)) kind = 'sparkline';
      else if (col.aggregate || field.type === 'quantitative' || typeof sample === 'number')
        kind = 'number';
      else kind = 'text';
      let track =
        col.width != null
          ? typeof col.width === 'number'
            ? `${col.width}px`
            : col.width
          : DEFAULT_WIDTH[kind];
      if (col.width == null && kind === 'text' && firstText) track = 'minmax(160px, 2fr)';
      if (col.pinned && typeof col.width !== 'number')
        track = `${Math.max(100, minTrack(track))}px`;
      if (kind === 'text') firstText = false;
      const fmtName: Formatter =
        col.format ?? (col.aggregate === 'count' ? 'integer' : field.format);
      let max = 0;
      let total = 0;
      if (kind === 'bar') {
        for (const r of shown) {
          const v = Number(r[key]);
          if (Number.isFinite(v)) {
            max = Math.max(max, Math.abs(v));
            total += v;
          }
        }
      }
      return {
        col,
        key,
        kind,
        align: col.align ?? (kind === 'number' || kind === 'delta' ? 'right' : 'left'),
        track,
        sortable: col.sortable ?? kind !== 'sparkline',
        label: col.label ?? field.label,
        field,
        fmt: makeFormatter(fmtName, { currency: field.currency, locale }),
        shareFmt: makeFormatter(
          { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 },
          { locale },
        ),
        max,
        total,
      };
    });
  }, [columns, schema, allRows, shown, locale]);

  // Selection state
  const interactive = !!(select && sel) || !!onRowClick;
  const selPredicate = select && sel ? sel.get(select) : undefined;
  const selectKey = (value: unknown) =>
    typedSelection
      ? typedValueKey(value, select ? schema[select]?.type : undefined)
      : valueKey(value);
  const selectedKeys = useMemo(
    () =>
      new Set(
        selectedValues(selPredicate).map((value) =>
          typedSelection
            ? typedValueKey(value, select ? schema[select]?.type : undefined)
            : valueKey(value),
        ),
      ),
    [selPredicate, typedSelection, schema, select],
  );
  const isSelected = (r: Row) => !!select && selectedKeys.has(selectKey(r[select]));
  const toggleRow = (r: Row) => {
    if (select && sel) {
      const v = r[select] as Primitive;
      if (typedSelection) {
        const previous = selectedValues(sel.get(select));
        const key = selectKey(v);
        const present = previous.some((item) => selectKey(item) === key);
        const next = present
          ? previous.filter((item) => selectKey(item) !== key)
          : multiple
            ? [...previous, v]
            : [v];
        sel.set(select, next, { source, op: 'in' });
      } else sel.toggle(select, v, { source, multiple });
    }
    onRowClick?.(r);
  };

  // Paging
  const [page, setPage] = useControllable(pageProp, defaultPage, onPageChange);
  const pageCount = pageSize ? Math.max(1, Math.ceil(shown.length / pageSize)) : 1;
  const safePage = Math.max(
    0,
    Math.min(Number.isFinite(page) ? Math.floor(page) : 0, pageCount - 1),
  );
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page, setPage]);
  const virtual =
    virtualize !== false &&
    !pageSize &&
    shown.length > (typeof virtualize === 'number' ? virtualize : 200);
  const bodyRows = pageSize ? shown.slice(safePage * pageSize, (safePage + 1) * pageSize) : shown;
  const offset = pageSize ? safePage * pageSize : 0;

  // Virtual window
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [rowH, setRowH] = useState(50);
  const { height: viewH } = useElementSize(scrollRef);
  const scrollerHeight = height ?? (virtual ? 480 : undefined);
  useIsoLayoutEffect(() => {
    const el = bodyRef.current?.querySelector<HTMLElement>('[role="row"]');
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0 && Math.abs(h - rowH) > 0.5) setRowH(h);
  });
  const headH = headRef.current?.offsetHeight ?? 36;
  let start = 0;
  let end = bodyRows.length;
  if (virtual) {
    const top = Math.max(0, scrollTop - headH);
    start = Math.max(0, Math.floor(top / rowH) - OVERSCAN);
    end = Math.min(
      bodyRows.length,
      Math.ceil((top + (viewH || scrollerHeight || 480)) / rowH) + OVERSCAN,
    );
  }

  // Roving focus
  const [focusIndex, setFocusIndex] = useState(0);
  const pendingFocus = useRef<number | null>(null);
  const focusAt = Math.min(focusIndex, Math.max(0, bodyRows.length - 1));
  useEffect(() => {
    const i = pendingFocus.current;
    if (i == null) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: virtual });
    }
  });
  const moveFocus = (i: number) => {
    const next = Math.max(0, Math.min(bodyRows.length - 1, i));
    setFocusIndex(next);
    pendingFocus.current = next;
    const sc = scrollRef.current;
    if (virtual && sc) {
      const top = headH + next * rowH;
      const view = sc.clientHeight;
      if (top < sc.scrollTop + headH) sc.scrollTop = top - headH;
      else if (top + rowH > sc.scrollTop + view) sc.scrollTop = top + rowH - view;
      setScrollTop(sc.scrollTop);
    }
  };
  const onBodyKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button,input,select,textarea,a')) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (!target) return;
    const i = Number(target.dataset.index);
    const pageStep = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowH) - 1);
    switch (e.key) {
      case 'ArrowDown':
        moveFocus(i + 1);
        break;
      case 'ArrowUp':
        moveFocus(i - 1);
        break;
      case 'Home':
        moveFocus(0);
        break;
      case 'End':
        moveFocus(bodyRows.length - 1);
        break;
      case 'PageDown':
        moveFocus(i + pageStep);
        break;
      case 'PageUp':
        moveFocus(i - pageStep);
        break;
      case 'Enter':
      case ' ':
        if (bodyRows[i]) toggleRow(bodyRows[i]);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onHeaderSort = (c: ColumnModel, additive = false) => {
    if (multiSort) {
      const current = sorts.find((s) => s.key === c.key);
      const next = {
        key: c.key,
        desc: current ? !current.desc : NUMERIC.includes(c.kind as CellKind),
      };
      setSorts(
        additive
          ? current
            ? sorts.map((s) => (s.key === c.key ? next : s))
            : [...sorts, next]
          : [next],
      );
      setPage(0);
      return;
    }
    let next: SortState;
    if (sortState?.key === c.key) next = { key: c.key, desc: !sortState.desc };
    else next = { key: c.key, desc: NUMERIC.includes(c.kind as CellKind) };
    setSort(formatSort(next));
    setPage(0);
  };

  const showCheck = !!(select && sel);
  const tracks = [
    ...(showCheck ? ['28px'] : []),
    ...(rank ? ['32px'] : []),
    ...cols.map((c) => c.track),
  ];
  const minWidth = tracks.reduce((a, t) => a + minTrack(t), 0) + (tracks.length - 1) * 14 + 32;
  const gridStyle = { '--q-dt-cols': tracks.join(' '), minWidth } as CSSProperties;
  const pinnedStyle = (index: number): CSSProperties | undefined => {
    const side = cols[index].col.pinned;
    if (!side) return undefined;
    const preceding = side === 'left' ? cols.slice(0, index) : cols.slice(index + 1);
    const pinned = preceding.filter((c) => c.col.pinned === side);
    const width = pinned.reduce((sum, c) => sum + minTrack(c.track), 0);
    return { [side]: `calc(var(--q-dt-px) + ${width}px + ${pinned.length} * var(--q-dt-gap))` };
  };

  const keyOf = (r: Row, i: number) =>
    typeof rowKey === 'function'
      ? rowKey(r, i)
      : rowKey
        ? typedSelection
          ? typedValueKey(r[rowKey], schema[rowKey]?.type)
          : valueKey(r[rowKey])
        : groupBy
          ? valueKey(r[groupBy])
          : String(i);

  const selectedCount = selectedKeys.size;
  const visibleKeys = bodyRows.map((r) => (select ? selectKey(r[select]) : ''));
  const allChecked =
    showCheck && bodyRows.length > 0 && visibleKeys.every((k) => selectedKeys.has(k));
  const someChecked = showCheck && visibleKeys.some((k) => selectedKeys.has(k));
  const toggleAll = () => {
    if (!select || !sel) return;
    if (someChecked) sel.clear(select);
    else
      sel.set(
        select,
        bodyRows.map((r) => r[select] as Primitive),
        { op: 'in', source },
      );
  };

  const status = error ? 'error' : loading ? 'loading' : shown.length === 0 ? 'empty' : 'ready';
  const filteredOut = status === 'empty' && allRows.length > 0;
  const role = interactive ? 'grid' : 'table';
  const name = ariaLabel ?? (typeof title === 'string' ? title : 'Data table');

  const renderCell = (c: ColumnModel, r: Row, i: number) => {
    const v = r[c.key];
    switch (c.kind) {
      case 'custom':
        return (c.col.cell as (row: Row, index: number) => ReactNode)(r, i);
      case 'number':
        return <span className="q-dt-num">{c.fmt(v)}</span>;
      case 'bar': {
        const n = Number(v);
        const w = c.max && Number.isFinite(n) ? (Math.abs(n) / c.max) * 100 : 0;
        return (
          <span className="q-dt-bar">
            <span className="q-dt-bar-track">
              <span className="q-dt-bar-fill" style={{ width: `${w}%` }} />
            </span>
            <span className="q-dt-bar-label">
              {c.col.share ? c.shareFmt(c.total ? n / c.total : Number.NaN) : c.fmt(v)}
            </span>
          </span>
        );
      }
      case 'sparkline':
        return Array.isArray(v) && v.length > 1 ? (
          <TrendLine values={v.map(Number)} height={28} className="q-dt-spark" />
        ) : null;
      case 'delta':
        return (
          <DeltaPill
            value={v == null ? null : Number(v)}
            kind={c.col.deltaKind ?? 'percent'}
            invert={c.col.invert}
          />
        );
      case 'badge':
        return v == null || v === '' ? null : (
          <span className="q-dt-badge" data-tone={c.col.tones?.[String(v)] ?? 'neutral'}>
            {c.fmt(v)}
          </span>
        );
      case 'status':
        return v == null || v === '' ? null : (
          <span className="q-dt-status" data-tone={c.col.tones?.[String(v)] ?? 'neutral'}>
            <span className="q-dt-status-dot" />
            {c.fmt(v)}
          </span>
        );
      default: {
        const second = c.col.secondary ? r[c.col.secondary] : undefined;
        return (
          <span
            className="q-dt-text"
            data-two-line={second != null && second !== '' ? '' : undefined}
          >
            <span className="q-dt-primary">{c.fmt(v)}</span>
            {second != null && second !== '' && (
              <span className="q-dt-secondary">{String(second)}</span>
            )}
          </span>
        );
      }
    }
  };

  const windowRows = virtual ? bodyRows.slice(start, end) : bodyRows;
  const footLeft: string[] = [];
  if (pageSize && shown.length > 0) {
    const fmtInt = makeFormatter('integer', { locale });
    footLeft.push(
      `${fmtInt(offset + 1)}–${fmtInt(offset + bodyRows.length)} of ${fmtInt(shown.length)} ${noun}`,
    );
  }
  if (showCheck && sel?.id) {
    const target = isGeneratedId(sel.id) ? 'the selection' : `“${sel.id}”`;
    footLeft.push(
      selectedCount > 0
        ? `${selectedCount} selected · published to ${target}`
        : `Select rows to publish to ${target}`,
    );
  }
  const hasFoot = footLeft.length > 0 || footer != null || pageCount > 1;

  return (
    <div
      className={cx('q-dt', className)}
      style={style}
      data-footer={hasFoot || undefined}
      data-status={status}
    >
      {(title != null || caption != null || toolbar != null) && (
        <div className="q-dt-top">
          <div className="q-dt-titles">
            {title != null && <div className="q-dt-title">{title}</div>}
            {caption != null && <div className="q-dt-caption">{caption}</div>}
          </div>
          {toolbar != null && <div className="q-dt-toolbar">{toolbar}</div>}
        </div>
      )}
      <div
        ref={scrollRef}
        className="q-dt-scroll"
        style={scrollerHeight ? { maxHeight: scrollerHeight } : undefined}
        onScroll={
          virtual
            ? (e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop)
            : undefined
        }
      >
        {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is table or grid, both take a label */}
        <div
          className="q-dt-table"
          role={role}
          aria-label={name}
          aria-rowcount={virtual ? bodyRows.length + 1 : undefined}
          aria-multiselectable={interactive && select ? multiple : undefined}
          aria-busy={status === 'loading' || undefined}
          style={gridStyle}
        >
          <div ref={headRef} className="q-dt-header" role="rowgroup">
            {/* biome-ignore lint/a11y/useFocusableInteractive: header rows are not focus stops; cells hold the buttons */}
            <div className="q-dt-hrow" role="row" aria-rowindex={virtual ? 1 : undefined}>
              {showCheck && (
                // biome-ignore lint/a11y/useFocusableInteractive: the checkbox inside is the focus stop
                <span className="q-dt-hcell" role="columnheader">
                  {multiple ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={allChecked ? true : someChecked ? 'mixed' : false}
                      aria-label={someChecked ? 'Clear selected rows' : 'Select all rows'}
                      className="q-dd-check q-dt-checkall"
                      data-state={allChecked ? 'checked' : someChecked ? 'mixed' : undefined}
                      onClick={toggleAll}
                      disabled={status !== 'ready'}
                    >
                      {allChecked ? (
                        <IconCheck strokeWidth={2.4} />
                      ) : someChecked ? (
                        <IconMinus strokeWidth={2.4} />
                      ) : null}
                    </button>
                  ) : (
                    <span className="q-visually-hidden">Selected</span>
                  )}
                </span>
              )}
              {rank && (
                // biome-ignore lint/a11y/useFocusableInteractive: static header
                <span className="q-dt-hcell" role="columnheader">
                  #
                </span>
              )}
              {cols.map((c, ci) => {
                const sortIndex = activeSorts.findIndex((s) => s.key === c.key);
                const activeSort = activeSorts[sortIndex];
                const active = !!activeSort;
                const ariaSort = active
                  ? activeSort.desc
                    ? 'descending'
                    : 'ascending'
                  : undefined;
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: the sort button inside is the focus stop
                  <span
                    key={c.key}
                    className="q-dt-hcell"
                    role="columnheader"
                    aria-sort={c.sortable ? (ariaSort ?? 'none') : undefined}
                    data-align={c.align}
                    data-active={active || undefined}
                    data-pinned={c.col.pinned}
                    style={pinnedStyle(ci)}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        className="q-dt-sort"
                        title={
                          multiSort
                            ? 'Click to sort. Shift-click to add a sort priority.'
                            : undefined
                        }
                        onClick={(e) => onHeaderSort(c, e.shiftKey)}
                      >
                        <span className="q-dt-sort-label">{c.label}</span>
                        {active && (
                          <span className="q-dt-sort-icon" aria-hidden="true">
                            {activeSort.desc ? (
                              <IconArrowDown size={11} />
                            ) : (
                              <IconArrowUp size={11} />
                            )}
                          </span>
                        )}
                        {active && multiSort && activeSorts.length > 1 && (
                          <span className="q-dt-sort-priority">
                            <span className="q-visually-hidden">Sort priority </span>
                            {sortIndex + 1}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="q-dt-sort-label">{c.label}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
          <div
            ref={bodyRef}
            className="q-dt-body"
            role="rowgroup"
            onKeyDown={interactive ? onBodyKeyDown : undefined}
          >
            {status === 'loading' &&
              Array.from({ length: Math.min(pageSize ?? limit ?? 5, 8) }, (_, i) => (
                // biome-ignore lint/a11y/useFocusableInteractive: placeholder rows while loading
                <div key={i} className="q-dt-row" role="row" data-skeleton="">
                  {tracks.map((_, j) => (
                    <span key={j} className="q-dt-cell" role={interactive ? 'gridcell' : 'cell'}>
                      <span
                        className="q-dd-skeleton"
                        style={{
                          height: 10,
                          width: j === 0 && showCheck ? 16 : `${55 + ((i * 7 + j * 13) % 40)}%`,
                        }}
                      />
                    </span>
                  ))}
                </div>
              ))}
            {status === 'ready' && (
              <>
                {virtual && start > 0 && (
                  <div aria-hidden="true" style={{ height: start * rowH }} />
                )}
                {windowRows.map((r, wi) => {
                  const i = (virtual ? start : 0) + wi;
                  const selected = isSelected(r);
                  return (
                    <div
                      key={keyOf(r, offset + i)}
                      className="q-dt-row"
                      role="row"
                      data-index={i}
                      aria-rowindex={virtual ? i + 2 : undefined}
                      aria-selected={interactive && select ? selected : undefined}
                      tabIndex={interactive ? (i === focusAt ? 0 : -1) : undefined}
                      data-interactive={interactive || undefined}
                      onClick={
                        interactive
                          ? (e) => {
                              if (
                                !(e.target as HTMLElement).closest('button,input,select,textarea,a')
                              )
                                toggleRow(r);
                            }
                          : undefined
                      }
                      onFocus={interactive ? () => setFocusIndex(i) : undefined}
                    >
                      {showCheck && (
                        <span className="q-dt-cell" role={interactive ? 'gridcell' : 'cell'}>
                          <span
                            className="q-dd-check"
                            data-state={selected ? 'checked' : undefined}
                            aria-hidden="true"
                          >
                            {selected && <IconCheck strokeWidth={2.4} />}
                          </span>
                        </span>
                      )}
                      {rank && (
                        <span
                          className="q-dt-cell q-dt-rank"
                          role={interactive ? 'gridcell' : 'cell'}
                        >
                          {offset + i + 1}
                        </span>
                      )}
                      {cols.map((c, ci) => (
                        <span
                          key={c.key}
                          className="q-dt-cell"
                          role={interactive ? 'gridcell' : 'cell'}
                          data-kind={c.kind}
                          data-align={c.align}
                          data-pinned={c.col.pinned}
                          style={pinnedStyle(ci)}
                        >
                          {c.col.editable && onCellEdit && rowKey && !groupBy ? (
                            <TableCellEditor
                              editor={typeof c.col.editable === 'object' ? c.col.editable : {}}
                              fieldType={c.field.type}
                              row={r}
                              rowKey={keyOf(r, offset + i)}
                              field={c.col.field}
                              columnKey={c.key}
                              label={typeof c.label === 'string' ? c.label : c.key}
                              onEdit={onCellEdit}
                            >
                              {renderCell(c, r, offset + i)}
                            </TableCellEditor>
                          ) : (
                            renderCell(c, r, offset + i)
                          )}
                        </span>
                      ))}
                    </div>
                  );
                })}
                {virtual && end < bodyRows.length && (
                  <div aria-hidden="true" style={{ height: (bodyRows.length - end) * rowH }} />
                )}
              </>
            )}
          </div>
        </div>
        {(status === 'empty' || status === 'error') && (
          <div className="q-dt-state">
            <ChartState
              status={status}
              error={error}
              errorCode={errorCode}
              onRetry={onRetry}
              empty={
                empty ??
                (filteredOut
                  ? {
                      title: 'No rows match',
                      description: 'Nothing passes the current selection.',
                      action:
                        sel && sel.predicates.length > 0 ? (
                          <Button size="sm" onClick={() => sel.clear()}>
                            Clear selection
                          </Button>
                        ) : undefined,
                    }
                  : { title: 'No rows to show' })
              }
            />
          </div>
        )}
      </div>
      {hasFoot && (
        <div className="q-dt-foot">
          <span className="q-dt-foot-left" aria-live="polite">
            {footLeft.join(' · ')}
          </span>
          <span className="q-dt-foot-right">
            {footer}
            {pageCount > 1 && (
              <span className="q-dt-pager">
                <Button size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </Button>
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
