import { act, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defineQuartileElements, setEmbedStyles } from './element';
import { embedGroups, embedSelection, type QuartileSelectDetail } from './selection';

const shadow = (el: Element) => (el as HTMLElement).shadowRoot!;
const text = (el: Element) => shadow(el).textContent ?? '';
const rowButton = (el: Element, label: string) =>
  [...shadow(el).querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

/** A ranking and a total over one named dataset, as three elements of a plain HTML page. */
const page = `
  <quartile-chart id="by-region"><script type="text/quartile">
    barlist sum(amount) by region
    select: true
    data: orders
  </script></quartile-chart>
  <quartile-chart id="total"><script type="text/quartile">
    kpi sum(amount) as "Revenue"
    data: orders
  </script></quartile-chart>
  <quartile-chart data-display="hidden"><script type="text/quartile">
    data orders
    ---
    region,amount
    EMEA,120
    APAC,80
    EMEA,40
  </script></quartile-chart>`;

type Heard = { id: string; detail: QuartileSelectDetail };
let heard: Heard[] = [];
const listen = (event: CustomEvent<QuartileSelectDetail>) =>
  heard.push({ id: (event.target as Element).id, detail: event.detail });

beforeAll(() => {
  setEmbedStyles(':root,\n[data-theme="light"] { --q-bg: #fff; }');
  defineQuartileElements();
});

afterEach(async () => {
  document.removeEventListener('quartile-select', listen);
  await act(async () => {
    for (const group of embedGroups()) embedSelection(group).clear();
  });
  document.body.innerHTML = '';
  heard = [];
});

async function mount(html: string) {
  document.body.innerHTML = html;
  await act(async () => {});
  document.addEventListener('quartile-select', listen);
  return [...document.querySelectorAll('quartile-chart')];
}

describe('quartile-select', () => {
  it('is dispatched by every element of the group and marks where the reader acted', async () => {
    const [list, kpi] = await mount(page);
    await waitFor(() => expect(text(kpi)).toContain('$240'));
    await act(async () => {
      fireEvent.click(rowButton(list, 'APAC'));
    });
    expect(text(kpi)).toContain('$80');
    // One event per element in the group; the data block takes part in no selection.
    expect(heard.map((h) => [h.id, h.detail.origin])).toEqual([
      ['by-region', true],
      ['total', false],
    ]);
    for (const { detail } of heard) {
      expect(detail.group).toBe('orders');
      expect(detail.predicates).toMatchObject([{ field: 'region', op: 'in', value: ['APAC'] }]);
    }
    // A page that wants each action once filters on `origin`.
    expect(heard.filter((h) => h.detail.origin)).toHaveLength(1);
  });

  it('crosses the shadow boundary and bubbles to the document', async () => {
    const [list] = await mount(page);
    const onElement = vi.fn();
    list.addEventListener('quartile-select', onElement);
    await act(async () => {
      fireEvent.click(rowButton(list, 'EMEA'));
    });
    expect(onElement).toHaveBeenCalledTimes(1);
    const event: CustomEvent<QuartileSelectDetail> = onElement.mock.calls[0][0];
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.target).toBe(list);
  });
});

describe('Quartile.selection(group)', () => {
  it('reads, sets, clears and observes a group by name, filtering every element in it', async () => {
    const [list, kpi] = await mount(page);
    await waitFor(() => expect(text(kpi)).toContain('$240'));
    const orders = embedSelection('orders');
    const seen: number[] = [];
    const stop = orders.subscribe((predicates) => seen.push(predicates.length));
    expect(orders.get()).toEqual([]);

    await act(async () => orders.set('region', 'EMEA'));
    expect(text(kpi)).toContain('$160');
    // A selection the page made belongs to no chart, so the ranking is filtered as well.
    expect(text(list)).not.toContain('APAC');
    expect(orders.get()).toMatchObject([{ field: 'region', op: 'eq', value: 'EMEA' }]);
    // Changes from script are announced by every element, none of them as the origin.
    expect(heard.map((h) => [h.id, h.detail.origin])).toEqual([
      ['by-region', false],
      ['total', false],
    ]);

    await act(async () => orders.set('region', ['EMEA', 'APAC']));
    expect(orders.get()).toMatchObject([{ op: 'in', value: ['EMEA', 'APAC'] }]);
    expect(text(kpi)).toContain('$240');

    await act(async () => orders.set('amount', [100, 500], { op: 'between' }));
    expect(orders.get().map((p) => p.op)).toEqual(['in', 'between']);
    expect(text(kpi)).toContain('$120');

    await act(async () => orders.clear('amount'));
    expect(orders.get().map((p) => p.field)).toEqual(['region']);
    await act(async () => orders.clear());
    expect(orders.get()).toEqual([]);
    expect(text(kpi)).toContain('$240');
    expect(seen).toEqual([1, 1, 2, 1, 0]);

    stop();
    await act(async () => orders.set('region', 'APAC'));
    expect(seen).toHaveLength(5);
    expect(embedGroups()).toContain('orders');
  });

  it('rejects a range that is not [min, max]', () => {
    const orders = embedSelection('orders');
    expect(() => orders.set('amount', 100, { op: 'between' })).toThrow(/\[min, max\]/);
    expect(() => embedSelection('')).toThrow(TypeError);
  });

  it('reaches a dashboard with its own rows under block-<n>', async () => {
    const [dashboard] = await mount(`
      <quartile-chart id="sales"><script type="text/quartile">
        dashboard Sales
        barlist sum(amount) by region
        kpi sum(amount) as "Sales total"
        ---
        region,amount
        EMEA,120
        APAC,80
      </script></quartile-chart>`);
    await act(async () => {
      fireEvent.click(rowButton(dashboard, 'APAC'));
    });
    expect(heard).toHaveLength(1);
    const { group, origin, predicates } = heard[0].detail;
    expect(group).toMatch(/^block-\d+$/);
    expect(origin).toBe(true);
    expect(predicates).toMatchObject([{ field: 'region', value: ['APAC'] }]);
    expect(embedGroups()).toContain(group);
    expect(shadow(dashboard).querySelector('.q-kpi')?.textContent).toContain('$80');

    await act(async () => embedSelection(group).clear());
    expect(shadow(dashboard).querySelector('.q-kpi')?.textContent).toContain('$200');
  });

  it('lets a page name a standalone block with link:, and filter it from its own controls', async () => {
    const [chart] = await mount(`
      <quartile-chart><script type="text/quartile">
        kpi sum(amount) as "Sales total"
        link: sales
        ---
        region,amount
        EMEA,120
        APAC,80
      </script></quartile-chart>`);
    expect(text(chart)).toContain('$200');
    await act(async () => embedSelection('sales').set('region', 'APAC'));
    expect(text(chart)).toContain('$80');
    expect(heard.map((h) => h.detail.group)).toEqual(['sales']);
  });
});
