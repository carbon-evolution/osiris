import { getPool, ensureSchema } from './db/postgres';

export interface AuditEntry {
  user?: string;
  ip?: string;
  source?: string;       // route / tool name
  query?: string;        // sanitized query summary
  resultCount?: number;
}

/**
 * Append an audit record. Fire-and-forget and fail-soft: auditing must never
 * break a request, so errors are swallowed (logged once).
 */
export async function audit(e: AuditEntry): Promise<void> {
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO audit_log (app_user, ip, source, query, result_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [e.user ?? null, e.ip ?? null, e.source ?? null, e.query ?? null, e.resultCount ?? null],
    );
  } catch (err) {
    console.warn('[OSIRIS] audit write failed:', err instanceof Error ? err.message : err);
  }
}
