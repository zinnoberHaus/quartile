import { type ElementType, forwardRef, type HTMLAttributes, type ReactNode, useId } from 'react';
import { cx } from '../../../lib/cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** One line under the title: period, grain, filters in effect. */
  subtitle?: ReactNode;
  /** Right-aligned controls in the header: segmented controls, menus, a legend. */
  actions?: ReactNode;
  /** Pad the body (default). Turn off for edge-to-edge tables; the header stays padded. */
  padded?: boolean;
  /** Root element (default `section`). */
  as?: ElementType;
  children?: ReactNode;
}

/** The white, hairline card every chart and table sits in. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { title, subtitle, actions, padded = true, as: Root = 'section', className, children, ...rest },
  ref,
) {
  const id = useId();
  const titleId = `${id}-title`;
  const hasHeader = title != null || subtitle != null || actions != null;
  return (
    <Root
      ref={ref}
      className={cx('q-card', className)}
      data-padded={padded ? undefined : 'false'}
      aria-labelledby={title != null && rest['aria-label'] == null ? titleId : undefined}
      {...rest}
    >
      {hasHeader && (
        <div className="q-card-header">
          {(title != null || subtitle != null) && (
            <div className="q-card-heading">
              {title != null && (
                <h3 id={titleId} className="q-card-title">
                  {title}
                </h3>
              )}
              {subtitle != null && <div className="q-card-subtitle">{subtitle}</div>}
            </div>
          )}
          {actions != null && <div className="q-card-actions">{actions}</div>}
        </div>
      )}
      <div className="q-card-body">{children}</div>
    </Root>
  );
});
