import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { expireStaleSessions, expireTables } from "../../lib/jobs/sweeps";

// Platform cron for the Netlify deployment. The sweeps themselves live in
// lib/jobs/sweeps.ts and are shared with the pg-boss worker (scripts/worker.ts)
// and the systemd one-shot (scripts/sweep.ts) used on the self-hosted box.
export default async function handler() {
  const url = process.env.DATABASE_URL;
  if (!url) return { statusCode: 500, body: "DATABASE_URL not set" };

  const db = drizzle(neon(url));
  const expired = await expireTables(db);
  const revoked = await expireStaleSessions(db);

  const body = `Expired ${expired} tables, revoked ${revoked} stale sessions`;
  console.log(body);
  return { statusCode: 200, body };
}

export const config: Config = {
  schedule: "0 0 * * *",
};
