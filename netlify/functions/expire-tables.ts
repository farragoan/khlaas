import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

export default async function () {
  const url = process.env.DATABASE_URL;
  if (!url) return { statusCode: 500, body: "DATABASE_URL not set" };

  const sql = neon(url);
  const expired = await sql`
    UPDATE split_tables
    SET status = 'expired'
    WHERE status NOT IN ('expired', 'settled')
      AND (
        (expires_at IS NOT NULL AND expires_at < NOW())
        OR (expires_at IS NULL AND created_at < NOW() - INTERVAL '24 hours')
      )
    RETURNING id
  `;

  console.log(`Expired ${expired.length} tables`);
  return { statusCode: 200, body: `Expired ${expired.length} tables` };
}

export const config: Config = {
  schedule: "0 0 * * *",
};
