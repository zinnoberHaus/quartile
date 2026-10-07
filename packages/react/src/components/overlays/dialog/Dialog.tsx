import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useId,
  useRef,
  useState,
} from 'react';
import { IconX } from '../../../icons';
import { cx } from '../../../lib/cx';
import { Portal } from '../../../lib/floating';
import { Button } from '../../button/Button';
import { useModal } from '../internal/modal';

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned buttons; the primary action goes last. */
  footer?: ReactNode;
  /** sm 400 · md 520 · lg 720 px max width. */
  size?: DialogSize;
  titleId?: string;
  descriptionId?: string;
  /** Shows a close button in the corner. */
  onClose?: () => void;
  children?: ReactNode;
}

/** The dialog surface without the modal behavior. Use directly for static previews. */
export const DialogPanel = forwardRef<HTMLDivElement, DialogPanelProps>(function DialogPanel(
  {
    title,
    description,
    footer,
    size = 'sm',
    titleId,
    descriptionId,
    onClose,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <div ref={ref} className={cx('q-dialog', className)} data-size={size} {...rest}>
      <div className="q-dialog-header">
        <h2 id={titleId} className="q-dialog-title">
          {title}
        </h2>
        {onClose && (
          <button type="button" className="q-dialog-close" aria-label="Close" onClick={onClose}>
            <IconX size={14} />
          </button>
        )}
      </div>
      {description != null && (
        <div id={descriptionId} className="q-dialog-description">
          {description}
        </div>
      )}
      {children != null && <div className="q-dialog-body">{children}</div>}
      {footer != null && <div className="q-dialog-footer">{footer}</div>}
    </div>
  );
});

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  /** `alertdialog` for confirmations that interrupt. */
  role?: 'dialog' | 'alertdialog';
  /** Element to focus on open (default: the first focusable element). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Close on Escape and backdrop click (default true). */
  dismissible?: boolean;
  /** Close button in the corner (default false). */
  showClose?: boolean;
  className?: string;
}

/**
 * A modal dialog: traps focus, closes on Escape and backdrop click, locks page scroll and returns
 * focus to the opener.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'sm',
  role = 'dialog',
  initialFocus,
  dismissible = true,
  showClose = false,
  className,
}: DialogProps) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const id = useId();
  const close = () => onOpenChange(false);
  const onKeyDown = useModal(open, panel, {
    initialFocus,
    onEscape: dismissible ? close : undefined,
  });
  if (!open) return null;
  return (
    <Portal>
      <div
        className="q-dialog-backdrop"
        onPointerDown={(e) => {
          if (dismissible && e.target === e.currentTarget) close();
        }}
      >
        <DialogPanel
          ref={setPanel}
          role={role}
          aria-modal="true"
          aria-labelledby={`${id}-title`}
          aria-describedby={description != null ? `${id}-desc` : undefined}
          tabIndex={-1}
          title={title}
          titleId={`${id}-title`}
          description={description}
          descriptionId={`${id}-desc`}
          footer={footer}
          size={size}
          onClose={showClose ? close : undefined}
          className={cx('q-dialog-floating', className)}
          onKeyDown={onKeyDown}
        >
          {children}
        </DialogPanel>
      </div>
    </Portal>
  );
}

export interface ConfirmDialogProps
  extends Omit<DialogProps, 'footer' | 'role' | 'initialFocus' | 'showClose'> {
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** Red confirm button for actions that delete or cannot be undone. */
  destructive?: boolean;
  /** Runs on confirm. Return a promise to show a loading state; the dialog closes when it resolves. */
  onConfirm: () => unknown;
  onCancel?: () => void;
}

/** A confirmation: Cancel and one confirm action. Focus starts on Cancel. */
export function ConfirmDialog({
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  onOpenChange,
  dismissible = true,
  ...rest
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    const result = onConfirm();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setPending(true);
      try {
        await result;
        onOpenChange(false);
      } catch {
        // Keep the dialog open so the caller can show the error.
      } finally {
        setPending(false);
      }
    } else {
      onOpenChange(false);
    }
  };
  return (
    <Dialog
      {...rest}
      role="alertdialog"
      onOpenChange={(next) => {
        if (!next && pending) return;
        if (!next) onCancel?.();
        onOpenChange(next);
      }}
      dismissible={dismissible && !pending}
      initialFocus={cancelRef}
      footer={
        <>
          <Button
            ref={cancelRef}
            variant="secondary"
            disabled={pending}
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            loading={pending}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
