import { type ReactNode, useCallback, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../components/button/Button';
import { TextField } from '../components/inputs/text-field/TextField';
import { fieldOf, resolveData } from '../data/schema';
import { typedValueKey } from '../data/typed-key';
import type { DataInput, Row, Schema } from '../data/types';
import { IconColumns, IconDownload, IconFilter, IconSearch } from '../icons';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/useControllable';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { DataTable, type DataTableColumn, type DataTableProps } from './DataTable';
import {
  createTableViewState,
  deriveTableRows,
  filterTableRows,
  parseTableViewState,
  serializeTableViewState,
  type TableFilter,
  type TableScalar,
  type TableViewState,
  tableToCSV,
} from './explorer-model';
import { columnKey } from './table-model';

export interface DataExplorerExport {
  csv: string;
  /** All matching, sorted result rows, before pagination. Groups when grouping is enabled. */
  rows: readonly Row[];
  columns: readonly DataTableColumn[];
  view: TableViewState;
}

export interface DataExplorerProps<R extends Row = Row>
  extends Omit<
    DataTableProps<R>,
    | 'data'
    | 'columns'
    | 'rowKey'
    | 'transform'
    | 'groupBy'
    | 'sort'
    | 'defaultSort'
    | 'onSortChange'
    | 'sorts'
    | 'defaultSorts'
    | 'onSortsChange'
    | 'manualSort'
    | 'page'
    | 'defaultPage'
    | 'onPageChange'
    | 'pageSize'
    | 'limit'
  > {
  data: DataInput<R>;
  columns: DataTableColumn[];
  rowKey: NonNullable<DataTableProps<R>['rowKey']>;
  view?: TableViewState;
  defaultView?: Partial<TableViewState>;
  onViewChange?: (view: TableViewState) => void;
  /** Defaults to rows.csv. Export includes all filtered rows and visible columns, not only this page. */
  exportFileName?: string;
  /** Overrides the browser download, useful for controlled export destinations. */
  onExport?: (result: DataExplorerExport) => void;
}

type Panel = 'filters' | 'sorts' | 'columns' | 'group' | 'view';
const PANEL_LABEL: Record<Panel, string> = {
  filters: 'Filters',
  sorts: 'Sort priorities',
  columns: 'Columns',
  group: 'Group rows',
  view: 'Saved view',
};
const TYPES = ['text', 'number', 'date', 'category', 'boolean', 'empty'] as const;
const OPS: Record<TableFilter['type'], [string, string][]> = {
  text: [
    ['contains', 'contains'],
    ['notContains', 'does not contain'],
    ['eq', 'equals'],
    ['startsWith', 'starts with'],
  ],
  number: [
    ['eq', '='],
    ['neq', '≠'],
    ['gt', '>'],
    ['gte', '≥'],
    ['lt', '<'],
    ['lte', '≤'],
    ['between', 'between'],
  ],
  date: [
    ['on', 'on UTC day'],
    ['before', 'before UTC day'],
    ['after', 'after UTC day'],
    ['between', 'between UTC days'],
  ],
  category: [
    ['in', 'is one of'],
    ['notIn', 'is not one of'],
  ],
  boolean: [['is', 'is']],
  empty: [
    ['isEmpty', 'is empty'],
    ['isNotEmpty', 'is not empty'],
  ],
};

function labelOf(c: DataTableColumn, schema: Schema): string {
  return typeof c.label === 'string' ? c.label : (schema[c.field]?.label ?? c.field);
}

function FilterBuilder({
  initial,
  columns,
  rows,
  schema,
  onApply,
  onCancel,
}: {
  initial?: TableFilter;
  columns: DataTableColumn[];
  rows: readonly Row[];
  schema: Schema;
  onApply: (filter: TableFilter) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [field, setField] = useState(initial?.field ?? columns[0]?.field ?? '');
  const inferType = (name: string): TableFilter['type'] => {
    const t = fieldOf(schema, name, rows).type;
    return t === 'quantitative'
      ? 'number'
      : t === 'temporal'
        ? 'date'
        : t === 'boolean'
          ? 'boolean'
          : 'text';
  };
  const [type, setType] = useState<TableFilter['type']>(initial?.type ?? inferType(field));
  const [op, setOp] = useState(initial?.op ?? OPS[type][0][0]);
  const [first, setFirst] = useState(
    initial && 'value' in initial
      ? String(Array.isArray(initial.value) ? (initial.value[0] ?? '') : initial.value)
      : '',
  );
  const [second, setSecond] = useState(
    initial && 'value' in initial && Array.isArray(initial.value)
      ? String(initial.value[1] ?? '')
      : '',
  );
  const [picked, setPicked] = useState<TableScalar[]>(
    initial?.type === 'category' ? initial.value : [],
  );
  const [error, setError] = useState('');
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: TableScalar[] = [];
    for (const r of rows) {
      const v = r[field] ?? null;
      if (typeof v === 'object' && v !== null) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean' && v !== null)
        continue;
      const k = typedValueKey(v, schema[field]?.type);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
      if (out.length >= 1000) break;
    }
    for (const v of picked) {
      const k = typedValueKey(v, schema[field]?.type);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
    }
    return out;
  }, [rows, field, schema, picked]);
  const changeType = (next: TableFilter['type']) => {
    setType(next);
    setOp(OPS[next][0][0]);
    setFirst('');
    setSecond('');
    setPicked([]);
    setError('');
  };
  const apply = () => {
    let value: unknown = first;
    if (type === 'number')
      value =
        op === 'between'
          ? [first === '' ? null : Number(first), second === '' ? null : Number(second)]
          : first.trim() === ''
            ? Number.NaN
            : Number(first);
    if (type === 'date' && op === 'between') value = [first || null, second || null];
    if (type === 'boolean') value = first === 'true';
    if (type === 'category') value = picked;
    try {
      const filter = { field, type, op, ...(type === 'empty' ? {} : { value }) } as TableFilter;
      const validated = createTableViewState({ filters: [filter] }).filters[0];
      onApply(validated);
    } catch {
      setError('Enter valid values. Range start must be before its end.');
    }
  };
  const fields = [...new Map(columns.map((c) => [c.field, c])).values()];
  return (
    <form
      className="q-explorer-filter-builder"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label>
        Field
        <select
          value={field}
          onChange={(e) => {
            setField(e.target.value);
            changeType(inferType(e.target.value));
          }}
        >
          {fields.map((c) => (
            <option key={c.field} value={c.field}>
              {labelOf(c, schema)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Value type
        <select value={type} onChange={(e) => changeType(e.target.value as TableFilter['type'])}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Condition
        <select value={op} onChange={(e) => setOp(e.target.value)}>
          {OPS[type].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {type === 'category' ? (
        <label className="q-explorer-filter-values">
          Values
          <select
            multiple
            size={Math.min(5, Math.max(2, categories.length))}
            value={categories.flatMap((v, i) =>
              picked.some(
                (p) =>
                  typedValueKey(p, schema[field]?.type) === typedValueKey(v, schema[field]?.type),
              )
                ? [String(i)]
                : [],
            )}
            onChange={(e) =>
              setPicked([...e.target.selectedOptions].map((o) => categories[Number(o.value)]))
            }
          >
            {categories.map((v, i) => (
              <option key={i} value={i}>
                {v === null ? '(empty)' : `${String(v)} · ${typeof v}`}
              </option>
            ))}
          </select>
          <small>Use Ctrl / Command to select multiple. Up to 1,000 distinct source values.</small>
        </label>
      ) : type === 'boolean' ? (
        <label>
          Value
          <select
            value={first === 'true' ? 'true' : 'false'}
            onChange={(e) => setFirst(e.target.value)}
          >
            <option value="false">False</option>
            <option value="true">True</option>
          </select>
        </label>
      ) : type !== 'empty' ? (
        <>
          <label>
            {op === 'between' ? 'From (optional)' : 'Value'}
            <input
              type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
              step={type === 'number' ? 'any' : undefined}
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </label>
          {op === 'between' && (
            <label>
              To (optional)
              <input
                type={type === 'number' ? 'number' : 'date'}
                step={type === 'number' ? 'any' : undefined}
                value={second}
                onChange={(e) => setSecond(e.target.value)}
                aria-invalid={!!error}
              />
            </label>
          )}
        </>
      ) : null}
      <div className="q-explorer-inline-actions">
        <Button size="sm" variant="primary" type="submit">
          Apply filter
        </Button>
        <Button size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && (
        <span id={`${id}-error`} className="q-explorer-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}

/** A local analytical table with explicit, caller-owned view state and controlled record edits. */
export function DataExplorer<R extends Row = Row>({
  data,
  columns,
  rowKey,
  view: viewProp,
  defaultView,
  onViewChange,
  exportFileName = 'rows.csv',
  onExport,
  className,
  style,
  id,
  selection,
  onCellEdit,
  title,
  caption,
  toolbar,
  ...tableProps
}: DataExplorerProps<R>) {
  const source = useSourceId(id);
  const panelId = useId();
  const initial = useRef<TableViewState | null>(null);
  if (!initial.current)
    initial.current = createTableViewState({
      ...defaultView,
      pinnedColumns: defaultView?.pinnedColumns ?? {
        left: columns.filter((column) => column.pinned === 'left').map(columnKey),
        right: columns.filter((column) => column.pinned === 'right').map(columnKey),
      },
    });
  const [view, setView] = useControllable(viewProp, initial.current, onViewChange);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [filterEdit, setFilterEdit] = useState<number | 'new' | null>(null);
  const [savedText, setSavedText] = useState('');
  const [viewMessage, setViewMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const { rows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows: linked } = useLinkedRows(rows, { selection, source });
  const fieldNames = useMemo(() => columns.map((c) => c.field), [columns]);
  const filtered = useMemo(
    () => filterTableRows(linked, view, schema, fieldNames),
    [linked, view, schema, fieldNames],
  );
  const result = useMemo(
    () => deriveTableRows(linked, columns, view, schema),
    [linked, columns, view, schema],
  );
  const transform = useCallback(() => result, [result]);
  const update = (patch: Partial<TableViewState>, resetPage = true) =>
    setView(
      createTableViewState({ ...view, ...patch, page: resetPage ? 0 : (patch.page ?? view.page) }),
    );
  const ordered = useMemo(() => {
    const byKey = new Map(columns.map((c) => [columnKey(c), c]));
    const order = [...new Set([...view.columnOrder, ...columns.map(columnKey)])].filter((k) =>
      byKey.has(k),
    );
    return order.map((k) => byKey.get(k)!);
  }, [columns, view.columnOrder]);
  const visible = useMemo(() => {
    const list = ordered.filter((c) => !view.hiddenColumns.includes(columnKey(c)));
    const safe = list.length ? list : ordered.slice(0, 1);
    const side = (c: DataTableColumn): 'left' | 'right' | undefined =>
      view.pinnedColumns.left.includes(columnKey(c))
        ? 'left'
        : view.pinnedColumns.right.includes(columnKey(c))
          ? 'right'
          : undefined;
    return [
      ...safe.filter((c) => side(c) === 'left'),
      ...safe.filter((c) => !side(c)),
      ...safe.filter((c) => side(c) === 'right'),
    ].map((c) => ({
      ...c,
      width: view.columnWidths[columnKey(c)] ?? c.width,
      pinned: side(c),
      editable: view.groupBy ? false : c.editable,
    }));
  }, [ordered, view.hiddenColumns, view.pinnedColumns, view.columnWidths, view.groupBy]);
  const moveColumn = (key: string, direction: number) => {
    const keys = ordered.map(columnKey);
    const i = keys.indexOf(key);
    const to = i + direction;
    if (to < 0 || to >= keys.length) return;
    [keys[i], keys[to]] = [keys[to], keys[i]];
    update({ columnOrder: keys }, false);
  };
  const pinColumn = (key: string, side: string) => {
    const left = view.pinnedColumns.left.filter((k) => k !== key);
    const right = view.pinnedColumns.right.filter((k) => k !== key);
    if (side === 'left') left.push(key);
    if (side === 'right') right.push(key);
    update({ pinnedColumns: { left, right } }, false);
  };
  const exportRows = () => {
    try {
      const csv = tableToCSV(result, visible);
      if (onExport) onExport({ csv, rows: result, columns: visible, view });
      else {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setExportMessage(
        `Exported ${result.length.toLocaleString('en-US')} ${view.groupBy ? 'groups' : 'rows'}.`,
      );
    } catch (e) {
      setExportMessage(e instanceof Error ? e.message : 'Export failed.');
    }
  };
  const togglePanel = (next: Panel) => {
    if (next === 'view' && panel !== 'view') {
      setSavedText(serializeTableViewState(view));
      setViewMessage('');
    }
    setPanel(panel === next ? null : next);
  };
  const loadView = () => {
    try {
      const next = parseTableViewState(savedText);
      const fields = new Set(fieldNames);
      const keys = new Set(columns.map(columnKey));
      if (
        next.filters.some((f) => !fields.has(f.field)) ||
        (next.groupBy && !fields.has(next.groupBy)) ||
        next.sorts.some((s) => !keys.has(s.key))
      )
        throw new Error('This view refers to fields that are not in the table.');
      setView(next);
      setViewMessage('View loaded. Source records are unchanged.');
    } catch (e) {
      setViewMessage(e instanceof Error ? e.message : 'Invalid saved view.');
    }
  };
  const filterDescription = (f: TableFilter): ReactNode => (
    <>
      {schema[f.field]?.label ?? f.field} · {OPS[f.type].find(([op]) => op === f.op)?.[1]}
      {'value' in f
        ? ` ${Array.isArray(f.value) ? f.value.map((v) => (v === null ? '…' : String(v))).join(' · ') : String(f.value)}`
        : ''}
    </>
  );
  return (
    <div className={cx('q-explorer', className)} style={style}>
      {(title != null || caption != null || toolbar != null) && (
        <div className="q-explorer-heading">
          <div>
            {title != null && <div className="q-explorer-title">{title}</div>}
            {caption != null && <div className="q-explorer-caption">{caption}</div>}
          </div>
          {toolbar}
        </div>
      )}
      <div className="q-explorer-toolbar">
        <TextField
          size="sm"
          className="q-explorer-search"
          icon={<IconSearch />}
          aria-label="Search rows"
          placeholder="Search rows…"
          value={view.search}
          onChange={(e) => update({ search: e.target.value })}
        />
        <Button
          size="sm"
          icon={<IconFilter />}
          aria-expanded={panel === 'filters'}
          aria-controls={panel === 'filters' ? panelId : undefined}
          onClick={() => togglePanel('filters')}
        >
          Filters{view.filters.length ? ` · ${view.filters.length}` : ''}
        </Button>
        <Button
          size="sm"
          aria-expanded={panel === 'sorts'}
          aria-controls={panel === 'sorts' ? panelId : undefined}
          onClick={() => togglePanel('sorts')}
        >
          Sort{view.sorts.length ? ` · ${view.sorts.length}` : ''}
        </Button>
        <Button
          size="sm"
          icon={<IconColumns />}
          aria-expanded={panel === 'columns'}
          aria-controls={panel === 'columns' ? panelId : undefined}
          onClick={() => togglePanel('columns')}
        >
          Columns · {visible.length}/{columns.length}
        </Button>
        <Button
          size="sm"
          aria-expanded={panel === 'group'}
          aria-controls={panel === 'group' ? panelId : undefined}
          onClick={() => togglePanel('group')}
        >
          Group{view.groupBy ? ' · 1' : ''}
        </Button>
        <Button
          size="sm"
          aria-expanded={panel === 'view'}
          aria-controls={panel === 'view' ? panelId : undefined}
          onClick={() => togglePanel('view')}
        >
          View
        </Button>
        <Button size="sm" icon={<IconDownload />} onClick={exportRows}>
          Export CSV
        </Button>
      </div>
      {panel && (
        <section id={panelId} className="q-explorer-panel" aria-label={PANEL_LABEL[panel]}>
          <div className="q-explorer-panel-heading">
            <strong>{PANEL_LABEL[panel]}</strong>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Close
            </Button>
          </div>
          {panel === 'filters' && (
            <>
              <p className="q-explorer-hint">
                Every condition must match. These filters refine this view after the shared
                selection.
              </p>
              {view.filters.map((f, i) => (
                <div key={i} className="q-explorer-filter-summary">
                  <span>{filterDescription(f)}</span>
                  <Button
                    size="sm"
                    onClick={() => setFilterEdit(i)}
                    aria-label={`Edit filter ${i + 1}`}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => update({ filters: view.filters.filter((_, n) => n !== i) })}
                    aria-label={`Remove filter ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {filterEdit !== null ? (
                <FilterBuilder
                  key={
                    filterEdit === 'new'
                      ? 'new'
                      : `${filterEdit}-${JSON.stringify(view.filters[filterEdit])}`
                  }
                  initial={filterEdit === 'new' ? undefined : view.filters[filterEdit]}
                  columns={columns}
                  rows={rows}
                  schema={schema}
                  onCancel={() => setFilterEdit(null)}
                  onApply={(filter) => {
                    update({
                      filters:
                        filterEdit === 'new'
                          ? [...view.filters, filter]
                          : view.filters.map((f, i) => (i === filterEdit ? filter : f)),
                    });
                    setFilterEdit(null);
                  }}
                />
              ) : (
                <Button size="sm" disabled={!columns.length} onClick={() => setFilterEdit('new')}>
                  Add filter
                </Button>
              )}
            </>
          )}
          {panel === 'sorts' && (
            <>
              <p className="q-explorer-hint">
                First priority wins; ties use the next. Empty values stay last. Shift-click a table
                header to add a priority.
              </p>
              {view.sorts.map((sort, i) => (
                <div className="q-explorer-sort-row" key={sort.key}>
                  <span className="q-explorer-priority">{i + 1}</span>
                  <label className="q-explorer-grow">
                    Column
                    <select
                      aria-label={`Sort column ${i + 1}`}
                      value={sort.key}
                      onChange={(e) =>
                        update({
                          sorts: view.sorts.map((s, n) =>
                            n === i ? { ...s, key: e.target.value } : s,
                          ),
                        })
                      }
                    >
                      {columns
                        .filter(
                          (c) =>
                            c.sortable !== false &&
                            (!view.sorts.some((s) => s.key === columnKey(c)) ||
                              columnKey(c) === sort.key),
                        )
                        .map((c) => (
                          <option key={columnKey(c)} value={columnKey(c)}>
                            {labelOf(c, schema)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Direction
                    <select
                      value={sort.desc ? 'desc' : 'asc'}
                      aria-label={`Sort direction ${i + 1}`}
                      onChange={(e) =>
                        update({
                          sorts: view.sorts.map((s, n) =>
                            n === i ? { ...s, desc: e.target.value === 'desc' } : s,
                          ),
                        })
                      }
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  </label>
                  <Button
                    size="sm"
                    disabled={i === 0}
                    aria-label={`Move sort ${i + 1} up`}
                    onClick={() => {
                      const sorts = [...view.sorts];
                      [sorts[i - 1], sorts[i]] = [sorts[i], sorts[i - 1]];
                      update({ sorts });
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    aria-label={`Remove sort ${i + 1}`}
                    onClick={() => update({ sorts: view.sorts.filter((_, n) => n !== i) })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                disabled={
                  !columns.some(
                    (c) => c.sortable !== false && !view.sorts.some((s) => s.key === columnKey(c)),
                  )
                }
                onClick={() => {
                  const c = columns.find(
                    (c) => c.sortable !== false && !view.sorts.some((s) => s.key === columnKey(c)),
                  );
                  if (c) update({ sorts: [...view.sorts, { key: columnKey(c), desc: false }] });
                }}
              >
                Add sort
              </Button>
            </>
          )}
          {panel === 'columns' && (
            <>
              <p className="q-explorer-hint">
                Order within each pinned region follows this list. Widths are pixels; pinned columns
                use fixed tracks.
              </p>
              {ordered.map((c, i) => {
                const key = columnKey(c);
                const shown = visible.some((v) => columnKey(v) === key);
                const label = labelOf(c, schema);
                return (
                  <div key={key} className="q-explorer-column-row">
                    <label className="q-explorer-visible">
                      <input
                        type="checkbox"
                        checked={shown}
                        disabled={shown && visible.length === 1}
                        onChange={() =>
                          update(
                            {
                              hiddenColumns: shown
                                ? [...view.hiddenColumns, key]
                                : view.hiddenColumns.filter((k) => k !== key),
                            },
                            false,
                          )
                        }
                      />
                      {label}
                    </label>
                    <Button
                      size="sm"
                      disabled={i === 0}
                      aria-label={`Move ${label} left`}
                      onClick={() => moveColumn(key, -1)}
                    >
                      ←
                    </Button>
                    <Button
                      size="sm"
                      disabled={i === ordered.length - 1}
                      aria-label={`Move ${label} right`}
                      onClick={() => moveColumn(key, 1)}
                    >
                      →
                    </Button>
                    <label>
                      Pin
                      <select
                        aria-label={`Pin ${label}`}
                        value={
                          view.pinnedColumns.left.includes(key)
                            ? 'left'
                            : view.pinnedColumns.right.includes(key)
                              ? 'right'
                              : ''
                        }
                        onChange={(e) => pinColumn(key, e.target.value)}
                      >
                        <option value="">None</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                    <label>
                      Width
                      <input
                        className="q-explorer-width"
                        aria-label={`Width of ${label}`}
                        type="number"
                        min={60}
                        max={1000}
                        placeholder="Auto"
                        value={
                          view.columnWidths[key] ?? (typeof c.width === 'number' ? c.width : '')
                        }
                        onChange={(e) => {
                          const widths = { ...view.columnWidths };
                          if (e.target.value === '') delete widths[key];
                          else {
                            const width = Number(e.target.value);
                            if (width < 60 || width > 1000) return;
                            widths[key] = width;
                          }
                          update({ columnWidths: widths }, false);
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </>
          )}
          {panel === 'group' && (
            <>
              <label className="q-explorer-group-field">
                Group by
                <select
                  value={view.groupBy ?? ''}
                  onChange={(e) => update({ groupBy: e.target.value || null })}
                >
                  <option value="">No grouping · individual rows</option>
                  {[...new Map(columns.map((c) => [c.field, c])).values()].map((c) => (
                    <option key={c.field} value={c.field}>
                      {labelOf(c, schema)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="q-explorer-hint">
                Grouped rows are read-only. Numeric columns use their configured aggregate;
                unaggregated columns show the first value in each group.
              </p>
              <div className="q-explorer-aggregates">
                {columns
                  .filter((c) => c.aggregate)
                  .map((c) => (
                    <span key={columnKey(c)}>
                      {labelOf(c, schema)} · {c.aggregate}
                    </span>
                  ))}
              </div>
            </>
          )}
          {panel === 'view' && (
            <>
              <p className="q-explorer-hint">
                Copy this JSON to save a view, or paste a saved view and load it. Records and shared
                selections are excluded.
              </p>
              <label className="q-explorer-view-json">
                View JSON
                <textarea
                  rows={7}
                  spellCheck={false}
                  value={savedText}
                  onChange={(e) => {
                    setSavedText(e.target.value);
                    setViewMessage('');
                  }}
                />
              </label>
              <div className="q-explorer-inline-actions">
                <Button size="sm" variant="primary" onClick={loadView}>
                  Load view
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setSavedText(serializeTableViewState(view));
                    setViewMessage('Current configuration is ready to copy.');
                  }}
                >
                  Use current view
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const next = createTableViewState();
                    setView(next);
                    setSavedText(serializeTableViewState(next));
                    setViewMessage('View reset. Source records are unchanged.');
                  }}
                >
                  Reset view
                </Button>
              </div>
              {viewMessage && (
                <span role="status" className="q-explorer-hint">
                  {viewMessage}
                </span>
              )}
            </>
          )}
        </section>
      )}
      <div className="q-explorer-context">
        <span aria-live="polite">
          {filtered.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} source
          rows{view.groupBy ? ` · ${result.length.toLocaleString('en-US')} groups · read-only` : ''}
        </span>
        <label>
          Rows per page
          <select
            value={view.pageSize}
            onChange={(e) => update({ pageSize: Number(e.target.value) })}
          >
            {[...new Set([10, 25, 50, 100, view.pageSize])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
        </label>
      </div>
      <DataTable
        {...tableProps}
        data={data}
        columns={visible}
        rowKey={
          view.groupBy
            ? (r) => typedValueKey(r[view.groupBy!], schema[view.groupBy!]?.type)
            : rowKey
        }
        id={source}
        selection={selection}
        select={tableProps.select && view.groupBy ? view.groupBy : tableProps.select}
        typedSelection={tableProps.typedSelection ?? true}
        transform={transform}
        sorts={view.sorts}
        onSortsChange={(sorts) => update({ sorts })}
        manualSort
        page={view.page}
        pageSize={view.pageSize}
        onPageChange={(page) => update({ page }, false)}
        onCellEdit={view.groupBy ? undefined : onCellEdit}
        noun={view.groupBy ? 'groups' : tableProps.noun}
        empty={
          tableProps.empty ?? {
            title: 'No rows match',
            description: 'Clear this view’s search and filters, or adjust the shared selection.',
            action:
              view.search || view.filters.length ? (
                <Button size="sm" onClick={() => update({ search: '', filters: [] })}>
                  Clear view filters
                </Button>
              ) : undefined,
          }
        }
      />
      {exportMessage && (
        <div className="q-explorer-export-status" role="status">
          {exportMessage}
        </div>
      )}
    </div>
  );
}
