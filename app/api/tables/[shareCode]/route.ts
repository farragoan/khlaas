import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, ledgerEntries, payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyHost } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  const [table] = await db
    .select()
    .from(splitTables)
    .where(eq(splitTables.shareCode, shareCode))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const [tableItems, tableParticipants] = await Promise.all([
    db.select().from(items).where(eq(items.tableId, table.id)),
    db
      .select({
        id: participants.id,
        tableId: participants.tableId,
        displayName: participants.displayName,
        userId: participants.userId,
        upiId: participants.upiId,
        joinedAt: participants.joinedAt,
        splitsSubmittedAt: participants.splitsSubmittedAt,
      })
      .from(participants)
      .where(eq(participants.tableId, table.id))
      .catch(() =>
        // upi_id / splits_submitted_at columns not yet migrated — fall back without them
        db
          .select({
            id: participants.id,
            tableId: participants.tableId,
            displayName: participants.displayName,
            userId: participants.userId,
            joinedAt: participants.joinedAt,
          })
          .from(participants)
          .where(eq(participants.tableId, table.id))
          .then((rows) => rows.map((r) => ({ ...r, upiId: null as string | null, splitsSubmittedAt: null as Date | null }))
          )
      ),
  ]);

  const [tableSelections, tablePayments, tableLedger] = await Promise.all([
    tableItems.length > 0
      ? db
          .select({ id: selections.id, participantId: selections.participantId, itemId: selections.itemId, quantity: selections.quantity })
          .from(selections)
          .innerJoin(items, eq(selections.itemId, items.id))
          .where(eq(items.tableId, table.id))
      : Promise.resolve([]),
    db.select().from(payments).where(eq(payments.tableId, table.id)),
    (table.status === "settled" || table.status === "editing")
      ? db.select().from(ledgerEntries).where(eq(ledgerEntries.tableId, table.id))
      : Promise.resolve([]),
  ]);

  const sessionToken = req.headers.get("x-session-token");
  const { userId } = await auth();
  const hostParticipant = await verifyHost(table.id, { sessionToken, clerkUserId: userId });

  const response = NextResponse.json({
    table,
    items: tableItems,
    participants: tableParticipants,
    selections: tableSelections,
    payments: tablePayments,
    ledger: tableLedger,
    isHost: !!hostParticipant,
  });

  response.headers.set("Cache-Control", "public, s-maxage=2, stale-while-revalidate=5");

  return response;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const [table] = await db
    .select()
    .from(splitTables)
    .where(eq(splitTables.shareCode, shareCode))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const { userId } = await auth();
  const host = await verifyHost(table.id, { sessionToken, clerkUserId: userId });
  if (!host) {
    return NextResponse.json({ error: "Only the host can update the table" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.currency && typeof body.currency === "string" && body.currency.length === 3) {
    updates.currency = body.currency;
  }

  if (body.paymentMode && ["host", "split"].includes(body.paymentMode)) {
    updates.paymentMode = body.paymentMode;
  }

  if (body.actualPaidTotal === null) {
    updates.actualPaidTotal = null;
  } else if (typeof body.actualPaidTotal === "number" && body.actualPaidTotal >= 0) {
    updates.actualPaidTotal = String(body.actualPaidTotal);
  } else if (typeof body.actualPaidTotal === "string" && body.actualPaidTotal === "") {
    updates.actualPaidTotal = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await db
    .update(splitTables)
    .set(updates)
    .where(eq(splitTables.id, table.id));

  return NextResponse.json({ ok: true });
}
