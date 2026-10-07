import {
  createContext,
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useId,
  useRef,
} from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';
import { nextIndex } from '../roving';

export interface TabItem {
  value: string;
  label: ReactNode;
  /** Small mono count after the label. */
  count?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Names the tab list for assistive technology. */
  label?: string;
  /**
   * Panels: `<TabPanel value>` elements, or a function of the active value that renders the one
   * panel. Leave empty when the tabs drive content elsewhere.
   */
  children?: ReactNode | ((value: string) => ReactNode);
}

interface TabsContextValue {
  value: string;
  idFor: (value: string, part: 'tab' | 'panel') => string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function slug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Tabs switch views of the same data. Arrow keys move between tabs and select them, Home and End
 * jump to the ends; an ink underline marks the active tab.
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { items, value, defaultValue, onChange, label, className, children, ...rest },
  ref,
) {
  const baseId = useId();
  const [active, setActive] = useControllable(
    value,
    defaultValue ?? items.find((i) => !i.disabled)?.value ?? '',
    onChange,
  );
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const idFor = (v: string, part: 'tab' | 'panel') => `${baseId}-${part}-${slug(v)}`;
  const hasPanels = children != null;
  const activeIndex = items.findIndex((i) => i.value === active);
  const focusIndex = activeIndex >= 0 ? activeIndex : items.findIndex((i) => !i.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabRefs.current.indexOf(event.target as HTMLButtonElement);
    const next = nextIndex(
      event.key,
      current,
      items.map((i) => !!i.disabled),
    );
    if (next == null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    setActive(items[next].value);
  };

  return (
    <TabsContext.Provider value={{ value: active, idFor }}>
      <div ref={ref} className={cx('q-tabs', className)} {...rest}>
        <div role="tablist" aria-label={label} className="q-tabs-list" onKeyDown={onKeyDown}>
          {items.map((item, i) => {
            const selected = item.value === active;
            return (
              <button
                key={item.value}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={idFor(item.value, 'tab')}
                aria-selected={selected}
                aria-controls={hasPanels ? idFor(item.value, 'panel') : undefined}
                tabIndex={i === focusIndex ? 0 : -1}
                disabled={item.disabled}
                className="q-tab"
                onClick={() => setActive(item.value)}
              >
                {item.label}
                {item.count != null && <span className="q-tab-count">{item.count}</span>}
              </button>
            );
          })}
        </div>
        {typeof children === 'function' ? (
          <div
            role="tabpanel"
            id={idFor(active, 'panel')}
            aria-labelledby={idFor(active, 'tab')}
            className="q-tab-panel"
          >
            {children(active)}
          </div>
        ) : (
          children
        )}
      </div>
    </TabsContext.Provider>
  );
});

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  children?: ReactNode;
}

/** Content for one tab. Rendered only while its tab is active. */
export function TabPanel({ value, className, children, ...rest }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabPanel must be rendered inside Tabs');
  const selected = ctx.value === value;
  return (
    <div
      role="tabpanel"
      id={ctx.idFor(value, 'panel')}
      aria-labelledby={ctx.idFor(value, 'tab')}
      hidden={!selected}
      className={cx('q-tab-panel', className)}
      {...rest}
    >
      {selected ? children : null}
    </div>
  );
}
