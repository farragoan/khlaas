import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { participants } from "@/lib/db/schema";
import { JoinParticipantSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = JoinParticipantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, displayName, sessionToken } = parsed.data;

  const [participant] = await db
    .insert(participants)
    .values({ tableId, displayName, sessionToken })
    .returning();

  return NextResponse.json(
    { participantId: participant.id, displayName: participant.displayName },
    { status: 201 }
  );
}
