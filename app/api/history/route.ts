import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants } from "@/lib/db/schema";
import { eq, or, and, lt, desc, inArray, sql } from "drizzle-orm";

export type HistoryBillEntry = {
  shareCode: string;
  status: "active" | "items_ready" | "editing" | "settled" | "expired";
  currency: string;
  createdAt: string; // ISO string
  billTotal: number; // subtotal + totalFees + tip
  itemCount: number;
  participantCount: number;
  role: "creator" | "participant" | "both";
  myParticipantId: string | null;
  myDisplayName: string | null;
};

type HistoryResponse = {
  bills: HistoryBillEntry[];
  nextCursor: string | null;
};

type CursorPayload = { createdAt: string; id: string };

export async function fetchHistoryPage(
  userId: string,
  cursor: string | null,
  limit: number
): Promise<HistoryResponse> {
  let parsedCursor: CursorPayload | null = null;
  if (cursor) {
    try {
      parsedCursor = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    } catch {
      parsedCursor = null;
    }
  }

  // Step 1: get all table IDs where this user is a participant
  const participantRows = await db
    .select({ tableId: participants.tableId })
    .from(participants)
    .where(eq(participants.userId, userId));
  const participatedIds = participantRows.map((r) => r.tableId);

  // Step 2: query splitTables with OR: created by user OR participated in
  const cursorCondition =
    parsedCursor != null
      ? or(
          lt(splitTables.createdAt, new Date(parsedCursor.createdAt)),
          and(
            eq(splitTables.createdAt, new Date(parsedCursor.createdAt)),
            lt(splitTables.id, parsedCursor.id)
          )
        )
      : undefined;

  const tableQuery = await db
    .select()
    .from(splitTables)
    .where(
      and(
        or(
          eq(splitTables.createdBy, userId),
          participatedIds.length > 0
            ? inArray(splitTables.id, participatedIds)
            : sql`false`
        ),
        cursorCondition
      )
    )
    .orderBy(desc(splitTables.createdAt), desc(splitTables.id))
    .limit(limit + 1);

  const hasMore = tableQuery.length > limit;
  const tables = tableQuery.slice(0, limit);
  const tableIds = tables.map((t) => t.id);

  if (tableIds.length === 0) {
    return { bills: [], nextCursor: null };
  }

  // Step 3: 4 parallel enrichment queries
  const [itemStats, feeStats, participantCounts, myParticipantRows] =
    await Promise.all([
      // Non-fee item count + subtotal
      db
        .select({
          tableId: items.tableId,
          itemCount: sql<string>`COUNT(*)`,
          subtotal: sql<string>`SUM(${items.totalPrice})`,
        })
        .from(items)
        .where(and(inArray(items.tableId, tableIds), eq(items.isFee, false)))
        .groupBy(items.tableId),

      // Fee total
      db
        .select({
          tableId: items.tableId,
          totalFees: sql<string>`SUM(${items.totalPrice})`,
        })
        .from(items)
        .where(and(inArray(items.tableId, tableIds), eq(items.isFee, true)))
        .groupBy(items.tableId),

      // Participant count per table
      db
        .select({
          tableId: participants.tableId,
          participantCount: sql<string>`COUNT(*)`,
        })
        .from(participants)
        .where(inArray(participants.tableId, tableIds))
        .groupBy(participants.tableId),

      // User's own participant rows
      db
        .select({
          tableId: participants.tableId,
          id: participants.id,
          displayName: participants.displayName,
        })
        .from(participants)
        .where(
          and(
            inArray(participants.tableId, tableIds),
            eq(participants.userId, userId)
          )
        ),
    ]);

  // Build lookup maps
  const itemStatsMap = new Map(
    itemStats.map((r) => [r.tableId, r])
  );
  const feeStatsMap = new Map(
    feeStats.map((r) => [r.tableId, r])
  );
  const participantCountMap = new Map(
    participantCounts.map((r) => [r.tableId, r])
  );
  const myParticipantMap = new Map(
    myParticipantRows.map((r) => [r.tableId, r])
  );

  // Step 4: assemble response
  const bills: HistoryBillEntry[] = tables.map((table) => {
    const iStats = itemStatsMap.get(table.id);
    const fStats = feeStatsMap.get(table.id);
    const pCount = participantCountMap.get(table.id);
    const myRow = myParticipantMap.get(table.id);

    const subtotal = parseFloat(iStats?.subtotal ?? "0");
    const totalFees = parseFloat(fStats?.totalFees ?? "0");
    const tip = parseFloat(table.tip ?? "0");
    const billTotal = subtotal + totalFees + tip;

    const isCreator = table.createdBy === userId;
    const isParticipant = myRow != null;
    const role: HistoryBillEntry["role"] =
      isCreator && isParticipant
        ? "both"
        : isCreator
          ? "creator"
          : "participant";

    return {
      shareCode: table.shareCode,
      status: table.status as HistoryBillEntry["status"],
      currency: table.currency,
      createdAt: table.createdAt?.toISOString() ?? new Date(0).toISOString(),
      billTotal,
      itemCount: parseInt(iStats?.itemCount ?? "0", 10),
      participantCount: parseInt(pCount?.participantCount ?? "0", 10),
      role,
      myParticipantId: myRow?.id ?? null,
      myDisplayName: myRow?.displayName ?? null,
    };
  });

  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({
          createdAt: tables[limit - 1].createdAt?.toISOString(),
          id: tables[limit - 1].id,
        })
      ).toString("base64")
    : null;

  return { bills, nextCursor };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const limitParam = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(isNaN(limitParam) || limitParam < 1 ? 20 : limitParam, 50);

  const result = await fetchHistoryPage(userId, cursor, limit);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
