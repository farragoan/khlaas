import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, ledgerEntries, payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyHost } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";

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

  const { userId } = await auth();
  const host = await verifyHost(table.id, { sessionToken, clerkUserId: userId });
  if (!host) {
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
