import { withQueryCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

// Only the Google DoH fields this route reads.
interface DohAnswer {
  name?: string;
  type?: number;
  TTL?: number;
  data?: string;
}

interface DohResponse {
  Answer?: DohAnswer[];
  Status?: number;
}

interface DnsRecord {
  name?: string;
  type?: number;
  ttl?: number;
  data?: string;
}

interface DnsResult {
  domain: string;
  records: Record<string, DnsRecord[]>;
  timestamp: string;
  summary?: {
    ip_addresses: (string | undefined)[];
    mail_servers: (string | undefined)[];
    nameservers: (string | undefined)[];
    total_records: number;
  };
}

// DNS Lookup via Google DNS-over-HTTPS (free, no key)
async function _GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain');
  if (!domain) return NextResponse.json({ error: 'Missing domain parameter' }, { status: 400 });

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Basic domain validation
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
  }

  try {
    const types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA'];
    const results: DnsResult = { domain, records: {}, timestamp: new Date().toISOString() };

    const lookups = await Promise.allSettled(
      types.map(async (type) => {
        const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, {
          signal: AbortSignal.timeout(5000),
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          const data: DohResponse = await res.json();
          return { type, answers: data.Answer || [], status: data.Status };
        }
        return { type, answers: [] as DohAnswer[], status: -1 };
      })
    );

    for (const result of lookups) {
      if (result.status === 'fulfilled') {
        const { type, answers } = result.value;
        results.records[type] = answers.map((a) => ({
          name: a.name,
          type: a.type,
          ttl: a.TTL,
          data: a.data,
        }));
      }
    }

    // Extract useful summary
    const aRecords = results.records.A || [];
    const mxRecords = results.records.MX || [];
    const nsRecords = results.records.NS || [];
    
    results.summary = {
      ip_addresses: aRecords.map((r) => r.data),
      mail_servers: mxRecords.map((r) => r.data),
      nameservers: nsRecords.map((r) => r.data),
      total_records: Object.values(results.records).flat().length,
    };

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'DNS lookup failed' }, { status: 500 });
  }
}

export const GET = withQueryCache('osint/dns', 21600000, _GET);
