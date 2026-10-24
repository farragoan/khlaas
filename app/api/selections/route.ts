import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { selections, participants, items, splitTables } from "@/lib/db/schema";
import { AddSelectionSchema, UpdateSelectionSchema, RemoveSelectionSchema } from "@/lib/schemas";
import { eq, and, sql } from "drizzle-orm";
import { hashToken, verifyHost } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import {
  EXPIRED_ERROR,
  EXPIRED_STATUS,
  SETTLED_ERROR,
  SETTLED_STATUS,
  isExpired,
  isSettled,
} from "@/lib/table-lock";
import { availableUnits, isOverAllocated } from "@/lib/selection-rules";

type Validation =
  | { ok: true; tableId: string; itemQuantity: number }
  | { ok: false; response: NextResponse };

function fail(error: string, status: number): Validation {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * Validate that the session may write a selection for `participantId` on `itemId`.
 *
 * Every path first loads the item and its table, so that (a) the item must exist,
 * (b) a settled or expired bill is frozen whoever is asking, and (c) the
 * participant must sit at the same table as the item. Without (c) item UUIDs,
 * which GET exposes, let one table's participant write into another table.
 *
 * Normal case: the session token directly belongs to the participant.
 * Signed-in participant bypass / host override: only while the table is in
 * `editing` or `items_ready`; the host is the table creator (see verifyHost).
 */
async function validateSession(
  participantId: string,
  sessionToken: string,
  itemId: string
): Promise<Validation> {
  const [item] = await db
    .select({ tableId: items.tableId, quantity: items.quantity })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!item) return fail("Item not found", 404);

  const [table] = await db
    .select({ status: splitTables.status })
    .from(splitTables)
    .where(eq(splitTables.id, item.tableId))
    .limit(1);
  if (!table) return fail("Table not found", 404);
  if (isExpired(table.status)) return fail(EXPIRED_ERROR, EXPIRED_STATUS);
  if (isSettled(table.status)) return fail(SETTLED_ERROR, SETTLED_STATUS);

  const ok: Validation = { ok: true, tableId: item.tableId, itemQuantity: item.quantity };
  const denied = fail("Invalid session", 403);
  const hashedToken = hashToken(sessionToken);

  const [target] = await db
    .select({ tableId: participants.tableId, sessionToken: participants.sessionToken })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1);
  if (!target || target.tableId !== item.tableId) return denied;

  // Direct match: the caller is this participant.
  if (target.sessionToken === hashedToken) return ok;

  // Anything beyond editing your own picks is only open while the host has the
  // bill in an editing state.
  if (table.status !== "editing" && table.status !== "items_ready") return denied;

  const { userId: clerkUserId } = await auth();
  if (clerkUserId) {
    const [requester] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.tableId, item.tableId), eq(participants.userId, clerkUserId)))
      .limit(1);
    if (requester) return ok;
  }

  const host = await verifyHost(item.tableId, { sessionToken, clerkUserId });
  return host ? ok : denied;
}

async function getTotalAllocated(itemId: string, excludeParticipantId?: string): Promise<number> {
  const conditions = [eq(selections.itemId, itemId)];
  if (excludeParticipantId) {
    conditions.push(sql`${selections.participantId} != ${excludeParticipantId}`);
  }
  const [result] = await db
    .select({ total: sql<number>`coalesce(sum(${selections.quantity}), 0)` })
    .from(selections)
    .where(and(...conditions));
  return Number(result?.total ?? 0);
}

async function getOwnQuantity(participantId: string, itemId: string): Promise<number | null> {
  const [row] = await db
    .select({ quantity: selections.quantity })
    .from(selections)
    .where(and(eq(selections.participantId, participantId), eq(selections.itemId, itemId)))
    .limit(1);
  return row ? row.quantity : null;
}

/**
 * Write `quantity` for (participant, item) only if it fits, in a single
 * statement so the capacity check and the write cannot be separated by another
 * request's write. Returns false when it does not fit.
 *
 * neon-http has no interactive transactions, and READ COMMITTED lets two
 * concurrent statements both pass the check, so callers also run
 * `settleRace` afterwards. A DB trigger would close it fully; the SQL is in
 * docs/migrations-pending.md.
 */
async function guardedUpsert(participantId: string, itemId: string, quantity: number): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO selections (participant_id, item_id, quantity)
    SELECT ${participantId}::uuid, ${itemId}::uuid, ${quantity}::int
    WHERE ${quantity}::int <= (SELECT quantity FROM items WHERE id = ${itemId}::uuid)
      - (SELECT coalesce(sum(quantity), 0) FROM selections
         WHERE item_id = ${itemId}::uuid AND participant_id <> ${participantId}::uuid)
    ON CONFLICT (participant_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity
    RETURNING id
  `);
  return (result.rows?.length ?? 0) > 0;
}

/**
 * After our write is visible, re-read the total. If a concurrent write pushed
 * the item over its quantity, undo ours (restore `previous`, or delete) so an
 * over-allocation never persists. Both racers may back off; that is safe, and
 * the client simply retries.
 */
async function settleRace(
  participantId: string,
  itemId: string,
  itemQuantity: number,
  previous: number | null
): Promise<boolean> {
  const total = await getTotalAllocated(itemId);
  if (!isOverAllocated(itemQuantity, total)) return true;
  if (previous === null) {
    await db
      .delete(selections)
      .where(and(eq(selections.participantId, participantId), eq(selections.itemId, itemId)));
  } else {
    await db
      .update(selections)
      .set({ quantity: previous })
      .where(and(eq(selections.participantId, participantId), eq(selections.itemId, itemId)));
  }
  return false;
}

async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}

async function writeSelection(
  participantId: string,
  itemId: string,
  quantity: number,
  itemQuantity: number
) {
  const previous = await getOwnQuantity(participantId, itemId);
  const wrote = await guardedUpsert(participantId, itemId, quantity);
  if (!wrote) {
    const available = availableUnits(itemQuantity, await getTotalAllocated(itemId, participantId));
    return NextResponse.json({ error: `Only ${available} units available to allocate` }, { status: 400 });
  }
  if (!(await settleRace(participantId, itemId, itemQuantity, previous))) {
    return NextResponse.json(
      { error: "Someone else just claimed that item. Please try again" },
      { status: 409 }
    );
  }
  return null;
}

export async function POST(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const parsed = AddSelectionSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { participantId, itemId, quantity } = parsed.data;

  const valid = await validateSession(participantId, sessionToken, itemId);
  if (!valid.ok) return valid.response;

  const failure = await writeSelection(participantId, itemId, quantity, valid.itemQuantity);
  if (failure) return failure;

  const [selection] = await db
    .select({ id: selections.id })
    .from(selections)
    .where(and(eq(selections.participantId, participantId), eq(selections.itemId, itemId)))
    .limit(1);
  return NextResponse.json({ selectionId: selection?.id ?? null }, { status: 201 });
}

export async function PUT(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const parsed = UpdateSelectionSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { participantId, itemId, quantity } = parsed.data;

  const valid = await validateSession(participantId, sessionToken, itemId);
  if (!valid.ok) return valid.response;

  const failure = await writeSelection(participantId, itemId, quantity, valid.itemQuantity);
  if (failure) return failure;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const parsed = RemoveSelectionSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { participantId, itemId } = parsed.data;

  const valid = await validateSession(participantId, sessionToken, itemId);
  if (!valid.ok) return valid.response;

  await db
    .delete(selections)
    .where(and(eq(selections.participantId, participantId), eq(selections.itemId, itemId)));

  return NextResponse.json({ ok: true });
}
