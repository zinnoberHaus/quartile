import { useEffect, useRef } from 'react';

function isMac() {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  slash: '/',
};

/**
 * True when a keyboard event matches a combo such as `mod+k`, `shift+mod+p`, `t` or `escape`.
 * `mod` is ⌘ on Apple platforms and Ctrl elsewhere. Modifiers must match exactly.
 */
export function matchesHotkey(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  combo: string,
  mac = isMac(),
): boolean {
  const parts = combo.toLowerCase().split('+').filter(Boolean);
  const want = { meta: false, ctrl: false, alt: false, shift: false };
  let key = '';
  for (const part of parts) {
    if (part === 'mod') want[mac ? 'meta' : 'ctrl'] = true;
    else if (part === 'cmd' || part === 'meta') want.meta = true;
    else if (part === 'ctrl' || part === 'control') want.ctrl = true;
    else if (part === 'alt' || part === 'option') want.alt = true;
    else if (part === 'shift') want.shift = true;
    else key = KEY_ALIASES[part] ?? part;
  }
  if (combo.endsWith('++')) key = '+';
  const pressed = (event.key ?? '').toLowerCase();
  return (
    pressed === key &&
    event.metaKey === want.meta &&
    event.ctrlKey === want.ctrl &&
    event.altKey === want.alt &&
    event.shiftKey === want.shift
  );
}

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName);
}

export interface HotkeyOptions {
  enabled?: boolean;
  /** Also fire while typing in inputs (default: only for combos with ⌘/Ctrl/Alt). */
  allowInInputs?: boolean;
  /** Prevent the browser default (default true). */
  preventDefault?: boolean;
}

/** Calls `handler` when `combo` is pressed anywhere on the page, e.g. `useHotkey('mod+k', open)`. */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  { enabled = true, allowInInputs, preventDefault = true }: HotkeyOptions = {},
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const hasModifier = /(^|\+)(mod|cmd|meta|ctrl|control|alt|option)\+/i.test(combo);
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !matchesHotkey(event, combo)) return;
      if (!(allowInInputs ?? hasModifier) && isEditable(event.target)) return;
      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [combo, enabled, allowInInputs, preventDefault]);
}
