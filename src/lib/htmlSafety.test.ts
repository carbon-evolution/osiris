import { describe, it, expect } from 'vitest';
import { escapeHtml, escDeep, parseEsc, jsArg, safeUrl } from './htmlSafety';

// What the browser does to an attribute value before running it as JS.
const decodeAttr = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`')
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&\``)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;&#96;',
    );
  });
});

describe('escDeep', () => {
  it('escapes nested strings and leaves other values alone', () => {
    const out = escDeep({ name: '<b>', n: 9.8, ok: true, none: null, list: ['<i>'], o: { x: '"' } });
    expect(out).toEqual({ name: '&lt;b&gt;', n: 9.8, ok: true, none: null, list: ['&lt;i&gt;'], o: { x: '&quot;' } });
  });

  it('does not mutate its input', () => {
    const input = { name: '<b>' };
    escDeep(input);
    expect(input.name).toBe('<b>');
  });
});

describe('parseEsc', () => {
  it('parses JSON first, then escapes the values', () => {
    expect(parseEsc<string[]>('["CVE-1","<script>"]')).toEqual(['CVE-1', '&lt;script&gt;']);
  });

  it('accepts already-decoded values (maplibre 6 nested properties)', () => {
    expect(parseEsc<string[]>(['CVE-1', '<script>'])).toEqual(['CVE-1', '&lt;script&gt;']);
    expect(parseEsc<string[]>([])).toEqual([]);
  });
});

describe('jsArg', () => {
  it('round-trips a hostile value through an onclick attribute without executing it', () => {
    const name = `x'}); alert(1); ({'"</button><script>`;
    const attr = `go(${jsArg({ type: 'cctv', name, lat: 55.6 })})`;
    expect(attr).not.toMatch(/["'<>]/); // nothing can break out of onclick="..."
    let received: unknown;
    new Function('go', decodeAttr(attr))((v: unknown) => { received = v; });
    expect(received).toEqual({ type: 'cctv', name, lat: 55.6 });
  });

  it('encodes undefined as null', () => {
    expect(jsArg(undefined)).toBe('null');
  });
});

describe('safeUrl', () => {
  it('allows http(s) and escapes the result', () => {
    expect(safeUrl('https://example.com/?a=1&b="2"')).toBe('https://example.com/?a=1&amp;b=&quot;2&quot;');
    expect(safeUrl('http://glider.dk/cam.jpg')).toBe('http://glider.dk/cam.jpg');
  });

  it.each(['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'not a url', '', undefined, 42])(
    'blocks %s',
    u => expect(safeUrl(u)).toBe('#'),
  );
});
