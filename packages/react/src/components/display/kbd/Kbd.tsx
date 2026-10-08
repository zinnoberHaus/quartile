import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../../lib/cx';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** `raised` has a thicker bottom edge; `flat` sits on a tinted fill (search fields, palettes). */
  variant?: 'raised' | 'flat';
}

/** A keyboard key: ⌘, K, esc, ↵. Render one per key. */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { variant = 'raised', className, ...rest },
  ref,
) {
  return <kbd ref={ref} className={cx('q-kbd', className)} data-variant={variant} {...rest} />;
});
