import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { participants } from "@/lib/db/schema";
import { JoinParticipantSchema } from "@/lib/schemas";
import { hashToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

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

  const participantRows = await db
    .insert(participants)
    .values({ tableId, displayName, sessionToken: hashedToken, upiId: upiId ?? null, userId: userId ?? null })
    .returning()
    .catch(() =>
      // upi_id column not yet migrated — insert without it
      db
        .insert(participants)
        .values({ tableId, displayName, sessionToken: hashedToken, userId: userId ?? null })
        .returning()
    );
  const [participant] = participantRows;

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

  try {
    await db
      .update(participants)
      .set(updates)
      .where(eq(participants.id, participant.id));
  } catch {
    // splits_submitted_at column not yet migrated — update only displayName
    if (displayName) {
      await db
        .update(participants)
        .set({ displayName })
        .where(eq(participants.id, participant.id));
    }
  }

  return NextResponse.json({ ok: true });
}
