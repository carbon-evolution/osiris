import { withQueryCache } from '@/lib/feeds/serve';
import { NextResponse } from 'next/server';

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mac = searchParams.get('mac');

  if (!mac) {
    return NextResponse.json({ error: 'Missing MAC parameter' }, { status: 400 });
  }

  // Clean the MAC address format to allow varied inputs
  const cleanMac = mac.trim().toUpperCase().replace(/[^A-F0-9:-]/g, '');

  try {
    // macvendors.co is dead (308-redirects to nothing). api.macvendors.com is the
    // live endpoint and returns the vendor as PLAIN TEXT (or 404 if unknown).
    const res = await fetch(`https://api.macvendors.com/${encodeURIComponent(cleanMac)}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404) {
      return NextResponse.json({ mac: cleanMac, vendor: 'Not Found' });
    }
    if (!res.ok) {
      throw new Error(`MacVendors API HTTP ${res.status}`);
    }

    const vendor = (await res.text()).trim();
    return NextResponse.json({
      mac: cleanMac,
      vendor: vendor || 'Not Found',
      prefix: cleanMac.replace(/[:-]/g, '').slice(0, 6),
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'MAC lookup failed', detail: error.message }, { status: 502 });
  }
}

export const GET = withQueryCache('osint/mac', 86400000, _GET);
