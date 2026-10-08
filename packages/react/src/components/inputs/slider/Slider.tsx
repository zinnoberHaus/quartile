import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useId,
  useRef,
} from 'react';
import { cx } from '../../../lib/cx';
import { useControllable } from '../../../lib/useControllable';
import { toPercent, valueFromKey, valueFromPointer } from './sliderMath';

export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Called once when a drag or key press ends. */
  onChangeEnd?: (value: number) => void;
  /** Formats the value readout and `aria-valuetext`. */
  format?: (value: number) => string;
  label?: ReactNode;
  /** Show the formatted value at the right of the label row. Default true. */
  showValue?: boolean;
  /** `ink` for settings, `signal` for controls that filter data. */
  tone?: 'ink' | 'signal';
  disabled?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible name when there is no visible `label`. */
  'aria-label'?: string;
}

/**
 * Pointer and keyboard handling shared by Slider and RangeSlider: calls `onDrag` with the snapped
 * value under the pointer while a drag is active, and `onEnd` when it finishes.
 */
export function useSliderDrag(opts: {
  trackRef: RefObject<HTMLElement | null>;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onStart: (value: number) => void;
  onDrag: (value: number) => void;
  onEnd: () => void;
}) {
  const dragging = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const valueAt = (clientX: number) => {
    const o = optsRef.current;
    const r = o.trackRef.current?.getBoundingClientRect();
    if (!r) return o.min;
    return valueFromPointer(clientX, r.left, r.width, o.min, o.max, o.step);
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (optsRef.current.disabled || e.button !== 0) return;
      e.preventDefault();
      dragging.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      optsRef.current.onStart(valueAt(e.clientX));
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (dragging.current) optsRef.current.onDrag(valueAt(e.clientX));
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      optsRef.current.onEnd();
    },
    onPointerCancel: () => {
      if (dragging.current) {
        dragging.current = false;
        optsRef.current.onEnd();
      }
    },
  };
}

const identity = (v: number) => String(v);

/** A single-value slider. ← → ↑ ↓ step, PageUp/PageDown and Shift take bigger steps, Home/End jump. */
export function Slider({
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
  tone = 'ink',
  disabled,
  id,
  className,
  style,
  'aria-label': ariaLabel,
}: SliderProps) {
  const autoId = useId();
  const labelId = `${autoId}-label`;
  const [value, setValue] = useControllable(valueProp, defaultValue ?? min, onChange);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  latest.current = value;

  const set = (v: number) => {
    if (v !== latest.current) {
      latest.current = v;
      setValue(v);
    }
  };
  const drag = useSliderDrag({
    trackRef,
    min,
    max,
    step,
    disabled,
    onStart: (v) => {
      set(v);
      thumbRef.current?.focus();
    },
    onDrag: set,
    onEnd: () => onChangeEnd?.(latest.current),
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const next = valueFromKey(e.key, value, min, max, step, e.shiftKey);
    if (next == null) return;
    e.preventDefault();
    set(next);
    onChangeEnd?.(next);
  };

  const pct = toPercent(value, min, max);
  return (
    <div
      className={cx('q-slider', className)}
      data-tone={tone}
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
          {showValue && <span className="q-slider-value">{format(value)}</span>}
        </div>
      )}
      <div ref={trackRef} className="q-slider-track" {...drag}>
        <span className="q-slider-rail" />
        <span className="q-slider-fill" style={{ left: 0, width: `${pct}%` }} />
        <div
          ref={thumbRef}
          id={id}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          className="q-slider-thumb"
          style={{ left: `${pct}%` }}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={format(value)}
          aria-orientation="horizontal"
          aria-disabled={disabled || undefined}
          aria-labelledby={label != null ? labelId : undefined}
          aria-label={label == null ? ariaLabel : undefined}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
