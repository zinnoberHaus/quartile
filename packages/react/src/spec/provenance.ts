/**
 * Provenance of a view: where its data came from and when it was current. Plain data, checked
 * here so that the compiler and every renderer agree on what may become a link.
 */
import { makeFormatter } from '../data/format';
import { toDate } from '../data/schema';

/** The provenance settings a component spec or a Dashboard may carry. */
export interface Provenance {
  /** Where the data came from, shown as "Source: …". */
  source?: string;
  /** An http or https link for the source. Rendered as a link; never fetched. */
  sourceUrl?: string;
  /** When the data was current, shown as "As of …": text, or an ISO date or time. */
  asOf?: string;
}

/**
 * The absolute http(s) URL in `value`, normalized, or null. Other schemes (`javascript:`,
 * `data:`, `file:`), relative paths, whitespace and control characters are refused, as are URLs
 * carrying credentials: `https://bank.example@other.example` reads like one site and opens
 * another.
 */
export function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^https?:\/\/[^\s/]/i.test(text)) return null;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 32 || code === 127 || ch === '\\') return null;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A short name for a link without source text: its host, without a leading `www.`. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Display text for `asOf`: an ISO date or date-time is written the way the page writes dates;
 * anything else ("Q3 2026", "last Friday's close") is shown as written.
 */
export function formatAsOf(
  value: unknown,
  options: { locale?: string; timeZone?: string } = {},
): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const format = ISO_DAY.test(text) ? 'date' : ISO_INSTANT.test(text) ? 'datetime' : null;
  if (!format || !Number.isFinite(toDate(text).getTime())) return text;
  return makeFormatter(format, options)(text);
}

/** "Source: World Bank · As of Nov 1, 2026", for descriptions and other plain-text surfaces. */
export function provenanceText(
  spec: Provenance,
  options: { locale?: string; timeZone?: string } = {},
): string {
  const source = typeof spec.source === 'string' ? spec.source.trim() : '';
  const href = httpUrl(spec.sourceUrl);
  const asOf = formatAsOf(spec.asOf, options);
  const name = source || (href ? hostOf(href) : '');
  return [name && `Source: ${name}`, asOf && `As of ${asOf}`].filter(Boolean).join(' · ');
}
