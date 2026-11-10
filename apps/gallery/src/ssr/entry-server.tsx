/**
 * Server entry for scripts/prerender.mjs, built with `vite build --ssr`. It renders the same
 * <GalleryRoot> the browser hydrates, with the route's URL in place of window.location.
 */
import { prerender } from 'react-dom/static';
import { GalleryRoot, PAGE_MODULES } from '../App';
import { ServerLocation } from '../router';
import {
  EXAMPLES_PATH,
  GROUPS,
  LEGACY_REDIRECTS,
  pagesInGroup,
  REPOSITORY_URL,
  routes,
  SITE_NAME,
  SITE_URL,
  staticPages,
} from '../routes';
import { links } from '../shell/links';
import { headTags, NOT_FOUND_TITLE } from './head';

export {
  EXAMPLES_PATH,
  GROUPS,
  headTags,
  LEGACY_REDIRECTS,
  links,
  NOT_FOUND_TITLE,
  PAGE_MODULES,
  pagesInGroup,
  REPOSITORY_URL,
  routes,
  SITE_NAME,
  SITE_URL,
  staticPages,
};

/** Resolves once every lazy page and Suspense boundary has rendered; errors are collected. */
export async function renderRoute(path: string): Promise<{ html: string; errors: unknown[] }> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(
    <ServerLocation url={path}>
      <GalleryRoot />
    </ServerLocation>,
    {
      // Keep every Suspense boundary where it renders. By default React moves boundaries larger
      // than 12,800 bytes (a chart inside Streamdown's code-block Suspense, for example) to the
      // end of the HTML, hidden, and swaps them in with an inline script, so a reader without
      // JavaScript would see the loading fallback where the chart belongs.
      progressiveChunkSize: Number.POSITIVE_INFINITY,
      onError(error) {
        errors.push(error);
      },
    },
  );
  return { html: await new Response(prelude).text(), errors };
}
