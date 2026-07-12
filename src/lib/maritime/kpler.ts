/**
 * OSIRIS — Kpler (MarineTraffic) maritime enrichment.
 *
 * Kpler's Maritime 2.0 / AIS API (developers.kpler.com) is a GraphQL service at
 * api.sml.kpler.com/graphql, authenticated with an Auth0 client-credentials
 * Bearer token minted from auth.kpler.com. This module holds the credentials,
 * mints/caches the token, and enriches the live AIS ships with Kpler-only
 * fields (e.g. matched/normalised destination). It is fully fail-soft: if the
 * credentials are missing, or the Auth0 client has no API grant yet, or the
 * request errors, it no-ops and the aisstream.io feed keeps the layer working.
 *
 * Enable it by setting KPLER_CLIENT_ID + KPLER_CLIENT_SECRET (or KPLER_BASIC,
 * the base64 of `client_id:client_secret`) in the environment. Until the Kpler
 * account provisions a client-grant for the resource server, token minting
 * returns Auth0 `access_denied` ("create a client-grant associated to this
 * API") — we surface that once via the status below rather than spamming logs.
 */

const AUTH_URL = process.env.KPLER_AUTH_URL || 'https://auth.kpler.com/oauth/token';
const GRAPHQL_URL = process.env.KPLER_GRAPHQL_URL || 'https://api.sml.kpler.com/graphql';
const AUDIENCE = process.env.KPLER_AUDIENCE || 'https://terminal.kpler.com';

/** Human-readable state of the Kpler integration, surfaced in the API payload. */
export type KplerStatus =
  | 'disabled'      // no credentials configured
  | 'active'        // token acquired, enrichment running
  | 'unprovisioned' // credentials valid but no client-grant on the API yet
  | 'error';        // unexpected auth/network failure

type Creds = { id: string; secret: string };

function readCreds(): Creds | null {
  let id = process.env.KPLER_CLIENT_ID;
  let secret = process.env.KPLER_CLIENT_SECRET;
  if ((!id || !secret) && process.env.KPLER_BASIC) {
    try {
      const [bid, bsecret] = Buffer.from(process.env.KPLER_BASIC, 'base64')
        .toString('utf8')
        .split(':');
      id = id || bid;
      secret = secret || bsecret;
    } catch { /* malformed KPLER_BASIC */ }
  }
  return id && secret ? { id, secret } : null;
}

const g = globalThis as unknown as {
  kplerToken?: { value: string; expiresAt: number };
  kplerStatus?: KplerStatus;
  kplerLoggedStatus?: KplerStatus;
  kplerRetryAfter?: number;
};

// Back off after a failed token mint so a 10s poll loop doesn't hammer Auth0
// (and risk rate-limiting) while the client-grant is still missing.
const TOKEN_RETRY_MS = 5 * 60 * 1000;

export function getKplerStatus(): KplerStatus {
  return g.kplerStatus ?? (readCreds() ? 'error' : 'disabled');
}

/** Log a status transition once, so provisioning gaps don't spam the console. */
function noteStatus(status: KplerStatus, detail?: string) {
  g.kplerStatus = status;
  if (g.kplerLoggedStatus !== status) {
    g.kplerLoggedStatus = status;
    if (status === 'unprovisioned') {
      console.warn('[kpler] credentials valid but the Auth0 client has no API grant yet — ' +
        'ask Kpler to add a client-grant for ' + AUDIENCE + '. Enrichment paused until then.');
    } else if (status === 'error' && detail) {
      console.warn('[kpler] token error:', detail);
    } else if (status === 'active') {
      console.log('[kpler] enrichment active.');
    }
  }
}

/** Mint (and cache) an Auth0 client-credentials Bearer token, or null. */
async function getToken(): Promise<string | null> {
  const creds = readCreds();
  if (!creds) { g.kplerStatus = 'disabled'; return null; }

  if (g.kplerToken && g.kplerToken.expiresAt > Date.now() + 60_000) {
    return g.kplerToken.value;
  }
  if (g.kplerRetryAfter && Date.now() < g.kplerRetryAfter) return null;

  let res: Response;
  try {
    res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: creds.id,
        client_secret: creds.secret,
        audience: AUDIENCE,
      }),
    });
  } catch (e) {
    noteStatus('error', String(e));
    return null;
  }

  const body = await res.json().catch(() => ({} as any));
  if (!res.ok || !body.access_token) {
    g.kplerRetryAfter = Date.now() + TOKEN_RETRY_MS;
    // Auth0 returns 403 access_denied with a "create a client-grant" message
    // when the client authenticates but isn't authorised for the resource server.
    const desc: string = body.error_description || body.error || '';
    if (res.status === 403 || /client-grant|not authorized/i.test(desc)) {
      noteStatus('unprovisioned');
    } else {
      noteStatus('error', desc || `HTTP ${res.status}`);
    }
    return null;
  }

  g.kplerToken = {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  };
  g.kplerRetryAfter = undefined;
  noteStatus('active');
  return g.kplerToken.value;
}

type Ship = {
  mmsi: number;
  destination?: string;
  matchedDestination?: string;
  navStatus?: number;
  [k: string]: unknown;
};

/**
 * Enrich in-place with Kpler-only fields for the vessels we already track.
 * Batched by MMSI. No-ops (returns the current status) if no token is available.
 */
export async function enrichWithKpler(ships: Ship[]): Promise<KplerStatus> {
  const token = await getToken();
  if (!token) return getKplerStatus();

  const mmsis = ships.map((s) => s.mmsi).filter(Boolean).slice(0, 500);
  if (mmsis.length === 0) return 'active';

  // Maritime 2.0 GraphQL: latest joined position + voyage per vessel. Only the
  // Kpler-value-add fields we don't get from raw AIS are requested here.
  const query = `query Vessels($mmsi: [MMSI!]) {
    vessels(mmsi: $mmsi) {
      mmsi
      lastPositionUpdate { navigationalStatus }
      currentVoyage { matchedPort { name country } destination }
    }
  }`;

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables: { mmsi: mmsis } }),
    });
    const json = await res.json().catch(() => ({} as any));
    const rows: any[] = json?.data?.vessels ?? [];
    if (!rows.length) return 'active';

    const byMmsi = new Map<number, Ship>();
    for (const s of ships) byMmsi.set(s.mmsi, s);
    for (const r of rows) {
      const s = byMmsi.get(Number(r.mmsi));
      if (!s) continue;
      const mp = r.currentVoyage?.matchedPort;
      if (mp?.name) s.matchedDestination = [mp.name, mp.country].filter(Boolean).join(', ');
      if (r.lastPositionUpdate?.navigationalStatus != null && s.navStatus == null) {
        s.navStatus = r.lastPositionUpdate.navigationalStatus;
      }
    }
    return 'active';
  } catch (e) {
    noteStatus('error', String(e));
    return getKplerStatus();
  }
}
