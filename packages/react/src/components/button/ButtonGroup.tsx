import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { ButtonGroupContext, type ButtonSize, type ButtonVariant } from './Button';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Size for every button in the group (a button's own `size` still wins). */
  size?: ButtonSize;
  /** Default variant for the buttons in the group. */
  variant?: ButtonVariant;
  /**
   * Attached (default): buttons share borders and only the outer corners are rounded. A button
   * with `aria-pressed="true"` renders as the selected one, so the group works as a toggle set.
   */
  attached?: boolean;
}

/** Groups related buttons. Name it with `aria-label` when the group has no visible label. */
export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { size = 'md', variant, attached = true, className, children, ...rest },
  ref,
) {
  return (
    <ButtonGroupContext.Provider value={{ size, variant }}>
      <div
        ref={ref}
        role="group"
        className={cx('q-btn-group', className)}
        data-size={size}
        data-attached={attached || undefined}
        {...rest}
      >
        {children}
      </div>
    </ButtonGroupContext.Provider>
  );
});
