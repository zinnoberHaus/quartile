import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { cx } from '../lib/cx';

export type ThemeSetting = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

interface QuartileContextValue {
  theme: 'light' | 'dark';
  density: Density;
  locale: string;
  /** Element overlays portal into, so they inherit the theme. */
  portalContainer: HTMLElement | null;
}

const QuartileContext = createContext<QuartileContextValue>({
  theme: 'light',
  density: 'comfortable',
  locale: 'en-US',
  portalContainer: null,
});

export function useQuartile() {
  return useContext(QuartileContext);
}

export interface QuartileProviderProps {
  /** Light, dark, or follow the operating system. */
  theme?: ThemeSetting;
  /** Comfortable for products, compact for analysts. Same components, one prop. */
  density?: Density;
  /** BCP 47 locale used by every formatter. */
  locale?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

function useSystemTheme(enabled: boolean): 'light' | 'dark' {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [enabled]);
  return dark ? 'dark' : 'light';
}

/** Scopes tokens, theme and density to a subtree. Wrap your app (or one dashboard) in it. */
export function QuartileProvider({
  theme = 'light',
  density = 'comfortable',
  locale = 'en-US',
  className,
  style,
  children,
}: QuartileProviderProps) {
  const system = useSystemTheme(theme === 'system');
  const resolved = theme === 'system' ? system : theme;
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  return (
    <QuartileContext.Provider value={{ theme: resolved, density, locale, portalContainer: portal }}>
      <div
        className={cx('q-root', className)}
        data-theme={resolved}
        data-density={density}
        style={style}
      >
        {children}
        <div ref={setPortal} className="q-portal" data-theme={resolved} data-density={density} />
      </div>
    </QuartileContext.Provider>
  );
}
