import { withQueryCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// BGP/ASN lookup via RIPEstat (free, no key). Replaces bgpview.io, which is dead.
const RIPE = 'https://stat.ripe.net/data';

async function ripe(path: string): Promise<any> {
  const res = await fetch(`${RIPE}/${path}`, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RIPEstat HTTP ${res.status}`);
  return (await res.json()).data;
}

async function asnHolder(asn: string | number): Promise<string> {
  try {
    const d = await ripe(`as-overview/data.json?resource=AS${asn}`);
    return d.holder || '';
  } catch {
    return '';
  }
}

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');
  if (!query) return NextResponse.json({ error: 'Missing query parameter (IP, ASN number, or prefix)' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const results: any = { query, timestamp: new Date().toISOString() };
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(query) || query.includes(':');
    const isASN = /^(AS)?\d+$/i.test(query);
    const asnNum = isASN ? query.replace(/^AS/i, '') : null;

    if (asnNum) {
      // ASN → overview + announced prefixes + neighbours
      const [ov, pfx, nb] = await Promise.allSettled([
        ripe(`as-overview/data.json?resource=AS${asnNum}`),
        ripe(`announced-prefixes/data.json?resource=AS${asnNum}`),
        ripe(`asn-neighbours/data.json?resource=AS${asnNum}`),
      ]);
      const holder = ov.status === 'fulfilled' ? ov.value.holder || '' : '';
      results.asn = { asn: Number(asnNum), name: holder, description: holder, country_code: '' };
      if (pfx.status === 'fulfilled') {
        const prefixes: string[] = (pfx.value.prefixes || []).map((p: any) => p.prefix).filter(Boolean);
        const v4 = prefixes.filter((p) => p.includes('.'));
        const v6 = prefixes.filter((p) => p.includes(':'));
        results.prefixes = {
          ipv4: v4.slice(0, 20).map((prefix) => ({ prefix })),
          ipv6: v6.slice(0, 10).map((prefix) => ({ prefix })),
          total_v4: v4.length,
          total_v6: v6.length,
        };
      }
      if (nb.status === 'fulfilled') {
        const neigh = nb.value.neighbours || [];
        results.peers = { upstream: neigh.slice(0, 10), total: neigh.length };
      }
      results.type = 'asn';
    } else if (isIP) {
      // IP / prefix → originating ASN(s)
      const info = await ripe(`network-info/data.json?resource=${encodeURIComponent(query)}`);
      const asns: string[] = info.asns || [];
      const prefix = info.prefix || '';
      const prefixes = [];
      for (const a of asns) {
        const name = await asnHolder(a);
        prefixes.push({ prefix, asn: { asn: Number(a), name, country_code: '', description: name } });
      }
      results.ip = { prefixes };
      results.type = 'ip';
    } else {
      return NextResponse.json({ error: 'Unrecognized query format. Use IP address or AS number.' }, { status: 400 });
    }

    return NextResponse.json(results);
  } catch (e: any) {
    return NextResponse.json({ error: 'BGP lookup failed', detail: e?.message }, { status: 500 });
  }
}

export const GET = withQueryCache('osint/bgp', 21600000, _GET);
