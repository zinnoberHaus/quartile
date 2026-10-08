import {
  forwardRef,
  type HTMLAttributes,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { type Placement, Portal, useFloating } from '../../../lib/floating';

export interface FloatingPanelProps extends HTMLAttributes<HTMLDivElement> {
  anchorRef: RefObject<HTMLElement | null>;
  placement?: Placement;
  offset?: number;
  matchWidth?: boolean;
  /** Called once, when the panel has been measured and made visible (safe to move focus in). */
  onPositioned?: () => void;
}

/**
 * Renders into the portal layer and positions itself against `anchorRef`. `useFloating` runs inside
 * the portal so it measures the panel after it mounts; render it only while open.
 */
export const FloatingPanel = forwardRef<HTMLDivElement, FloatingPanelProps>(
  function FloatingPanel(props, ref) {
    return (
      <Portal>
        <PositionedPanel ref={ref} {...props} />
      </Portal>
    );
  },
);

const PositionedPanel = forwardRef<HTMLDivElement, FloatingPanelProps>(function PositionedPanel(
  { anchorRef, placement, offset = 6, matchWidth, onPositioned, style, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);
  const { style: pos } = useFloating(anchorRef, innerRef, {
    open: true,
    placement,
    offset,
    matchWidth,
  });
  const visible = pos.visibility === 'visible';
  const cb = useRef(onPositioned);
  cb.current = onPositioned;
  const done = useRef(false);
  useEffect(() => {
    if (visible && !done.current) {
      done.current = true;
      cb.current?.();
    }
  }, [visible]);
  return <div ref={innerRef} style={{ ...pos, ...style }} {...rest} />;
});
