import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { selections, participants, items, splitTables } from "@/lib/db/schema";
import { AddSelectionSchema, RemoveSelectionSchema } from "@/lib/schemas";
import { eq, and, asc } from "drizzle-orm";

/**
 * Validate that the session is allowed to write a selection for `participantId` on `itemId`.
 *
 * Normal case: the session token directly belongs to the participant.
 * Host-override case (editing mode only): the session token belongs to the table's host
 * (participants[0]) and the table is currently in `editing` status.
 */
async function validateSession(
  participantId: string,
  sessionToken: string,
  itemId: string
): Promise<boolean> {
  // Fast path: direct match
  const [direct] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.id, participantId),
        eq(participants.sessionToken, sessionToken)
      )
    )
    .limit(1);

  if (direct) return true;

  // Host bypass: only allowed when table is in editing mode
  const [item] = await db
    .select({ tableId: items.tableId })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!item) return false;

  const [table] = await db
    .select({ status: splitTables.status })
    .from(splitTables)
    .where(eq(splitTables.id, item.tableId))
    .limit(1);
  if (!table || table.status !== "editing") return false;

  // Verify the requester is in this table
  const [requester] = await db
    .select({ id: participants.id, tableId: participants.tableId })
    .from(participants)
    .where(
      and(
        eq(participants.tableId, item.tableId),
        eq(participants.sessionToken, sessionToken)
      )
    )
    .limit(1);
  if (!requester) return false;

  // Verify the target participant is also in this table
  const [target] = await db
    .select({ tableId: participants.tableId })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!target || target.tableId !== item.tableId) return false;

  // Verify requester is the host (first to join)
  const [host] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.tableId, item.tableId))
    .orderBy(asc(participants.joinedAt))
    .limit(1);

  return host?.id === requester.id;
}

export async function POST(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = AddSelectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { participantId, itemId } = parsed.data;

  const valid = await validateSession(participantId, sessionToken, itemId);
  if (!valid) {
    return NextResponse.json({ error: "Invalid session" }, { status: 403 });
  }

  const [selection] = await db
    .insert(selections)
    .values({ participantId, itemId })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json({ selectionId: selection?.id ?? null }, { status: 201 });
}

export async function DELETE(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = RemoveSelectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { participantId, itemId } = parsed.data;

  const valid = await validateSession(participantId, sessionToken, itemId);
  if (!valid) {
    return NextResponse.json({ error: "Invalid session" }, { status: 403 });
  }

  await db
    .delete(selections)
    .where(
      and(
        eq(selections.participantId, participantId),
        eq(selections.itemId, itemId)
      )
    );

  return NextResponse.json({ ok: true });
}
