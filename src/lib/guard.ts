import { NextResponse } from 'next/server';
import { limit, LIMITS } from './rateLimit';
import { audit } from './audit';
import { clientIp } from './client-ip';

// Forwarding headers are only honoured when TRUST_PROXY_HEADERS is set — see
// ./client-ip for the threat model.
export { clientIp };

/**
 * Rate-limit + audit guard for Node-runtime route handlers.
 *
 * Why not Next middleware? Middleware runs on the Edge runtime, which cannot
 * load `pg` / `ioredis` (Node TCP sockets). This guard runs inside the route
 * (Node runtime) instead. Call it at the top of a handler:
 *
 *   const blocked = await guardRequest(req, 'osint/sweep');
 *   if (blocked) return blocked;
 *
 * Returns a 429 NextResponse when the caller is over the anonymous limit;
 * otherwise returns null and records an audit row (fire-and-forget).
 */
export async function guardRequest(req: Request, source: string): Promise<NextResponse | null> {
  const ip = clientIp(req);
  const { allowed } = await limit(`${source}:${ip}`, LIMITS.anon.max, LIMITS.anon.windowMs);
  void audit({ ip, source, query: new URL(req.url).search.slice(0, 200) });
  if (!allowed) {
    return NextResponse.json(
      { error: 'rate limit exceeded', source, retry_after_ms: LIMITS.anon.windowMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(LIMITS.anon.windowMs / 1000)) } },
    );
  }
  return null;
}
