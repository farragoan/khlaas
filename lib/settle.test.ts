import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { scratchDb } from "./testing/pg";
import { settleTable } from "./settle";
import { splitTables, participants, ledgerEntries } from "./db/schema";

let ctx: Awaited<ReturnType<typeof scratchDb>>;
let tableId: string;
let a: string;
let b: string;

beforeEach(async () => {
  ctx = await scratchDb();
  const [t] = await ctx.db.insert(splitTables).values({ shareCode: "abc12345", status: "items_ready" }).returning();
  tableId = t.id;
  const ps = await ctx.db
    .insert(participants)
    .values([
      { tableId, displayName: "A" },
      { tableId, displayName: "B" },
    ])
    .returning();
  [a, b] = ps.map((p) => p.id);
});
afterEach(() => ctx.client.close());

const entries = () => [{ fromParticipant: b, toParticipant: a, amount: "120.50" }];
const rows = () => ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.tableId, tableId));
const status = async () => (await ctx.db.select().from(splitTables).where(eq(splitTables.id, tableId)))[0];

describe("settleTable", () => {
  it("settles once: status, tip and ledger rows land together", async () => {
    expect(await settleTable(ctx.db, { tableId, tip: "10.00", entries: entries() })).toBe(true);
    const t = await status();
    expect(t.status).toBe("settled");
    expect(t.tip).toBe("10.00");
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].amount).toBe("120.50");
  });

  it("a double submit inserts nothing the second time", async () => {
    expect(await settleTable(ctx.db, { tableId, tip: "0", entries: entries() })).toBe(true);
    expect(await settleTable(ctx.db, { tableId, tip: "99", entries: entries() })).toBe(false);
    expect(await rows()).toHaveLength(1);
    expect((await status()).tip).toBe("0.00"); // second call did not overwrite the tip
  });

  it("concurrent submits: exactly one wins", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => settleTable(ctx.db, { tableId, tip: "0", entries: entries() }))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
  });

  it("refuses an expired bill and writes nothing", async () => {
    await ctx.db.update(splitTables).set({ status: "expired" }).where(eq(splitTables.id, tableId));
    expect(await settleTable(ctx.db, { tableId, tip: "0", entries: entries() })).toBe(false);
    expect(await rows()).toHaveLength(0);
    expect((await status()).status).toBe("expired");
  });

  it("settles a bill with no transfers (everyone even) and still marks it settled", async () => {
    expect(await settleTable(ctx.db, { tableId, tip: "0", entries: [] })).toBe(true);
    expect((await status()).status).toBe("settled");
    expect(await rows()).toHaveLength(0);
  });

  it("returns false for an unknown table", async () => {
    expect(
      await settleTable(ctx.db, { tableId: "00000000-0000-4000-8000-000000000000", tip: "0", entries: [] })
    ).toBe(false);
  });

  it("rolls back the status change when a ledger row is invalid (one statement, atomic)", async () => {
    await expect(
      settleTable(ctx.db, {
        tableId,
        tip: "0",
        entries: [{ fromParticipant: "00000000-0000-4000-8000-000000000001", toParticipant: a, amount: "1.00" }],
      })
    ).rejects.toThrow();
    expect((await status()).status).toBe("items_ready");
    expect(await rows()).toHaveLength(0);
  });
});
