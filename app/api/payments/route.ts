import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { payments, participants } from "@/lib/db/schema";
import { PaymentSchema } from "@/lib/schemas";
import { and, eq } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, participantId, amount } = parsed.data;

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
