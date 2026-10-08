import { lazy, Suspense } from 'react';
import { DesignSystemPage } from './design-system/DesignSystemPage';
import { StorefrontExample } from './examples/storefront/StorefrontExample';
import { usePath } from './router';

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
  if (path.startsWith('/examples/storefront')) return <StorefrontExample />;
  return <DesignSystemPage />;
}
