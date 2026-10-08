import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconCheck, IconX } from '../../../icons';
import { cx } from '../../../lib/cx';
import { useDismiss } from '../../../lib/floating';
import { useControllable } from '../../../lib/useControllable';
import { describedBy, FormField, hasMessage } from '../field/FormField';
import { firstEnabled, stepEnabled, useScrollActiveIntoView } from '../listbox/listNav';
import { FloatingPanel } from '../shared/FloatingPanel';
import type { InputSize } from '../text-field/TextField';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Right-aligned mono figure, e.g. the revenue behind the option ("$224K"). */
  meta?: ReactNode;
  disabled?: boolean;
}

interface ComboboxBaseProps {
  options: ComboboxOption[];
  placeholder?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: InputSize;
  disabled?: boolean;
  /** Shown when nothing matches the query. */
  emptyText?: ReactNode;
  /** Custom filter; defaults to a case-insensitive substring match on the label. */
  filter?: (option: ComboboxOption, query: string) => boolean;
  /** Keyboard hints and the match count under the list. */
  showFooter?: boolean;
  /** Render the list in place instead of the portal layer. */
  portal?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

export interface ComboboxSingleProps extends ComboboxBaseProps {
  multiple?: false;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
}

export interface ComboboxMultipleProps extends ComboboxBaseProps {
  /** Pick several options; they show as removable chips. */
  multiple: true;
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultipleProps;

const defaultFilter = (o: ComboboxOption, q: string) =>
  o.label.toLowerCase().includes(q.trim().toLowerCase());

/** Splits `label` around the first case-insensitive match of `query`, for highlighting. */
export function splitMatch(label: string, query: string): [string, string, string] {
  const q = query.trim();
  if (!q) return [label, '', ''];
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return [label, '', ''];
  return [label.slice(0, i), label.slice(i, i + q.length), label.slice(i + q.length)];
}

/**
 * Filterable select. Single: the input shows the chosen label. Multiple: chips with remove buttons;
 * Enter toggles, Backspace on an empty query removes the last chip.
 */
export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder,
    label,
    hint,
    error,
    size = 'md',
    disabled,
    emptyText = 'No matches',
    filter = defaultFilter,
    showFooter = true,
    portal = true,
    id,
    className,
    style,
    'aria-label': ariaLabel,
  } = props;
  const multiple = props.multiple === true;
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const labelId = `${autoId}-label`;
  const messageId = `${autoId}-msg`;
  const optId = (i: number) => `${autoId}-opt-${i}`;

  const toArray = (v: string | string[] | null | undefined) =>
    v == null ? undefined : Array.isArray(v) ? v : [v];
  const [selectedArr, setSelectedArr] = useControllable<string[]>(
    toArray(props.value === null ? [] : props.value),
    toArray(props.defaultValue) ?? [],
  );
  const emit = (next: string[]) => {
    setSelectedArr(next);
    if (multiple) (props.onChange as ((v: string[]) => void) | undefined)?.(next);
    else (props.onChange as ((v: string | null) => void) | undefined)?.(next[0] ?? null);
  };

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query ?? '';
  const matches = useMemo(
    () => (q.trim() ? options.filter((o) => filter(o, q)) : options),
    [options, q, filter],
  );
  const isDisabled = useCallback((i: number) => !!matches[i]?.disabled, [matches]);
  const selectedSet = new Set(selectedArr);
  const singleLabel = !multiple
    ? (options.find((o) => o.value === selectedArr[0])?.label ?? '')
    : '';

  useScrollActiveIntoView(listRef, active, open);

  const close = useCallback(() => {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }, []);
  useDismiss(open, close, [controlRef, popRef]);

  const openList = (activeIndex?: number) => {
    setOpen(true);
    const firstSel = matches.findIndex((o) => selectedSet.has(o.value) && !o.disabled);
    setActive(
      activeIndex ?? (firstSel >= 0 ? firstSel : firstEnabled(matches.length, 1, isDisabled)),
    );
  };

  const toggle = (option: ComboboxOption) => {
    if (option.disabled) return;
    if (multiple) {
      emit(
        selectedSet.has(option.value)
          ? selectedArr.filter((v) => v !== option.value)
          : [...selectedArr, option.value],
      );
    } else {
      emit([option.value]);
      close();
    }
  };

  const remove = (v: string) => {
    emit(selectedArr.filter((x) => x !== v));
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = matches.length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        if (!open) openList(e.altKey ? undefined : firstEnabled(n, dir, isDisabled));
        else setActive((a) => stepEnabled(n, a, dir, isDisabled));
        return;
      }
      case 'Enter':
        if (open && active >= 0 && matches[active]) {
          e.preventDefault();
          toggle(matches[active]);
        }
        return;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        } else if (q) setQuery(null);
        return;
      case 'Backspace':
        if (multiple && !q && selectedArr.length) {
          e.preventDefault();
          emit(selectedArr.slice(0, -1));
        }
        return;
      case 'Tab':
        if (open) close();
        return;
    }
  };

  const invalid = hasMessage(error) || error === true;
  const footerHint = multiple ? '↑↓ navigate · ↵ toggle' : '↑↓ navigate · ↵ select';

  const popoverProps = {
    className: cx('q-listbox-popover', !portal && 'q-listbox-popover-inline'),
    onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
  const list = (
    <>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        aria-labelledby={label != null ? labelId : undefined}
        aria-label={label == null ? ariaLabel : undefined}
        className="q-listbox"
      >
        {matches.map((o, i) => {
          const sel = selectedSet.has(o.value);
          const [a, b, c] = splitMatch(o.label, q);
          return (
            <div
              key={o.value}
              id={optId(i)}
              data-index={i}
              role="option"
              tabIndex={-1}
              aria-selected={sel}
              aria-disabled={o.disabled || undefined}
              data-active={i === active || undefined}
              className="q-listbox-option q-combobox-option"
              onPointerMove={() => {
                if (!o.disabled && i !== active) setActive(i);
              }}
              onClick={() => toggle(o)}
            >
              {multiple ? (
                <span className="q-listbox-box" aria-hidden="true">
                  {sel && <IconCheck size={10} strokeWidth={2.6} />}
                </span>
              ) : (
                <span className="q-listbox-check" aria-hidden="true">
                  {sel && <IconCheck size={14} strokeWidth={2} />}
                </span>
              )}
              <span className="q-listbox-label">
                {a}
                {b && <mark>{b}</mark>}
                {c}
              </span>
              {o.meta != null && <span className="q-listbox-meta">{o.meta}</span>}
            </div>
          );
        })}
      </div>
      {matches.length === 0 && <div className="q-listbox-empty">{emptyText}</div>}
      {showFooter && (
        <div className="q-listbox-footer" aria-hidden="true">
          <span>{footerHint}</span>
          <span>
            {matches.length} of {options.length}
          </span>
        </div>
      )}
    </>
  );

  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      disabled={disabled}
      htmlFor={inputId}
      labelId={labelId}
      messageId={messageId}
      className={cx('q-combobox', className)}
      style={style}
    >
      <div className="q-select-anchor">
        <div
          ref={controlRef}
          className="q-input q-combobox-control"
          data-size={size}
          data-multiple={multiple || undefined}
          data-open={open || undefined}
          data-invalid={invalid || undefined}
          data-disabled={disabled || undefined}
          onPointerDown={(e) => {
            if (disabled || (e.target as HTMLElement).closest('.q-combobox-chip-remove')) return;
            if (e.target !== inputRef.current) e.preventDefault();
            inputRef.current?.focus();
            if (!open) openList();
          }}
        >
          {multiple &&
            selectedArr.map((v) => {
              const o = options.find((x) => x.value === v);
              const text = o?.label ?? v;
              return (
                <span key={v} className="q-combobox-chip">
                  {text}
                  <button
                    type="button"
                    className="q-combobox-chip-remove"
                    aria-label={`Remove ${text}`}
                    disabled={disabled}
                    onClick={() => remove(v)}
                  >
                    <IconX size={10} strokeWidth={2} />
                  </button>
                </span>
              );
            })}
          <input
            ref={inputRef}
            id={inputId}
            className="q-combobox-input"
            role="combobox"
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            placeholder={multiple && selectedArr.length ? undefined : placeholder}
            value={query ?? singleLabel}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
            aria-label={label == null ? ariaLabel : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy(messageId, hint, error)}
            onChange={(e) => {
              const text = e.target.value;
              setQuery(text);
              if (!open) setOpen(true);
              const next = text.trim() ? options.filter((o) => filter(o, text)) : options;
              setActive(firstEnabled(next.length, 1, (i) => !!next[i]?.disabled));
              if (!multiple && text === '' && selectedArr.length) emit([]);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (!open) setQuery(null);
            }}
          />
        </div>
        {open && !portal && (
          <div ref={popRef} {...popoverProps}>
            {list}
          </div>
        )}
      </div>
      {open && portal && (
        <FloatingPanel ref={popRef} anchorRef={controlRef} matchWidth {...popoverProps}>
          {list}
        </FloatingPanel>
      )}
    </FormField>
  );
}
