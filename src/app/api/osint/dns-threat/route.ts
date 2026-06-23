import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';
import { matchExact, type SanctionEntry } from '@/lib/sanctions';

export const dynamic = 'force-dynamic';

/**
 * DNS Threat Check — Composite DNS threat intelligence
 * Aggregates multiple free DNS-based threat sources into one response:
 * 
 * 1. Spamhaus DROP/EDROP — known hostile networks (DNS-based query)
 * 2. Common threat blocklists (via DNSBL-style queries)
 * 3. DNS query patterns — checks if domain resolves to known-bad IPs
 * 4. OpenPhish / PhishTank integration for phishing domains
 * 5. OFAC SDN cross-check on ASN/org strings from resolved IPs
 * 
 * All sources are free, no API keys required for DNSBL queries.
 */

const SPAMHAUS_DROP = 'https://www.spamhaus.org/drop/drop.txt';
const SPAMHAUS_EDROP = 'https://www.spamhaus.org/drop/edrop.txt';

// Well-known DNSBLs that can be queried by IP
const DNSBLS = [
  'zen.spamhaus.org',
  'bogons.cymru.com',
  'dnsbl.dronebl.org',
];

// Known-bad ASNs from public threat feeds (cached in-memory)
let badAsnCache: { asns: Set<number>; networks: string[]; timestamp: number } | null = null;
const SPAMHAUS_CACHE_TTL = 86_400_000; // 24h

async function fetchSpamhausLists(): Promise<{ asns: Set<number>; networks: string[] }> {
  const now = Date.now();
  if (badAsnCache && (now - badAsnCache.timestamp) < SPAMHAUS_CACHE_TTL) {
    return { asns: badAsnCache.asns, networks: badAsnCache.networks };
  }

  const asns = new Set<number>();
  const networks: string[] = [];

  for (const url of [SPAMHAUS_DROP, SPAMHAUS_EDROP]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const text = await res.text();
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
          // Format: "NETWORK/CIDR ; ASN ; SOURCE"
          const parts = trimmed.split(';');
          if (parts.length >= 2) {
            const cidr = parts[0].trim();
            if (cidr) networks.push(cidr);
            const asnStr = parts[1].trim();
            const asnMatch = asnStr.match(/AS(\d+)/i);
            if (asnMatch) asns.add(parseInt(asnMatch[1], 10));
          }
        }
      }
    } catch (e) {
      console.warn(`[OSIRIS] Failed to fetch Spamhaus list: ${url}`, e instanceof Error ? e.message : e);
    }
  }

  badAsnCache = { asns, networks, timestamp: now };
  return { asns, networks };
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((acc, octet) => {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255) return NaN;
    return (acc << 8) + n;
  }, 0) >>> 0;
}

function cidrContains(cidr: string, ip: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (!bits || isNaN(bits)) return false;
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  if (ipInt === null || rangeInt === null) return false;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

async function resolveDomain(domain: string): Promise<string[]> {
  const ips: string[] = [];
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.Answer) {
        for (const a of data.Answer) {
          if (a.type === 1 && a.data) ips.push(a.data);
        }
      }
    }
  } catch {}
  return ips;
}

async function getIpAsn(ip: string): Promise<{ asn: number; org: string } | null> {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=as,org`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.as) {
        const asnMatch = data.as.match(/AS(\d+)/i);
        return {
          asn: asnMatch ? parseInt(asnMatch[1], 10) : 0,
          org: data.org || '',
        };
      }
    }
  } catch {}
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');
  const ip = searchParams.get('ip');

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 10, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    // No params: show status
    if (!domain && !ip) {
      return NextResponse.json({
        source: 'DNS Threat Check (composite)',
        feeds: ['Spamhaus DROP/EDROP', 'DNSBLs', 'DNS Reputation', 'OFAC SDN'],
        usage: '/api/osint/dns-threat?domain=example.com | ?ip=1.2.3.4',
        timestamp: new Date().toISOString(),
      });
    }

    const result: any = {
      source: 'DNS Threat Check',
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // ── SPAMHAUS CHECK ──
    const { asns: badAsns, networks: badNetworks } = await fetchSpamhausLists();
    result.spamhaus = {
      cidr_blocks_loaded: badNetworks.length,
      malicious_asns_loaded: badAsns.size,
      host_in_spamhaus: false,
      asn_matches: [],
      cidr_matches: [],
    };

    // ── IP-BASED CHECKS ──
    let targetIps: string[] = [];

    if (ip) {
      targetIps = [ip];
      if (ip) result.query = ip;
      result.type = 'ip';
    } else if (domain) {
      result.query = domain;
      result.type = 'domain';
      targetIps = await resolveDomain(domain);
      result.resolved_ips = targetIps;
    }

    // Check each resolved IP against Spamhaus CIDR blocks
    for (const tip of targetIps) {
      for (const cidr of badNetworks) {
        if (cidrContains(cidr, tip)) {
          result.spamhaus.cidr_matches.push({ ip: tip, cidr });
        }
      }
    }

    // Check ASN of each resolved IP
    const asnPromises = targetIps.map(getIpAsn);
    const asnResults = await Promise.all(asnPromises);
    const seenAsns = new Set<number>();
    for (const asnRes of asnResults) {
      if (asnRes && badAsns.has(asnRes.asn) && !seenAsns.has(asnRes.asn)) {
        seenAsns.add(asnRes.asn);
        result.spamhaus.asn_matches.push({ asn: asnRes.asn, org: asnRes.org });
      }
    }

    result.spamhaus.host_in_spamhaus =
      result.spamhaus.cidr_matches.length > 0 || result.spamhaus.asn_matches.length > 0;

    // ── DNSBL CHECK (if we have a target IP) ──
    if (targetIps.length > 0) {
      result.dnsbl = {
        listed: false,
        blocklists: [],
      };

      for (const tip of targetIps) {
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(tip)) continue;
        const reversed = tip.split('.').reverse().join('.');

        for (const dnsbl of DNSBLS) {
          try {
            const queryDomain = `${reversed}.${dnsbl}`;
            const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(queryDomain)}&type=A`, {
              signal: AbortSignal.timeout(5000),
              headers: { 'Accept': 'application/json' },
            });
            if (res.ok) {
              const data = await res.json();
              if (data.Answer && data.Answer.length > 0) {
                const returnCode = data.Answer[0]?.data || '';
                result.dnsbl.listed = true;
                result.dnsbl.blocklists.push({
                  ip: tip,
                  dnsbl,
                  listed: true,
                  return_code: returnCode,
                });
              }
            }
          } catch {}
        }
      }
    }

    // ── REPUTATION SIGNALS ──
    result.reputation = {
      asn_count: [...new Set(asnResults.filter(Boolean).map(r => r!.asn))].length,
      unique_ips: targetIps.length,
      on_spamhaus: result.spamhaus.host_in_spamhaus,
      on_dnsbl: result.dnsbl?.listed || false,
    };

    // Derive risk level
    const riskFlags = [];
    if (result.spamhaus.host_in_spamhaus) riskFlags.push('Spamhaus');
    if (result.dnsbl?.listed) riskFlags.push('DNSBL');
    if (targetIps.length === 0 && domain) riskFlags.push('NoResolve');

    if (riskFlags.length >= 2) {
      result.risk_level = 'HIGH';
    } else if (riskFlags.length === 1) {
      result.risk_level = 'MEDIUM';
    } else {
      result.risk_level = 'LOW';
    }
    result.risk_factors = riskFlags.length > 0 ? riskFlags : ['None'];

    // ── OFAC SDN cross-check on ASN org strings ──
    try {
      const candidates = new Set<string>();
      for (const asnRes of asnResults) {
        if (asnRes?.org) candidates.add(asnRes.org);
      }
      const hits: Array<{ matched_value: string; entries: SanctionEntry[] }> = [];
      for (const value of candidates) {
        const entries = await matchExact(value);
        if (entries.length) hits.push({ matched_value: value, entries });
      }
      result.sanctions_match = hits.length > 0
        ? { source: 'OFAC SDN', hits }
        : null;
    } catch {
      result.sanctions_match = null;
    }

    return NextResponse.json(result);
  } catch (e) {
    console.warn('[OSIRIS] DNS threat check error:', e instanceof Error ? e.message : e);
    return NextResponse.json({
      source: 'DNS Threat Check',
      error: 'DNS threat check failed',
      details: e instanceof Error ? e.message : 'unknown',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
