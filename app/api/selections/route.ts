import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { selections, participants } from "@/lib/db/schema";
import { AddSelectionSchema, RemoveSelectionSchema } from "@/lib/schemas";
import { eq, and } from "drizzle-orm";

async function validateSession(
  participantId: string,
  sessionToken: string
): Promise<boolean> {
  const [participant] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.id, participantId),
        eq(participants.sessionToken, sessionToken)
      )
    )
    .limit(1);

  return !!participant;
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

  const valid = await validateSession(participantId, sessionToken);
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

  const valid = await validateSession(participantId, sessionToken);
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
