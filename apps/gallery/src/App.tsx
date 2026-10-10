import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useDeferredValue,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  completeNavigation,
  type RouteLocation,
  RouteLocationProvider,
  useBrowserLocation,
} from './router';
import './shell/transitions.css';

const DesignSystemPage = lazy(() =>
  import('./design-system/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage })),
);
const StorefrontExample = lazy(() =>
  import('./examples/storefront/StorefrontExample').then((m) => ({ default: m.StorefrontExample })),
);
const Workbench = lazy(() =>
  import('./examples/workbench/Workbench').then((m) => ({ default: m.Workbench })),
);
const ScaleWorkbench = lazy(() =>
  import('./examples/scale/ScaleWorkbench').then((m) => ({ default: m.ScaleWorkbench })),
);
const ScienceWorkbench = lazy(() =>
  import('./examples/science/ScienceWorkbench').then((m) => ({ default: m.ScienceWorkbench })),
);
const AssistantWorkbench = lazy(() =>
  import('./examples/science/AssistantWorkbench').then((m) => ({ default: m.AssistantWorkbench })),
);
const StudioPage = lazy(() =>
  import('./examples/studio/StudioPage').then((m) => ({ default: m.StudioPage })),
);

// The scratch page is for local development only and is left out of production builds.
const Scratch = import.meta.env.DEV
  ? lazy(() => import('./dev/Scratch').then((m) => ({ default: m.Scratch })))
  : null;

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
          <a href="/">Return to the gallery</a>
        </main>
      </RouteFrame>
    );
  }
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
  if (Scratch && path.startsWith('/_dev')) {
    return (
      <Suspense fallback={<InitialLoading />}>
        <RouteErrorBoundary key={path + location.search} location={location}>
          <RouteFrame location={location}>
            <Scratch />
          </RouteFrame>
        </RouteErrorBoundary>
      </Suspense>
    );
  }
  const kind = path.split('/')[2];
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
            {path === '/studio' ? (
              <StudioPage />
            ) : path.startsWith('/examples/storefront') ? (
              <StorefrontExample />
            ) : path === '/examples/scale' ? (
              <ScaleWorkbench />
            ) : path === '/examples/assistant' ? (
              <AssistantWorkbench />
            ) : kind === 'explore' || kind === 'cohorts' || kind === 'model-evaluation' ? (
              <ScienceWorkbench key={kind} kind={kind} />
            ) : path.startsWith('/examples/') &&
              (kind === 'saas' || kind === 'operations' || kind === 'ai-dashboard') ? (
              <Workbench key={kind} kind={kind} />
            ) : (
              <DesignSystemPage />
            )}
          </RouteFrame>
        </RouteErrorBoundary>
      </Suspense>
    </>
  );
}
