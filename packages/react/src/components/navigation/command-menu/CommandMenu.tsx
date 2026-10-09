import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconSearch } from '../../../icons';
import { cx } from '../../../lib/cx';
import { Portal } from '../../../lib/floating';
import { useControllable } from '../../../lib/useControllable';
import { Kbd } from '../../display/kbd/Kbd';
import { useScrollActiveIntoView } from '../../inputs/listbox/listNav';
import { useModal } from '../../overlays/internal/modal';
import { type CommandGroup, type CommandItem, filterCommandGroups } from './filter';

export interface CommandPaletteProps {
  groups: CommandGroup[];
  placeholder?: string;
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Shown when nothing matches. */
  emptyMessage?: ReactNode;
  /** Called after an item's own `onSelect`. */
  onItemSelect?: (item: CommandItem) => void;
  /** Show the "esc" hint in the search row. */
  escHint?: boolean;
  autoFocus?: boolean;
  /** Names the search field for assistive technology. */
  label?: string;
  className?: string;
}

/**
 * The palette itself, without the dialog: a search field that filters grouped commands.
 * Arrow keys move the highlight, Enter runs the highlighted command.
 */
export function CommandPalette({
  groups,
  placeholder = 'Type a command or search…',
  query: queryProp,
  defaultQuery = '',
  onQueryChange,
  emptyMessage = 'No matching commands',
  onItemSelect,
  escHint = false,
  autoFocus,
  label = 'Search commands',
  className,
}: CommandPaletteProps) {
  const [query, setQuery] = useControllable(queryProp, defaultQuery, onQueryChange);
  const filtered = useMemo(() => filterCommandGroups(groups, query), [groups, query]);
  const flat = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);
  const firstEnabled = flat.findIndex((it) => !it.disabled);
  const [active, setActive] = useState(firstEnabled);
  const baseId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset the highlight to the first match whenever the query changes the list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the filtered list only
  useEffect(() => setActive(firstEnabled), [filtered]);

  useScrollActiveIntoView(listRef, active, true);

  const run = (item: CommandItem | undefined) => {
    if (!item || item.disabled) return;
    item.onSelect?.();
    onItemSelect?.(item);
  };

  const move = (dir: 1 | -1) => {
    const n = flat.length;
    if (n === 0) return;
    for (let i = 1; i <= n; i++) {
      const j = (((active + dir * i) % n) + n) % n;
      if (!flat[j].disabled) {
        setActive(j);
        return;
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      run(flat[active]);
    }
  };

  const optionId = (i: number) => `${baseId}-opt-${i}`;
  let index = -1;

  return (
    <div className={cx('q-command', className)}>
      <div className="q-command-search">
        <IconSearch size={14} aria-hidden="true" />
        <input
          className="q-command-input"
          role="combobox"
          aria-label={label}
          aria-expanded="true"
          aria-controls={`${baseId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && flat[active] ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          // biome-ignore lint/a11y/noAutofocus: opt-in, for palettes shown on demand
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {escHint && (
          <Kbd variant="flat" className="q-command-esc" aria-hidden="true">
            esc
          </Kbd>
        )}
      </div>
      <div ref={listRef} id={`${baseId}-list`} role="listbox" className="q-command-list">
        {filtered.length === 0 ? (
          <div className="q-command-empty" role="presentation">
            {emptyMessage}
          </div>
        ) : (
          filtered.map((group, g) => (
            <div
              key={`${group.label}-${g}`}
              role="group"
              aria-labelledby={`${baseId}-g-${g}`}
              className="q-command-group"
            >
              <div id={`${baseId}-g-${g}`} className="q-command-group-label" role="presentation">
                {group.label}
              </div>
              {group.items.map((item) => {
                index += 1;
                const i = index;
                const selected = i === active;
                return (
                  <div
                    key={i}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected}
                    aria-disabled={item.disabled || undefined}
                    className="q-command-item"
                    onPointerMove={() => {
                      if (!item.disabled && !selected) setActive(i);
                    }}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => run(item)}
                  >
                    {item.icon != null && (
                      <span className="q-command-item-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    <span className="q-command-item-label">{item.label}</span>
                    {(item.shortcut != null || selected) && (
                      <span className="q-command-item-hint" aria-hidden="true">
                        {item.shortcut ?? '↵'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export interface CommandMenuProps
  extends Omit<CommandPaletteProps, 'onItemSelect' | 'autoFocus' | 'escHint'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the dialog (default "Command menu"). */
  title?: string;
}

/**
 * A filterable command palette in a modal dialog. Pair with `useHotkey('mod+k', …)` to open it.
 * Escape or a click outside closes it; running a command closes it and returns focus.
 */
export function CommandMenu({
  open,
  onOpenChange,
  title = 'Command menu',
  className,
  ...palette
}: CommandMenuProps) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const onKeyDown = useModal(open, panel, { onEscape: () => onOpenChange(false) });
  if (!open) return null;
  return (
    <Portal>
      <div
        className="q-command-backdrop"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <div
          ref={setPanel}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={cx('q-command-dialog', className)}
          onKeyDown={onKeyDown}
        >
          <CommandPalette {...palette} escHint onItemSelect={() => onOpenChange(false)} />
        </div>
      </div>
    </Portal>
  );
}
