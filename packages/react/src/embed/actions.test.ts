import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderBlockToHTML } from '../server';
import {
  configureEmbed,
  defineQuartileElements,
  readActionsSetting,
  setEmbedStyles,
  upgradeBlocks,
} from './element';

const rows = 'region,amount\nEMEA,120\nAPAC,80\n';
const shadow = (el: Element) => (el as HTMLElement).shadowRoot!;
const buttons = (el: Element) =>
  [...shadow(el).querySelectorAll('button')].map((b) => b.textContent);

beforeAll(() => {
  setEmbedStyles(':root,\n[data-theme="light"] { --q-bg: #fff; }');
  defineQuartileElements();
});

afterEach(async () => {
  document.body.innerHTML = '';
  configureEmbed({ actions: [] });
  // A removed element unmounts on the next tick; let that happen before the test ends.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('data-actions', () => {
  it('reads a list of actions, or a word that turns them off', () => {
    expect(readActionsSetting('rows download')).toEqual(['rows', 'download']);
    expect(readActionsSetting('Download, table,rows')).toEqual(['table', 'rows', 'download']);
    expect(readActionsSetting('rows print')).toEqual(['rows']);
    expect(readActionsSetting('none')).toBe(false);
    expect(readActionsSetting('off')).toBe(false);
    expect(readActionsSetting('false')).toBe(false);
  });

  it('shows no toolbar unless the page or the block asks', async () => {
    document.body.innerHTML = `<quartile-chart>bar sum(amount) by region\n---\n${rows}</quartile-chart>`;
    await act(async () => {});
    expect(buttons(document.querySelector('quartile-chart')!)).toEqual([]);
  });

  it('gives every chart the page default, and a pre-rendered block its toolbar on upgrade', async () => {
    configureEmbed({ actions: ['rows', 'download'] });
    const source = `bar sum(amount) by region\ntitle: Revenue\n---\n${rows}`;
    document.body.innerHTML = renderBlockToHTML(source);
    expect(document.querySelector('button')).toBeNull();
    expect(upgradeBlocks(document)).toBe(1);
    await act(async () => {});
    const chart = document.querySelector('quartile-chart')!;
    expect(buttons(chart)).toEqual(['Rows', 'Download CSV']);
    const rowsButton = shadow(chart).querySelector('button')!;
    await act(async () => {
      fireEvent.click(rowsButton);
    });
    expect(rowsButton.getAttribute('aria-pressed')).toBe('true');
    expect(shadow(chart).querySelector('.q-spec-rows-count')?.textContent).toBe('2 rows');
  });

  it('honors a block that asks, and a page that refuses', async () => {
    const asking = `<quartile-chart>bar sum(amount) by region\nactions: table\n---\n${rows}</quartile-chart>`;
    document.body.innerHTML = asking;
    await act(async () => {});
    expect(buttons(document.querySelector('quartile-chart')!)).toEqual(['Table']);

    document.body.innerHTML = '';
    configureEmbed({ actions: false });
    document.body.innerHTML = asking;
    await act(async () => {});
    expect(buttons(document.querySelector('quartile-chart')!)).toEqual([]);
  });
});
