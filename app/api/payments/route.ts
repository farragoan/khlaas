import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { payments, participants } from "@/lib/db/schema";
import { PaymentSchema } from "@/lib/schemas";
import { verifyHostSession } from "@/lib/auth";
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

  const host = await verifyHostSession(tableId, sessionToken);
  if (!host) {
    return NextResponse.json({ error: "Only the host can record payments" }, { status: 403 });
  }

  // Verify participant belongs to this table
  const [participant] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.tableId, tableId)))
    .limit(1);

  if (!participant) {
    return NextResponse.json({ error: "Participant not found in this table" }, { status: 404 });
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
