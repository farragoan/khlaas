import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, payments } from "@/lib/db/schema";
import { verifyHost } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { computeBreakdown } from "@/lib/ledger/compute";
import { toCsv } from "@/lib/csv";

const money = (amount: number) => amount.toFixed(2);

export async function GET(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  // table_id is a uuid column, so a malformed value must be rejected here
  // rather than failing the cast inside Postgres and surfacing as a 500.
  const tableId = z
    .string()
    .uuid()
    .safeParse(new URL(req.url).searchParams.get("tableId"));
  if (!tableId.success) {
    return NextResponse.json({ error: "Missing or invalid tableId" }, { status: 400 });
  }

  const { userId } = await auth();
  const host = await verifyHost(tableId.data, { sessionToken, clerkUserId: userId });
  if (!host) {
    return NextResponse.json({ error: "Only the host can export this bill" }, { status: 403 });
  }

  const [table] = await db
    .select()
    .from(splitTables)
    .where(eq(splitTables.id, tableId.data))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const [tableItems, tableParticipants, tablePayments] = await Promise.all([
    db.select().from(items).where(eq(items.tableId, tableId.data)),
    db.select().from(participants).where(eq(participants.tableId, tableId.data)),
    db.select().from(payments).where(eq(payments.tableId, tableId.data)),
  ]);

  const tableSelections =
    tableItems.length > 0
      ? await db
          .select({
            participantId: selections.participantId,
            itemId: selections.itemId,
            quantity: selections.quantity,
          })
          .from(selections)
          .innerJoin(items, eq(selections.itemId, items.id))
          .where(eq(items.tableId, tableId.data))
      : [];

  // Every amount below comes from computeBreakdown, the same arithmetic that
  // produces the settle screen. Re-deriving shares here would let the export
  // drift away from what people actually agreed to pay.
  const breakdown = computeBreakdown(
    tableItems.map((i) => ({
      id: i.id,
      totalPrice: i.totalPrice ?? "0",
      isFee: i.isFee,
      quantity: i.quantity,
    })),
    tableParticipants.map((p) => ({ id: p.id, displayName: p.displayName })),
    tableSelections,
    tablePayments.map((p) => ({ participantId: p.participantId, amount: parseFloat(p.amount) })),
    parseFloat(table.tip ?? "0"),
    table.actualPaidTotal ? parseFloat(table.actualPaidTotal) : null
  );

  const nameById = new Map(tableParticipants.map((p) => [p.id, p.displayName]));
  const itemNameById = new Map(tableItems.map((i) => [i.id, i.name]));

  const rows: string[][] = [["Person", "Line", "Quantity", "Amount"]];

  for (const person of breakdown) {
    const name = nameById.get(person.participantId) ?? "";

    for (const share of person.itemShares) {
      rows.push([
        name,
        itemNameById.get(share.itemId) ?? "",
        String(share.quantity),
        money(share.amount),
      ]);
    }

    // Fees and tip are apportioned, not claimed, so they get their own lines —
    // the item rows plus these two sum exactly to "Total owed".
    if (person.fees !== 0) rows.push([name, "Tax & service charge", "", money(person.fees)]);
    if (person.tip !== 0) rows.push([name, "Tip", "", money(person.tip)]);

    rows.push([name, "Total owed", "", money(person.owes)]);
    rows.push([name, "Already paid", "", money(person.paid)]);
    rows.push([name, "Balance", "", money(person.net)]);
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="split-${table.shareCode}.csv"`,
    },
  });
}
