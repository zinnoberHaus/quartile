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
import { IconCheck, IconChevronDown } from '../../../icons';
import { cx } from '../../../lib/cx';
import { useDismiss } from '../../../lib/floating';
import { useControllable } from '../../../lib/useControllable';
import { describedBy, FormField, hasMessage } from '../field/FormField';
import {
  firstEnabled,
  isPrintableKey,
  stepEnabled,
  typeaheadIndex,
  useScrollActiveIntoView,
  useTypeahead,
} from '../listbox/listNav';
import { FloatingPanel } from '../shared/FloatingPanel';
import type { InputSize } from '../text-field/TextField';

export interface SelectOption {
  value: string;
  label: string;
  /** Right-aligned mono note, e.g. "sum · USD" or why the option is disabled ("needs plan"). */
  description?: ReactNode;
  disabled?: boolean;
  /** Options with the same group are listed under one heading, in the order they first appear. */
  group?: string;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string, option: SelectOption) => void;
  placeholder?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: InputSize;
  disabled?: boolean;
  /** Submits the value with a form under this name. */
  name?: string;
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Render the list in the provider's portal layer (default) or in place, below the trigger. In
   * place suits lists that should stay inside a scrolling container.
   */
  portal?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

export function groupOptions<T extends { group?: string }>(options: T[]) {
  const sections: { group?: string; items: { option: T; index: number }[] }[] = [];
  const byGroup = new Map<string | undefined, (typeof sections)[number]>();
  options.forEach((option, index) => {
    let s = byGroup.get(option.group);
    if (!s) {
      s = { group: option.group, items: [] };
      byGroup.set(option.group, s);
      sections.push(s);
    }
    s.items.push({ option, index });
  });
  // Visual order (grouped) drives keyboard order.
  const order = sections.flatMap((s) => s.items.map((it) => it.index));
  return { sections, order };
}

/**
 * A listbox select: options with descriptions, groups and disabled states. Keyboard: ↑ ↓ Home End
 * move, Enter or Space picks, Escape closes, typing jumps to a matching option.
 */
export function Select({
  options,
  value: valueProp,
  defaultValue = null,
  onChange,
  placeholder = 'Select…',
  label,
  hint,
  error,
  size = 'md',
  disabled,
  name,
  id,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  portal = true,
  className,
  style,
  'aria-label': ariaLabel,
}: SelectProps) {
  const autoId = useId();
  const triggerId = id ?? `${autoId}-trigger`;
  const listId = `${autoId}-list`;
  const labelId = `${autoId}-label`;
  const messageId = `${autoId}-msg`;
  const optId = (i: number) => `${autoId}-opt-${i}`;

  const [value, setValue] = useControllable<string | null>(valueProp, defaultValue);
  const [open, setOpenState] = useControllable(openProp, defaultOpen, onOpenChange);
  const { sections, order } = useMemo(() => groupOptions(options), [options]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // `active` is a position in visual order, not an index into `options`.
  const isDisabled = useCallback(
    (pos: number) => !!options[order[pos]]?.disabled,
    [options, order],
  );
  const initialActive = () => {
    const pos = order.indexOf(selectedIndex);
    return pos >= 0 && !isDisabled(pos) ? pos : firstEnabled(order.length, 1, isDisabled);
  };
  const [active, setActive] = useState(() => (defaultOpen || openProp ? initialActive() : -1));

  const triggerRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const typeahead = useTypeahead();
  useScrollActiveIntoView(listRef, active, open);

  const initialRef = useRef(initialActive);
  initialRef.current = initialActive;
  const setOpen = useCallback(
    (next: boolean, focusTrigger = false) => {
      if (next) setActive(initialRef.current());
      setOpenState(next);
      if (focusTrigger) triggerRef.current?.focus();
    },
    [setOpenState],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, [anchorRef, popRef]);

  const pick = (pos: number) => {
    const option = options[order[pos]];
    if (!option || option.disabled) return;
    if (option.value !== value) {
      setValue(option.value);
      onChange?.(option.value, option);
    }
    setOpen(false, true);
  };

  const labelsInOrder = order.map((i) => options[i].label);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const n = order.length;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setOpenState(true);
        setActive(firstEnabled(n, e.key === 'Home' ? 1 : -1, isDisabled));
      } else if (isPrintableKey(e)) {
        e.preventDefault();
        const q = typeahead.push(e.key);
        const pos = typeaheadIndex(labelsInOrder, q, order.indexOf(selectedIndex), isDisabled);
        setOpenState(true);
        setActive(pos >= 0 ? pos : initialActive());
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => stepEnabled(n, a, e.key === 'ArrowDown' ? 1 : -1, isDisabled));
        return;
      case 'Home':
      case 'End':
        e.preventDefault();
        setActive(firstEnabled(n, e.key === 'Home' ? 1 : -1, isDisabled));
        return;
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault();
        const dir = e.key === 'PageDown' ? 1 : -1;
        setActive((a) => {
          let p = a;
          for (let k = 0; k < 10; k++) p = stepEnabled(n, p, dir, isDisabled);
          return p;
        });
        return;
      }
      case 'Enter':
        e.preventDefault();
        pick(active);
        return;
      case ' ':
        e.preventDefault();
        if (typeahead.active()) {
          const pos = typeaheadIndex(labelsInOrder, typeahead.push(' '), active, isDisabled);
          if (pos >= 0) setActive(pos);
        } else pick(active);
        return;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        if (isPrintableKey(e)) {
          e.preventDefault();
          const pos = typeaheadIndex(labelsInOrder, typeahead.push(e.key), active, isDisabled);
          if (pos >= 0) setActive(pos);
        }
    }
  };

  const invalid = hasMessage(error) || error === true;

  const listbox = (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      className="q-listbox"
      aria-labelledby={label != null ? labelId : undefined}
      aria-label={label == null ? ariaLabel : undefined}
      tabIndex={-1}
    >
      {sections.map((s, si) => {
        const body = s.items.map(({ option, index }) => {
          const pos = order.indexOf(index);
          const isSel = index === selectedIndex;
          return (
            <div
              key={option.value}
              id={optId(pos)}
              data-index={pos}
              role="option"
              tabIndex={-1}
              aria-selected={isSel}
              aria-disabled={option.disabled || undefined}
              data-active={pos === active || undefined}
              className="q-listbox-option"
              onPointerMove={() => {
                if (!option.disabled && pos !== active) setActive(pos);
              }}
              onClick={() => pick(pos)}
            >
              <span className="q-listbox-check" aria-hidden="true">
                {isSel && <IconCheck size={14} strokeWidth={2} />}
              </span>
              <span className="q-listbox-label">{option.label}</span>
              {option.description != null && (
                <span className="q-listbox-meta">{option.description}</span>
              )}
            </div>
          );
        });
        if (s.group == null) return <div key={`s${si}`}>{body}</div>;
        const hid = `${autoId}-g${si}`;
        return (
          <div key={`s${si}`} role="group" aria-labelledby={hid} className="q-listbox-group">
            <div id={hid} className="q-listbox-group-label" role="presentation">
              {s.group}
            </div>
            {body}
          </div>
        );
      })}
    </div>
  );
  const popoverProps = {
    className: cx('q-listbox-popover', !portal && 'q-listbox-popover-inline'),
    onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  };

  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      disabled={disabled}
      htmlFor={triggerId}
      labelId={labelId}
      messageId={messageId}
      className={cx('q-select', className)}
      style={style}
    >
      <div ref={anchorRef} className="q-select-anchor">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          className="q-input q-select-trigger"
          data-size={size}
          data-open={open || undefined}
          data-invalid={invalid || undefined}
          data-disabled={disabled || undefined}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
          aria-label={label == null ? ariaLabel : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(messageId, hint, error)}
          onClick={() => setOpen(!open)}
          onKeyDown={onKeyDown}
        >
          <span className={cx('q-select-value', !selected && 'q-select-placeholder')}>
            {selected ? selected.label : placeholder}
          </span>
          <IconChevronDown className="q-select-chevron" size={12} strokeWidth={1.6} />
        </button>
        {open && !portal && (
          <div ref={popRef} {...popoverProps}>
            {listbox}
          </div>
        )}
      </div>
      {open && portal && (
        <FloatingPanel ref={popRef} anchorRef={anchorRef} matchWidth {...popoverProps}>
          {listbox}
        </FloatingPanel>
      )}
      {name && <input type="hidden" name={name} value={value ?? ''} />}
    </FormField>
  );
}
