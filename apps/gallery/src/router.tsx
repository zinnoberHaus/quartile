import {
  type AnchorHTMLAttributes,
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';

export interface RouteLocation {
  pathname: string;
  search: string;
  hash: string;
  key: string;
  action: 'initial' | 'push' | 'replace' | 'pop';
}

const HISTORY_KEY = '__quartileRouteKey';
const EVENT = 'quartile:navigate';
let sequence = 0;
let snapshot: RouteLocation | undefined;
let visibleKey: string | undefined;
let completedKey: string | undefined;
const positions = new Map<string, [number, number]>();
const LocationContext = createContext<RouteLocation | null>(null);

function key() {
  return `q-${Date.now().toString(36)}-${++sequence}`;
}
function historyKey() {
  let value = window.history.state?.[HISTORY_KEY];
  if (typeof value !== 'string') {
    value = key();
    window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: value }, '');
  }
  return value as string;
}
function read(action: RouteLocation['action']): RouteLocation {
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash, key: historyKey(), action };
}
function getSnapshot() {
  snapshot ??= read('initial');
  return snapshot;
}
function savePosition() {
  if (visibleKey) positions.set(visibleKey, [window.scrollX, window.scrollY]);
}
function subscribe(notify: () => void) {
  const on = (event: Event) => {
    savePosition();
    const action = event instanceof CustomEvent ? event.detail : 'pop';
    const next = read(action);
    const previous = getSnapshot();
    if (
      previous.key === next.key &&
      previous.pathname === next.pathname &&
      previous.search === next.search &&
      previous.hash === next.hash
    )
      return;
    snapshot = next;
    notify();
  };
  window.addEventListener(EVENT, on);
  window.addEventListener('popstate', on);
  window.addEventListener('hashchange', on);
  window.addEventListener('scroll', savePosition, { passive: true });
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener('popstate', on);
    window.removeEventListener('hashchange', on);
    window.removeEventListener('scroll', savePosition);
  };
}

/** App owns the urgent URL. Route children receive the last fully rendered snapshot. */
export function useBrowserLocation() {
  const location = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);
  return location;
}

export function RouteLocationProvider({
  location,
  children,
}: {
  location: RouteLocation;
  children: ReactNode;
}) {
  return <LocationContext.Provider value={location}>{children}</LocationContext.Provider>;
}

/** Includes query parameters, e.g. new URLSearchParams(useLocation().search).get('source'). */
export function useLocation() {
  const location = useContext(LocationContext);
  if (!location) throw new Error('useLocation must be used inside the gallery route.');
  return location;
}
export function usePath() {
  return useLocation().pathname;
}

function hashTarget(hash: string): HTMLElement | null {
  if (!hash) return null;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}
function focus(target: HTMLElement | null) {
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/** Runs only after the lazy page commits, never when merely requesting a route. */
export function completeNavigation(location: RouteLocation, container: HTMLElement) {
  if (completedKey === location.key && visibleKey === location.key) return;
  const initial = completedKey === undefined;
  completedKey = location.key;
  visibleKey = location.key;
  const target = hashTarget(location.hash);
  const restored = location.action === 'pop' ? positions.get(location.key) : undefined;
  if (restored) window.scrollTo({ left: restored[0], top: restored[1], behavior: 'instant' });
  else if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  else if (!initial) window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  if (target) focus(target);
  else if (!initial)
    focus(
      container.querySelector<HTMLElement>('h1') ??
        container.querySelector<HTMLElement>('main') ??
        container,
    );
  savePosition();
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) {
    window.location.assign(url.href);
    return;
  }
  if (url.href === window.location.href) {
    const target = hashTarget(url.hash);
    if (target) {
      target.scrollIntoView({ behavior: 'instant' });
      focus(target);
    }
    return;
  }
  savePosition();
  const state = { ...window.history.state, [HISTORY_KEY]: key() };
  window.history[options.replace ? 'replaceState' : 'pushState'](state, '', url);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: options.replace ? 'replace' : 'push' }));
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
}

export function Link({ to, replace, children, onClick, ...props }: LinkProps) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      (props.target && props.target !== '_self') ||
      props.download !== undefined
    )
      return;
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol))
      return;
    event.preventDefault();
    navigate(to, { replace });
  };
  return (
    <a {...props} href={to} onClick={click}>
      {children}
    </a>
  );
}
