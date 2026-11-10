// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderBlockToHTML } from './index';

const rows = 'region,amount\nEMEA,120\nAPAC,80\n';

describe('static HTML: provenance', () => {
  it('writes the source line with a plain link and ties it to the figure', () => {
    const html = renderBlockToHTML(
      `bar sum(amount) by region\ntitle: Revenue\nsource: World Bank\nsource.url: https://data.worldbank.org/\nasof: 2026-11-01\n---\n${rows}`,
    );
    expect(html).toContain(
      'Source: <a href="https://data.worldbank.org/" rel="noopener noreferrer">World Bank</a>',
    );
    expect(html).toContain('As of Nov 1, 2026');
    const id = /<p class="q-spec-source" id="([^"]+)">/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`aria-describedby="${id}"`);
  });

  it('writes no link for another scheme, and escapes the text', () => {
    const html = renderBlockToHTML(
      `kpi sum(amount)\nsource: A & B <script>alert(1)</script>\nsource.url: javascript:alert(1)\n---\n${rows}`,
    );
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Source: A &amp; B &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('adds nothing to a block that states no source', () => {
    const html = renderBlockToHTML(`bar sum(amount) by region\n---\n${rows}`);
    expect(html).not.toContain('q-spec-source');
    expect(html).not.toContain('aria-describedby');
  });
});

describe('static HTML: actions and view mode', () => {
  it('has no toolbar, even when the block asks: buttons need script', () => {
    const html = renderBlockToHTML(
      `bar sum(amount) by region\ntitle: Revenue\nactions: table, rows, download\n---\n${rows}`,
    );
    expect(html).not.toContain('<button');
    expect(html).not.toContain('q-spec-actions');
    expect(html).not.toContain('q-spec-rows');
    expect(html).toContain('<svg');
    // The request travels with the source, for the embed script to honor.
    expect(html).toContain('actions: table, rows, download');
  });

  it('draws view: table as the table, which needs no script', () => {
    const html = renderBlockToHTML(`bar sum(amount) by region\nview: table\n---\n${rows}`);
    expect(html).toContain('class="q-chart-table"');
    expect(html).not.toContain('<svg');
    expect(html).toContain('EMEA');
  });
});
