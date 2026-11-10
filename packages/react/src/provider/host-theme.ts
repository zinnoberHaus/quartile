/**
 * Reads the colors of the page around an embedded Quartile root, so charts can take the host's
 * background, text color and light/dark mode. Browser-only; every function tolerates a missing
 * DOM and returns null rather than guessing.
 */

export interface HostColors {
  /** Effective background behind the root: the first opaque background up the tree. */
  background: string;
  /** Inherited text color at the root's position. */
  text: string;
  /** Light or dark, from the background's lightness. */
  scheme: 'light' | 'dark';
}

/** The element whose styles the root inherits, crossing a shadow boundary to its host. */
export function hostElementOf(root: Element): Element | null {
  if (root.parentElement) return root.parentElement;
  const node = root.getRootNode?.();
  return node && 'host' in node ? ((node as ShadowRoot).host ?? null) : null;
}

function parentAcrossShadow(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const node = el.getRootNode?.();
  return node && 'host' in node ? ((node as ShadowRoot).host ?? null) : null;
}

let probe: CanvasRenderingContext2D | null | undefined;

/** Any CSS color (rgb, hsl, oklch, color(), names) as sRGB bytes plus alpha 0–1. */
export function toRgba(color: string): [number, number, number, number] | null {
  const direct =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
      color.trim(),
    );
  if (direct) {
    const a =
      direct[4] == null
        ? 1
        : direct[4].endsWith('%')
          ? Number.parseFloat(direct[4]) / 100
          : Number(direct[4]);
    return [Number(direct[1]), Number(direct[2]), Number(direct[3]), a];
  }
  if (color.trim().toLowerCase() === 'transparent') return [0, 0, 0, 0];
  if (probe === undefined) {
    try {
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      probe = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    } catch {
      probe = null;
    }
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#010203';
  probe.fillStyle = color;
  if (probe.fillStyle === '#010203' && color.trim() !== '#010203') return null;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

/** WCAG relative luminance of an sRGB color, 0 (black) to 1 (white). */
export function luminance([r, g, b]: [number, number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Reads the host's colors at `root`. Null outside a browser or when nothing can be read. */
export function readHostColors(root: Element): HostColors | null {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return null;
  const host = hostElementOf(root);
  if (!host) return null;
  const text = getComputedStyle(host).color;
  let background: string | null = null;
  for (let el: Element | null = host; el; el = parentAcrossShadow(el)) {
    const bg = getComputedStyle(el).backgroundColor;
    const rgba = bg ? toRgba(bg) : null;
    if (rgba && rgba[3] > 0.5) {
      background = bg;
      break;
    }
  }
  if (!background) {
    // Nothing painted: the canvas color follows the root's color-scheme.
    const dark =
      getComputedStyle(document.documentElement).colorScheme?.includes('dark') &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    background = dark ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)';
  }
  const bgRgba = toRgba(background);
  const textRgba = text ? toRgba(text) : null;
  let scheme: 'light' | 'dark' = 'light';
  if (bgRgba) scheme = luminance(bgRgba) < 0.35 ? 'dark' : 'light';
  else if (textRgba) scheme = luminance(textRgba) > 0.5 ? 'dark' : 'light';
  return { background, text: text || (scheme === 'dark' ? '#f2f0e9' : '#16150f'), scheme };
}

/** Attributes sites flip to switch themes; a change triggers a re-read. */
export const THEME_ATTRIBUTES = [
  'class',
  'style',
  'data-theme',
  'data-mode',
  'data-color-mode',
  'data-color-scheme',
  'data-md-color-scheme',
  'data-bs-theme',
];

/** Calls `onChange` when the page's theme may have changed. Returns a cleanup function. */
export function watchHostTheme(root: Element, onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(onChange);
  };
  const observers: MutationObserver[] = [];
  if (typeof MutationObserver !== 'undefined') {
    const targets = new Set<Element>([document.documentElement]);
    if (document.body) targets.add(document.body);
    for (let el = hostElementOf(root); el && targets.size < 12; el = parentAcrossShadow(el))
      targets.add(el);
    for (const target of targets) {
      const mo = new MutationObserver(schedule);
      mo.observe(target, { attributes: true, attributeFilter: THEME_ATTRIBUTES });
      observers.push(mo);
    }
  }
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', schedule);
  return () => {
    cancelAnimationFrame(frame);
    for (const mo of observers) mo.disconnect();
    mq?.removeEventListener?.('change', schedule);
  };
}
