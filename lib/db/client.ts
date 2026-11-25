import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;

function getPoolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  const isLocalhost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname,
  );

  let ssl: PoolConfig["ssl"];
  if (sslmode === "require") {
    // Match libpq's sslmode=require: encrypt without verifying the server cert.
    ssl = { rejectUnauthorized: false };
  } else if (sslmode === "disable" || isLocalhost) {
    ssl = false;
  }

  if (ssl !== undefined) {
    // pg parses connectionString after PoolConfig and would otherwise replace
    // this explicit setting with its own interpretation of sslmode.
    url.searchParams.delete("sslmode");
  }

  return { connectionString: url.toString(), max: 10, ssl };
}

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool(getPoolConfig(url));
  pool.on("error", (err) => {
    console.error("Unexpected error on idle PostgreSQL client", err);
  });
  _db = drizzle(pool, { schema });
  return _db;
}

// Convenience export — still lazy (only executed on first import in a request context)
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});
