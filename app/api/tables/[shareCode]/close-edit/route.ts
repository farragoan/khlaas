import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, participants } from "@/lib/db/schema";
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

  if (table.status !== "editing") {
    return NextResponse.json({ error: "Table is not in editing mode" }, { status: 409 });
  }

  // Verify caller is the host
  const [host] = await db
    .select()
    .from(participants)
    .where(eq(participants.tableId, table.id))
    .orderBy(asc(participants.joinedAt))
    .limit(1);

  if (!host || host.sessionToken !== sessionToken) {
    return NextResponse.json({ error: "Only the host can close editing" }, { status: 403 });
  }

  await db
    .update(splitTables)
    .set({ status: "items_ready" })
    .where(eq(splitTables.id, table.id));

  return NextResponse.json({ ok: true });
}
