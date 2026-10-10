import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { makeFieldFormatter, makeFormatter } from '../data/format';
import { applyPredicates, type Predicate, type Primitive } from '../data/predicates';
import { humanize, inferSchema, resolveData } from '../data/schema';
import type { DataInput, Row, Schema } from '../data/types';
import { IconCheck, IconChevronDown, IconPlus, IconX } from '../icons';
import { cx } from '../lib/cx';
import { Portal, useDismiss, useFloating } from '../lib/floating';
import { useQuartile } from '../provider/QuartileProvider';
import { useSelection, useSourceId } from '../selection/Selection';
import { compareValues, valueKey } from './shared';

export interface FilterOption {
  value: Primitive;
  /** Display text. Defaults to the value. */
  label?: ReactNode;
  /** Right-aligned mono detail, e.g. a count or a total. */
  meta?: ReactNode;
}

export interface FilterField {
  field: string;
  /** Chip label. Defaults to the field's schema label. */
  label?: string;
  /**
   * Values offered in the chip's menu. When omitted and `data` is given, the field's distinct
   * values are offered with a row count each.
   */
  options?: FilterOption[];
  /** Pinned chips always show ("All" when unset). Unpinned fields are offered by "Add filter". */
  pinned?: boolean;
  /** Allow several values (an "in" predicate). Defaults to true. */
  multiple?: boolean;
}

export interface FilterBarProps<R extends Row = Row> {
  fields: FilterField[];
  /** Rows used for the summary and for options derived from distinct values. */
  data?: DataInput<R>;
  /** Selection id. Defaults to the nearest <Selection>. */
  selection?: string;
  /** Right-side summary of the rows that pass every predicate, e.g. "2,104 orders · $187.4K". */
  summary?: (rows: R[]) => ReactNode;
  /** Leading label. Defaults to "Filters". */
  label?: ReactNode;
  /** Publisher id for predicates set from chip menus. */
  id?: string;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

interface Chip {
  field: string;
  def?: FilterField;
  predicate?: Predicate;
}

function selectedValues(p: Predicate | undefined): Primitive[] {
  if (!p) return [];
  if (p.op === 'eq') return [p.value];
  if (p.op === 'in') return p.value;
  return [];
}

const MENU_ITEM = '[role="menuitemcheckbox"],[role="menuitem"]';

/** Arrow-key, Home/End and Tab handling shared by the chip and "Add filter" menus. */
function useMenuKeys(onClose: (refocus: boolean) => void) {
  return useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEM)];
      const i = items.indexOf(document.activeElement as HTMLElement);
      let next: number | null = null;
      if (e.key === 'ArrowDown') next = (i + 1) % items.length;
      else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else if (e.key === 'Escape') {
        e.preventDefault();
        onClose(true);
        return;
      } else if (e.key === 'Tab') {
        onClose(false);
        return;
      }
      if (next != null && items[next]) {
        e.preventDefault();
        items[next].focus();
      }
    },
    [onClose],
  );
}

function Menu({
  anchor,
  open,
  onClose,
  label,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: (refocus: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { style, update } = useFloating(anchor, ref, {
    open,
    placement: 'bottom-start',
    offset: 6,
  });
  const dismiss = useCallback(() => onClose(false), [onClose]);
  useDismiss(open, dismiss, [anchor, ref]);
  const onKeyDown = useMenuKeys(onClose);
  // The portal mounts a render after `open` flips and stays hidden until positioned, so focus
  // moves in once the menu is visible.
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      setNode(el);
      if (el) update();
    },
    [update],
  );
  const visible = style.visibility === 'visible';
  useEffect(() => {
    if (!node || !visible || node.contains(document.activeElement)) return;
    const first =
      node.querySelector<HTMLElement>('[aria-checked="true"]') ??
      node.querySelector<HTMLElement>(MENU_ITEM);
    first?.focus({ preventScroll: true });
  }, [node, visible]);
  if (!open) return null;
  return (
    <Portal>
      <div
        ref={setRef}
        role="menu"
        aria-label={label}
        className="q-filterbar-menu"
        style={style}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </Portal>
  );
}

/**
 * A row of chips that mirrors the selection: one chip per configured field plus one for any
 * predicate another component published (a brush, a clicked bar). Chips with options open a
 * checkbox menu; × clears the field.
 */
export function FilterBar<R extends Row = Row>({
  fields,
  data,
  selection,
  summary,
  label = 'Filters',
  id,
  className,
  style,
  'aria-label': ariaLabel,
}: FilterBarProps<R>) {
  const { locale } = useQuartile();
  const source = useSourceId(id);
  const sel = useSelection(selection);
  const { rows: allRows, schema: dataSchema } = useMemo(() => resolveData(data), [data]);
  const [added, setAdded] = useState<string[]>([]);
  const [openField, setOpenField] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);

  const byField = useMemo(() => new Map(fields.map((f) => [f.field, f])), [fields]);
  const predicates = sel.predicates;

  // Fields the data does not describe (e.g. a brushed date) are inferred from predicate values.
  const schema: Schema = useMemo(() => {
    const missing = predicates.filter((p) => !dataSchema[p.field]);
    if (missing.length === 0) return dataSchema;
    const sample: Row[] = missing.flatMap((p) =>
      (p.op === 'eq' ? [p.value] : p.value).map((v) => ({ [p.field]: v })),
    );
    return { ...inferSchema(sample), ...dataSchema };
  }, [predicates, dataSchema]);

  const chips: Chip[] = useMemo(() => {
    const out: Chip[] = [];
    for (const f of fields) {
      const p = predicates.find((q) => q.field === f.field);
      if (f.pinned !== false || p || added.includes(f.field) || openField === f.field) {
        out.push({ field: f.field, def: f, predicate: p });
      }
    }
    for (const p of predicates)
      if (!byField.has(p.field)) out.push({ field: p.field, predicate: p });
    return out;
  }, [fields, predicates, added, openField, byField]);

  const addable = fields.filter((f) => !chips.some((c) => c.field === f.field));

  const optionsFor = useCallback(
    (f: FilterField): FilterOption[] => {
      if (f.options) return f.options;
      if (allRows.length === 0) return [];
      const others = applyPredicates(
        allRows,
        predicates.filter((p) => p.field !== f.field),
      );
      const counts = new Map<string, number>();
      for (const r of others) {
        const k = valueKey(r[f.field]);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const seen = new Map<string, Primitive>();
      for (const r of allRows) {
        const v = r[f.field];
        if (v == null || v === '' || typeof v === 'object') continue;
        const k = valueKey(v);
        if (!seen.has(k)) seen.set(k, v as Primitive);
      }
      const fmt = makeFormatter('integer', { locale });
      return [...seen.values()]
        .sort(compareValues)
        .map((v) => ({ value: v, meta: fmt(counts.get(valueKey(v)) ?? 0) }));
    },
    [allRows, predicates, locale],
  );

  const closeChip = useCallback(
    (field: string) => {
      setOpenField((cur) => (cur === field ? null : cur));
      setAdded((a) => (sel.get(field) ? a : a.filter((x) => x !== field)));
    },
    [sel],
  );

  const filtered = useMemo(() => sel.filter(allRows), [sel, allRows]);
  const summaryNode = summary
    ? summary(filtered)
    : data !== undefined
      ? `${makeFormatter('integer', { locale })(filtered.length)} rows`
      : null;

  const onAddClose = useCallback((refocus: boolean) => {
    setAddOpen(false);
    if (refocus) addRef.current?.focus();
  }, []);

  return (
    <div
      className={cx('q-filterbar', className)}
      style={style}
      role="group"
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : 'Filters')}
    >
      {label != null && <span className="q-filterbar-label">{label}</span>}
      {chips.map((c) => (
        <FilterChip
          key={c.field}
          chip={c}
          label={c.def?.label ?? c.predicate?.label ?? schema[c.field]?.label ?? humanize(c.field)}
          schema={schema}
          open={openField === c.field}
          options={c.def && openField === c.field ? optionsFor(c.def) : []}
          hasOptions={!!c.def && (!!c.def.options || allRows.length > 0)}
          onOpen={() => setOpenField(c.field)}
          onClose={() => closeChip(c.field)}
          onToggle={(v) => {
            sel.toggle(c.field, v, { source, multiple: c.def?.multiple !== false });
            if (c.def?.multiple === false) closeChip(c.field);
          }}
          onClear={() => {
            sel.clear(c.field);
            setAdded((a) => a.filter((x) => x !== c.field));
          }}
        />
      ))}
      {addable.length > 0 && (
        <>
          <button
            ref={addRef}
            type="button"
            className="q-filterbar-add"
            aria-haspopup="menu"
            aria-expanded={addOpen}
            onClick={() => setAddOpen((o) => !o)}
          >
            <IconPlus size={12} strokeWidth={1.6} />
            Add filter
          </button>
          <Menu anchor={addRef} open={addOpen} onClose={onAddClose} label="Add filter">
            {addable.map((f) => (
              <button
                key={f.field}
                type="button"
                role="menuitem"
                className="q-filterbar-option"
                onClick={() => {
                  setAddOpen(false);
                  setAdded((a) => [...a, f.field]);
                  setOpenField(f.field);
                }}
              >
                <span className="q-filterbar-option-text">
                  {f.label ?? schema[f.field]?.label ?? humanize(f.field)}
                </span>
              </button>
            ))}
          </Menu>
        </>
      )}
      <span className="q-filterbar-spacer" />
      {summaryNode != null && (
        <span className="q-filterbar-summary" aria-live="polite">
          {summaryNode}
        </span>
      )}
      {predicates.length > 0 && (
        <button type="button" className="q-filterbar-clear" onClick={() => sel.clear()}>
          Clear all
        </button>
      )}
    </div>
  );
}

function FilterChip({
  chip,
  label,
  schema,
  open,
  options,
  hasOptions,
  onOpen,
  onClose,
  onToggle,
  onClear,
}: {
  chip: Chip;
  label: string;
  schema: Schema;
  open: boolean;
  options: FilterOption[];
  hasOptions: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: (value: Primitive) => void;
  onClear: () => void;
}) {
  const { locale, timeZone } = useQuartile();
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const p = chip.predicate;
  const active = !!p;
  const values = selectedValues(p);
  const keys = new Set(values.map(valueKey));
  let valueText = 'All';
  const fmt = makeFieldFormatter(schema[chip.field], { locale, timeZone });
  if (p) {
    const match =
      values.length === 1
        ? chip.def?.options?.find((o) => valueKey(o.value) === valueKey(values[0]))
        : undefined;
    valueText =
      match?.label != null && typeof match.label === 'string'
        ? match.label
        : p.op === 'eq'
          ? fmt(p.value)
          : p.op === 'between'
            ? `${fmt(p.value[0])} – ${fmt(p.value[1])}`
            : p.value.length === 1
              ? fmt(p.value[0])
              : `${makeFormatter('integer', { locale })(p.value.length)} selected`;
  }
  const close = useCallback(
    (refocus: boolean) => {
      onClose();
      if (refocus) trigger.current?.focus();
    },
    [onClose],
  );
  const body = (
    <>
      <span className="q-filterbar-chip-label">{label}</span>
      <span className="q-filterbar-chip-value">{valueText}</span>
    </>
  );
  return (
    <span ref={anchor} className="q-filterbar-chip" data-active={active || undefined}>
      {hasOptions ? (
        <button
          ref={trigger}
          type="button"
          className="q-filterbar-chip-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close(false) : onOpen())}
        >
          {body}
          {!active && <IconChevronDown size={12} className="q-filterbar-chevron" />}
        </button>
      ) : (
        <span className="q-filterbar-chip-trigger" data-static="">
          {body}
        </span>
      )}
      {active && (
        <button
          type="button"
          className="q-filterbar-chip-clear"
          aria-label={`Clear ${label} filter`}
          onClick={onClear}
        >
          <IconX size={10} strokeWidth={2} />
        </button>
      )}
      {hasOptions && (
        <Menu anchor={anchor} open={open} onClose={close} label={label}>
          {options.length === 0 && <div className="q-filterbar-empty">No values</div>}
          {options.map((o) => {
            const checked = keys.has(valueKey(o.value));
            return (
              <button
                key={valueKey(o.value)}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                className="q-filterbar-option"
                onClick={() => onToggle(o.value)}
              >
                <span className="q-filterbar-option-check">
                  {checked && <IconCheck size={14} strokeWidth={2} />}
                </span>
                <span className="q-filterbar-option-text">{o.label ?? fmt(o.value)}</span>
                {o.meta != null && <span className="q-filterbar-option-meta">{o.meta}</span>}
              </button>
            );
          })}
        </Menu>
      )}
    </span>
  );
}
