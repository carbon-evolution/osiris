/**
 * HTML-safety helpers for map popups.
 *
 * Map popups are HTML strings built from third-party feed data (camera names,
 * news titles, threat-intel fields...), so every string is escaped before it
 * reaches Popup.setHTML(). onclick handlers get JSON-encoded raw values and
 * hrefs are limited to http(s).
 */
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"'`]/g, ch => HTML_ESCAPES[ch]);
}

/** Deep copy with every string HTML-escaped; numbers, booleans and null are untouched. */

export function escDeep<T>(v: T): T {
  if (typeof v === 'string') return escapeHtml(v) as T;
  if (Array.isArray(v)) return v.map(escDeep) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escDeep(x)])) as T;
  return v;
}

/** Parse a JSON-string feature property, then escape the result. */

export function parseEsc<T>(s: string): T {
  return escDeep(JSON.parse(s) as T);
}

/** Encode a value as a JS literal that is safe inside an HTML onclick="" attribute. */

export function jsArg(v: unknown): string {
  return escapeHtml(JSON.stringify(v ?? null));
}

/** Allow only http(s) URLs in href; returns the escaped URL, or '#'. */

export function safeUrl(u: unknown): string {
  if (typeof u !== 'string') return '#';
  try {
    const { protocol } = new URL(u);
    return protocol === 'http:' || protocol === 'https:' ? escapeHtml(u) : '#';
  } catch {
    return '#';
  }
}
