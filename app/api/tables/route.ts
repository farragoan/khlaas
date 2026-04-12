import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables } from "@/lib/db/schema";
import { nanoid } from "nanoid";

export async function POST() {
  const shareCode = nanoid(8);

  const [table] = await db
    .insert(splitTables)
    .values({ shareCode })
    .returning();

  return NextResponse.json({ tableId: table.id, shareCode: table.shareCode }, { status: 201 });
}
