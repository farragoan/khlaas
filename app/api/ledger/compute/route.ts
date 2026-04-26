import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, ledgerEntries, payments } from "@/lib/db/schema";
import { ComputeLedgerSchema } from "@/lib/schemas";
import { verifyHostSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { computeLedger } from "@/lib/ledger/compute";

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

  const host = await verifyHostSession(tableId, sessionToken);
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

  const [tableItems, tableParticipants, tablePayments] = await Promise.all([
    db.select().from(items).where(eq(items.tableId, tableId)),
    db.select().from(participants).where(eq(participants.tableId, tableId)),
    db.select().from(payments).where(eq(payments.tableId, tableId)),
  ]);

  const tableSelections =
    tableItems.length > 0
      ? await db
          .select({ participantId: selections.participantId, itemId: selections.itemId })
          .from(selections)
          .innerJoin(items, eq(selections.itemId, items.id))
          .where(eq(items.tableId, tableId))
      : [];

  const ledgerItems = tableItems.map((i) => ({
    id: i.id,
    totalPrice: i.totalPrice ?? "0",
    isFee: i.isFee,
  }));

  const ledgerParticipants = tableParticipants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
  }));

  const ledgerPayments = tablePayments.map((p) => ({
    participantId: p.participantId,
    amount: parseFloat(p.amount),
  }));

  const results = computeLedger(ledgerItems, ledgerParticipants, tableSelections, ledgerPayments, tip);

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
