import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
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
    db.select().from(participants).where(eq(participants.tableId, table.id)),
  ]);

  const tableSelections =
    tableItems.length > 0
      ? await db
          .select()
          .from(selections)
          .where(
            eq(
              selections.itemId,
              // Fetch all selections for any item in this table
              // We do a simple approach: get all selections then filter client-side is fine for MVP
              // but we query by all item ids via a subquery
              selections.itemId // placeholder — see below
            )
          )
          .then(() =>
            // Simpler: just fetch all selections for the participants in this table
            db
              .select({
                id: selections.id,
                participantId: selections.participantId,
                itemId: selections.itemId,
              })
              .from(selections)
              .innerJoin(items, eq(selections.itemId, items.id))
              .where(eq(items.tableId, table.id))
          )
      : [];

  const tableLedger =
    table.status === "settled"
      ? await db
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.tableId, table.id))
      : [];

  return NextResponse.json({
    table,
    items: tableItems,
    participants: tableParticipants,
    selections: tableSelections,
    ledger: tableLedger,
  });
}
