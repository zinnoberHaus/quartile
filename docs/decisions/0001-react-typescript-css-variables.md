# 0001: React, TypeScript and CSS variables

Date: 2026-10-07 · Status: accepted

## Context

Quartile's scope was undecided when the repository was created. The design (charts, tables and controls sharing one theme, one data model and one selection state) targets teams building data apps in React.

## Decision

- Ship one package, `@quartile/react`, written in TypeScript, with React 18.2+ and 19 as peer dependencies.
- Style with plain CSS and `--q-*` custom properties, shipped as `@quartile/react/styles.css`. No Tailwind or CSS-in-JS runtime dependency, so it drops into any React app and any styling setup.
- Render charts as SVG using small d3 modules for math only (`d3-scale`, `d3-shape`, `d3-array`, `d3-sankey`); React owns the DOM.
- Keep the selection store framework-agnostic (`SelectionStore`) with thin React bindings, so other adapters stay possible.
- Use a pnpm workspace with a Vite gallery app that renders the library from source.

## Consequences

- Canvas and WebGL renderers, Arrow and DuckDB inputs are not part of 0.1. They need their own decisions and measurements before any documentation claims them.
- The package is not yet published to npm. The npm scope `@quartile` and the project name still need trademark, scope and domain clearance before a public release.
