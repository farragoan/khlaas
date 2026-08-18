import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { payments, participants, splitTables } from "@/lib/db/schema";
import { PaymentSchema } from "@/lib/schemas";
import { verifyHost, hashToken } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { EXPIRED_ERROR, EXPIRED_STATUS, isExpired } from "@/lib/table-lock";
import { and, eq } from "drizzle-orm";

export async function POST(req: Request) {
  const sessionToken = req.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, participantId, amount } = parsed.data;

  const [table] = await db
    .select({ status: splitTables.status })
    .from(splitTables)
    .where(eq(splitTables.id, tableId))
    .limit(1);

  if (isExpired(table?.status)) {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: EXPIRED_STATUS });
  }

  // Verify requester is a participant in this table
  const hashedToken = hashToken(sessionToken);
  const [requester] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.tableId, tableId), eq(participants.sessionToken, hashedToken)))
    .limit(1);

  if (!requester) {
    return NextResponse.json({ error: "Not a participant in this table" }, { status: 403 });
  }

  // Verify the target participant belongs to this table
  const [targetParticipant] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.tableId, tableId)))
    .limit(1);

  if (!targetParticipant) {
    return NextResponse.json({ error: "Participant not found in this table" }, { status: 404 });
  }

  // Host can edit anyone; non-host can only edit themselves
  const { userId } = await auth();
  const host = await verifyHost(tableId, { sessionToken, clerkUserId: userId });
  if (!host && requester.id !== participantId) {
    return NextResponse.json({ error: "Can only edit your own payment" }, { status: 403 });
  }

  await db
    .insert(payments)
    .values({ tableId, participantId, amount: String(amount) })
    .onConflictDoUpdate({
      target: [payments.tableId, payments.participantId],
      set: { amount: String(amount) },
    });

  return NextResponse.json({ ok: true });
}
