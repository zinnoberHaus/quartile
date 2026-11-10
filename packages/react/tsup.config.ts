import { defineConfig } from 'tsup';

const shared = {
  format: ['esm'] as const,
  dts: true,
  sourcemap: true,
  target: 'es2022' as const,
  external: [
    'react',
    'react-dom',
    'react-dom/server',
    'react-dom/client',
    'react/jsx-runtime',
    'apache-arrow',
    '@duckdb/duckdb-wasm',
  ],
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: 'src/index.ts',
      'ai/index': 'src/ai/index.ts',
      'query/index': 'src/query/index.ts',
      'duckdb/index': 'src/duckdb/index.ts',
    },
    // `npm run build` empties dist first; the two configs build in parallel.
    // Every export is interactive; mark the bundle as a client module for React Server Components.
    banner: { js: "'use client';" },
  },
  {
    ...shared,
    // Plain functions for servers, build plugins and workers: no client-module directive, so a
    // React Server Component or a Markdown plugin can call them directly.
    entry: {
      'lang/index': 'src/lang/index.ts',
      'server/index': 'src/server/index.ts',
      'embed/index': 'src/embed/index.ts',
    },
    clean: false,
  },
]);
