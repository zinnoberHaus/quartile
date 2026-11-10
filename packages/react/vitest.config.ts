import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // The standalone build inlines the package stylesheet under this name (tsup.embed.config.ts);
      // tests of the drop-in script get a one-rule stand-in.
      name: 'quartile-styles-stub',
      resolveId: (id) => (id === 'quartile:styles' ? '\0quartile:styles' : undefined),
      load: (id) =>
        id === '\0quartile:styles'
          ? 'export default ":root,[data-theme=light]{--q-bg:#fff}";'
          : undefined,
    },
  ],
  resolve: {
    alias: [
      {
        find: /^@quartile\/react$/,
        replacement: new URL('./src/index.ts', import.meta.url).pathname,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
});
