import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";
import * as schema from "../db/schema";

/** In-process scratch Postgres (PGlite) with the real drizzle migrations applied. */
export async function scratchDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  // Apply the repo's real migrations in journal order. exec() takes multi-statement
  // files, which some hand-written migrations here are (drizzle's migrator would not).
  const dir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries) {
    await client.exec(fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return { db, client };
}
