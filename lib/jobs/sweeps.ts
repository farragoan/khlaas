import { sql } from "drizzle-orm";
import type { AnyPgDb } from "@/lib/settle";

const rowsOf = (r: unknown) => (r as { rows: Record<string, unknown>[] }).rows;

/**
 * Move bills past their deadline to `expired`. Settled bills are history and
 * are never touched; bills without expires_at fall back to 24h after creation.
 * Idempotent: running it twice (a retry, an overlapping run) expires nothing new.
 */
export async function expireTables(db: AnyPgDb): Promise<number> {
  const res = await db.execute(sql`
    UPDATE split_tables
    SET status = 'expired'
    WHERE status NOT IN ('expired', 'settled')
      AND (
        (expires_at IS NOT NULL AND expires_at < NOW())
        OR (expires_at IS NULL AND created_at < NOW() - INTERVAL '24 hours')
      )
    RETURNING id
  `);
  return rowsOf(res).length;
}

/**
 * Revoke guest session tokens on bills that expired more than `graceDays` ago.
 * An expired bill is read-only, so its tokens can no longer authorise anything
 * useful; leaving the hashes around only widens what a database leak exposes.
 * Idempotent: only rows that still hold a token are touched.
 */
export async function expireStaleSessions(db: AnyPgDb, graceDays = 7): Promise<number> {
  const res = await db.execute(sql`
    UPDATE participants
    SET session_token = NULL
    WHERE session_token IS NOT NULL
      AND table_id IN (
        SELECT id FROM split_tables
        WHERE status = 'expired'
          AND COALESCE(expires_at, created_at) < NOW() - make_interval(days => ${graceDays}::int)
      )
    RETURNING id
  `);
  return rowsOf(res).length;
}
