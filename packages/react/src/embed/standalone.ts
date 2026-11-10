/**
 * The drop-in script: one file with React and the stylesheet bundled.
 *
 *   <script src="quartile.global.js" data-sources="same-origin" data-theme="auto"></script>
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
  setEmbedStyles,
  upgradeBlocks,
} from './element';
import type { SourcePolicy } from './scope';

interface GlobalConfig {
  auto?: boolean;
  sources?: SourcePolicy;
  theme?: ThemeSetting;
  host?: HostTheme;
  accent?: string;
  languages?: string[];
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
  if (d.sources === 'same-origin' || d.sources === 'none') out.sources = d.sources;
  if (d.theme) out.theme = d.theme as ThemeSetting;
  if (d.host) out.host = d.host as HostTheme;
  if (d.accent) out.accent = d.accent;
  if (d.languages) out.languages = d.languages.split(/[\s,]+/).filter(Boolean);
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

export {
  configureEmbed as configure,
  observeBlocks as observe,
  QuartileChartElement,
  upgradeBlocks as upgrade,
};
