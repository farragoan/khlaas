/**
 * One-shot housekeeping for systemd timers (no queue needed for a fixed daily
 * sweep). Run: DATABASE_URL=... pnpm sweep
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { expireStaleSessions, expireTables } from "../lib/jobs/sweeps";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  const db = drizzle(pool);
  console.log(`expired ${await expireTables(db)} tables`);
  console.log(`revoked ${await expireStaleSessions(db)} stale sessions`);
} finally {
  await pool.end();
}
