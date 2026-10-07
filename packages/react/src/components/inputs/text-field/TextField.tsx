import {
  type CSSProperties,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from 'react';
import { cx } from '../../../lib/cx';
import { describedBy, FormField, hasMessage } from '../field/FormField';

export type InputSize = 'sm' | 'md' | 'lg';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: ReactNode;
  /** Help text under the input. */
  hint?: ReactNode;
  /** Error message; sets `aria-invalid`. Pass `true` for invalid styling without a message. */
  error?: ReactNode;
  /** Attached segment before the input, e.g. a currency symbol. */
  prefix?: ReactNode;
  /** Text inside the input's right edge, e.g. a unit ("USD") or a status ("locked"). */
  suffix?: ReactNode;
  /** Icon inside the input's left edge. */
  icon?: ReactNode;
  /** Keyboard hint shown at the right edge, e.g. "⌘K". Display only unless `focusOnShortcut`. */
  shortcut?: string;
  /** Focus the input when the `shortcut` chord is pressed anywhere (⌘ also matches Ctrl). */
  focusOnShortcut?: boolean;
  size?: InputSize;
  /** Mono, tabular figures. Defaults to true for numeric `inputMode`/`type`. */
  mono?: boolean;
  /** Class for the root column (label, control, message). */
  className?: string;
  style?: CSSProperties;
  /** Class for the bordered control box. */
  controlClassName?: string;
}

/** Parses "⌘K", "Ctrl+K", "Mod+K" or "/" into a matcher for keydown events. */
export function shortcutMatcher(shortcut: string): ((e: KeyboardEvent) => boolean) | null {
  const s = shortcut.replace(/\s+/g, '');
  const mod = /^(⌘|cmd\+|ctrl\+|mod\+|⌃)/i.test(s);
  const key = s.replace(/^(⌘|cmd\+|ctrl\+|mod\+|⌃)/i, '').toLowerCase();
  if (key.length !== 1) return null;
  return (e) =>
    e.key.toLowerCase() === key &&
    (mod ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey && !e.altKey);
}

function ariaShortcut(shortcut: string) {
  const s = shortcut.replace(/\s+/g, '');
  const key = s.replace(/^(⌘|cmd\+|ctrl\+|mod\+|⌃)/i, '').toUpperCase();
  return key.length === s.length ? key : `Meta+${key} Control+${key}`;
}

/** Text input with label, hint, error, prefix · suffix, icon and shortcut hint. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    hint,
    error,
    prefix,
    suffix,
    icon,
    shortcut,
    focusOnShortcut = false,
    size = 'md',
    mono,
    className,
    style,
    controlClassName,
    id,
    disabled,
    readOnly,
    type = 'text',
    inputMode,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const messageId = `${autoId}-msg`;
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const invalid = hasMessage(error) || error === true;
  const isMono = mono ?? (type === 'number' || inputMode === 'decimal' || inputMode === 'numeric');

  useEffect(() => {
    if (!focusOnShortcut || !shortcut) return;
    const match = shortcutMatcher(shortcut);
    if (!match) return;
    const onKey = (e: KeyboardEvent) => {
      if (!match(e)) return;
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing && !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focusOnShortcut, shortcut]);

  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      disabled={disabled}
      htmlFor={inputId}
      messageId={messageId}
      className={className}
      style={style}
    >
      <div
        className={cx('q-input', controlClassName)}
        data-size={size}
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        data-readonly={readOnly || undefined}
        data-has-prefix={prefix != null || undefined}
        data-has-icon={icon != null || undefined}
        data-has-end={suffix != null || shortcut != null || undefined}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {prefix != null && (
          <span className="q-input-prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        {icon != null && (
          <span className="q-input-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type={type}
          inputMode={inputMode}
          className="q-input-native"
          data-mono={isMono || undefined}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(messageId, hint, error, ariaDescribedBy)}
          aria-keyshortcuts={focusOnShortcut && shortcut ? ariaShortcut(shortcut) : undefined}
          {...rest}
        />
        {suffix != null && <span className="q-input-suffix">{suffix}</span>}
        {shortcut != null && (
          <kbd className="q-input-kbd" aria-hidden="true">
            {shortcut}
          </kbd>
        )}
      </div>
    </FormField>
  );
});
