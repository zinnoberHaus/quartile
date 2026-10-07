import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The gallery renders the library from source, so every change shows up immediately.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@quartile/react': fileURLToPath(
        new URL('../../packages/react/src/index.ts', import.meta.url),
      ),
    },
  },
});
