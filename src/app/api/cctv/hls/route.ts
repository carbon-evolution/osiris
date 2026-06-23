import { NextResponse } from 'next/server';
import { safeFetch } from '@/lib/ssrf-guard';
import { HLS_PROXY_HOSTS, toHlsProxyUrl } from '../hls-hosts';

export const dynamic = 'force-dynamic';

/**
 * Same-origin HLS proxy for Indonesian CCTV feeds.
 *
 * hls.js fetches the .m3u8 playlist and every .ts segment cross-origin, which
 * fails when the upstream CDN omits CORS headers (see hls-hosts.ts). This
 * proxy fetches them server-side and:
 *   - for .m3u8 playlists, rewrites every segment / sub-playlist / key URL to
 *     point back through this same endpoint (so nested fetches are proxied too)
 *   - for everything else (.ts segments, keys), streams the bytes through.
 * A Referer matching the upstream host is added, which also recovers feeds
 * that 403 on a missing/foreign Referer.
 */
export async function GET(req: Request) {
  const urlStr = new URL(req.url).searchParams.get('url');
  if (!urlStr) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  let upstream: URL;
  try {
    upstream = new URL(urlStr);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  if (!HLS_PROXY_HOSTS.includes(upstream.hostname)) {
    return NextResponse.json({ error: 'domain not allowed' }, { status: 403 });
  }

  try {
    const res = await safeFetch(urlStr, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OSIRIS/1.0; +https://github.com/simplifaisoul/osiris)',
        // Many of these feeds gate on a same-origin Referer.
        'Referer': `${upstream.protocol}//${upstream.host}/`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error', status: res.status }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || '';
    const isPlaylist =
      /\.m3u8(\?|$)/i.test(upstream.pathname + upstream.search) ||
      /mpegurl/i.test(contentType);

    if (isPlaylist) {
      const text = await res.text();
      const rewritten = rewritePlaylist(text, upstream);
      return new NextResponse(rewritten, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Binary passthrough (segments, encryption keys, etc.)
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType || 'video/mp2t',
        // Segments are immutable for their short lifetime; brief cache is safe.
        'Cache-Control': 'public, max-age=5',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg.includes('aborted') || msg.includes('timeout')) {
      return NextResponse.json({ error: 'timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * Rewrite a .m3u8 so every URL (segments, variant playlists, and URI="..."
 * attributes on #EXT-X-KEY / #EXT-X-MAP) is resolved to an absolute URL and
 * routed back through this proxy. Relative URLs are resolved against `base`.
 */
function rewritePlaylist(text: string, base: URL): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return line;

      if (trimmed.startsWith('#')) {
        // Rewrite any URI="..." attributes (keys, maps, media renditions).
        if (/URI="/i.test(trimmed)) {
          return line.replace(/URI="([^"]+)"/gi, (_m, uri: string) => {
            const abs = resolveAbsolute(uri, base);
            return abs ? `URI="${toHlsProxyUrl(abs)}"` : _m;
          });
        }
        return line;
      }

      // A bare URL line: segment or sub-playlist.
      const abs = resolveAbsolute(trimmed, base);
      return abs ? toHlsProxyUrl(abs) : line;
    })
    .join('\n');
}

function resolveAbsolute(ref: string, base: URL): string | null {
  try {
    return new URL(ref, base).toString();
  } catch {
    return null;
  }
}
