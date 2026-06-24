import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/postgres';
import { getOpenSearch } from '@/lib/db/opensearch';
import { getRedis } from '@/lib/db/redis';
import { getNeo4j } from '@/lib/db/neo4j';

export const dynamic = 'force-dynamic';

async function ok(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return true; } catch { return false; }
}

export async function GET() {
  const [pg, os, redis, neo] = await Promise.all([
    ok(() => getPool().query('SELECT 1')),
    ok(() => getOpenSearch().cluster.health()),
    ok(() => getRedis().ping()),
    ok(async () => { const s = getNeo4j().session(); await s.run('RETURN 1'); await s.close(); }),
  ]);
  return NextResponse.json({ postgres: pg, opensearch: os, redis, neo4j: neo });
}
