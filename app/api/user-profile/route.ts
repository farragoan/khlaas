import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.clerkUserId, userId))
    .limit(1);

  return NextResponse.json(profile[0] ?? null);
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { displayName, upiId } = body as { displayName?: string; upiId?: string };

  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.clerkUserId, userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(userProfiles)
      .set({
        displayName: displayName ?? existing[0].displayName,
        upiId: upiId ?? existing[0].upiId,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.clerkUserId, userId));
  } else {
    await db.insert(userProfiles).values({
      clerkUserId: userId,
      displayName: displayName ?? null,
      upiId: upiId ?? null,
    });
  }

  return NextResponse.json({ success: true });
}
