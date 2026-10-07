import { type CSSProperties, forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../../lib/cx';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** CSS width (number = px). Default 100%. */
  width?: number | string;
  /** CSS height (number = px). Default 12px; ignored with `lines`. */
  height?: number | string;
  /** Corner radius (number = px). Default 4px. */
  radius?: number | string;
  /** Render a block of text lines; the last one is shorter. */
  lines?: number;
  /** A circle of `width` × `width`. */
  circle?: boolean;
}

const px = (v: number | string | undefined) => (typeof v === 'number' ? `${v}px` : v);

/**
 * A shimmering placeholder in the shape of content that is loading. Decorative (`aria-hidden`);
 * mark the region that is loading with `aria-busy`.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { width, height, radius, lines, circle, className, style, ...rest },
  ref,
) {
  if (lines != null && lines > 0) {
    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cx('q-skeleton-lines', className)}
        style={{ width: px(width), ...style }}
        {...rest}
      >
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className="q-skeleton"
            style={{
              width: i === lines - 1 && lines > 1 ? '60%' : '100%',
              borderRadius: px(radius),
            }}
          />
        ))}
      </div>
    );
  }
  const s: CSSProperties = {
    width: px(width),
    height: circle ? px(width ?? 32) : px(height),
    borderRadius: circle ? '50%' : px(radius),
    ...style,
  };
  if (circle && width == null) s.width = '32px';
  return (
    <div ref={ref} aria-hidden="true" className={cx('q-skeleton', className)} style={s} {...rest} />
  );
});
