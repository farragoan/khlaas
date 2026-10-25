import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";
import * as schema from "../db/schema";

/** In-process scratch Postgres (PGlite) with the real dbmate migrations applied. */
export async function scratchDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  // Apply the repo's real dbmate migrations in filename order (only the
  // `-- migrate:up` half of each). exec() takes multi-statement files.
  const dir = path.resolve(__dirname, "../../db/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const up = sql.split(/^-- migrate:down\s*$/m)[0].replace(/^-- migrate:up\s*$/m, "");
    await client.exec(up);
  }
  return { db, client };
}
