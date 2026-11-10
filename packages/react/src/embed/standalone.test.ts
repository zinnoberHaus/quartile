import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageScope } from './scope';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('the drop-in script', () => {
  it('reads data-sources and data-min-refresh from its tag, and exports reload', async () => {
    document.head.innerHTML =
      '<script data-quartile data-auto="false" data-sources="same-origin https://api.example.com" data-min-refresh="45"></script>';
    const answers = ['amount\n1\n', 'amount\n2\n', 'amount\n3\n'];
    const fetch = vi.fn(async () => new Response(answers.shift()));
    vi.stubGlobal('fetch', fetch);

    const quartile = await import('./standalone');
    expect(pageScope().options.sources).toBe('same-origin https://api.example.com');
    expect(pageScope().options.minRefresh).toBe(45);
    expect(pageScope().sources.minRefresh()).toBe(45);

    document.body.innerHTML = `
      <quartile-chart>kpi sum(amount) as "Api"\nsrc: https://api.example.com/standalone.csv\nformat: integer\n</quartile-chart>
      <quartile-chart>kpi sum(amount)\nsrc: https://other.example/standalone.csv\n</quartile-chart>`;
    const [api, other] = [...document.querySelectorAll('quartile-chart')].map(
      (el) => (el as HTMLElement).shadowRoot!,
    );
    await waitFor(() => expect(api.querySelector('.q-kpi')?.textContent).toContain('1'));
    await waitFor(() =>
      expect(other.textContent).toContain(
        'This page allows data from: same-origin, https://api.example.com; `https://other.example` is not allowed.',
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls as unknown as [string, RequestInit][])[0][1].credentials).toBe('omit');

    await act(() => quartile.reload());
    await waitFor(() => expect(api.querySelector('.q-kpi')?.textContent).toContain('2'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(typeof quartile.configure).toBe('function');
  });
});
