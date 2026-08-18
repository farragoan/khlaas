import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { participants } from "@/lib/db/schema";
import { JoinParticipantSchema } from "@/lib/schemas";
import { hashToken } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = JoinParticipantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, displayName, sessionToken, upiId } = parsed.data;
  const hashedToken = hashToken(sessionToken);

  // Attach Clerk userId if the request comes from a signed-in user
  const { userId } = await auth();

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

  const body = await req.json();
  const { displayName, submitted } = body as { displayName?: string; submitted?: boolean };

  if (displayName !== undefined && (typeof displayName !== "string" || displayName.length < 1 || displayName.length > 50)) {
    return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
  }

  if (displayName === undefined && !submitted) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const hashedToken = hashToken(sessionToken);
  const [participant] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.sessionToken, hashedToken))
    .limit(1);

  if (!participant) {
    return NextResponse.json({ error: "Invalid session" }, { status: 403 });
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
