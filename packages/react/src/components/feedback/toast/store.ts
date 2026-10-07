import type { ReactNode } from 'react';

export type ToastTone = 'neutral' | 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  /** One action button, e.g. Undo or Copy link. Clicking it also dismisses the toast. */
  action?: { label: ReactNode; onClick: () => void };
  tone?: ToastTone;
  /** Auto-dismiss after this many ms (default 5000). `Infinity` keeps it until dismissed. */
  duration?: number;
  /** Reuse an id to replace a toast in place (e.g. "Exporting…" → "Exported"). */
  id?: string;
}

export interface ToastRecord extends Omit<ToastOptions, 'id'> {
  id: string;
  /** False while the exit animation plays. */
  open: boolean;
  createdAt: number;
}

type Listener = () => void;

export const DEFAULT_TOAST_DURATION = 5000;
/** Time the exit animation gets before a dismissed toast is removed, ms. */
export const TOAST_EXIT_MS = 180;

/** A tiny external store; `toast()` works from anywhere, `<Toaster />` subscribes. */
export function createToastStore() {
  let toasts: ToastRecord[] = [];
  let seq = 0;
  const listeners = new Set<Listener>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const emit = () => {
    for (const l of listeners) l();
  };

  const remove = (id: string) => {
    timers.delete(id);
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  };

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return toasts;
    },
    show(options: ToastOptions): string {
      const id = options.id ?? `q-toast-${++seq}`;
      const record: ToastRecord = {
        tone: 'neutral',
        duration: DEFAULT_TOAST_DURATION,
        ...options,
        id,
        open: true,
        createdAt: Date.now(),
      };
      const pending = timers.get(id);
      if (pending) {
        clearTimeout(pending);
        timers.delete(id);
      }
      const exists = toasts.some((t) => t.id === id);
      toasts = exists ? toasts.map((t) => (t.id === id ? record : t)) : [...toasts, record];
      emit();
      return id;
    },
    /** Starts the exit animation, then removes. Without an id, dismisses every toast. */
    dismiss(id?: string) {
      const targets = toasts.filter((t) => t.open && (id == null || t.id === id));
      if (targets.length === 0) return;
      const ids = new Set(targets.map((t) => t.id));
      toasts = toasts.map((t) => (ids.has(t.id) ? { ...t, open: false } : t));
      emit();
      for (const t of targets) {
        timers.set(
          t.id,
          setTimeout(() => remove(t.id), TOAST_EXIT_MS),
        );
      }
    },
    /** Removes everything immediately (tests, route changes). */
    clear() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      toasts = [];
      emit();
    },
  };
}

export type ToastStore = ReturnType<typeof createToastStore>;

/** The default store behind `toast()` and `<Toaster />`. */
export const toastStore = createToastStore();

/**
 * Shows a toast and returns its id. Needs one `<Toaster />` mounted somewhere in the app.
 * `toast.dismiss(id)` closes one; `toast.dismiss()` closes all.
 */
export const toast = Object.assign((options: ToastOptions) => toastStore.show(options), {
  dismiss: (id?: string) => toastStore.dismiss(id),
});
