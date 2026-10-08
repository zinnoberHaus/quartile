import { type CSSProperties, type KeyboardEvent, type ReactNode, useId, useRef } from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';
import { useSliderDrag } from './Slider';
import { binsInRange, moveRangeThumb, nearestThumb, toPercent, valueFromKey } from './sliderMath';

export interface RangeSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: [number, number];
  defaultValue?: [number, number];
  onChange?: (value: [number, number]) => void;
  /** Called once when a drag or key press ends. */
  onChangeEnd?: (value: [number, number]) => void;
  /** Formats the readout and each thumb's `aria-valuetext`. */
  format?: (value: number) => string;
  label?: ReactNode;
  /** Show "lo – hi" at the right of the label row. Default true. */
  showValue?: boolean;
  /**
   * Histogram counts in equal-width bins across [min, max]. Drawn behind the track: bins inside the
   * range in signal, the rest muted. Controls that filter data show the data they filter.
   */
  distribution?: number[];
  /** Height of the histogram in px. */
  distributionHeight?: number;
  /** Line under the track, e.g. "2,814 of 3,402 orders in range". */
  caption?: ReactNode | ((range: [number, number]) => ReactNode);
  /** Smallest allowed gap between the two values. */
  minDistance?: number;
  /** Accessible names for the two thumbs. */
  thumbLabels?: [string, string];
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible name for the group when there is no visible `label`. */
  'aria-label'?: string;
}

const identity = (v: number) => String(v);

/** Two-thumb slider for a [lo, hi] range, with an optional histogram of the values it filters. */
export function RangeSlider({
  min = 0,
  max = 100,
  step = 1,
  value: valueProp,
  defaultValue,
  onChange,
  onChangeEnd,
  format = identity,
  label,
  showValue = true,
  distribution,
  distributionHeight = 46,
  caption,
  minDistance = 0,
  thumbLabels = ['Minimum', 'Maximum'],
  disabled,
  className,
  style,
  'aria-label': ariaLabel,
}: RangeSliderProps) {
  const autoId = useId();
  const labelId = `${autoId}-label`;
  const [range, setRange] = useControllable<[number, number]>(
    valueProp,
    defaultValue ?? [min, max],
    onChange,
  );
  const [lo, hi] = range;
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)] as const;
  const latest = useRef(range);
  latest.current = range;
  const activeThumb = useRef<0 | 1>(0);

  const set = (next: [number, number]) => {
    const cur = latest.current;
    if (next[0] === cur[0] && next[1] === cur[1]) return;
    latest.current = next;
    setRange(next);
  };

  const drag = useSliderDrag({
    trackRef,
    min,
    max,
    step,
    disabled,
    onStart: (v) => {
      const t = nearestThumb(latest.current, v, max);
      activeThumb.current = t;
      set(moveRangeThumb(latest.current, t, v, minDistance));
      thumbRefs[t].current?.focus();
    },
    onDrag: (v) => set(moveRangeThumb(latest.current, activeThumb.current, v, minDistance)),
    onEnd: () => onChangeEnd?.(latest.current),
  });

  const onKeyDown = (t: 0 | 1) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const lower = t === 0 ? min : lo + minDistance;
    const upper = t === 0 ? hi - minDistance : max;
    const next = valueFromKey(e.key, range[t], lower, upper, step, e.shiftKey);
    if (next == null) return;
    e.preventDefault();
    const out = moveRangeThumb(range, t, next, minDistance);
    set(out);
    onChangeEnd?.(out);
  };

  const pLo = toPercent(lo, min, max);
  const pHi = toPercent(hi, min, max);
  const peak = distribution?.length ? Math.max(...distribution, 1) : 1;
  const inRange = distribution ? binsInRange(distribution.length, min, max, lo, hi) : [];
  const captionNode = typeof caption === 'function' ? caption(range) : caption;

  return (
    <div
      role="group"
      aria-labelledby={label != null ? labelId : undefined}
      aria-label={label == null ? ariaLabel : undefined}
      className={cx('q-slider q-range-slider', className)}
      data-tone="signal"
      data-disabled={disabled || undefined}
      style={style}
    >
      {(label != null || showValue) && (
        <div className="q-slider-head">
          {label != null && (
            <span id={labelId} className="q-slider-label">
              {label}
            </span>
          )}
          {showValue && (
            <span className="q-slider-value">
              {format(lo)} – {format(hi)}
            </span>
          )}
        </div>
      )}
      <div className="q-range-plot" {...drag}>
        {distribution && distribution.length > 0 && (
          <div className="q-range-bars" style={{ height: distributionHeight }} aria-hidden="true">
            {distribution.map((count, i) => (
              <span
                key={i}
                className="q-range-bar"
                data-in={inRange[i] || undefined}
                style={{
                  height: `${count > 0 ? Math.max(2, (count / peak) * 100) : 0}%`,
                }}
              />
            ))}
          </div>
        )}
        <div ref={trackRef} className="q-slider-track">
          <span className="q-slider-rail" />
          <span className="q-slider-fill" style={{ left: `${pLo}%`, width: `${pHi - pLo}%` }} />
          {([0, 1] as const).map((t) => {
            const v = range[t];
            return (
              <div
                key={t}
                ref={thumbRefs[t]}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                className="q-slider-thumb"
                style={{ left: `${t === 0 ? pLo : pHi}%`, zIndex: t === 0 && pLo > 50 ? 2 : 1 }}
                aria-label={thumbLabels[t]}
                aria-valuemin={t === 0 ? min : lo + minDistance}
                aria-valuemax={t === 0 ? hi - minDistance : max}
                aria-valuenow={v}
                aria-valuetext={format(v)}
                aria-orientation="horizontal"
                aria-disabled={disabled || undefined}
                onKeyDown={onKeyDown(t)}
              />
            );
          })}
        </div>
      </div>
      {captionNode != null && <div className="q-slider-caption">{captionNode}</div>}
    </div>
  );
}
