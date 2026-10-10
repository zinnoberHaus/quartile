import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'ai/index': 'src/ai/index.ts',
    'query/index': 'src/query/index.ts',
    'duckdb/index': 'src/duckdb/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'apache-arrow', '@duckdb/duckdb-wasm'],
  // Every export is interactive; mark the bundle as a client module for React Server Components.
  banner: { js: "'use client';" },
});
