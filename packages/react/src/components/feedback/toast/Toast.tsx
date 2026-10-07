import {
  type FocusEvent,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { IconX } from '../../../icons';
import { cx } from '../../../lib/cx';
import { Portal } from '../../../lib/floating';
import {
  DEFAULT_TOAST_DURATION,
  type ToastOptions,
  type ToastRecord,
  type ToastStore,
  type ToastTone,
  toast,
  toastStore,
} from './store';

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'neutral') return null;
  const path =
    tone === 'success' ? (
      <path d="M3 8.5l3 3 7-7" />
    ) : tone === 'error' ? (
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    ) : tone === 'warning' ? (
      <path d="M8 3.5v5.5M8 12.4v.1" />
    ) : (
      <path d="M8 7v5.5M8 3.6v.1" />
    );
  return (
    <span className="q-toast-icon" aria-hidden="true">
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {path}
      </svg>
    </span>
  );
}

export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  action?: ToastOptions['action'];
  tone?: ToastTone;
  /** Shows a close button and is called after the action runs. */
  onDismiss?: () => void;
}

/** One toast on the dark inverse surface. `<Toaster />` renders these; use directly for previews. */
export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { title, description, action, tone = 'neutral', onDismiss, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx('q-toast', className)} data-tone={tone} {...rest}>
      <ToneIcon tone={tone} />
      <div className="q-toast-content">
        <div className="q-toast-title">{title}</div>
        {description != null && <div className="q-toast-description">{description}</div>}
      </div>
      {action && (
        <button
          type="button"
          className="q-toast-action"
          onClick={() => {
            action.onClick();
            onDismiss?.();
          }}
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="q-toast-close"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <IconX size={12} />
        </button>
      )}
    </div>
  );
});

function ToastItem({
  record,
  paused,
  onDismiss,
}: {
  record: ToastRecord;
  paused: boolean;
  onDismiss: () => void;
}) {
  const duration = record.duration ?? DEFAULT_TOAST_DURATION;
  const remaining = useRef(duration);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // A replaced toast (same id) starts its timer over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the record is replaced
  useEffect(() => {
    remaining.current = duration;
  }, [record.createdAt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: timer restarts on pause/replace only
  useEffect(() => {
    if (!record.open || paused) return;
    if (!Number.isFinite(remaining.current) || remaining.current <= 0) return;
    const start = Date.now();
    const timer = setTimeout(() => dismissRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - start;
    };
  }, [paused, record.open, record.createdAt]);

  return (
    <li className="q-toaster-item" data-state={record.open ? 'open' : 'closed'}>
      <Toast
        title={record.title}
        description={record.description}
        action={record.action}
        tone={record.tone}
        onDismiss={onDismiss}
      />
    </li>
  );
}

export type ToasterPlacement =
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom'
  | 'top-right'
  | 'top-left'
  | 'top';

export interface ToasterProps {
  placement?: ToasterPlacement;
  /** Most toasts shown at once; older ones wait (default 3). */
  max?: number;
  /** Names the notification region (default "Notifications"). */
  label?: string;
  /** A store from `createToastStore()`; defaults to the one behind `toast()`. */
  store?: ToastStore;
}

/**
 * Renders toasts from `toast()`: a polite live region in a corner, newest nearest the edge.
 * Timers pause while the pointer or focus is inside the stack.
 */
export function Toaster({
  placement = 'bottom-right',
  max = 3,
  label = 'Notifications',
  store = toastStore,
}: ToasterProps) {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = toasts.slice(-max);
  return (
    <Portal>
      <section
        className="q-toaster"
        data-placement={placement}
        aria-label={label}
        aria-live="polite"
        aria-relevant="additions text"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e: FocusEvent<HTMLElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <ol className="q-toaster-list">
          {visible.map((t) => (
            <ToastItem
              key={t.id}
              record={t}
              paused={hovered || focused}
              onDismiss={() => store.dismiss(t.id)}
            />
          ))}
        </ol>
      </section>
    </Portal>
  );
}

/** `toast` and `dismiss` for components that prefer a hook. */
export function useToast() {
  return { toast, dismiss: toast.dismiss };
}
