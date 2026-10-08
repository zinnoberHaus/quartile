/** Cross-site links. Overridable per deployment with VITE_* environment variables. */
export const links = {
  landing: import.meta.env.VITE_LANDING_URL ?? 'https://quartile-landing.vercel.app',
  docs: import.meta.env.VITE_DOCS_URL ?? 'https://quartile-docs.vercel.app',
  github: 'https://github.com/zinnoberHaus/quartile',
};
