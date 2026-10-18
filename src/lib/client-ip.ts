import { isIP } from 'node:net';

/**
 * Client IP for rate limiting and audit logging.
 *
 * Threat model: app-router route handlers never see the socket address.
 * `next start` / the standalone server only *fill in* `x-forwarded-for` from
 * the socket when the request lacks one (`headers['x-forwarded-for'] ??=
 * socket.remoteAddress` in next/dist/server/base-server.js); a value the
 * client sends is passed through untouched. `x-real-ip` and
 * `cf-connecting-ip` are never set by Next at all. So every one of these
 * headers is attacker-controlled unless a reverse proxy we trust overwrites
 * or appends to it — trusting them by default let anyone dodge per-IP rate
 * limits (rotate a fake IP per request) and forge the audit-log IP.
 *
 * TRUST_PROXY_HEADERS (operator setting):
 *   unset / false  → ignore forwarding headers; every client maps to
 *                    'unknown', so per-IP limits become one shared bucket per
 *                    endpoint (fails closed rather than bypassable).
 *   true / 1       → one trusted proxy (e.g. the bundled nginx): use the
 *                    RIGHTMOST x-forwarded-for entry — the address our proxy
 *                    saw. Earlier entries are whatever the client sent.
 *   N (integer)    → N trusted proxies in a chain: use the Nth entry from
 *                    the right.
 *   cloudflare     → use cf-connecting-ip (origin must only accept
 *                    connections from Cloudflare).
 * Only enable it when the app port is reachable solely through that proxy.
 */
export function trustedProxyHops(): number | 'cloudflare' {
  const raw = (process.env.TRUST_PROXY_HEADERS || '').trim().toLowerCase();
  if (raw === 'cloudflare') return 'cloudflare';
  if (raw === 'true' || raw === 'yes') return 1;
  if (/^\d+$/.test(raw)) return Math.min(Number(raw), 32);
  return 0;
}

function normalise(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim();
  // "[2001:db8::1]:443" / "203.0.113.7:51234" → bare address
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'));
  return isIP(ip) ? ip : null;
}

export function clientIp(req: Request): string {
  const trust = trustedProxyHops();
  if (trust === 0) return 'unknown';
  const h = req.headers;
  if (trust === 'cloudflare') return normalise(h.get('cf-connecting-ip')) || 'unknown';

  const chain = (h.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (chain.length > 0) {
    // Fewer entries than trusted hops means the request skipped part of the
    // chain; the leftmost entry is then the furthest address we have.
    return normalise(chain[Math.max(0, chain.length - trust)]) || 'unknown';
  }
  // A trusted proxy that only sets X-Real-IP (overwriting any client value).
  return normalise(h.get('x-real-ip')) || 'unknown';
}
