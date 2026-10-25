/**
 * Long-running job worker (pg-boss). Needs Node >= 22.12 and a Postgres the
 * app can reach with a persistent connection — i.e. the self-hosted box, not
 * Netlify functions. Run: DATABASE_URL=... pnpm worker
 *
 * pg-boss keeps its queue tables in the `pgboss` schema of the app database;
 * give it its own role and watch vacuum on that schema (see FOSS-TOOLING.md s9).
 */
import { PgBoss } from "pg-boss";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { registerJobs } from "../lib/jobs/register";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const boss = new PgBoss(url);
boss.on("error", (err: unknown) => console.error("pg-boss error", err));

const pool = new Pool({ connectionString: url, max: 2 });
pool.on("error", (err) => console.error("pg pool error", err));

await boss.start();
await registerJobs(boss, drizzle(pool));
console.log("khlaas worker running");

async function shutdown() {
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
