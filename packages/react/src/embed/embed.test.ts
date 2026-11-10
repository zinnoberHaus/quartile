import { act, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderBlockToHTML } from '../server';
import {
  configureEmbed,
  defineQuartileElements,
  embedStyles,
  observeBlocks,
  type QuartileChartElement,
  setEmbedStyles,
  upgradeBlocks,
} from './element';
import { pageScope } from './scope';

const orders = 'region,amount\nEMEA,120\nAPAC,80\nEMEA,40\n';
const shadow = (el: Element) => (el as HTMLElement).shadowRoot!;

beforeAll(() => {
  setEmbedStyles(':root,\n[data-theme="light"] { --q-bg: #fff; }');
  defineQuartileElements();
});

afterEach(() => {
  document.body.innerHTML = '';
  configureEmbed({ sources: 'none', loadSource: undefined, minRefresh: undefined });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<quartile-chart>', () => {
  it('renders its text content in a shadow root, with the styles adopted', async () => {
    document.body.innerHTML = `<quartile-chart theme="light">
      bar sum(amount) by region
      title: Revenue
      ---
      region,amount
      EMEA,120
      APAC,80
    </quartile-chart>`;
    const el = document.querySelector('quartile-chart')!;
    await act(async () => {});
    const root = shadow(el);
    expect(root.querySelector('[role="figure"]')?.getAttribute('aria-label')).toBe('Revenue');
    expect(root.querySelector('.q-root')?.getAttribute('data-theme')).toBe('light');
    expect(root.querySelector('.q-root')?.getAttribute('part')).toBe('root');
    const styles = [...root.querySelectorAll('style')].map((s) => s.textContent).join('');
    const adopted =
      (root as ShadowRoot & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? [];
    expect(styles.includes(':host') || adopted.length > 0).toBe(true);
  });

  it('takes a source property and re-renders when it changes', async () => {
    const el = document.createElement('quartile-chart') as QuartileChartElement;
    el.setAttribute('theme', 'dark');
    document.body.appendChild(el);
    el.source = `kpi sum(amount) as "Total"\n---\n${orders}`;
    await act(async () => {});
    expect(shadow(el).textContent).toContain('$240');
    el.source = `kpi count as "Orders"\n---\n${orders}`;
    await act(async () => {});
    expect(shadow(el).textContent).toContain('Orders');
    expect(shadow(el).querySelector('.q-root')?.getAttribute('data-theme')).toBe('dark');
  });

  it('shares data blocks and selections across elements on the page', async () => {
    document.body.innerHTML = `
      <quartile-chart><script type="text/quartile">
        barlist sum(amount) by region
        select: true
        data: orders
      </script></quartile-chart>
      <quartile-chart><script type="text/quartile">
        kpi sum(amount) as "Revenue"
        data: orders
      </script></quartile-chart>
      <quartile-chart data-display="hidden"><script type="text/quartile">
        data orders
        ---
        ${orders.trim().split('\n').join('\n        ')}
      </script></quartile-chart>`;
    await act(async () => {});
    const [list, kpi] = [...document.querySelectorAll('quartile-chart')];
    await waitFor(() => expect(shadow(kpi).textContent).toContain('$240'));
    const apac = [...shadow(list).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('APAC'),
    )!;
    await act(async () => {
      fireEvent.click(apac);
    });
    expect(shadow(kpi).textContent).toContain('$80');
    expect(shadow(kpi).textContent).not.toContain('$240');
    expect(Object.keys(pageScope().datasets)).toContain('orders');
  });
});

describe('setEmbedStyles', () => {
  it('declares the base tokens on :host, quoted or minified', () => {
    setEmbedStyles(':root,\n[data-theme="light"] { --q-bg: #fff; }');
    expect(embedStyles()).toContain(':root,:host,[data-theme="light"]');
    setEmbedStyles(':root,[data-theme=light]{--q-bg:#fff}');
    expect(embedStyles()).toContain(':root,:host,[data-theme=light]');
  });
});

describe('upgradeBlocks', () => {
  it('turns fenced code blocks and static renders into live elements, keeping the markup', async () => {
    document.body.innerHTML = `
      <pre><code class="language-quartile">donut sum(amount) by region\n---\n${orders}</code></pre>
      <div class="language-quartile"><pre class="shiki"><code>kpi count\n---\nid\n1\n</code></pre></div>
      <pre><code class="language-js">console.log(1)</code></pre>
      ${renderBlockToHTML(`bar sum(amount) by region\n---\n${orders}`)}`;
    expect(upgradeBlocks(document)).toBe(3);
    await act(async () => {});
    const charts = document.querySelectorAll('quartile-chart');
    expect(charts).toHaveLength(3);
    // Originals stay in place, hidden, so frameworks that own them and no-JS readers keep them.
    const first = charts[0].previousElementSibling as HTMLElement;
    expect(first.matches('pre[data-quartile-upgraded]')).toBe(true);
    expect(first.style.display).toBe('none');
    expect(first.querySelector('code.language-quartile')).not.toBeNull();
    expect(charts[2].previousElementSibling?.querySelector('svg')).not.toBeNull();
    expect(shadow(charts[1]).textContent).toContain('Rows');
    expect(
      document.querySelector('pre code.language-js')?.hasAttribute('data-quartile-upgraded'),
    ).toBe(false);
    expect(upgradeBlocks(document)).toBe(0);
  });
});

describe('following the page', () => {
  it('redraws when the original text grows, as in a streaming chat message', async () => {
    document.body.innerHTML =
      '<pre><code class="language-quartile">kpi count as "Rows"\n---\nid\n1\n</code></pre>';
    upgradeBlocks(document);
    const el = document.querySelector('quartile-chart')!;
    await act(async () => {});
    expect(shadow(el).textContent).toContain('1');
    const code = document.querySelector('code')!;
    await act(async () => {
      code.textContent = 'kpi count as "Rows"\n---\nid\n1\n2\n3\n4\n';
    });
    // While the text is changing the block streams; once still, every row counts.
    await waitFor(() => expect(shadow(el).querySelector('.q-kpi')?.textContent).toContain('4'), {
      timeout: 3000,
    });
  });

  it('removes a chart when its original leaves the page', async () => {
    const stop = observeBlocks(document);
    document.body.innerHTML =
      '<div id="msg"><pre><code class="language-quartile">kpi count\n---\nid\n1\n</code></pre></div>';
    await waitFor(() => expect(document.querySelectorAll('quartile-chart')).toHaveLength(1));
    document.getElementById('msg')!.remove();
    await waitFor(() => expect(document.querySelectorAll('quartile-chart')).toHaveLength(0));
    stop();
  });
});

describe('page-wide sources', () => {
  it('loads a data block source once and shares it with every element', async () => {
    const fetch = vi.fn(async () => new Response('region,amount\nEMEA,3\nAPAC,4\n'));
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: 'same-origin' });
    document.body.innerHTML = `
      <pre><code class="language-quartile">data shared\nsrc: data/shared.csv\namount.format: currency USD\n</code></pre>
      <pre><code class="language-quartile">kpi sum(amount) as "Shared"\ndata: shared\n</code></pre>`;
    upgradeBlocks(document);
    const [, kpi] = [...document.querySelectorAll('quartile-chart')];
    await waitFor(() => expect(shadow(kpi).textContent).toContain('$7'));
    expect(shadow(kpi).querySelector('.q-block-error')).toBeNull();
    // The data block's own settings describe the shared rows: whole dollars, no cents.
    await waitFor(() => expect(shadow(kpi).textContent).not.toContain('$7.00'));
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('source policy', () => {
  it('fetches nothing by default', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    document.body.innerHTML =
      '<quartile-chart>kpi sum(amount)\nsrc: /data/orders.csv\n</quartile-chart>';
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
    expect(shadow(document.querySelector('quartile-chart')!).textContent).toContain(
      'does not load remote data',
    );
    vi.unstubAllGlobals();
  });

  it('fetches same-origin files when the page allows it, and refuses other origins', async () => {
    const fetch = vi.fn(async () => new Response('region,amount\nEMEA,3\nAPAC,4\n'));
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: 'same-origin' });
    document.body.innerHTML = `
      <quartile-chart>kpi sum(amount) as "Local"\nsrc: data/orders.csv\n</quartile-chart>
      <quartile-chart>kpi sum(amount) as "Remote"\nsrc: https://evil.example/x.csv?secret=1\n</quartile-chart>`;
    const [local, remote] = [...document.querySelectorAll('quartile-chart')];
    await waitFor(() => expect(shadow(local).textContent).toContain('$7.00'));
    await waitFor(() =>
      expect(shadow(remote).textContent).toContain(
        'This page allows data from: same-origin; `https://evil.example` is not allowed.',
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/\/data\/orders\.csv$/);
    vi.unstubAllGlobals();
  });
});

describe('source allowlist', () => {
  type FetchArgs = [string, RequestInit];
  const respond = (body: string) => vi.fn(async () => new Response(body));

  it('reads a listed API origin without the page’s credentials', async () => {
    const fetch = respond('region,amount\nEMEA,3\nAPAC,4\n');
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: 'same-origin https://api.example.com' });
    document.body.innerHTML = `
      <quartile-chart>kpi sum(amount) as "Api"\nsrc: https://api.example.com/v1/orders.csv\n</quartile-chart>
      <quartile-chart>kpi sum(amount) as "Own"\nsrc: data/allowlist-own.csv\n</quartile-chart>
      <quartile-chart>kpi sum(amount) as "Other"\nsrc: https://cdn.example.net/orders.csv\n</quartile-chart>`;
    const [api, own, other] = [...document.querySelectorAll('quartile-chart')];
    await waitFor(() => expect(shadow(api).textContent).toContain('$7.00'));
    await waitFor(() => expect(shadow(own).textContent).toContain('$7.00'));
    await waitFor(() =>
      expect(shadow(other).textContent).toContain(
        'This page allows data from: same-origin, https://api.example.com; `https://cdn.example.net` is not allowed.',
      ),
    );
    const calls = fetch.mock.calls as unknown as FetchArgs[];
    expect(calls).toHaveLength(2);
    const byUrl = Object.fromEntries(calls.map(([url, init]) => [url, init.credentials]));
    expect(byUrl).toEqual({
      'https://api.example.com/v1/orders.csv': 'omit',
      [`${window.location.origin}/data/allowlist-own.csv`]: 'same-origin',
    });
  });

  it('ignores wildcards, paths and other schemes with one warning each', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = respond('amount\n1\n');
    vi.stubGlobal('fetch', fetch);
    configureEmbed({
      sources: 'https://*.wild.example, https://api.example.com/v1 ftp://files.example.com',
    });
    document.body.innerHTML = `
      <quartile-chart>kpi sum(amount)\nsrc: https://a.wild.example/x.csv\n</quartile-chart>
      <quartile-chart>kpi sum(amount)\nsrc: https://api.example.com/v1/x.csv\n</quartile-chart>`;
    await act(async () => {});
    // Nothing valid is left, so the page loads nothing at all.
    for (const el of document.querySelectorAll('quartile-chart')) {
      expect(shadow(el).textContent).toContain('does not load remote data');
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(String(warn.mock.calls[0][0])).toContain('“https://*.wild.example”');
    // Asking again does not repeat the warnings.
    pageScope().loader();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('accepts a list of origins', async () => {
    const fetch = respond('amount\n9\n');
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: ['https://list.example.com', 'same-origin'] });
    document.body.innerHTML =
      '<quartile-chart>kpi sum(amount) as "Listed"\nsrc: https://list.example.com/x.csv\nformat: integer\n</quartile-chart>';
    await waitFor(() =>
      expect(shadow(document.querySelector('quartile-chart')!).textContent).toContain('9'),
    );
    expect((fetch.mock.calls as unknown as FetchArgs[])[0][1].credentials).toBe('omit');
  });

  it('requires http(s) for a function policy too', async () => {
    const fetch = respond('amount\n5\n');
    vi.stubGlobal('fetch', fetch);
    const policy = vi.fn((url: URL) => url.hostname !== 'blocked.example');
    configureEmbed({ sources: policy });
    document.body.innerHTML = `
      <quartile-chart>kpi sum(amount) as "Fn"\nsrc: https://fn.example/x.csv\nformat: integer\n</quartile-chart>
      <quartile-chart>kpi sum(amount)\nsrc: data:text/csv,amount%0A1\n</quartile-chart>
      <quartile-chart>kpi sum(amount)\nsrc: https://blocked.example/x.csv\n</quartile-chart>`;
    const [allowed, scheme, blocked] = [...document.querySelectorAll('quartile-chart')];
    await waitFor(() => expect(shadow(allowed).textContent).toContain('5'));
    await waitFor(() =>
      expect(shadow(scheme).textContent).toContain(
        'Only http: and https: URLs are loaded; `data:` is not allowed.',
      ),
    );
    await waitFor(() =>
      expect(shadow(blocked).textContent).toContain(
        'This page does not allow data from `https://blocked.example`.',
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(policy.mock.calls.map(([url]) => url.protocol)).not.toContain('data:');
    expect((fetch.mock.calls as unknown as FetchArgs[])[0][1].credentials).toBe('omit');
  });

  it('reads the rows a block’s path names', async () => {
    const body = JSON.stringify({
      meta: { page: 1 },
      data: { items: [{ amount: 20 }, { amount: 22 }] },
    });
    // A network answer arrives after both elements have mounted.
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(body)), 30)),
    );
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: 'same-origin' });
    document.body.innerHTML = `
      <quartile-chart>kpi sum(amount) as "Path"\nsrc: /api/path-items.json\npath: data.items\nformat: integer\n</quartile-chart>
      <quartile-chart>kpi sum(amount) as "Missing"\nsrc: /api/path-items.json\npath: data.rows\n</quartile-chart>`;
    const [found, missing] = [...document.querySelectorAll('quartile-chart')];
    await waitFor(() => expect(shadow(found).textContent).toContain('42'));
    await waitFor(() =>
      expect(shadow(missing).textContent).toContain(
        'The path `data.rows` stops at `rows`: there is no such key at `data`. Keys there: `items`.',
      ),
    );
    // One request serves both blocks, each reading its own path.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure for the life of the page', async () => {
    const answers = [
      new Response('down', { status: 503 }),
      new Response('amount\n6\n'),
      new Response('amount\n8\n'),
    ];
    const fetch = vi.fn(async () => answers.shift()!);
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: 'same-origin' });
    document.body.innerHTML =
      '<quartile-chart>kpi sum(amount) as "Retry"\nsrc: /data/retry.csv\nformat: integer\n</quartile-chart>';
    const el = document.querySelector('quartile-chart')!;
    await waitFor(() => expect(shadow(el).textContent).toContain('HTTP 503'));
    await act(() => pageScope().reload());
    await waitFor(() => expect(shadow(el).textContent).toContain('6'));
    expect(shadow(el).querySelector('.q-block-error')).toBeNull();
    await act(() => pageScope().reload('/data/retry.csv'));
    await waitFor(() => expect(shadow(el).textContent).toContain('8'));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('reloads on refresh no faster than the page’s floor, until the element leaves', async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetch = vi.fn(async () => new Response(`amount\n${++n}\n`));
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: 'same-origin', minRefresh: 60 });
    document.body.innerHTML =
      '<quartile-chart>kpi sum(amount) as "Live"\nsrc: /data/live-embed.csv\nrefresh: 5s\nformat: integer\n</quartile-chart>';
    const el = document.querySelector('quartile-chart')!;
    const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
    await tick(0);
    await tick(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await tick(59_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await tick(1_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(shadow(el).querySelector('.q-kpi')?.textContent).toContain('2');
    el.remove();
    await tick(600_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes a data block for every element that reads it', async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ amount: ++n }] })));
    vi.stubGlobal('fetch', fetch);
    configureEmbed({ sources: 'same-origin' });
    document.body.innerHTML = `
      <quartile-chart data-display="hidden">data ticking\nsrc: /api/ticking.json\npath: data\nrefresh: 30s\namount.format: currency EUR\n</quartile-chart>
      <quartile-chart>kpi sum(amount) as "Ticking"\ndata: ticking\n</quartile-chart>`;
    const kpi = document.querySelectorAll('quartile-chart')[1];
    const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
    await tick(0);
    await tick(0);
    expect(shadow(kpi).querySelector('.q-kpi')?.textContent).toContain('€1');
    await tick(30_000);
    await tick(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(shadow(kpi).querySelector('.q-kpi')?.textContent).toContain('€2');

    // Editing the block after its rows arrived keeps it refreshing, at the new interval.
    const data = document.querySelectorAll('quartile-chart')[0] as QuartileChartElement;
    data.source =
      'data ticking\nsrc: /api/ticking.json\npath: data\nrefresh: 2m\namount.format: currency EUR\n';
    await tick(0);
    await tick(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await tick(60_000);
    await tick(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(shadow(kpi).querySelector('.q-kpi')?.textContent).toContain('€3');
  });
});
