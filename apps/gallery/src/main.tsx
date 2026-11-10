import { createRoot, hydrateRoot } from 'react-dom/client';
import { GalleryRoot, preloadPage } from './App';
import { matchRoute } from './routes';
import './gallery.css';

// Load every library stylesheet from source (tokens and base first, then components).
import '../../../packages/react/src/styles/tokens.css';
import '../../../packages/react/src/styles/base.css';

import.meta.glob('../../../packages/react/src/**/*.css', { eager: true });

const container = document.getElementById('root')!;
const { pathname, search } = window.location;
// scripts/prerender.mjs writes each route's markup for its path without a query. Other paths
// receive the home page's file and mount fresh, like a query that changes the first render.
const prerendered = container.dataset.prerenderedPath === pathname;
const hydrate = prerendered && !search && container.dataset.prerender === 'hydrate';

function mount(loaded: boolean) {
  if (hydrate && loaded) hydrateRoot(container, <GalleryRoot />);
  else createRoot(container).render(<GalleryRoot />);
}
// Over prerendered markup, load the page first: React then hydrates or replaces it in one pass
// instead of showing the loading skeleton in between. A failed load renders the error view.
if (prerendered) {
  preloadPage(matchRoute(pathname)).then(
    () => mount(true),
    () => mount(false),
  );
} else {
  mount(false);
}
