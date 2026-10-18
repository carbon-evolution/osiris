import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Who may drive the RECON scanner proxy (/api/scanner)?  OWASP A01.
 *
 * The scanner makes *this server* probe arbitrary public hosts (ports, TLS,
 * headers, whois, vuln fingerprinting). OSIRIS has no user accounts, so on a
 * public deployment every anonymous visitor could otherwise use it as a scan
 * relay that attributes the traffic to the operator's IP.
 *
 * Access is granted, in order, when:
 *   1. SCANNER_ALLOW_ANONYMOUS=true — operator explicitly opts in to a public
 *      scanner (not recommended).
 *   2. SCANNER_ACCESS_TOKEN is set and the request carries it in the
 *      X-Scanner-Token header (constant-time compare). A custom header cannot
 *      be attached cross-origin without a CORS preflight, so a third-party
 *      page cannot ride on a token holder's browser.
 *   3. Local development: `next dev` (NODE_ENV=development — the documented
 *      `npm run osiris` flow) AND the request looks loopback-originated.
 * Anything else is refused: 401 when a token would help, 403 when the
 * operator has configured no way in for remote clients.
 *
 * Why rule 3 is limited to `next dev`: route handlers cannot see the socket
 * address, and Next only fills in X-Forwarded-For when the client did not
 * send one, so "is this request from loopback?" is answered purely from
 * client-supplied headers. The Host / X-Forwarded-For / Sec-Fetch-Site checks
 * stop browser-borne abuse (DNS rebinding, a LAN visitor's browser, a
 * cross-site page firing requests at localhost) but not a deliberate non-
 * browser client on the same network that forges them. That is acceptable
 * only for the dev server, which must never be exposed publicly anyway;
 * production builds (`next start`, Docker, standalone) always need rule 1 or 2.
 */

export const SCANNER_TOKEN_HEADER = 'x-scanner-token';

export type ScannerAccess =
  | { ok: true; via: 'anonymous' | 'token' | 'local-dev' }
  | { ok: false; status: 401 | 403; body: { error: string; detail: string; auth?: 'token' } };

function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

/** Constant-time string compare (hashing first equalises lengths). */
export function tokensMatch(given: string, expected: string): boolean {
  return timingSafeEqual(sha256(given), sha256(expected));
}

const LOOPBACK_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i;
const LOOPBACK_IP = /^(127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/i;

export function looksLikeLocalDevRequest(req: Request): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  const h = req.headers;
  if (!LOOPBACK_HOST.test(h.get('host') || '')) return false;
  // Next fills X-Forwarded-For from the socket when absent; anything other
  // than a single loopback address means a proxy (or a forger) is involved.
  const xff = h.get('x-forwarded-for');
  if (xff !== null && !LOOPBACK_IP.test(xff.trim())) return false;
  if (h.get('x-real-ip') !== null || h.get('cf-connecting-ip') !== null || h.get('forwarded') !== null) return false;
  // Browsers send Sec-Fetch-Site; refuse requests initiated by another site.
  const site = h.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

export function checkScannerAccess(req: Request): ScannerAccess {
  if ((process.env.SCANNER_ALLOW_ANONYMOUS || '').trim().toLowerCase() === 'true') {
    return { ok: true, via: 'anonymous' };
  }

  const expected = process.env.SCANNER_ACCESS_TOKEN || '';
  const given = req.headers.get(SCANNER_TOKEN_HEADER) || '';
  if (expected && given && tokensMatch(given, expected)) return { ok: true, via: 'token' };

  if (looksLikeLocalDevRequest(req)) return { ok: true, via: 'local-dev' };

  if (expected) {
    return {
      ok: false,
      status: 401,
      body: {
        error: given ? 'Invalid scanner access token' : 'Scanner access token required',
        detail: 'Send the operator-issued SCANNER_ACCESS_TOKEN in the X-Scanner-Token header.',
        auth: 'token',
      },
    };
  }
  return {
    ok: false,
    status: 403,
    body: {
      error: 'Scanner disabled for remote clients',
      detail: 'The operator must set SCANNER_ACCESS_TOKEN (or SCANNER_ALLOW_ANONYMOUS=true) to enable RECON scans on this host.',
    },
  };
}
