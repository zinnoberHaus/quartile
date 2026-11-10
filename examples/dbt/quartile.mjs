// Resolves the Quartile build and markdown-it from this repository. In your own project, install
// them instead: `npm install @quartile/react markdown-it` (the package is not yet on npm; see the
// installation guide for a local tarball).

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const library = fileURLToPath(new URL('../../packages/react/', import.meta.url));
if (!existsSync(`${library}dist/server/index.js`)) {
  throw new Error('Build the library first: pnpm build:lib');
}
const load = (path) => import(pathToFileURL(`${library}${path}`).href);
export const lang = await load('dist/lang/index.js');
export const server = await load('dist/server/index.js');
export const MarkdownIt = createRequire(`${library}package.json`)('markdown-it');
export const embedScript = `${library}dist/embed/quartile.global.js`;
export const stylesheet = `${library}dist/styles.css`;
