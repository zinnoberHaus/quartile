/**
 * Server entry for scripts/prerender.mjs, built with `vite build --ssr`. It renders the same
 * <GalleryRoot> the browser hydrates, with the route's URL in place of window.location.
 */
import { prerender } from 'react-dom/static';
import { GalleryRoot, PAGE_MODULES } from '../App';
import { ServerLocation } from '../router';
import { REPOSITORY_URL, routes, SITE_NAME, SITE_URL } from '../routes';
import { headTags } from './head';

export { headTags, PAGE_MODULES, REPOSITORY_URL, routes, SITE_NAME, SITE_URL };

/** Resolves once every lazy page and Suspense boundary has rendered; errors are collected. */
export async function renderRoute(path: string): Promise<{ html: string; errors: unknown[] }> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(
    <ServerLocation url={path}>
      <GalleryRoot />
    </ServerLocation>,
    {
      onError(error) {
        errors.push(error);
      },
    },
  );
  return { html: await new Response(prelude).text(), errors };
}
