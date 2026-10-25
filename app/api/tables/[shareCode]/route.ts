import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, ledgerEntries, payments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { verifyHost, hashToken } from "@/lib/auth";
import { toPublicTable, redactParticipants } from "@/lib/public-table";
import { auth } from "@clerk/nextjs/server";
import { UpdateTableSchema } from "@/lib/schemas";
import { paiseToString, toPaise } from "@/lib/money";
import { EXPIRED_ERROR, EXPIRED_STATUS, isExpired } from "@/lib/table-lock";

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

  // Who is looking? upiId is only for people at the table: the host, a guest
  // whose session token matches a participant here, or a signed-in participant.
  let viewerIsParticipant = !!hostParticipant;
  if (!viewerIsParticipant && sessionToken) {
    const [match] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.tableId, table.id), eq(participants.sessionToken, hashToken(sessionToken))))
      .limit(1);
    viewerIsParticipant = !!match;
  }
  if (!viewerIsParticipant && userId) {
    viewerIsParticipant = tableParticipants.some((p) => p.userId === userId);
  }

  const response = NextResponse.json({
    table: toPublicTable(table),
    items: tableItems,
    participants: redactParticipants(tableParticipants, viewerIsParticipant),
    selections: tableSelections,
    payments: tablePayments,
    ledger: tableLedger,
    isHost: !!hostParticipant,
  });

  // The body now depends on who asks (upiId, isHost), so a shared cache must
  // never serve one viewer's copy to another.
  response.headers.set("Cache-Control", "private, no-store");

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

  if (isExpired(table.status)) {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: EXPIRED_STATUS });
  }

  const { userId } = await auth();
  const host = await verifyHost(table.id, { sessionToken, clerkUserId: userId });
  if (!host) {
    return NextResponse.json({ error: "Only the host can update the table" }, { status: 403 });
  }

  const parsed = UpdateTableSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const updates: Record<string, unknown> = {};

  if (body.currency) updates.currency = body.currency.toUpperCase();
  if (body.paymentMode) updates.paymentMode = body.paymentMode;

  if (body.actualPaidTotal === null) {
    updates.actualPaidTotal = null;
  } else if (body.actualPaidTotal !== undefined) {
    const tableItems = await db.select().from(items).where(eq(items.tableId, table.id));
    const billPaise = tableItems.reduce((sum, i) => sum + toPaise(i.totalPrice ?? "0"), 0);
    const requested = toPaise(body.actualPaidTotal);
    if (billPaise > 0 && requested > billPaise) {
      return NextResponse.json(
        { error: "actualPaidTotal cannot exceed the original bill total" },
        { status: 400 }
      );
    }
    updates.actualPaidTotal = paiseToString(requested);
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
