import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  // Every export is interactive; mark the bundle as a client module for React Server Components.
  banner: { js: "'use client';" },
});
