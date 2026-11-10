/** Cross-site links. Overridable per deployment with VITE_* environment variables. */
export const links = {
  landing: import.meta.env.VITE_LANDING_URL ?? 'https://usequartile.com',
  docs: import.meta.env.VITE_DOCS_URL ?? 'https://docs.usequartile.com',
  github: 'https://github.com/zinnoberHaus/quartile',
};
