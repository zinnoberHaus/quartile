import {
  Component,
  type ComponentType,
  lazy,
  type ReactNode,
  StrictMode,
  Suspense,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  completeNavigation,
  Link,
  type RouteLocation,
  RouteLocationProvider,
  useBrowserLocation,
} from './router';
import { EXAMPLES_PATH, type GalleryRoute, matchRoute, normalizePath, type PageId } from './routes';
import { SiteAnalytics } from './SiteAnalytics';
import { applyRouteHead } from './ssr/head';
import './shell/transitions.css';

/**
 * A code-split page and the module it lives in (prerendering links that module's stylesheets).
 * `preload` lets main.tsx load it before the first render, so prerendered markup is hydrated or
 * replaced in one pass rather than through the loading skeleton.
 */
function page<P extends object>(module: string, load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (component) => (loaded = component),
      (error) => {
        pending = undefined;
        throw error;
      },
    ));
  const Lazy = lazy(() => preload().then((component) => ({ default: component })));
  function CodeSplitPage(props: P) {
    // Chosen once per mount: swapping Lazy for the loaded component later would remount it.
    const [Component] = useState(() => loaded ?? Lazy);
    return <Component {...props} />;
  }
  return Object.assign(CodeSplitPage, { module, preload });
}

const markdownPages = 'src/examples/markdown/MarkdownPages.tsx';
const PAGES = {
  index: page('src/examples/index/ExamplesIndex.tsx', () =>
    import('./examples/index/ExamplesIndex').then((m) => m.ExamplesIndex),
  ),
  playground: page(markdownPages, () =>
    import('./examples/markdown/MarkdownPages').then((m) => m.LanguagePage),
  ),
  'ai-answer': page(markdownPages, () =>
    import('./examples/markdown/MarkdownPages').then((m) => m.AIAnswerPage),
  ),
  'markdown-report': page(markdownPages, () =>
    import('./examples/markdown/MarkdownPages').then((m) => m.MarkdownReportPage),
  ),
  storefront: page('src/examples/storefront/StorefrontExample.tsx', () =>
    import('./examples/storefront/StorefrontExample').then((m) => m.StorefrontExample),
  ),
  workbench: page('src/examples/workbench/Workbench.tsx', () =>
    import('./examples/workbench/Workbench').then((m) => m.Workbench),
  ),
  scale: page('src/examples/scale/ScaleWorkbench.tsx', () =>
    import('./examples/scale/ScaleWorkbench').then((m) => m.ScaleWorkbench),
  ),
  science: page('src/examples/science/ScienceWorkbench.tsx', () =>
    import('./examples/science/ScienceWorkbench').then((m) => m.ScienceWorkbench),
  ),
  assistant: page('src/examples/science/AssistantWorkbench.tsx', () =>
    import('./examples/science/AssistantWorkbench').then((m) => m.AssistantWorkbench),
  ),
  formatting: page('src/examples/formatting/FormattingWorkbench.tsx', () =>
    import('./examples/formatting/FormattingWorkbench').then((m) => m.FormattingWorkbench),
  ),
  studio: page('src/examples/studio/StudioPage.tsx', () =>
    import('./examples/studio/StudioPage').then((m) => m.StudioPage),
  ),
} satisfies Record<PageId, { module: string; preload: () => Promise<unknown> }>;

/** The source module of each page, for the prerender script's chunk manifest lookups. */
export const PAGE_MODULES = Object.fromEntries(
  Object.entries(PAGES).map(([id, entry]) => [id, entry.module]),
) as Record<PageId, string>;

/** Loads the page a route renders. */
export function preloadPage(route: GalleryRoute): Promise<unknown> {
  return PAGES[route.page].preload();
}

// Local development only, left out of production builds: the component catalog (a test bed for
// every library component) at /examples/_design and a scratch page at /examples/_dev. Neither is
// in the route table, so neither is prerendered, listed in the sitemap or linked.
const DesignSystem = import.meta.env.DEV
  ? lazy(() =>
      import('./design-system/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage })),
    )
  : null;
const Scratch = import.meta.env.DEV
  ? lazy(() => import('./dev/Scratch').then((m) => ({ default: m.Scratch })))
  : null;

function devPage(pathname: string) {
  const path = normalizePath(pathname);
  if (path === `${EXAMPLES_PATH}/_design`) return DesignSystem;
  if (path === `${EXAMPLES_PATH}/_dev`) return Scratch;
  return null;
}

function RoutePage({ route }: { route: GalleryRoute }) {
  switch (route.page) {
    case 'workbench': {
      const Workbench = PAGES.workbench;
      return <Workbench key={route.kind} kind={route.kind} />;
    }
    case 'science': {
      const ScienceWorkbench = PAGES.science;
      return <ScienceWorkbench key={route.kind} kind={route.kind} />;
    }
    default: {
      const Page = PAGES[route.page];
      return <Page />;
    }
  }
}

function InitialLoading() {
  return (
    <div className="g-route-loading" role="status" aria-label="Loading Quartile workspace">
      <div className="g-route-loading-header">
        <strong>quartile</strong>
        <span>Opening workspace…</span>
      </div>
      <div className="g-route-loading-body" aria-hidden="true">
        <div className="g-route-loading-title" />
        <div className="g-route-loading-line" />
        <div className="g-route-loading-plot" />
        <div className="g-route-loading-line" />
      </div>
    </div>
  );
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; location: RouteLocation },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <RouteFrame location={this.props.location}>
        <main className="g-route-error">
          <h1>This workspace could not be opened.</h1>
          <p>
            The page or one of its assets failed to load. Your URL is preserved so you can retry.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
          <a href={EXAMPLES_PATH}>All examples</a>
        </main>
      </RouteFrame>
    );
  }
}

/** A path under /examples that no example lives at: the server sent the app shell for it. */
function NotFound() {
  return (
    <main className="g-route-error">
      <h1>There is no example at this address.</h1>
      <p>The link may be out of date, or the example may have moved.</p>
      <Link to={EXAMPLES_PATH}>All examples</Link>
    </main>
  );
}

function RouteFrame({ location, children }: { location: RouteLocation; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) completeNavigation(location, ref.current);
  }, [location]);
  return (
    <RouteLocationProvider location={location}>
      <div className="g-route-content" ref={ref} data-route={location.pathname} tabIndex={-1}>
        {children}
      </div>
    </RouteLocationProvider>
  );
}

export function App() {
  const requested = useBrowserLocation();
  const location = useDeferredValue(requested);
  const pending = requested !== location;
  const path = location.pathname;
  const route = matchRoute(path);
  const DevPage = devPage(path);
  // After the page commits, so it also wins over a title a page sets for itself.
  useEffect(() => {
    if (!DevPage) applyRouteHead(route);
  }, [route, DevPage]);
  if (DevPage) {
    return (
      <Suspense fallback={<InitialLoading />}>
        <RouteErrorBoundary key={path + location.search} location={location}>
          <RouteFrame location={location}>
            <DevPage />
          </RouteFrame>
        </RouteErrorBoundary>
      </Suspense>
    );
  }
  return (
    <>
      <div
        className="g-route-progress"
        data-pending={pending || undefined}
        role="status"
        aria-live="polite"
      >
        {pending ? 'Opening next workspace…' : ''}
      </div>
      <Suspense fallback={<InitialLoading />}>
        <RouteErrorBoundary key={path + location.search} location={location}>
          <RouteFrame key={path + location.search} location={location}>
            {route ? <RoutePage route={route} /> : <NotFound />}
          </RouteFrame>
        </RouteErrorBoundary>
      </Suspense>
    </>
  );
}

/** The whole page. The prerender renders exactly this tree, so hydration sees the same one. */
export function GalleryRoot() {
  return (
    <StrictMode>
      <App />
      <SiteAnalytics />
    </StrictMode>
  );
}
