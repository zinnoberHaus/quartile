/**
 * The drop-in script: one file with React and the stylesheet bundled.
 *
 *   <script src="quartile.global.js" data-sources="same-origin" data-theme="auto"></script>
 *
 * `data-sources` lists what `src:` may fetch: `none`, `same-origin` and exact origins such as
 * `https://api.example.com`. `data-min-refresh` is the shortest `refresh:` interval in seconds.
 *
 * On load it defines `<quartile-chart>`, upgrades ```quartile code blocks and statically
 * rendered blocks, and keeps watching for new ones (single-page docs, streaming chat).
 * Configure with data attributes on the script tag, or `window.QuartileConfig` set before it.
 */
import css from 'quartile:styles';
import type { HostTheme, ThemeSetting } from '../provider/QuartileProvider';
import {
  configureEmbed,
  defineQuartileElements,
  observeBlocks,
  QuartileChartElement,
  readActionsSetting,
  setEmbedStyles,
  upgradeBlocks,
} from './element';
import { pageScope, type SourcePolicy } from './scope';
import { embedGroups, embedSelection } from './selection';

interface GlobalConfig {
  auto?: boolean;
  sources?: SourcePolicy;
  minRefresh?: number;
  theme?: ThemeSetting;
  host?: HostTheme;
  accent?: string;
  languages?: string[];
  /** Actions views show by default (`rows`, `download`, `table`), or false for none. */
  actions?: readonly ('table' | 'rows' | 'download')[] | false;
}

declare global {
  interface Window {
    QuartileConfig?: GlobalConfig;
  }
}

export const version = '0.1.0';

setEmbedStyles(css);
defineQuartileElements();

function fromScript(script: HTMLScriptElement | null): GlobalConfig {
  const d = script?.dataset;
  if (!d) return {};
  const out: GlobalConfig = {};
  if (d.auto) out.auto = d.auto !== 'false';
  if (d.sources) out.sources = d.sources;
  if (d.minRefresh && Number(d.minRefresh) > 0) out.minRefresh = Number(d.minRefresh);
  if (d.theme) out.theme = d.theme as ThemeSetting;
  if (d.host) out.host = d.host as HostTheme;
  if (d.accent) out.accent = d.accent;
  if (d.languages) out.languages = d.languages.split(/[\s,]+/).filter(Boolean);
  if (d.actions) out.actions = readActionsSetting(d.actions);
  return out;
}

const script =
  typeof document !== 'undefined'
    ? ((document.currentScript as HTMLScriptElement | null) ??
      document.querySelector<HTMLScriptElement>('script[data-quartile]'))
    : null;
const config: GlobalConfig = {
  ...(typeof window !== 'undefined' ? window.QuartileConfig : undefined),
  ...fromScript(script),
};
configureEmbed(config);

if (typeof document !== 'undefined' && config.auto !== false) {
  const start = () => observeBlocks(document);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

/** Fetches the page's `src:` data again now: all of it, or the sources of one URL. */
export function reload(url?: string): Promise<void> {
  return pageScope().reload(url);
}

export {
  configureEmbed as configure,
  embedGroups as groups,
  embedSelection as selection,
  observeBlocks as observe,
  QuartileChartElement,
  upgradeBlocks as upgrade,
};
