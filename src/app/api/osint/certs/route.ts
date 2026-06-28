import { withQueryCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// Certificate Transparency lookup via crt.sh (free, no key)
async function _GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');
  if (!domain) return NextResponse.json({ error: 'Missing domain parameter' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
  }

  const subdomains = new Set<string>();
  const uniqueCerts: any[] = [];
  let totalCerts = 0;
  let source = '';

  // Source 1: crt.sh (richest, but frequently 502s under load).
  try {
    const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Osiris-OSINT/3.0' },
    });
    if (res.ok) {
      const certs = await res.json();
      totalCerts = certs.length;
      source = 'crt.sh';
      const seen = new Set<string>();
      for (const cert of certs.slice(0, 200)) {
        const key = `${cert.common_name}-${cert.serial_number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        (cert.name_value || '').split('\n').forEach((n: string) => {
          const clean = n.trim().replace(/^\*\./, '');
          if (clean.endsWith(domain)) subdomains.add(clean);
        });
        uniqueCerts.push({
          id: cert.id, issuer: cert.issuer_name, common_name: cert.common_name,
          name_value: cert.name_value, not_before: cert.not_before,
          not_after: cert.not_after, serial: cert.serial_number,
        });
      }
    }
  } catch { /* fall through to certspotter */ }

  // Source 2 (fallback): Cert Spotter — used when crt.sh is down/empty.
  if (uniqueCerts.length === 0) {
    try {
      const res = await fetch(
        `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`,
        { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Osiris-OSINT/3.0' } },
      );
      if (res.ok) {
        const issuances = await res.json();
        if (Array.isArray(issuances)) {
          totalCerts = issuances.length;
          source = 'certspotter';
          for (const c of issuances.slice(0, 200)) {
            const names: string[] = c.dns_names || [];
            names.forEach((n) => {
              const clean = n.trim().replace(/^\*\./, '');
              if (clean.endsWith(domain)) subdomains.add(clean);
            });
            uniqueCerts.push({
              id: c.id, issuer: c.issuer?.name || '', common_name: names[0] || '',
              name_value: names.join('\n'), not_before: c.not_before, not_after: c.not_after, serial: '',
            });
          }
        }
      }
    } catch { /* both sources failed */ }
  }

  if (uniqueCerts.length === 0 && subdomains.size === 0) {
    return NextResponse.json(
      { domain, certificates: [], subdomains: [], error: 'No CT source reachable (crt.sh and certspotter both failed)' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    domain,
    source,
    certificates: uniqueCerts.slice(0, 50),
    subdomains: Array.from(subdomains).sort(),
    total_certs: totalCerts,
    unique_subdomains: subdomains.size,
    timestamp: new Date().toISOString(),
  });
}

export const GET = withQueryCache('osint/certs', 86400000, _GET);
