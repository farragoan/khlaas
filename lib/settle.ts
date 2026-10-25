import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// Driver-agnostic: neon-http (prod), node-postgres (worker) and PGlite (tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDb = PgDatabase<PgQueryResultHKT, any>;

export interface SettleEntry {
  fromParticipant: string;
  toParticipant: string;
  /** NUMERIC string, e.g. "12.30" */
  amount: string;
}

/**
 * Settle a bill exactly once.
 *
 * One statement does the whole job: the UPDATE claims the table only if it is
 * not already settled or expired (taking the row lock, so a concurrent settle
 * blocks until the first commits and then re-checks the predicate and claims
 * nothing), and the ledger rows are inserted FROM the claimed row. A single SQL
 * statement is one implicit transaction, so status and ledger can never
 * diverge — which is what we need because neon-http has no interactive
 * transactions (`db.transaction` throws there).
 *
 * Returns false when this call did not settle the bill (already settled, expired
 * or missing); the caller turns that into a 409 without having written anything.
 */
export async function settleTable(
  db: AnyPgDb,
  args: { tableId: string; tip: string; entries: SettleEntry[] }
): Promise<boolean> {
  const entries = JSON.stringify(
    args.entries.map((e) => ({
      from_participant: e.fromParticipant,
      to_participant: e.toParticipant,
      amount: e.amount,
    }))
  );
  const result = await db.execute(sql`
    WITH claimed AS (
      UPDATE split_tables
      SET status = 'settled', tip = ${args.tip}::numeric
      WHERE id = ${args.tableId}::uuid AND status NOT IN ('settled', 'expired')
      RETURNING id
    ), inserted AS (
      INSERT INTO ledger_entries (table_id, from_participant, to_participant, amount)
      SELECT claimed.id, e.from_participant, e.to_participant, e.amount
      FROM claimed, jsonb_to_recordset(${entries}::jsonb)
        AS e(from_participant uuid, to_participant uuid, amount numeric)
      RETURNING id
    )
    SELECT (SELECT count(*) FROM claimed)::int AS claimed
  `);
  const rows = (result as unknown as { rows: { claimed: number }[] }).rows;
  return (rows[0]?.claimed ?? 0) > 0;
}
