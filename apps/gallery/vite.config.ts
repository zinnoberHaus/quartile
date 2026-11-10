import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const librarySrc = fileURLToPath(new URL('../../packages/react/src/', import.meta.url));
const mainEntry = fileURLToPath(new URL('./src/main.tsx', import.meta.url));

/** main.tsx globs every library stylesheet; re-run that glob when one is created or deleted. */
function reloadOnNewStylesheet(): Plugin {
  return {
    name: 'quartile-reload-on-new-stylesheet',
    configureServer(server) {
      server.watcher.add(librarySrc);
      const rerunGlob = (file: string) => {
        if (!file.endsWith('.css') || !file.startsWith(librarySrc)) return;
        for (const mod of server.moduleGraph.getModulesByFile(mainEntry) ?? []) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', rerunGlob);
      server.watcher.on('unlink', rerunGlob);
    },
  };
}

// The gallery renders the library from source, so every change shows up immediately.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), reloadOnNewStylesheet()],
  resolve: {
    alias: {
      '@quartile/react/ai': fileURLToPath(
        new URL('../../packages/react/src/ai/index.ts', import.meta.url),
      ),
      '@quartile/react/query': fileURLToPath(
        new URL('../../packages/react/src/query/index.ts', import.meta.url),
      ),
      '@quartile/react/duckdb': fileURLToPath(
        new URL('../../packages/react/src/duckdb/index.ts', import.meta.url),
      ),
      '@quartile/react/lang': fileURLToPath(
        new URL('../../packages/react/src/lang/index.ts', import.meta.url),
      ),
      '@quartile/react/server': fileURLToPath(
        new URL('../../packages/react/src/server/index.ts', import.meta.url),
      ),
      '@quartile/react/embed': fileURLToPath(
        new URL('../../packages/react/src/embed/index.ts', import.meta.url),
      ),
      '@quartile/react': fileURLToPath(
        new URL('../../packages/react/src/index.ts', import.meta.url),
      ),
    },
  },
  // `vite build` writes the site and a manifest of its chunks; `vite build --ssr` then writes the
  // server entry that scripts/prerender.mjs runs (and deletes) to prerender every route.
  build: isSsrBuild
    ? { outDir: 'dist/.server', emptyOutDir: true, copyPublicDir: false }
    : { manifest: true },
}));
