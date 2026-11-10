import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

// The standalone embed: React, the components and the stylesheet in one browser file, for a
// <script> tag on any page. Runs after the main build, which writes dist/styles.css.
const stylesheet = fileURLToPath(new URL('./dist/styles.css', import.meta.url));

export default defineConfig({
  entry: { 'embed/quartile': 'src/embed/standalone.ts' },
  format: ['esm', 'iife'],
  globalName: 'Quartile',
  outExtension: ({ format }) => ({ js: format === 'iife' ? '.global.js' : '.js' }),
  platform: 'browser',
  target: 'es2022',
  noExternal: [/.*/],
  minify: true,
  // A drop-in script; the module entries keep their maps. Keeps the package small.
  sourcemap: false,
  dts: false,
  clean: false,
  splitting: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  esbuildPlugins: [
    {
      name: 'quartile-styles-text',
      setup(build) {
        // A virtual path: a real .css path would be taken over by tsup's CSS pipeline and
        // emitted as a separate file instead of being inlined as text.
        build.onResolve({ filter: /^quartile:styles$/ }, () => ({
          path: 'package-stylesheet',
          namespace: 'quartile-styles',
          watchFiles: [stylesheet],
        }));
        build.onLoad({ filter: /.*/, namespace: 'quartile-styles' }, async () => {
          const css = await readFile(stylesheet, 'utf8');
          const minified = await build.esbuild.transform(css, { loader: 'css', minify: true });
          return { contents: minified.code, loader: 'text' };
        });
      },
    },
  ],
});
