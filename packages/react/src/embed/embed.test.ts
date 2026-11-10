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
  configureEmbed({ sources: 'none', loadSource: undefined });
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
    await waitFor(() => expect(shadow(remote).textContent).toContain('does not allow loading'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/\/data\/orders\.csv$/);
    vi.unstubAllGlobals();
  });
});
