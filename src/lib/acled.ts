/**
 * ACLED (Armed Conflict Location & Event Data) client.
 *
 * ACLED's current API uses an OAuth password grant:
 *   1. POST /oauth/token  with the account email + password  → bearer token
 *   2. GET  /api/acled/read  with `Authorization: Bearer <token>`
 *
 * Credentials come from the environment (never hardcoded). Either:
 *   ACLED_EMAIL + ACLED_PASSWORD   — your myACLED login (password grant), or
 *   ACLED_ACCESS_TOKEN             — a token pasted from the ACLED portal
 *   ACLED_CLIENT_ID                — optional, defaults to "acled"
 *
 * Note: accounts registered via Google/SSO have no password, so set one on
 * your myACLED account to use the email/password path (or supply a token).
 *
 * If credentials are absent the helper returns [] so OSIRIS keeps working
 * keyless. Tokens (valid 24h) are cached in-module until shortly before expiry.
 */

const TOKEN_URL = 'https://acleddata.com/oauth/token';
const READ_URL = 'https://acleddata.com/api/acled/read';

let cachedToken: { value: string; expiresAt: number } | null = null;

export function acledConfigured(): boolean {
  return Boolean(
    process.env.ACLED_ACCESS_TOKEN ||
    (process.env.ACLED_EMAIL && process.env.ACLED_PASSWORD),
  );
}

async function getToken(): Promise<string | null> {
  // A directly-supplied token wins (e.g. for SSO accounts without a password).
  if (process.env.ACLED_ACCESS_TOKEN) return process.env.ACLED_ACCESS_TOKEN;
  if (!process.env.ACLED_EMAIL || !process.env.ACLED_PASSWORD) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;

  // ACLED's OAuth token endpoint expects form-urlencoded (not JSON).
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      username: process.env.ACLED_EMAIL!,
      password: process.env.ACLED_PASSWORD!,
      grant_type: 'password',
      client_id: process.env.ACLED_CLIENT_ID || 'acled',
      scope: 'authenticated',
    }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`ACLED token ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('ACLED token missing');
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 86400) * 1000,
  };
  return cachedToken.value;
}

export type AcledEvent = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: 'conflict' | 'unrest' | 'political';
  category: string;
  count: number;
  fatalities: number;
  actors: string;
  country: string;
  date: string;
  url: string;
  source: 'ACLED';
};

// Map ACLED event types to OSIRIS incident buckets.
function bucket(eventType: string): AcledEvent['type'] {
  const t = (eventType || '').toLowerCase();
  if (t.includes('protest')) return 'unrest';
  if (t.includes('riot')) return 'unrest';
  if (t.includes('strategic')) return 'political';
  return 'conflict'; // Battles, Explosions/Remote violence, Violence against civilians
}

/**
 * Fetch recent ACLED events (default: last `days` days, capped at `limit`).
 * Returns [] when unconfigured or on any failure (never throws to the caller).
 */
// When the account is authenticated but not yet entitled to the API (403),
// back off so we don't attempt a doomed read on every incidents poll.
let accessDeniedUntil = 0;

export async function fetchAcledEvents(days = 30, limit = 600): Promise<AcledEvent[]> {
  try {
    if (Date.now() < accessDeniedUntil) return [];
    const token = await getToken();
    if (!token) return [];

    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      event_date: since,
      event_date_where: '>=',
      limit: String(limit),
      _format: 'json',
    });
    const res = await fetch(`${READ_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 401 || res.status === 403) {
      // API not enabled for this account yet — skip ACLED for an hour.
      accessDeniedUntil = Date.now() + 3600_000;
      console.warn('[OSIRIS] ACLED API access denied (403/401) — backing off 1h');
      return [];
    }
    if (!res.ok) throw new Error(`ACLED read ${res.status}`);
    const json = await res.json();
    const rows: any[] = Array.isArray(json) ? json : json.data || [];

    const events: AcledEvent[] = [];
    for (const r of rows) {
      const lat = parseFloat(r.latitude);
      const lng = parseFloat(r.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;
      const actors = [r.actor1, r.actor2].filter(Boolean).join(' vs ');
      const fatalities = parseInt(r.fatalities, 10) || 0;
      events.push({
        id: `acled-${r.event_id_cnty || `${r.event_date}-${lat}-${lng}`}`,
        lat,
        lng,
        name: (r.notes || `${r.sub_event_type || r.event_type} in ${r.location || r.country || 'unknown'}`).slice(0, 240),
        type: bucket(r.event_type),
        category: r.sub_event_type || r.event_type || 'Conflict Event',
        count: fatalities || 1,
        fatalities,
        actors,
        country: r.country || '',
        date: r.event_date || '',
        url: `https://acleddata.com/dashboard/#/dashboard?event_id=${encodeURIComponent(r.event_id_cnty || '')}`,
        source: 'ACLED',
      });
    }
    return events;
  } catch (e) {
    console.warn('[OSIRIS] ACLED fetch failed:', e instanceof Error ? e.message : e);
    return [];
  }
}
