import type { Config } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";

export default async function () {
  const url = process.env.DATABASE_URL;
  if (!url) return { statusCode: 500, body: "DATABASE_URL not set" };
  const sql = neon(url);
  await sql`SELECT 1`;
  return { statusCode: 200, body: "ok" };
}

export const config: Config = {
  schedule: "*/4 * * * *",
};
