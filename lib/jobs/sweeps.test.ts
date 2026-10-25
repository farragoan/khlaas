import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import { scratchDb } from "../testing/pg";
import { expireStaleSessions, expireTables } from "./sweeps";
import { registerJobs, QUEUES, type BossLike } from "./register";
import { splitTables, participants } from "../db/schema";

let ctx: Awaited<ReturnType<typeof scratchDb>>;
beforeEach(async () => {
  ctx = await scratchDb();
});
afterEach(() => ctx.client.close());

async function table(code: string, status: string, expiresAgo: string | null, createdAgo = "1 hour") {
  const exp = expiresAgo ? sql.raw(`NOW() - INTERVAL '${expiresAgo}'`) : sql`NULL`;
  await ctx.db.execute(sql`INSERT INTO split_tables (share_code, status, expires_at, created_at)
    VALUES (${code}, ${status}, ${exp}, NOW() - ${sql.raw(`INTERVAL '${createdAgo}'`)})`);
}
const statusOf = async (code: string) =>
  (await ctx.db.select().from(splitTables).where(eq(splitTables.shareCode, code)))[0].status;

describe("expireTables", () => {
  it("expires overdue bills, spares settled, future and fresh ones", async () => {
    await table("overdue01", "items_ready", "1 hour");
    await table("settled01", "settled", "1 hour");
    await table("future001", "items_ready", null);
    await table("legacyold", "items_ready", null, "25 hours");
    await ctx.db.execute(sql`UPDATE split_tables SET expires_at = NOW() + INTERVAL '1 day' WHERE share_code='future001'`);
    expect(await expireTables(ctx.db)).toBe(2);
    expect(await statusOf("overdue01")).toBe("expired");
    expect(await statusOf("legacyold")).toBe("expired");
    expect(await statusOf("settled01")).toBe("settled");
    expect(await statusOf("future001")).toBe("items_ready");
  });
  it("is idempotent", async () => {
    await table("overdue01", "items_ready", "1 hour");
    expect(await expireTables(ctx.db)).toBe(1);
    expect(await expireTables(ctx.db)).toBe(0);
  });
});

describe("expireStaleSessions", () => {
  async function guest(code: string) {
    const [t] = await ctx.db.select().from(splitTables).where(eq(splitTables.shareCode, code));
    await ctx.db.insert(participants).values({ tableId: t.id, displayName: code, sessionToken: "hash-" + code });
  }
  const tokenOf = async (code: string) =>
    (await ctx.db.select().from(participants).where(eq(participants.displayName, code)))[0].sessionToken;

  it("clears tokens only on bills expired beyond the grace period", async () => {
    await table("oldexpire", "expired", "10 days");
    await table("newexpire", "expired", "1 day");
    await table("liveeeeee", "items_ready", "10 days"); // overdue but not yet swept: left alone
    await table("settledold", "settled", "10 days");
    for (const c of ["oldexpire", "newexpire", "liveeeeee", "settledold"]) await guest(c);
    expect(await expireStaleSessions(ctx.db)).toBe(1);
    expect(await tokenOf("oldexpire")).toBeNull();
    expect(await tokenOf("newexpire")).toBe("hash-newexpire");
    expect(await tokenOf("liveeeeee")).toBe("hash-liveeeeee");
    expect(await tokenOf("settledold")).toBe("hash-settledold");
    expect(await expireStaleSessions(ctx.db)).toBe(0);
  });
});

describe("registerJobs", () => {
  it("creates queues with retry/backoff, registers workers and daily schedules", async () => {
    const boss = {
      createQueue: vi.fn(async () => {}),
      schedule: vi.fn(async () => {}),
      work: vi.fn(async () => "id"),
    } satisfies BossLike;
    await registerJobs(boss, ctx.db, () => {});
    for (const q of Object.values(QUEUES)) {
      expect(boss.createQueue).toHaveBeenCalledWith(q.name, expect.objectContaining({ retryLimit: 3, retryBackoff: true }));
      expect(boss.schedule).toHaveBeenCalledWith(q.name, q.cron, null, { tz: "UTC" });
    }
    expect(boss.work).toHaveBeenCalledTimes(2);
  });
  it("worker handlers run the real sweeps", async () => {
    await table("overdue01", "items_ready", "1 hour");
    const handlers: Record<string, () => Promise<unknown>> = {};
    const boss: BossLike = {
      createQueue: async () => {},
      schedule: async () => {},
      work: async (n, h) => ((handlers[n] = () => h([])), "id"),
    };
    const log = vi.fn();
    await registerJobs(boss, ctx.db, log);
    await handlers[QUEUES.expireTables.name]();
    expect(await statusOf("overdue01")).toBe("expired");
    expect(log).toHaveBeenCalledWith("expired 1 tables");
  });
});
