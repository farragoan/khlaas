import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, ledgerEntries, payments } from "@/lib/db/schema";
import { ComputeLedgerSchema } from "@/lib/schemas";
import { verifyHost } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { computeLedger } from "@/lib/ledger/compute";
import { EXPIRED_ERROR, EXPIRED_STATUS, isExpired } from "@/lib/table-lock";

export async function POST(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ComputeLedgerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, tip } = parsed.data;

  const { userId } = await auth();
  const host = await verifyHost(tableId, { sessionToken, clerkUserId: userId });
  if (!host) {
    return NextResponse.json({ error: "Only the host can settle the bill" }, { status: 403 });
  }

  const [table] = await db
    .select()
    .from(splitTables)
    .where(eq(splitTables.id, tableId))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  if (isExpired(table.status)) {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: EXPIRED_STATUS });
  }

  const [tableItems, tableParticipants, tablePayments] = await Promise.all([
    db.select().from(items).where(eq(items.tableId, tableId)),
    db.select().from(participants).where(eq(participants.tableId, tableId)),
    db.select().from(payments).where(eq(payments.tableId, tableId)),
  ]);

  const tableSelections =
    tableItems.length > 0
      ? await db
          .select({ participantId: selections.participantId, itemId: selections.itemId, quantity: selections.quantity })
          .from(selections)
          .innerJoin(items, eq(selections.itemId, items.id))
          .where(eq(items.tableId, tableId))
      : [];

  // Validate: all non-fee items must have at least one selection
  const unselectedItems = tableItems.filter(
    (i) => !i.isFee && !tableSelections.some((s) => s.itemId === i.id)
  );
  if (unselectedItems.length > 0) {
    return NextResponse.json(
      { error: "unselected_items", items: unselectedItems.map((i) => i.name) },
      { status: 400 }
    );
  }

  // Validate: all participants must have a payment entry
  const paymentMap = new Map(tablePayments.map((p) => [p.participantId, parseFloat(p.amount)]));
  const missingPayments = tableParticipants.filter(
    (p) => !paymentMap.has(p.id)
  );
  if (missingPayments.length > 0) {
    return NextResponse.json(
      { error: "missing_payments", participants: missingPayments.map((p) => p.displayName) },
      { status: 400 }
    );
  }

  // Validate: at least one person must have paid something
  const hasAnyPayment = tableParticipants.some(
    (p) => (paymentMap.get(p.id) ?? 0) > 0
  );
  if (!hasAnyPayment) {
    return NextResponse.json(
      { error: "missing_payments", participants: ["At least one person must have paid"] },
      { status: 400 }
    );
  }

  const ledgerItems = tableItems.map((i) => ({
    id: i.id,
    totalPrice: i.totalPrice ?? "0",
    isFee: i.isFee,
    quantity: i.quantity,
  }));

  const ledgerParticipants = tableParticipants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
  }));

  const ledgerPayments = tablePayments.map((p) => ({
    participantId: p.participantId,
    amount: parseFloat(p.amount),
  }));

  const actualPaidTotal = table.actualPaidTotal ? parseFloat(table.actualPaidTotal) : null;

  const results = computeLedger(ledgerItems, ledgerParticipants, tableSelections, ledgerPayments, tip, actualPaidTotal);

  // Save tip and mark table settled
  await db
    .update(splitTables)
    .set({ status: "settled", tip: String(tip) })
    .where(eq(splitTables.id, tableId));

  if (results.length > 0) {
    await db.insert(ledgerEntries).values(
      results.map((r) => ({
        tableId,
        fromParticipant: r.fromParticipant,
        toParticipant: r.toParticipant,
        amount: String(r.amount),
      }))
    );
  }

  return NextResponse.json({ ok: true, entries: results });
}
