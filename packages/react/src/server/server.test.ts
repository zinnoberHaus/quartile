// @vitest-environment node
import MarkdownIt from 'markdown-it';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it, vi } from 'vitest';
import { createSourceLoader } from '../lang/source';
import {
  escapeHtml,
  markdownItQuartile,
  remarkQuartile,
  renderBlockToHTML,
  renderMarkdownBlocks,
} from './index';

const block =
  'bar sum(amount) by region\ntitle: Revenue by region\n---\nregion,amount\nEMEA,120\nAPAC,80\n';

describe('renderBlockToHTML', () => {
  it('writes the chart as SVG plus an HTML table, with the source for later upgrade', () => {
    const html = renderBlockToHTML(block);
    expect(html).toMatch(
      /^<div class="quartile-static" data-quartile-block="view" data-quartile-source="bar sum\(amount\)/,
    );
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 640');
    expect(html).toContain('<path');
    expect(html).toContain('<table');
    expect(html).toContain('EMEA');
    expect(html).toContain('data-width="assumed"');
    expect(html).toContain('data-theme="light"');
  });

  it('escapes block text in the attribute', () => {
    const html = renderBlockToHTML('table\n---\nname\n"<script>alert(1)</script>"\n');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('honours the chosen width, theme and diagnostics callback', () => {
    const seen: string[] = [];
    const html = renderBlockToHTML('bar profit by region\n---\nregion,amount\nEMEA,1\n', {
      theme: 'dark',
      initialWidth: 480,
      onDiagnostics: (d) => seen.push(...d.map((x) => x.message)),
    });
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('There is no column “profit”.');
    expect(seen).toContain('There is no column “profit”.');
    expect(renderBlockToHTML(block, { initialWidth: 480 })).toContain('viewBox="0 0 480');
  });
});

describe('remarkQuartile', () => {
  const markdown = [
    '# Report',
    '',
    '```quartile',
    'kpi sum(amount) as "Revenue"',
    'data: orders',
    '```',
    '',
    '```quartile',
    'data orders',
    '---',
    'region,amount',
    'EMEA,120',
    'APAC,80',
    '```',
    '',
    '```quartile',
    'line sum(amount) by month',
    'src: ./monthly.csv',
    '```',
  ].join('\n');

  it('replaces fences with static charts in a remark → rehype pipeline', async () => {
    const file = await unified()
      .use(remarkParse)
      .use(remarkQuartile, {
        loadSource: (url: string) =>
          url === './monthly.csv' ? 'month,amount\n2026-01,10\n2026-02,12\n' : '',
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(markdown);
    const html = String(file);
    expect(html).toContain('<h1>Report</h1>');
    expect(html.match(/class="quartile-static"/g)).toHaveLength(3);
    expect(html).toContain('$200');
    expect(html).not.toContain('$200.00');
    expect(html).toContain('data-quartile-block="data"');
    // The loaded source was drawn: the line's table holds both months.
    expect(html).toContain('Jan 26');
    expect(html).not.toContain('<code class="language-quartile">');
  });
});

describe('markdownItQuartile', () => {
  it('renders fences synchronously and leaves other code alone', () => {
    const md = new MarkdownIt();
    markdownItQuartile(md as never);
    const html = md.render(
      [
        '```quartile',
        'donut sum(amount) by region',
        'data: orders',
        '```',
        '',
        '```quartile',
        'data orders',
        '---',
        'region,amount',
        'EMEA,120',
        'APAC,80',
        '```',
        '',
        '```js',
        'const x = 1 < 2;',
        '```',
      ].join('\n'),
    );
    expect(html.match(/class="quartile-static"/g)).toHaveLength(2);
    expect(html).toContain('<svg');
    expect(html).toContain('<code class="language-js">const x = 1 &lt; 2;');
  });
});

describe('fence collisions', () => {
  it('keeps datasets whose rows contain backtick runs', () => {
    const md = new MarkdownIt();
    markdownItQuartile(md as never);
    const html = md.render(
      [
        '````quartile',
        'data notes',
        '---',
        'name,count',
        '"```a```",2',
        '````',
        '',
        '```quartile',
        'kpi sum(count) as "Notes"',
        'data: notes',
        '```',
      ].join('\n'),
    );
    expect(html).toContain('Notes');
    expect(html).not.toContain('There is no dataset');
  });
});

describe('renderMarkdownBlocks', () => {
  it('returns one rendering per block, in order', async () => {
    const out = await renderMarkdownBlocks('text\n\n```quartile\nkpi count\n---\nid\n1\n2\n```\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ line: 3, source: 'kpi count\n---\nid\n1\n2\n' });
    expect(out[0].html).toContain('Rows');
  });
});

describe('sources at build time', () => {
  const api = {
    status: 'ok',
    data: {
      items: [
        { plan: 'Team', seats: 12 },
        { plan: 'Solo', seats: 3 },
      ],
    },
  };
  const page = [
    '```quartile',
    'bar sum(seats) by plan',
    'title: Seats by plan',
    'src: https://api.example.com/v1/seats',
    'path: data.items',
    'refresh: 30s',
    '```',
    '',
    '```quartile',
    'data plans',
    'src: plans.json',
    '```',
    '',
    '```quartile',
    'kpi sum(seats) as "Seats"',
    'data: plans',
    'format: integer',
    '```',
  ].join('\n');

  it('applies each block’s path to what the loader returns, text or parsed', async () => {
    const loadSource = vi.fn(async (url: string) =>
      url === 'plans.json' ? { data: api.data.items, meta: {} } : JSON.stringify(api),
    );
    const out = await renderMarkdownBlocks(page, { loadSource });
    expect(loadSource.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/v1/seats',
      'plans.json',
    ]);
    expect(out[0].html).toContain('Seats by plan');
    expect(out[0].html).toContain('<svg');
    expect(out[0].html).toContain('Team');
    expect(out[0].html).not.toContain('q-block-error');
    expect(out[2].html).toContain('15');
  });

  it('stops the build when a path does not resolve', async () => {
    const loadSource = async () => ({ data: { rows: [] } });
    await expect(renderMarkdownBlocks(page, { loadSource })).rejects.toThrow(
      'Could not read https://api.example.com/v1/seats: The path `data.items` stops at `items`: there is no such key at `data`. Keys there: `rows`.',
    );
  });

  it('accepts the packaged loader, which needs a base and a listed origin on a server', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/plans.json')
        ? new Response(JSON.stringify(api.data.items))
        : new Response(JSON.stringify(api)),
    );
    const loadSource = createSourceLoader({
      origins: ['https://api.example.com'],
      base: 'https://api.example.com/static/',
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const out = await renderMarkdownBlocks(page, { loadSource });
    expect(out[2].html).toContain('15');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/v1/seats',
      'https://api.example.com/static/plans.json',
    ]);
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe('omit');

    const sameOriginOnly = createSourceLoader({ origins: ['same-origin'], fetch: vi.fn() });
    await expect(sameOriginOnly('https://api.example.com/v1/seats')).rejects.toThrow(
      'This loader allows data from: same-origin; `https://api.example.com` is not allowed.',
    );
  });
});
