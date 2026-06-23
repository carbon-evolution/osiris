import { NextResponse } from 'next/server';
import { safeFetch } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

const ALLOWED_DOMAINS = [
  // Taiwan — National Freeway (國道) MJPEG hosts
  'cctvn.freeway.gov.tw',
  'cctvc.freeway.gov.tw',
  'cctvs.freeway.gov.tw',
  'cctvn5.freeway.gov.tw',
  // Taiwan — Provincial Highway (省道) THB MJPEG hosts (cctv-ss01..08)
  'cctv-ss01.thb.gov.tw',
  'cctv-ss02.thb.gov.tw',
  'cctv-ss03.thb.gov.tw',
  'cctv-ss04.thb.gov.tw',
  'cctv-ss05.thb.gov.tw',
  'cctv-ss06.thb.gov.tw',
  'cctv-ss07.thb.gov.tw',
  'cctv-ss08.thb.gov.tw',
  'thbapp.thb.gov.tw',
  '117.56.235.1',
  '117.56.180.1',
  'tie.digitraffic.fi',
  'weathercam.digitraffic.fi',
  'sigip.infraestruturasdeportugal.pt',
  'its.binamarga.pu.go.id',
];

const BOUNDARY_PAT = /boundary=([^;\s]+)/i;

/**
 * Proxies an MJPEG camera stream by extracting the first JPEG frame.
 * Browsers don't reliably render multipart/x-mixed-replace in <img> tags,
 * so we extract a single frame server-side and return it as image/jpeg.
 * The frontend polls this endpoint every 5s to get fresh frames.
 */
export async function GET(req: Request) {
  const urlStr = new URL(req.url).searchParams.get('url');
  if (!urlStr) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  let host: string;
  try {
    host = new URL(urlStr).hostname;
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  if (!ALLOWED_DOMAINS.includes(host)) {
    return NextResponse.json({ error: 'domain not allowed' }, { status: 403 });
  }

  try {
    const res = await safeFetch(urlStr, {
      // Some Taiwan gov MJPEG hosts (e.g. cctvs.freeway.gov.tw) are slow to
      // open the stream — allow extra headroom before aborting.
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OSIRIS/1.0; +https://github.com/simplifaisoul/osiris)',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error', status: res.status }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || '';

    // If the upstream already returns a single image, pass it through
    if (!contentType.includes('multipart')) {
      const buf = await res.arrayBuffer();
      return new NextResponse(buf, {
        headers: {
          'Content-Type': contentType || 'image/jpeg',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // ── MJPEG multipart parsing ──
    const boundary = extractBoundary(contentType);
    if (!boundary) {
      return NextResponse.json({ error: 'no boundary' }, { status: 502 });
    }

    const boundaryBuf = Buffer.from(`--${boundary}`, 'latin1');
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'no body' }, { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let totalLen = 0;

    // Extract the first complete JPEG frame (boundary → part headers → JPEG →
    // next boundary) from a buffer, or null if not yet fully present.
    const doubleCRLF = Buffer.from('\r\n\r\n', 'latin1');
    const extractFrame = (buf: Buffer): Buffer | null => {
      const firstIdx = buf.indexOf(boundaryBuf);
      if (firstIdx === -1) return null;
      const headerEndRel = buf.slice(firstIdx + boundaryBuf.length).indexOf(doubleCRLF);
      if (headerEndRel === -1) return null;
      const jpegStart = firstIdx + boundaryBuf.length + headerEndRel + 4;
      const nextIdx = buf.indexOf(boundaryBuf, jpegStart);
      if (nextIdx === -1) return null;
      let jpegEnd = nextIdx;
      if (jpegEnd >= 2 && buf[jpegEnd - 2] === 0x0d && buf[jpegEnd - 1] === 0x0a) jpegEnd -= 2;
      const jpeg = buf.slice(jpegStart, jpegEnd);
      return jpeg.length > 0 ? jpeg : null;
    };

    // Stop as soon as one full frame is available rather than always draining
    // 256 KB: slow HTTP/1.1 MJPEG hosts (e.g. cctvc.freeway.gov.tw) reset the
    // socket if read too long, surfacing as a "terminated" error. The 256 KB
    // cap remains a safety bound, and a mid-stream reset is salvaged below.
    let frame: Buffer | null = null;
    try {
      while (totalLen < 262144) {
        const { done, value } = await reader.read();
        if (value) {
          chunks.push(value);
          totalLen += value.length;
        }
        frame = extractFrame(Buffer.concat(chunks));
        if (frame || done) break;
      }
    } catch {
      // Upstream closed a long-lived MJPEG connection — use what we collected.
      frame = extractFrame(Buffer.concat(chunks));
    } finally {
      try { await reader.cancel(); } catch { /* best effort */ }
    }

    if (!frame) {
      return NextResponse.json({ error: 'no frame' }, { status: 502 });
    }

    return new NextResponse(frame, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
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

function extractBoundary(contentType: string): string | null {
  const m = contentType.match(BOUNDARY_PAT);
  if (!m) return null;
  // Per RFC 2046 the multipart separator in the body is "--" + boundary, and
  // the caller prepends "--". But some MJPEG servers (e.g. Taiwan freeway
  // cctv*.freeway.gov.tw) declare the boundary value with the dashes already
  // included (`boundary=--myboundary`), so a naive prepend searches for
  // `----myboundary` and never matches. Strip any leading dashes so the search
  // marker is exactly the "--myboundary" that appears in the stream.
  return m[1].replace(/^-+/, '');
}
