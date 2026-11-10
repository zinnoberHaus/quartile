import { createRoot, hydrateRoot } from 'react-dom/client';
import { GalleryRoot, preloadPage } from './App';
import { legacyRedirect, matchRoute } from './routes';
import './gallery.css';

// Load every library stylesheet from source (tokens and base first, then components).
import '../../../packages/react/src/styles/tokens.css';
import '../../../packages/react/src/styles/base.css';

import.meta.glob('../../../packages/react/src/**/*.css', { eager: true });

const container = document.getElementById('root')!;

function start() {
  const { pathname, search } = window.location;
  // scripts/prerender.mjs writes each route's markup for its path without a query. Other paths
  // receive the empty app shell and mount fresh, like a query that changes the first render.
  const prerendered = container.dataset.prerenderedPath === pathname;
  const hydrate = prerendered && !search && container.dataset.prerender === 'hydrate';
  const route = matchRoute(pathname);

  function mount(loaded: boolean) {
    if (hydrate && loaded) hydrateRoot(container, <GalleryRoot />);
    else createRoot(container).render(<GalleryRoot />);
  }
  // Over prerendered markup, load the page first: React then hydrates or replaces it in one pass
  // instead of showing the loading skeleton in between. A failed load renders the error view.
  if (prerendered && route) {
    preloadPage(route).then(
      () => mount(true),
      () => mount(false),
    );
  } else {
    mount(false);
  }
}

// A path from before the app moved under /examples. The deployment redirects these itself
// (vercel.json); a host without those rules serves the app shell for them instead.
const moved = legacyRedirect(window.location.pathname);
if (!moved) {
  start();
} else {
  const target = `${moved}${window.location.search}${window.location.hash}`;
  if (matchRoute(moved)) {
    window.history.replaceState(window.history.state, '', target);
    start();
  } else {
    // A static file, such as the embed demo: only the server can answer for it.
    window.location.replace(target);
  }
}
