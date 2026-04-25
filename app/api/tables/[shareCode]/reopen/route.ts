import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, participants, ledgerEntries, payments } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const { shareCode } = await params;

  const [table] = await db
    .select()
    .from(splitTables)
    .where(eq(splitTables.shareCode, shareCode))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  if (table.status !== "settled" && table.status !== "items_ready") {
    return NextResponse.json({ error: "Cannot reopen in current status" }, { status: 409 });
  }

  // Verify caller is the host (first participant by joinedAt)
  const [host] = await db
    .select()
    .from(participants)
    .where(eq(participants.tableId, table.id))
    .orderBy(asc(participants.joinedAt))
    .limit(1);

  if (!host || host.sessionToken !== sessionToken) {
    return NextResponse.json({ error: "Only the host can reopen a bill" }, { status: 403 });
  }

  // Clear ledger + payments, set status to editing
  await Promise.all([
    db.delete(ledgerEntries).where(eq(ledgerEntries.tableId, table.id)),
    db.delete(payments).where(eq(payments.tableId, table.id)),
  ]);

  await db
    .update(splitTables)
    .set({ status: "editing" })
    .where(eq(splitTables.id, table.id));

  return NextResponse.json({ ok: true });
}
