import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { participants, splitTables } from "@/lib/db/schema";
import { JoinParticipantSchema, UpdateParticipantSchema } from "@/lib/schemas";
import { hashToken } from "@/lib/auth";
import {
  EXPIRED_ERROR,
  EXPIRED_STATUS,
  SETTLED_ERROR,
  SETTLED_STATUS,
  isExpired,
  isSettled,
  lockedError,
} from "@/lib/table-lock";
import { and, eq, sql } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = JoinParticipantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, displayName, sessionToken, upiId } = parsed.data;
  const hashedToken = hashToken(sessionToken);

  // Nobody joins a bill that is already history — including the auto-join that
  // fires for signed-in visitors, which would otherwise add a stranger to the
  // roster of a settled-by-timeout bill just because they opened the link.
  const [table] = await db
    .select({ status: splitTables.status })
    .from(splitTables)
    .where(eq(splitTables.id, tableId))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  if (isExpired(table.status)) {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: EXPIRED_STATUS });
  }

  // Attach Clerk userId if the request comes from a signed-in user
  const { userId } = await auth();

  // A settled bill has a fixed ledger, so a new person cannot join its roster.
  // A signed-in person who is already on it may still reclaim their own row
  // (new device, cleared storage) via the upsert below.
  if (isSettled(table.status)) {
    const [existing] = userId
      ? await db
          .select({ id: participants.id })
          .from(participants)
          .where(and(eq(participants.tableId, tableId), eq(participants.userId, userId)))
          .limit(1)
      : [];
    if (!existing) {
      return NextResponse.json({ error: SETTLED_ERROR }, { status: SETTLED_STATUS });
    }
  }

  // A signed-in user is one participant per table, enforced by the partial
  // unique index on (table_id, user_id). Reopening a share link after
  // localStorage is gone reclaims the existing row and rotates its session
  // token onto the new client, rather than minting a second identity that
  // splits the person's selections across two rows.
  //
  // displayName is deliberately not overwritten: reopening the link on another
  // device shouldn't rename someone at a table where others already know them.
  const insert = { tableId, displayName, sessionToken: hashedToken, upiId: upiId ?? null, userId: userId ?? null };

  const [participant] = userId
    ? await db
        .insert(participants)
        .values(insert)
        .onConflictDoUpdate({
          target: [participants.tableId, participants.userId],
          targetWhere: sql`${participants.userId} IS NOT NULL`,
          set: { sessionToken: hashedToken },
        })
        .returning()
    : await db.insert(participants).values(insert).returning();

  return NextResponse.json(
    { participantId: participant.id, displayName: participant.displayName },
    { status: 201 }
  );
}

export async function PATCH(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsedBody = UpdateParticipantSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }

  const { displayName, submitted, tableId } = parsedBody.data;

  if (displayName === undefined && !submitted) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const hashedToken = hashToken(sessionToken);
  const [participant] = await db
    .select({ id: participants.id, tableId: participants.tableId })
    .from(participants)
    .where(eq(participants.sessionToken, hashedToken))
    .limit(1);

  if (!participant) {
    return NextResponse.json({ error: "Invalid session" }, { status: 403 });
  }

  // A session token belongs to one person at one table. Callers that name the
  // table must name the right one; the check is here rather than in the WHERE
  // clause so a client that has not learned to send tableId yet still works.
  if (tableId && participant.tableId !== tableId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 403 });
  }

  // Names and "I'm done" marks are part of the record a settled or expired bill
  // freezes; a session that was valid while the bill was live must not rewrite them.
  const [table] = await db
    .select({ status: splitTables.status })
    .from(splitTables)
    .where(eq(splitTables.id, participant.tableId))
    .limit(1);
  const locked = lockedError(table?.status);
  if (locked) {
    return NextResponse.json({ error: locked.error }, { status: locked.status });
  }

  const updates: Record<string, string | Date> = {};
  if (displayName) updates.displayName = displayName;
  if (submitted) updates.splitsSubmittedAt = new Date();

  await db
    .update(participants)
    .set(updates)
    .where(eq(participants.id, participant.id));

  return NextResponse.json({ ok: true });
}
