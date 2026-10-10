import { lazy, Suspense } from 'react';
import { usePath } from './router';

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

// The scratch page is for local development only and is left out of production builds.
const Scratch = import.meta.env.DEV
  ? lazy(() => import('./dev/Scratch').then((m) => ({ default: m.Scratch })))
  : null;

export function App() {
  const path = usePath();
  if (Scratch && path.startsWith('/_dev')) {
    return (
      <Suspense fallback={null}>
        <Scratch />
      </Suspense>
    );
  }
  const kind = path.split('/')[2];
  return (
    <Suspense fallback={<p role="status">Loading Quartile…</p>}>
      {path.startsWith('/examples/storefront') ? (
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
    </Suspense>
  );
}
