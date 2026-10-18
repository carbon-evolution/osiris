import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

// Optional, self-hosted Umami page-view analytics. OFF by default: nothing is
// sent anywhere unless the operator sets BOTH UMAMI_URL and UMAMI_WEBSITE_ID.
const ANALYTICS_TIMEOUT_MS = 2000;

function umamiEndpoint(): { endpoint: string; websiteId: string } | null {
  const base = process.env.UMAMI_URL?.trim();
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!base || !websiteId) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/send`;
    return { endpoint: url.toString(), websiteId };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const umami = umamiEndpoint();
  if (!umami) return NextResponse.next();

  // The client IP is forwarded only as a header so Umami can do its own geo
  // lookup / visitor hashing; it is never put in the event payload.
  const ip = (request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '')
    .split(',')[0]
    .trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': request.headers.get('user-agent') || 'Unknown OSIRIS Client',
  };
  if (ip) headers['x-forwarded-for'] = ip;

  const payload = {
    hostname: request.nextUrl.hostname,
    language: 'en-US',
    referrer: request.headers.get('referer') || '',
    screen: '1920x1080',
    title: 'OSIRIS',
    url: request.nextUrl.pathname,
    website: umami.websiteId,
  };

  try {
    const pageView = fetch(umami.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ payload, type: 'event' }),
      signal: AbortSignal.timeout(ANALYTICS_TIMEOUT_MS),
    }).then(
      () => undefined,
      () => undefined,
    );
    event.waitUntil(pageView);
  } catch {
    // Analytics must never break page loads.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
