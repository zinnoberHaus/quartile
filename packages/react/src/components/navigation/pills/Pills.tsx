import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';

export interface PillItem {
  value: string;
  label: ReactNode;
  count?: ReactNode;
  disabled?: boolean;
}

export interface PillsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: PillItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Names the group for assistive technology. */
  label?: string;
  size?: 'sm' | 'md';
}

/** Filter pills: one active filter over a collection, ink-filled when active. */
export const Pills = forwardRef<HTMLDivElement, PillsProps>(function Pills(
  { items, value, defaultValue, onChange, label, size = 'md', className, ...rest },
  ref,
) {
  const [active, setActive] = useControllable(
    value,
    defaultValue ?? items[0]?.value ?? '',
    onChange,
  );
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cx('q-pills', className)}
      data-size={size}
      {...rest}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="q-pill"
          aria-pressed={item.value === active}
          disabled={item.disabled}
          onClick={() => setActive(item.value)}
        >
          {item.label}
          {item.count != null && <span className="q-pill-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
});
