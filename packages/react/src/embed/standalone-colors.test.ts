import { act } from '@testing-library/react';
import { expect, it } from 'vitest';

const BLOCK = `bar revenue by region and year
colors: signal, #f26b3a
---
region,year,revenue
EMEA,2025,120
EMEA,2026,150
`;

it('reads data-block-colors="off" from the script tag and keeps the page palette', async () => {
  const script = document.createElement('script');
  script.setAttribute('data-quartile', '');
  script.setAttribute('data-block-colors', 'off');
  script.setAttribute('data-auto', 'false');
  document.head.appendChild(script);
  await import('./standalone');

  const el = document.createElement('quartile-chart');
  el.setAttribute('theme', 'light');
  el.textContent = BLOCK;
  document.body.appendChild(el);
  await act(async () => {});
  const fills = Array.from(
    el.shadowRoot!.querySelectorAll<SVGPathElement>('.q-bar-marks path'),
  ).map((p) => p.style.fill);
  expect(new Set(fills)).toEqual(new Set(['var(--q-cat-1)', 'var(--q-cat-2)']));
});
