import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cx } from '../lib/cx';
import { type HostColors, readHostColors, watchHostTheme } from './host-theme';

/**
 * `light` and `dark` are fixed. `system` follows the reader's operating-system preference (in CSS,
 * so it is right before any script runs). `auto` matches the page around the root: its
 * background, text color and light/dark mode, re-read when the page switches themes.
 */
export type ThemeSetting = 'light' | 'dark' | 'system' | 'auto';
export type Density = 'comfortable' | 'compact';

/**
 * Map a host design system's CSS variables onto Quartile's tokens. These work in plain CSS, so
 * they also apply to server-rendered and static pages. `shadcn-hsl` is for Tailwind v3 projects
 * whose variables hold bare HSL channels.
 */
export type HostTheme =
  | 'shadcn'
  | 'shadcn-hsl'
  | 'vitepress'
  | 'docusaurus'
  | 'starlight'
  | 'mkdocs'
  | 'primer'
  | 'pico'
  | 'radix'
  | 'open-props';

export const HOST_THEMES: readonly HostTheme[] = [
  'shadcn',
  'shadcn-hsl',
  'vitepress',
  'docusaurus',
  'starlight',
  'mkdocs',
  'primer',
  'pico',
  'radix',
  'open-props',
];

interface QuartileContextValue {
  theme: 'light' | 'dark';
  density: Density;
  locale: string;
  timeZone?: string;
  /** Chart width assumed before a container is measured (server, static export, first paint). */
  initialWidth: number;
  /** Element overlays portal into, so they inherit the theme. */
  portalContainer: HTMLElement | null;
}

/** Width, in px, charts draw at before they can measure their container. */
export const DEFAULT_INITIAL_WIDTH = 640;

const QuartileContext = createContext<QuartileContextValue>({
  theme: 'light',
  density: 'comfortable',
  locale: 'en-US',
  initialWidth: DEFAULT_INITIAL_WIDTH,
  portalContainer: null,
});

export function useQuartile() {
  return useContext(QuartileContext);
}

export interface QuartileProviderProps {
  /** Light, dark, follow the operating system, or match the surrounding page (`auto`). */
  theme?: ThemeSetting;
  /** Take colors and font from a known design system's CSS variables. */
  host?: HostTheme;
  /** A brand color for selection and the primary series, e.g. "#e11d48" or "var(--brand)". */
  accent?: string;
  /** Comfortable for products, compact for analysts. Same components, one prop. */
  density?: Density;
  /** BCP 47 locale used by every formatter. */
  locale?: string;
  /** IANA time zone used to display timestamps. Defaults to the runtime's zone. */
  timeZone?: string;
  /**
   * Chart width in px assumed before a container can be measured: during server rendering, in
   * static exports and on the first client render. Charts scale that drawing to their container
   * and redraw at the measured width after mount. Defaults to 640.
   */
  initialWidth?: number;
  /** Shadow-part name for the root, so a page can style it from outside a shadow root. */
  part?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The operating-system preference after mount; null until known (server, first render). */
function useSystemTheme(enabled: boolean): 'light' | 'dark' | null {
  const [scheme, setScheme] = useState<'light' | 'dark' | null>(null);
  useIsoLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setScheme(mq.matches ? 'dark' : 'light');
    const on = (e: MediaQueryListEvent) => setScheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [enabled]);
  return enabled ? scheme : null;
}

/** The page's colors around `ref`, read after mount and whenever the page switches themes. */
function useHostColors(enabled: boolean, ref: RefObject<HTMLElement | null>) {
  const [colors, setColors] = useState<HostColors | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const read = () =>
      setColors((prev) => {
        const next = readHostColors(el);
        return prev &&
          next &&
          prev.background === next.background &&
          prev.text === next.text &&
          prev.scheme === next.scheme
          ? prev
          : next;
      });
    read();
    return watchHostTheme(el, read);
  }, [enabled, ref]);
  return enabled ? colors : null;
}

function validWidth(width: number) {
  return Number.isFinite(width) && width > 0 ? width : DEFAULT_INITIAL_WIDTH;
}

/** Scopes tokens, theme and density to a subtree. Wrap your app (or one dashboard) in it. */
export function QuartileProvider({
  theme = 'light',
  host,
  accent,
  density = 'comfortable',
  locale = 'en-US',
  timeZone,
  initialWidth = DEFAULT_INITIAL_WIDTH,
  part,
  className,
  style,
  children,
}: QuartileProviderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const system = useSystemTheme(theme === 'system');
  const hostColors = useHostColors(theme === 'auto', rootRef);
  // Before the browser can answer (server, first render), "system" and "auto" render as
  // data-theme="system": CSS picks light or dark from the reader's preference.
  const attr: 'light' | 'dark' | 'system' =
    theme === 'system'
      ? (system ?? 'system')
      : theme === 'auto'
        ? (hostColors?.scheme ?? 'system')
        : theme;
  const resolved: 'light' | 'dark' = attr === 'system' ? 'light' : attr;
  const hostAttr = host ?? (theme === 'auto' && hostColors ? 'auto' : undefined);
  const vars: Record<string, string> = {};
  if (hostColors && !host) {
    vars['--q-host-bg'] = hostColors.background;
    vars['--q-host-text'] = hostColors.text;
  }
  if (accent) vars['--q-host-accent'] = accent;
  const rootStyle = Object.keys(vars).length ? ({ ...vars, ...style } as CSSProperties) : style;
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  return (
    <QuartileContext.Provider
      value={{
        theme: resolved,
        density,
        locale,
        timeZone,
        initialWidth: validWidth(initialWidth),
        portalContainer: portal,
      }}
    >
      <div
        ref={rootRef}
        part={part}
        className={cx('q-root', className)}
        data-theme={attr}
        data-host={hostAttr}
        data-accent={accent ? '' : undefined}
        data-density={density}
        style={rootStyle}
      >
        {children}
        <div
          ref={setPortal}
          className="q-portal"
          data-theme={attr}
          data-host={hostAttr}
          data-accent={accent ? '' : undefined}
          data-density={density}
        />
      </div>
    </QuartileContext.Provider>
  );
}
