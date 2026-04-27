import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { splitTables } from "@/lib/db/schema";
import { CreateTableSchema } from "@/lib/schemas";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to create a bill" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateTableSchema.safeParse(body);
  const currency = parsed.success ? parsed.data.currency : "INR";

  const shareCode = nanoid(8);

  const [table] = await db
    .insert(splitTables)
    .values({ shareCode, currency, createdBy: userId })
    .returning();

  return NextResponse.json({ tableId: table.id, shareCode: table.shareCode }, { status: 201 });
}
