import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The generator is a plain ESM script without declarations.
import { systemTheme } from '../../scripts/build-system-theme.mjs';
import { luminance, readHostColors, toRgba } from './host-theme';
import { HOST_THEMES, QuartileProvider } from './QuartileProvider';

const styles = join(__dirname, '../styles');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme="system"', () => {
  it('renders a CSS-resolved theme on the server, before any script runs', () => {
    const html = renderToString(<QuartileProvider theme="system">x</QuartileProvider>);
    expect(html).toContain('data-theme="system"');
  });

  it('resolves to the reader preference after mount', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(<QuartileProvider theme="system">x</QuartileProvider>);
    expect(container.querySelector('.q-root')?.getAttribute('data-theme')).toBe('dark');
  });

  it('keeps the generated system stylesheet in sync with the tokens', () => {
    const tokens = readFileSync(join(styles, 'tokens.css'), 'utf8');
    const generated = readFileSync(join(styles, 'system-theme.css'), 'utf8');
    expect(generated).toBe(systemTheme(tokens));
  });
});

describe('host themes', () => {
  it('maps a named design system on the root and the overlay portal', () => {
    const { container } = render(
      <QuartileProvider host="shadcn" accent="#e11d48">
        x
      </QuartileProvider>,
    );
    const root = container.querySelector('.q-root') as HTMLElement;
    expect(root.getAttribute('data-host')).toBe('shadcn');
    expect(root.hasAttribute('data-accent')).toBe(true);
    expect(root.style.getPropertyValue('--q-host-accent')).toBe('#e11d48');
    expect(root.querySelector('.q-portal')?.getAttribute('data-host')).toBe('shadcn');
  });

  it('has CSS for every preset', () => {
    const css = readFileSync(join(styles, 'host.css'), 'utf8');
    for (const host of HOST_THEMES) expect(css).toContain(`[data-host="${host}"][data-theme]`);
  });

  it('reads the surrounding page with theme="auto"', () => {
    const { container } = render(
      <div style={{ backgroundColor: 'rgb(12, 12, 14)', color: 'rgb(235, 235, 240)' }}>
        <QuartileProvider theme="auto">x</QuartileProvider>
      </div>,
    );
    const root = container.querySelector('.q-root') as HTMLElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-host')).toBe('auto');
    expect(root.style.getPropertyValue('--q-host-bg')).toBe('rgb(12, 12, 14)');
    expect(root.style.getPropertyValue('--q-host-text')).toBe('rgb(235, 235, 240)');
  });

  it('falls back to the CSS system theme when the page cannot be read', () => {
    const html = renderToString(<QuartileProvider theme="auto">x</QuartileProvider>);
    expect(html).toContain('data-theme="system"');
    expect(html).not.toContain('data-host');
  });
});

describe('color reading', () => {
  it('parses rgb() and judges lightness', () => {
    expect(toRgba('rgb(255, 255, 255)')).toEqual([255, 255, 255, 1]);
    expect(toRgba('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0]);
    expect(toRgba('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5]);
    expect(luminance([255, 255, 255, 1])).toBeCloseTo(1);
    expect(luminance([0, 0, 0, 1])).toBe(0);
  });

  it('walks past transparent ancestors to the painted background', () => {
    const outer = document.createElement('div');
    outer.style.backgroundColor = 'rgb(250, 250, 250)';
    const middle = document.createElement('div');
    const root = document.createElement('div');
    middle.appendChild(root);
    outer.appendChild(middle);
    document.body.appendChild(outer);
    expect(readHostColors(root)).toMatchObject({
      background: 'rgb(250, 250, 250)',
      scheme: 'light',
    });
    outer.remove();
  });
});
