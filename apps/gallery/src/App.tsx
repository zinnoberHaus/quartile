import { DesignSystemPage } from './design-system/DesignSystemPage';
import { Scratch } from './dev/Scratch';
import { StorefrontExample } from './examples/storefront/StorefrontExample';
import { usePath } from './router';

export function App() {
  const path = usePath();
  if (path.startsWith('/_dev')) return <Scratch />;
  if (path.startsWith('/examples/storefront')) return <StorefrontExample />;
  return <DesignSystemPage />;
}
