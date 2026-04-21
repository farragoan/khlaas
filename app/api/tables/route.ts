import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables } from "@/lib/db/schema";
import { CreateTableSchema } from "@/lib/schemas";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = CreateTableSchema.safeParse(body);
  const currency = parsed.success ? parsed.data.currency : "INR";

  const shareCode = nanoid(8);

  const [table] = await db
    .insert(splitTables)
    .values({ shareCode, currency })
    .returning();

  return NextResponse.json({ tableId: table.id, shareCode: table.shareCode }, { status: 201 });
}
