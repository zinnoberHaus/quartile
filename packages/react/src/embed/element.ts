/**
 * `<quartile-chart>`: a custom element that renders one Quartile block in a shadow root, so a
 * plain HTML page, a static docs site or another framework can show interactive, themed charts.
 * Text color, font and `--q-*` variables cross the shadow boundary; page styles for tables, SVG
 * or buttons do not, so prose themes cannot distort a chart.
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { compileBlock } from '../lang/compile';
import { DEFAULT_LANGUAGES } from '../lang/document';
import { QuartileBlock } from '../markdown/QuartileBlock';
import { QuartileDocument } from '../markdown/QuartileDocument';
import {
  type Density,
  HOST_THEMES,
  type HostTheme,
  type ThemeSetting,
} from '../provider/QuartileProvider';
import { type EmbedOptions, pageScope } from './scope';

let cssText = '';
let sheet: CSSStyleSheet | null | undefined;

/**
 * Sets the stylesheet adopted by every element's shadow root. The standalone build supplies the
 * package stylesheet; tests and custom builds may pass their own. `:root` tokens are also
 * declared on `:host`, since `:root` matches nothing inside a shadow tree.
 */
export function setEmbedStyles(css: string) {
  // Quoted in source, unquoted once minified.
  cssText = css.replace(/:root,\s*\[data-theme=("light"|light)\]/, ':root,:host,[data-theme=$1]');
  sheet = undefined;
}

/** The stylesheet text adopted by shadow roots, for inspection and tests. */
export function embedStyles(): string {
  return cssText;
}

function adoptStyles(shadow: ShadowRoot) {
  const base =
    ':host{display:block;margin:1.25em 0;color:inherit}:host([hidden]){display:none}.q-embed-mount>.q-root{background:transparent}';
  const text = `${base}\n${cssText}`;
  try {
    if (sheet === undefined) {
      sheet = typeof CSSStyleSheet === 'function' ? new CSSStyleSheet() : null;
      sheet?.replaceSync(text);
    }
    if (sheet && 'adoptedStyleSheets' in shadow) {
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
      return;
    }
  } catch {
    sheet = null;
  }
  const style = document.createElement('style');
  style.textContent = text;
  shadow.appendChild(style);
}

function dedent(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const n = indents.length ? Math.min(...indents) : 0;
  return `${lines.map((l) => l.slice(n)).join('\n')}\n`;
}

const THEMES = new Set<ThemeSetting>(['light', 'dark', 'system', 'auto']);
let counter = 0;

/** Page-wide defaults for elements without their own attributes. */
const defaults: { theme: ThemeSetting; host?: HostTheme; accent?: string } = { theme: 'auto' };

export function setElementDefaults(options: Partial<typeof defaults>) {
  Object.assign(defaults, options);
}

export class QuartileChartElement extends HTMLElement {
  static observedAttributes = [
    'source',
    'theme',
    'host',
    'accent',
    'density',
    'locale',
    'time-zone',
    'data-display',
    'initial-width',
  ];

  #root: Root | null = null;
  #mount: HTMLDivElement | null = null;
  #source: string | null = null;
  #unsubscribe: (() => void) | null = null;
  #owner = `qe${++counter}`;
  #defined: string | null = null;
  /** The loaded rows this element last described, so a reload re-registers exactly once. */
  #described: unknown = null;
  #unmountTimer: ReturnType<typeof setTimeout> | null = null;
  /** The page's original block this element draws, when created by `upgradeBlocks`. */
  #sourceNode: Element | null = null;
  #watcher: MutationObserver | null = null;
  #streaming = false;
  #settle: ReturnType<typeof setTimeout> | null = null;

  /** The original markup this element was created from, if any. */
  get sourceNode(): Element | null {
    return this.#sourceNode;
  }

  /**
   * Draws the block held by `node` (a code block or a static render elsewhere on the page) and
   * follows its text: while the text keeps changing, as in a streaming chat message, the block
   * renders as streaming; it settles once the text has been still for a moment.
   */
  follow(node: Element, read: () => string) {
    this.#watcher?.disconnect();
    this.#sourceNode = node;
    this.source = read();
    if (typeof MutationObserver === 'undefined') return;
    this.#watcher = new MutationObserver(() => {
      const next = read();
      if (next === this.#source) return;
      this.#streaming = true;
      if (this.#settle) clearTimeout(this.#settle);
      this.#settle = setTimeout(() => {
        this.#streaming = false;
        if (this.isConnected) this.#update();
      }, 600);
      this.source = next;
    });
    this.#watcher.observe(node, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  }

  /** The block text. Setting it re-renders; it takes precedence over markup and attributes. */
  get source(): string {
    return this.#source ?? this.#readSource();
  }

  set source(value: string) {
    this.#source = value;
    if (this.isConnected) this.#update();
  }

  connectedCallback() {
    if (this.#unmountTimer) {
      clearTimeout(this.#unmountTimer);
      this.#unmountTimer = null;
    }
    if (!this.#mount) {
      const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      shadow.replaceChildren();
      adoptStyles(shadow);
      this.#mount = document.createElement('div');
      this.#mount.className = 'q-embed-mount';
      shadow.appendChild(this.#mount);
    }
    this.#unsubscribe ??= pageScope().subscribe(() => this.#onScope());
    this.#update();
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    if (this.#defined) pageScope().unregister(this.#defined, this.#owner);
    this.#defined = null;
    // Defer unmounting so moving the element in the DOM does not rebuild it.
    this.#unmountTimer = setTimeout(() => {
      this.#root?.unmount();
      this.#root = null;
      this.#watcher?.disconnect();
      this.#watcher = null;
    }, 0);
  }

  attributeChangedCallback() {
    if (this.isConnected && this.#mount) this.#update();
  }

  #readSource(): string {
    const attr = this.getAttribute('source');
    if (attr) return attr;
    const script = this.querySelector(':scope > script[type="text/quartile"]');
    if (script) return dedent(script.textContent ?? '');
    const rendered = this.querySelector(':scope > [data-quartile-source]');
    if (rendered) return rendered.getAttribute('data-quartile-source') ?? '';
    const code = this.querySelector(':scope > pre code, :scope > pre, :scope > code');
    if (code) return code.textContent ?? '';
    return dedent(this.textContent ?? '');
  }

  /** Page data changed: describe newly loaded rows of this element's data block, then render. */
  #onScope() {
    const name = this.#sourceName;
    const loaded = name ? pageScope().loaded[name] : undefined;
    if (loaded && loaded !== this.#described) {
      this.#described = loaded;
      this.#update();
      return;
    }
    this.#render();
  }

  #sourceName: string | null = null;

  #update() {
    const source = this.source;
    const scope = pageScope();
    // A `data` block shares its rows with every element on the page. A block with `src:` is
    // compiled against its loaded rows, so its field settings describe the shared dataset.
    const first = compileBlock(source);
    const srcName = first.type === 'data' ? (first.sources[0]?.name ?? null) : null;
    this.#sourceName = srcName;
    const loaded = srcName ? scope.loaded[srcName] : undefined;
    const compiled =
      loaded && srcName ? compileBlock(source, { datasets: { [srcName]: loaded } }) : first;
    const name = compiled.type === 'data' && compiled.complete ? compiled.defines?.name : undefined;
    if (this.#defined && this.#defined !== name) scope.unregister(this.#defined, this.#owner);
    if (name && compiled.defines) scope.register(name, compiled.defines.dataset, this.#owner);
    this.#defined = name ?? null;
    // Sources load once for the whole page, so every element over the dataset can use it.
    for (const s of compiled.sources) scope.requestSource(s.name, s.url);
    this.#render();
  }

  #render() {
    if (!this.#mount) return;
    const scope = pageScope();
    const theme = this.getAttribute('theme') as ThemeSetting | null;
    const host = this.getAttribute('host') as HostTheme | null;
    const width = Number(this.getAttribute('initial-width'));
    const display = this.getAttribute('data-display');
    this.#root ??= createRoot(this.#mount, { identifierPrefix: `${this.#owner}-` });
    this.#root.render(
      createElement(
        QuartileDocument,
        {
          data: scope.datasets,
          pending: scope.pending,
          stores: scope.store,
          loadSource: scope.loader() ? (url: string) => scope.load(url) : undefined,
          languages: scope.options.languages ?? DEFAULT_LANGUAGES,
          theme: theme && THEMES.has(theme) ? theme : defaults.theme,
          host: host && (HOST_THEMES as readonly string[]).includes(host) ? host : defaults.host,
          accent: this.getAttribute('accent') ?? defaults.accent,
          density: (this.getAttribute('density') as Density | null) ?? undefined,
          locale: this.getAttribute('locale') ?? undefined,
          timeZone: this.getAttribute('time-zone') ?? undefined,
          initialWidth: Number.isFinite(width) && width > 0 ? width : undefined,
          // Pages restyle the chart with `quartile-chart::part(root) { --q-signal: … }`.
          part: 'root',
          dataDisplay:
            display === 'table' || display === 'hidden' || display === 'summary'
              ? display
              : undefined,
        },
        createElement(QuartileBlock, {
          source: this.source,
          streaming: this.#streaming || undefined,
        }),
      ),
    );
  }
}

/** Registers `<quartile-chart>` once. */
export function defineQuartileElements() {
  if (typeof customElements !== 'undefined' && !customElements.get('quartile-chart')) {
    customElements.define('quartile-chart', QuartileChartElement);
  }
}

function selectorFor(languages: readonly string[]): string {
  return languages
    .flatMap((l) => [
      `pre > code.language-${l}`,
      `pre > code.lang-${l}`,
      `pre.language-${l}`,
      `pre.lang-${l}`,
      `div.language-${l}`,
    ])
    .concat('[data-quartile-source]')
    .join(', ');
}

const upgraded = new Set<QuartileChartElement>();

/** Hides an upgraded original without fighting site CSS such as `pre { display: block }`. */
function hide(node: Element) {
  node.setAttribute('data-quartile-upgraded', '');
  if (node instanceof HTMLElement) {
    node.hidden = true;
    node.style.setProperty('display', 'none', 'important');
  }
}

/**
 * Draws Quartile code blocks and statically rendered blocks under `root` as live
 * `<quartile-chart>` elements. Each original stays where it is, hidden, so frameworks that own
 * that markup keep working, and readers without JavaScript and crawlers keep seeing it. The
 * element follows later changes to the original's text. Returns the number of blocks upgraded.
 */
export function upgradeBlocks(root: ParentNode = document, options: EmbedOptions = {}): number {
  defineQuartileElements();
  const languages = options.languages ?? pageScope().options.languages ?? DEFAULT_LANGUAGES;
  let count = 0;
  for (const match of Array.from(root.querySelectorAll(selectorFor(languages)))) {
    if (match.closest('quartile-chart, [data-quartile-upgraded]')) continue;
    let target: Element = match;
    let read: () => string;
    if (match.hasAttribute('data-quartile-source')) {
      read = () => match.getAttribute('data-quartile-source') ?? '';
    } else if (match.tagName === 'CODE') {
      target = match.parentElement ?? match;
      read = () => match.textContent ?? '';
    } else if (match.tagName === 'DIV') {
      read = () => match.querySelector('pre')?.textContent ?? match.textContent ?? '';
    } else {
      read = () => match.textContent ?? '';
    }
    if (!read().trim()) continue;
    const el = document.createElement('quartile-chart') as QuartileChartElement;
    target.after(el);
    hide(target);
    el.follow(target, () => {
      const text = read();
      return text.endsWith('\n') ? text : `${text}\n`;
    });
    upgraded.add(el);
    count++;
  }
  return count;
}

/** Removes charts whose original block left the page, e.g. a deleted chat message. */
function removeOrphans() {
  for (const el of upgraded) {
    if (!el.sourceNode?.isConnected) {
      upgraded.delete(el);
      el.remove();
    }
  }
}

/** Upgrades blocks now and whenever matching markup is added later (SPAs, chat streams). */
export function observeBlocks(root: ParentNode = document, options: EmbedOptions = {}): () => void {
  upgradeBlocks(root, options);
  if (typeof MutationObserver === 'undefined') return () => {};
  let frame = 0;
  const target = root instanceof Document ? root.documentElement : (root as Node);
  const mo = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      removeOrphans();
      upgradeBlocks(root, options);
    });
  });
  mo.observe(target, { childList: true, subtree: true });
  return () => {
    cancelAnimationFrame(frame);
    mo.disconnect();
  };
}

/** Page-wide settings: source policy, languages, and defaults for theme, host and accent. */
export function configureEmbed(
  options: EmbedOptions & { theme?: ThemeSetting; host?: HostTheme; accent?: string },
) {
  const { theme, host, accent, ...rest } = options;
  Object.assign(pageScope().options, rest);
  setElementDefaults({
    ...(theme ? { theme } : {}),
    ...(host ? { host } : {}),
    ...(accent ? { accent } : {}),
  });
}
